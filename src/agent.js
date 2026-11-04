const { OpenAI } = require('openai');
const config = require('./config');
const { getSystemPrompt } = require('./prompt');
const memory = require('./memory');
const { checkAvailability, createCalendarEvent } = require('./tools/calendar');
const { lookupPatient, savePatient } = require('./tools/sheets');

const openai = new OpenAI({
  apiKey: config.openaiApiKey || process.env.OPENAI_API_KEY || 'fake-key-for-test'
});

const tools = [
  {
    type: 'function',
    function: {
      name: 'lookup_patient',
      description: 'Consulta se o paciente já é cadastrado na clínica pelo telefone.',
      parameters: {
        type: 'object',
        properties: {
          telefone: {
            type: 'string',
            description: 'Telefone exato do paciente para busca'
          }
        },
        required: ['telefone']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_patient',
      description: 'Grava um novo paciente na planilha/cadastro da clínica.',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description: 'Nome completo informado pelo paciente'
          },
          telefone: {
            type: 'string',
            description: 'Telefone do paciente com DDD'
          }
        },
        required: ['nome', 'telefone']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Retorna os horários livres exatos nos próximos 14 dias (duas semanas) para o Dr. Hélcio. Não precisa de argumentos.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: 'Cria evento de consulta agendada na agenda Google do consultório.',
      parameters: {
        type: 'object',
        properties: {
          start: {
            type: 'string',
            description: 'Data/hora de início em formato ISO 8601 com fuso -03:00 (ex: 2026-10-20T14:00:00-03:00)'
          },
          end: {
            type: 'string',
            description: 'Data/hora de término em formato ISO 8601 com fuso -03:00'
          },
          summary: {
            type: 'string',
            description: 'Título: Nome do paciente + motivo da consulta (ex: Maria Silva - Avaliação)'
          },
          description: {
            type: 'string',
            description: 'Detalhes completos: nome, telefone e queixa'
          }
        },
        required: ['start', 'summary']
      }
    }
  }
];

/**
 * Executa uma ferramenta chamada pelo modelo de IA.
 */
async function executeTool(name, args, patientData) {
  switch (name) {
    case 'lookup_patient':
      return await lookupPatient(args.telefone || patientData.phone);
    case 'save_patient':
      return await savePatient({
        nome: args.nome,
        telefone: args.telefone || patientData.phone
      });
    case 'check_availability':
      const slots = await checkAvailability();
      return { horariosLivres: slots };
    case 'create_calendar_event':
      return await createCalendarEvent(args);
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}

/**
 * Processa a mensagem do paciente com Helisa.
 */
async function processMessage({ sessionId, userText, patientData }) {
  const systemPrompt = getSystemPrompt(patientData);
  const history = memory.getHistory(sessionId);

  // Monta a lista de mensagens para o modelo
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userText }
  ];

  // Loop de execução de ferramentas (até 5 passos para evitar loops infinitos)
  let turns = 0;
  while (turns < 5) {
    turns++;
    const response = await openai.chat.completions.create({
      model: config.openaiModel,
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.2 // Baixa temperatura para precisão cirúrgica de regras
    });

    const choice = response.choices[0];
    const message = choice.message;

    // Se o modelo decidiu chamar uma ou mais ferramentas
    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        let functionArgs = {};
        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          functionArgs = {};
        }

        const toolResult = await executeTool(functionName, functionArgs, patientData);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });
      }
    } else {
      // Resposta final de texto para o paciente
      const replyText = message.content || '';

      // Grava no histórico de memória
      memory.addMessage(sessionId, 'user', userText);
      memory.addMessage(sessionId, 'assistant', replyText);

      return replyText;
    }
  }

  return 'Olá! No momento estamos com alta demanda. Vou pedir para nossa equipe humana falar diretamente com você em alguns instantes.';
}

module.exports = { processMessage };
