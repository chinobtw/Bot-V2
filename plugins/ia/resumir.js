// /resumir: resume el mensaje que respondés (o el texto que escribas) con Gemini
const { geminiError, geminiPedir } = require('../../src/lib/ia');
const { argsDe, comando, responder, textoCitado } = require('../../src/lib/medios');
const { sock } = require('../../src/lib/state');

async function resumirCmd(c) {
  const reply = responder(c), texto = (textoCitado(c.m) || argsDe(c)).slice(0, 12000);
  if (texto.length < 200) return reply(texto? '📄 Ese texto es corto, no hace falta resumirlo (mínimo 200 caracteres)' : 'Uso: respondé a un mensaje largo con /resumir (o escribí /resumir <texto>)');
  sock.sendPresenceUpdate('composing', c.jid).catch(() => {});
  try {
    const out = await geminiPedir({ tokens: 700, sistema: 'Resumí el texto en español rioplatense, en no más de 5 viñetas cortas, sin agregar información que no esté en el texto. Respondé solo con el resumen.', texto });
    await reply(`📝 *Resumen*\n${out.slice(0, 3000)}`);
  } catch (e) { console.error('[resumir]', e.motivo || '', e.message); await reply(geminiError(e)); }
}

module.exports.commands = [{ test: comando('resumir', 'resumen'), run: resumirCmd }];
