const { OpenAI, toFile } = require('openai');
const config = require('./config');

const openai = new OpenAI({
  apiKey: config.openaiApiKey || process.env.OPENAI_API_KEY
});

/**
 * Transcreve áudio base64 vindo da Evolution API usando Whisper.
 */
async function transcribeAudioBase64(base64Data) {
  if (!base64Data) return '';

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'pt'
    });

    return transcription.text || '';
  } catch (error) {
    console.error('Erro na transcrição de áudio:', error.message);
    return '';
  }
}

module.exports = { transcribeAudioBase64 };
