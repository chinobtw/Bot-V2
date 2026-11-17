// Ayudas para los comandos que trabajan con una foto, un audio o un texto (el mensaje, o el que se responde)
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { TT_DIR } = require('./descarga');
const { socBajar, socDesenvolver } = require('./social');
const { sock } = require('./state');

const ctxDe = m => Object.values(m.message || {}).map(v => v?.contextInfo).find(Boolean);

// comando("tr", "translate") -> test(c): el texto (o el pie de la foto) empieza con /tr o /translate
const comando = (...nombres) => {
  const re = new RegExp('^\\/(' + nombres.join('|') + ')(\\s|$)', 'iu');
  return c => re.test(c.text) || re.test(c.cap);
};
// lo que viene después del comando
const argsDe = c => (c.text.startsWith('/')? c.text : c.cap).replace(/^\/\S+\s*/u, '').trim();
const responder = c => (t, mentions = []) => sock.sendMessage(c.jid, { text: t, mentions }, { quoted: c.m });

// el primer mensaje con alguno de esos tipos: el propio o el que se responde (también "ver una vez"). Devuelve { tipo, msg, fuente }
function mediaDe(m, jid, tipos) {
  const ctx = ctxDe(m), q = ctx?.quotedMessage;
  const propio = socDesenvolver(m.message), citado = q? socDesenvolver(q) : null;
  for (const [msg, esCitado] of [[propio, false], [citado, true]]) {
    const tipo = msg && tipos.find(t => msg[t]);
    if (!tipo) continue;
    const fuente = esCitado? { key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: msg } : { key: m.key, message: msg };
    return { tipo, msg, fuente };
  }
  return null;
}
// texto del mensaje que se responde
function textoCitado(m) {
  const q = ctxDe(m)?.quotedMessage; if (!q) return '';
  const b = socDesenvolver(q);
  return (b.conversation || b.extendedTextMessage?.text || b.imageMessage?.caption || b.videoMessage?.caption || '').trim();
}

// convierte audio/video con ffmpeg (usa archivos temporales: el mp4 no se puede leer bien desde un pipe)
const execP = (cmd, args, ms) => new Promise((ok, mal) => execFile(cmd, args, { timeout: ms, maxBuffer: 4 * 1024 * 1024 }, (e, so, se) => e? mal(Object.assign(e, { stderr: String(se || '') })) : ok(String(so))));
async function ffmpeg(buf, args, extSalida) {
  fs.mkdirSync(TT_DIR, { recursive: true });
  const base = path.join(TT_DIR, `m_${Date.now()}_${Math.random().toString(36).slice(2)}`), ent = base + '.in', sal = base + '.' + extSalida;
  try {
    fs.writeFileSync(ent, buf);
    await execP('ffmpeg', ['-y', '-i', ent, ...args, sal], 120000);
    const out = fs.readFileSync(sal);
    if (!out.length) throw new Error('ffmpeg no generó nada');
    return out;
  } finally { fs.rmSync(ent, { force: true }); fs.rmSync(sal, { force: true }); }
}
const aMp3 = buf => ffmpeg(buf, ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k'], 'mp3');
const aNotaDeVoz = buf => ffmpeg(buf, ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1'], 'ogg');

module.exports = { aMp3, aNotaDeVoz, argsDe, comando, ctxDe, ffmpeg, mediaDe, responder, socBajar, textoCitado };
