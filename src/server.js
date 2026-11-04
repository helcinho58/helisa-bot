const fastify = require('fastify')({ logger: true });
const config = require('./config');
const state = require('./state');
const { processMessage } = require('./agent');
const { transcribeAudioBase64 } = require('./audio');

// Buffer para debounce de mensagens (30 segundos)
const debounceBuffers = new Map();
const DEBOUNCE_TIME_MS = 30 * 1000; // 30 segundos de espera para agrupar mensagens picadas

/**
 * Envia texto de volta para o WhatsApp via Evolution API.
 */
async function sendWhatsAppMessage(remoteJid, text) {
  if (!config.evolutionUrl || !config.evolutionApiKey) {
    console.log(`[SIMULAÇÃO ENVIO WHATSAPP] Para: ${remoteJid} | Mensagem: ${text}`);
    return;
  }

  const endpoint = `${config.evolutionUrl.replace(/\/$/, '')}/message/sendText/${config.evolutionInstance}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.evolutionApiKey
      },
      body: JSON.stringify({
        number: remoteJid,
        text: text
      })
    });

    if (!response.ok) {
      console.error(`Erro ao enviar WhatsApp: Status ${response.status}`);
    }
  } catch (error) {
    console.error('Falha de rede ao chamar Evolution API:', error.message);
  }
}

// Rota de saúde / status
fastify.get('/health', async () => {
  return { status: 'online', service: 'Helisa Core', timestamp: new Date().toISOString() };
});

// Endpoint do Webhook compatível com Evolution API
fastify.post('/webhook/evolution', async (request, reply) => {
  const body = request.body;
  const data = body?.data;

  if (!data || !data.key) {
    return reply.status(400).send({ error: 'Payload inválido da Evolution API' });
  }

  const remoteJid = data.key.remoteJid;
  const fromMe = data.key.fromMe;
  const pushName = data.pushName || '';
  const messageData = data.message || {};

  // Extrai texto inicial para checar comandos de pausa/humano
  let rawText = messageData.conversation || messageData.extendedTextMessage?.text || '';

  // 1. Intervenção Humana (Mensagens enviadas pela clínica)
  if (fromMe) {
    // Se havia mensagens no buffer aguardando resposta, cancela para não atropelar a conversa humana
    if (debounceBuffers.has(remoteJid)) {
      clearTimeout(debounceBuffers.get(remoteJid).timer);
      debounceBuffers.delete(remoteJid);
      console.log(`[DEBOUNCE CANCELADO] Buffer descartado pois a clínica enviou mensagem para ${remoteJid}`);
    }

    const lower = rawText.trim().toLowerCase();
    if (lower === '/voltar') {
      state.unpauseChat(remoteJid);
      console.log(`[HUMANO] Bot despausado para ${remoteJid}`);
    } else {
      state.pauseChat(remoteJid);
      console.log(`[HUMANO] Mensagem enviada pelo Doutor/Clínica. Bot pausado por 12h para ${remoteJid}`);
    }
    return reply.send({ status: 'human_intervention_handled' });
  }

  // 2. Verifica se o atendimento com este paciente está em pausa
  if (state.isPaused(remoteJid)) {
    console.log(`[PAUSA] Ignorando mensagem de ${remoteJid} pois está em atendimento humano.`);
    return reply.send({ status: 'chat_paused' });
  }

  // 3. Processamento de Áudio vs Texto
  let text = '';
  const isAudio = data.messageType === 'audioMessage';

  if (isAudio) {
    console.log(`[ÁUDIO] Transcrevendo áudio de ${remoteJid}...`);
    const base64Audio = messageData.base64 || messageData.audioMessage?.base64;
    text = await transcribeAudioBase64(base64Audio);
  } else {
    // Mensagens normais, legendas de imagens ou documentos
    text = rawText || 
           messageData.imageMessage?.caption || 
           messageData.videoMessage?.caption || 
           messageData.documentWithCaptionMessage?.message?.documentMessage?.caption || '';
  }

  // Se não há texto (figurinha, foto sem legenda ou áudio inaudível), aborta em silêncio
  if (!text || text.trim() === '') {
    return reply.send({ status: 'no_text_ignored' });
  }

  // 4. Extrai telefone limpo
  const phone = remoteJid.replace('@s.whatsapp.net', '');

  // 5. Agrupador Inteligente de Mensagens (Debounce de 30 segundos)
  if (!debounceBuffers.has(remoteJid)) {
    debounceBuffers.set(remoteJid, {
      texts: [],
      phone,
      pushName,
      timer: null
    });
  }

  const userBuffer = debounceBuffers.get(remoteJid);
  userBuffer.texts.push(text);
  if (pushName) userBuffer.pushName = pushName;

  // Cancela o timer anterior para reiniciar a contagem de 30 segundos
  if (userBuffer.timer) {
    clearTimeout(userBuffer.timer);
  }

  userBuffer.timer = setTimeout(async () => {
    try {
      const current = debounceBuffers.get(remoteJid);
      if (!current) return;
      debounceBuffers.delete(remoteJid);

      // Une as mensagens do paciente evitando repetições exatas
      const unifiedText = Array.from(new Set(current.texts)).join('\n');
      console.log(`\n📩 [DEBOUNCE 30s CONCLUÍDO] Processando mensagens de ${current.pushName} (${current.phone}):\n"${unifiedText}"`);

      // Executa a inteligência da Helisa com todo o texto unificado
      const responseText = await processMessage({
        sessionId: remoteJid,
        userText: unifiedText,
        patientData: { phone: current.phone, pushName: current.pushName }
      });

      console.log(`🤖 Helisa respondeu: "${responseText}"`);

      // Envia resposta final única via WhatsApp
      await sendWhatsAppMessage(remoteJid, responseText);
    } catch (err) {
      console.error(`Erro ao processar mensagem com debounce para ${remoteJid}:`, err);
    }
  }, DEBOUNCE_TIME_MS);

  console.log(`⏱️ [DEBOUNCE] Mensagem recebida de ${pushName} (${phone}) adicionada ao buffer. Aguardando 30s...`);
  return reply.send({ status: 'buffered_for_debounce', delaySeconds: 30 });
});

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`\n🚀 Servidor Helisa rodando em http://localhost:${config.port}`);
    console.log(`📡 Webhook pronto em: http://localhost:${config.port}/webhook/evolution\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
