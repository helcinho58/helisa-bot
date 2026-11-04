require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  
  // Evolution API
  evolutionUrl: process.env.EVOLUTION_URL || '',
  evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
  evolutionInstance: process.env.EVOLUTION_INSTANCE || 'consultorio',
  
  // Google IDs (se usar integração direta)
  calendarId: process.env.GOOGLE_CALENDAR_ID || '833089c3ecc1f2dddeaa213090d786090a5cc7946b64b5e84fd8cb470ed2fc5c@group.calendar.google.com',
  sheetsSpreadsheetId: process.env.GOOGLE_SHEETS_ID || '1eXE-ieOz8E9KAELTeUdRPKegu7OgH4qPHaXHxLXUnHs',
  
  // Pausa de intervenção humana (12 horas por padrão)
  pauseDurationMs: 12 * 60 * 60 * 1000
};
