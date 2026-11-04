# 🤖 Helisa Core (Versão em Código Puro)

Versão em código Node.js de alta performance da **Helisa**, secretária virtual da Clínica Odontológica Dr. Hélcio.

---

## 📁 Estrutura do Projeto

* `src/prompt.js`: Prompt dinâmico com fuso de SP e todas as regras da clínica (urgências de dor, bloqueio Dra. Isabel, regras de sexta-feira, respostas de lembretes `👍`).
* `src/agent.js`: Agente OpenAI (GPT-4o) com Function Calling / Ferramentas nativas.
* `src/state.js`: Gestão de intervenção humana (pausa automática de 12h se a clínica responder; comando `/voltar`).
* `src/memory.js`: Histórico de conversas por paciente (*Window Buffer*).
* `src/tools/calendar.js`: Algoritmo exato de cálculo de slots vagos na agenda do Dr. Hélcio.
* `src/tools/sheets.js`: Busca e gravação de pacientes.
* `src/audio.js`: Transcrição de áudio do WhatsApp com Whisper.
* `src/server.js`: Servidor Fastify recebendo o Webhook da Evolution API.
* `src/simulate.js`: Simulador de terminal para testes rápidos sem precisar do WhatsApp.

---

## 🚀 Como Testar Localmente (Modo Simulador)

1. Abra o arquivo `.env` e adicione sua chave:
   ```env
   OPENAI_API_KEY=sk-proj-...
   ```
2. No terminal (PowerShell), entre na pasta e execute:
   ```powershell
   cmd.exe /c npm run simulate
   ```
3. Converse com a Helisa simulando ser um paciente e veja a velocidade em milissegundos!

---

## 📡 Como Rodar o Servidor Webhook

```powershell
cmd.exe /c npm start
```
* O servidor subirá na porta 3000: `http://localhost:3000/webhook/evolution`.
