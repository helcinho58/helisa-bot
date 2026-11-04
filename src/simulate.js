const readline = require('readline');
const { processMessage } = require('./agent');
const memory = require('./memory');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const sessionId = 'simulacao_paciente_1';
const patientData = {
  phone: '5519981710000',
  pushName: 'Helcio'
};

console.log('========================================================');
console.log('🤖 SIMULADOR DA HELISA (Clínica Dr. Hélcio)');
console.log('========================================================');
console.log(`Contexto do Paciente Simulado:`);
console.log(`- Telefone: ${patientData.phone}`);
console.log(`- Nome WhatsApp: ${patientData.pushName}`);
console.log('\nComandos de apoio no simulador:');
console.log('- Digite "/limpar" para reiniciar a conversa');
console.log('- Digite "/sair" para fechar o simulador');
console.log('--------------------------------------------------------\n');

function promptUser() {
  rl.question('👤 Você (Paciente): ', async (input) => {
    const text = input.trim();
    if (!text) {
      promptUser();
      return;
    }

    if (text.toLowerCase() === '/sair') {
      console.log('Encerrando simulador.');
      rl.close();
      process.exit(0);
    }

    if (text.toLowerCase() === '/limpar') {
      memory.clear(sessionId);
      console.log('🧹 Memória da conversa limpa!\n');
      promptUser();
      return;
    }

    const start = Date.now();
    try {
      process.stdout.write('⏳ Helisa pensando...\r');
      const response = await processMessage({
        sessionId,
        userText: text,
        patientData
      });
      const elapsed = Date.now() - start;

      console.log(`\n🤖 Helisa: ${response}`);
      console.log(`⚡ [Tempo de resposta: ${elapsed}ms]\n`);
    } catch (err) {
      console.error('\n❌ Erro ao processar:', err.message);
      if (err.message.includes('API key') || err.message.includes('401')) {
        console.log('\n💡 Dica: Verifique se sua OPENAI_API_KEY está configurada no arquivo .env!\n');
      }
    }

    promptUser();
  });
}

promptUser();
