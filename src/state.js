const config = require('./config');

class StateManager {
  constructor() {
    this.pausedChats = new Map();
  }

  /**
   * Verifica se a conversa com o paciente está pausada por intervenção humana.
   */
  isPaused(remoteJid) {
    if (!remoteJid) return false;
    const pausedUntil = this.pausedChats.get(remoteJid);
    if (!pausedUntil) return false;

    const now = Date.now();
    if (pausedUntil > now) {
      return true; // Pausado
    } else {
      this.pausedChats.delete(remoteJid); // Expirou
      return false;
    }
  }

  /**
   * Pausa a IA para o contato por 12h (chamado quando Dr. Hélcio responde manualmente).
   */
  pauseChat(remoteJid, durationMs = config.pauseDurationMs) {
    if (!remoteJid) return;
    this.pausedChats.set(remoteJid, Date.now() + durationMs);
  }

  /**
   * Despausa a IA imediatamente (quando o Doutor envia /voltar).
   */
  unpauseChat(remoteJid) {
    if (!remoteJid) return;
    this.pausedChats.delete(remoteJid);
  }
}

module.exports = new StateManager();
