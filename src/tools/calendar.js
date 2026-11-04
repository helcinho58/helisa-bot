const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// IDs das duas agendas do Dr. Hélcio
const CALENDAR_PRIMARY = '833089c3ecc1f2dddeaa213090d786090a5cc7946b64b5e84fd8cb470ed2fc5c@group.calendar.google.com'; // EasyDental Cloud (13094)
const CALENDAR_SECONDARY = 'helcioodonto@gmail.com'; // Agenda pessoal/concorrente

// Caminho do arquivo de credenciais da Conta de Serviço
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../../service-account.json');

// Memória local para fallback quando o arquivo ainda não foi adicionado
const bookedEventsInMemory = [];

/**
 * Retorna o cliente da API do Google Calendar autenticado se o service-account.json existir.
 */
function getGoogleCalendarClient() {
  try {
    let auth;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const credentials = typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === 'string'
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
        : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
    } else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
    } else {
      return null;
    }
    return google.calendar({ version: 'v3', auth });
  } catch (error) {
    console.error('Erro ao inicializar autenticação do Google Calendar:', error.message);
    return null;
  }
}

function getSPTime(date) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function createDateSP(dateSP, hour, minute) {
  const year = dateSP.getFullYear();
  const month = String(dateSP.getMonth() + 1).padStart(2, '0');
  const day = String(dateSP.getDate()).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T${h}:${m}:00.000-03:00`);
}

/**
 * Busca eventos reais do Google Calendar para os próximos 14 dias.
 */
async function fetchGoogleCalendarEvents(calendarClient) {
  const now = new Date();
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const timeMin = now.toISOString();
  const timeMax = in14Days.toISOString();

  const fetchCalendar = async (calId) => {
    try {
      const res = await calendarClient.events.list({
        calendarId: calId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime'
      });
      return res.data.items || [];
    } catch (err) {
      console.warn(`[Aviso] Falha ao consultar agenda ${calId}:`, err.message);
      return [];
    }
  };

  const [events1, events2] = await Promise.all([
    fetchCalendar(CALENDAR_PRIMARY),
    fetchCalendar(CALENDAR_SECONDARY)
  ]);

  const rawEvents = [...events1, ...events2];

  // Normaliza eventos para formato com start e end
  return rawEvents.map(ev => {
    let start = ev.start?.dateTime;
    let end = ev.end?.dateTime;

    // Eventos de dia inteiro (ex: feriados)
    if (!start && ev.start?.date) {
      start = `${ev.start.date}T00:00:00-03:00`;
      end = `${ev.end.date}T23:59:59-03:00`;
    }

    return { start, end, summary: ev.summary };
  });
}

/**
 * Calcula horários livres nos próximos 14 dias seguindo as regras da clínica.
 */
async function checkAvailability() {
  const calendarClient = getGoogleCalendarClient();
  let allEvents = [];

  if (calendarClient) {
    allEvents = await fetchGoogleCalendarEvents(calendarClient);
  } else {
    allEvents = bookedEventsInMemory;
  }

  let freeSlotsStr = '';
  const now = new Date();
  const nowSP = getSPTime(now);

  for (let i = 0; i < 14; i++) {
    const currentSP = new Date(nowSP.getTime() + i * 24 * 60 * 60 * 1000);
    const weekday = currentSP.getDay();

    // Pula Domingo (0) e Sábado (6)
    if (weekday === 0 || weekday === 6) continue;

    const slots = [];

    // Segunda a Quinta: 13:30 às 19:00
    if (weekday >= 1 && weekday <= 4) {
      for (let h = 13; h < 19; h++) {
        if (h === 13) {
          slots.push({
            start: createDateSP(currentSP, 13, 30),
            end: createDateSP(currentSP, 14, 0)
          });
        } else {
          slots.push({
            start: createDateSP(currentSP, h, 0),
            end: createDateSP(currentSP, h, 30)
          });
          slots.push({
            start: createDateSP(currentSP, h, 30),
            end: createDateSP(currentSP, h + 1, 0)
          });
        }
      }
    } 
    // Sexta-feira: 13:30 às 15:00 APENAS
    else if (weekday === 5) {
      slots.push({
        start: createDateSP(currentSP, 13, 30),
        end: createDateSP(currentSP, 14, 0)
      });
      slots.push({
        start: createDateSP(currentSP, 14, 0),
        end: createDateSP(currentSP, 14, 30)
      });
      slots.push({
        start: createDateSP(currentSP, 14, 30),
        end: createDateSP(currentSP, 15, 0)
      });
    }

    // Filtra horários livres
    const freeSlots = slots.filter(slot => {
      if (slot.start.getTime() < now.getTime()) return false;

      for (const ev of allEvents) {
        if (!ev.start) continue;

        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);

        if (slot.start.getTime() < evEnd.getTime() && slot.end.getTime() > evStart.getTime()) {
          return false;
        }
      }
      return true;
    });

    if (freeSlots.length > 0) {
      const dayStr = String(currentSP.getDate()).padStart(2, '0') + '/' + String(currentSP.getMonth() + 1).padStart(2, '0');
      const times = freeSlots.map(s => {
        const spTime = getSPTime(s.start);
        return String(spTime.getHours()).padStart(2, '0') + ':' + String(spTime.getMinutes()).padStart(2, '0');
      });
      const weekdayStr = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][weekday];
      freeSlotsStr += `${weekdayStr}-feira (${dayStr}): ${times.join(', ')}\n`;
    }
  }

  if (!freeSlotsStr) {
    freeSlotsStr = 'Não há horários livres nos próximos 14 dias.';
  }

  return freeSlotsStr;
}

/**
 * Cria evento na agenda oficial do Google (EasyDental Cloud).
 */
async function createCalendarEvent({ start, end, summary, description }) {
  const calendarClient = getGoogleCalendarClient();

  const finalEnd = end || new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();

  if (calendarClient) {
    try {
      const res = await calendarClient.events.insert({
        calendarId: CALENDAR_PRIMARY,
        requestBody: {
          summary: summary,
          description: description,
          start: {
            dateTime: start,
            timeZone: 'America/Sao_Paulo'
          },
          end: {
            dateTime: finalEnd,
            timeZone: 'America/Sao_Paulo'
          }
        }
      });

      return {
        success: true,
        message: `Consulta agendada no Google Calendar com sucesso! ID: ${res.data.id}`,
        event: res.data
      };
    } catch (error) {
      console.error('Erro ao criar evento no Google Calendar:', error.message);
      return {
        success: false,
        error: `Falha ao gravar no Google Calendar: ${error.message}`
      };
    }
  }

  // Fallback em memória se não tiver service-account.json
  const event = {
    id: 'evt_' + Date.now(),
    start,
    end: finalEnd,
    summary,
    description,
    createdAt: new Date().toISOString()
  };
  bookedEventsInMemory.push(event);

  return {
    success: true,
    message: `Agendamento simulado com sucesso para ${summary}! (Coloque o service-account.json para gravar no Google Calendar real)`,
    event
  };
}

module.exports = {
  checkAvailability,
  createCalendarEvent,
  isLiveGoogleCalendarConnected: () => fs.existsSync(SERVICE_ACCOUNT_PATH),
  SERVICE_ACCOUNT_PATH
};
