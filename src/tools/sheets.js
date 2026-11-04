const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Planilha oficial da Clínica Dr. Hélcio (Pacientes Dr. Helcio)
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID || '1eXE-ieOz8E9KAELTeUdRPKegu7OgH4qPHaXHxLXUnHs';
const SHEET_NAME = 'Aba1';
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../../service-account.json');

// Memória local de fallback caso a conta de serviço ainda não tenha permissão na planilha
const patientsInMemory = new Map([
  ['5519981710000', { nome: 'Maria Silva', telefone: '5519981710000', cadastradoEm: '2026-01-10' }]
]);

function getGoogleSheetsClient() {
  try {
    let auth;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const credentials = typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === 'string'
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
        : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } else {
      return null;
    }
    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.warn('[Sheets] Falha ao inicializar autenticação:', error.message);
    return null;
  }
}

/**
 * Consulta se o paciente já é cadastrado pelo telefone.
 */
async function lookupPatient(telefone) {
  if (!telefone) return { encontrado: false };
  
  const cleanPhone = String(telefone).replace(/\D/g, '');
  const sheetsClient = getGoogleSheetsClient();

  if (sheetsClient) {
    try {
      const res = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:D`
      });

      const rows = res.data.values || [];
      if (rows.length > 1) {
        // Assume cabeçalhos na linha 1
        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const phoneIdx = headers.findIndex(h => h.includes('telefone') || h.includes('fone') || h.includes('celular'));
        const nameIdx = headers.findIndex(h => h.includes('nome') || h.includes('paciente'));

        if (phoneIdx !== -1 && nameIdx !== -1) {
          for (let i = 1; i < rows.length; i++) {
            const rowPhone = String(rows[i][phoneIdx] || '').replace(/\D/g, '');
            const rowName = rows[i][nameIdx];

            if (rowPhone && (rowPhone.includes(cleanPhone) || cleanPhone.includes(rowPhone))) {
              return {
                encontrado: true,
                nome: rowName,
                telefone: rowPhone
              };
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Sheets] Falha ao consultar Google Sheet (usando fallback local):', err.message);
    }
  }

  // Fallback em memória local
  for (const [phone, data] of patientsInMemory.entries()) {
    if (phone.includes(cleanPhone) || cleanPhone.includes(phone)) {
      return {
        encontrado: true,
        nome: data.nome,
        telefone: data.telefone
      };
    }
  }

  return { encontrado: false };
}

/**
 * Grava novo paciente na planilha da clínica.
 */
async function savePatient({ nome, telefone }) {
  if (!nome || !telefone) {
    return { success: false, error: 'Nome e telefone são obrigatórios' };
  }

  const cleanPhone = String(telefone).replace(/\D/g, '');
  const sheetsClient = getGoogleSheetsClient();

  if (sheetsClient) {
    try {
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:C`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[nome, cleanPhone, new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })]]
        }
      });

      return {
        success: true,
        message: `Paciente ${nome} gravado na Planilha do Google com sucesso!`,
        paciente: { nome, telefone: cleanPhone }
      };
    } catch (err) {
      console.warn('[Sheets] Falha ao gravar no Google Sheet (gravando em fallback local):', err.message);
    }
  }

  // Fallback em memória local
  const patientData = {
    nome,
    telefone: cleanPhone,
    cadastradoEm: new Date().toISOString()
  };
  patientsInMemory.set(cleanPhone, patientData);

  return {
    success: true,
    message: `Paciente ${nome} cadastrado com sucesso!`,
    paciente: patientData
  };
}

module.exports = {
  lookupPatient,
  savePatient,
  patientsInMemory
};
