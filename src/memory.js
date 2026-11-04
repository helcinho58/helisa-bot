/**
 * Gerenciador de memória com persistência por sessão, limite de 50 mensagens
 * e expiração inteligente por tempo de inatividade (TTL de 12 horas).
 */
class MemoryManager {
  constructor(maxMessages = 50, ttlMs = 12 * 60 * 60 * 1000) {
    this.sessions = new Map();
    this.maxMessages = maxMessages;
    this.ttlMs = ttlMs; // 12 horas em milissegundos
  }

  /**
   * Obtém o histórico de mensagens de uma sessão.
   * Se a última interação foi há mais de 12 horas, reinicia a sessão.
   */
  getHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const now = Date.now();
    // Se passaram mais de 12 horas de inatividade, expira a sessão antiga
    if (now - session.lastActivity > this.ttlMs) {
      this.sessions.delete(sessionId);
      return [];
    }

    return session.messages;
  }

  /**
   * Adiciona uma mensagem ao histórico da sessão e renova o tempo de atividade.
   */
  addMessage(sessionId, role, content) {
    let session = this.sessions.get(sessionId);
    const now = Date.now();

    if (!session || (now - session.lastActivity > this.ttlMs)) {
      session = { messages: [], lastActivity: now };
      this.sessions.set(sessionId, session);
    }

    session.lastActivity = now;
    session.messages.push({ role, content });

    // Mantém até 50 mensagens para preservar todo o histórico recente
    if (session.messages.length > this.maxMessages) {
      session.messages.splice(0, session.messages.length - this.maxMessages);
    }
  }

  /**
   * Limpa a memória de um paciente manualmente.
   */
  clear(sessionId) {
    this.sessions.delete(sessionId);
  }
}

module.exports = new MemoryManager();
