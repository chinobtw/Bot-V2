// Utilidades de formato y menciones para los comandos sociales
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { rxNombreDe } = require('./nombres');
const { idsDe, num, sock } = require('./state');

const SOC_PAG = 10;                                                         // filas por página en los rankings
const SOC_DIAS_MAX = 90;                                                    // cuántos días hacia atrás se guardan los conteos
const SOC_AR = 3 * 3600e3;                                                  // Argentina: UTC-3
const diaN = (t = Date.now()) => Math.floor((t - SOC_AR) / 86400e3);        // número de día calendario argentino
const socFmt = n => Math.round(n).toLocaleString('en-US');
const socFecha = t => new Date(t - SOC_AR).toISOString().slice(0, 10).split('-').reverse().join('/');   // dd/mm/aaaa
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const quienJid = (m, jid) => m.key.participant || (m.key.fromMe? `${num(sock.user?.id)}@s.whatsapp.net` : jid);
const socMapa = meta => { const mp = new Map(); for (const p of meta.participants) for (const id of idsDe(p)) mp.set(id, p); return mp; };
const socMiembro = (mp, ids) => { for (const id of ids) { const p = mp.get(id); if (p) return p; } return null; };
// cómo se nombra a alguien en una lista: su nombre de WhatsApp si lo conocemos; si no, se lo arroba
function socEtiq(p, ids) {
  const nom = rxNombreDe([...new Set([...ids,...idsDe(p)])]);
  return nom? { txt: nom, jid: null } : { txt: '@' + num(p.id), jid: p.id };
}
const socPag = (lista, pagina, tam = SOC_PAG) => {
  const total = Math.max(1, Math.ceil(lista.length / tam)), p = Math.min(Math.max(1, Number(pagina) || 1), total);
  return { p, total, ini: (p - 1) * tam, items: lista.slice((p - 1) * tam, p * tam) };
};
const socBarra = (f, n = 10) => { const l = Math.max(0, Math.min(n, Math.round(f * n))); return '▰'.repeat(l) + '▱'.repeat(n - l); };
const socBajar = fuente => downloadMediaMessage(fuente, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
const socDesenvolver = msg => {   // saca las capas de "ver una vez", efímero, etc. hasta llegar al contenido
  let x = msg;
  for (let i = 0; i < 6 && x; i++) {
    const w = x.viewOnceMessageV2?.message || x.viewOnceMessageV2Extension?.message || x.viewOnceMessage?.message || x.ephemeralMessage?.message || x.documentWithCaptionMessage?.message || x.editedMessage?.message;
    if (!w) break; x = w;
  }
  return x || {};
};

module.exports = { MESES, SOC_AR, SOC_DIAS_MAX, diaN, quienJid, socBajar, socDesenvolver, socEtiq, socFecha, socFmt, socMapa, socMiembro, socPag };
