// Reglas de la economía: billetera, banco, racha diaria, cooldowns
const { eco, saveEco } = require('../db/economia');
const { currency } = require('./identidad');
const { idsDe, num, senderIds, sock } = require('./state');

// comandos de la economía (para poder apagarla por grupo con /economy off)
const ECO_RE = /^\/(daily|w|work|crime|delito|minar|hacking|rob|dep|d|deposit|depositar|with|retirar|withdraw|bal|balance|rt|roulette|ruleta|cf|coinflip|bj|blackjack|maq|maquinita|pay|givecoins|coinsgive|baltop|economyboard|eboard|economyinfo|einfo|dados|dice|loteria|lotería|lottery|prestamo|préstamo|loan)(\s|$)/i;

const DAILY_BASE = 30000, DAILY_PASO = 5000, DAILY_MAX = 500000;
const AR_OFFSET = 3 * 3600e3;                                            // Argentina: UTC-3, sin horario de verano
const hoyAR = () => new Date(Date.now() - AR_OFFSET).toISOString().slice(0, 10);  // "AAAA-MM-DD" según la hora argentina
const msHastaMedianoche = () => 86400e3 - ((Date.now() - AR_OFFSET) % 86400e3);
const fmtNum = n => '$' + Math.round(n).toLocaleString('en-US');
const din = n => `${fmtNum(n)} \`${currency()}\``;                       // monto + moneda del bot (/setbotcurrency)
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function fmtTiempo(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return [d && d + 'd', h && h + 'h', m && m + 'm', (x &&!d &&!h) && x + 's'].filter(Boolean).join(' ') || '1s';
}

// identifica a la persona con todos sus ids (número y LID) para no duplicarla
async function ecoIds(m, jid) {
  let ids = senderIds(m, jid);
  if (jid.endsWith('@g.us')) {
    const meta = await sock.groupMetadata(jid).catch(() => null);
    const p = meta?.participants.find(p => idsDe(p).some(x => ids.includes(x)));
    if (p) ids = [...new Set([...ids,...idsDe(p)])];
  }
  return ids;
}
function ecoGet(chat, ids, crear = true) {
  const g = eco[chat] || (crear? (eco[chat] = {}) : null);
  const k = g && Object.keys(g).find(k => g[k].ids.some(x => ids.includes(x)));
  if (k) { const u = g[k]; u.ids = [...new Set([...u.ids,...ids])]; return u; }
  if (!crear) return null;
  return (g[ids[0]] = { ids: [...ids], cartera: 0, banco: 0, dias: 0, ultDaily: null, cd: {}, ult: 0 });
}
// cualquier comando cuenta como "usar el bot" (para saber si alguien está distraído y se le puede robar)
function ecoTocar(jid, m) {
  const g = eco[jid]; if (!g) return;
  const ids = senderIds(m, jid), k = Object.keys(g).find(k => g[k].ids.some(x => ids.includes(x)));
  if (k) { g[k].ult = Date.now(); saveEco(); }
}
// a quién se refiere el comando: mención o mensaje citado
async function ecoObjetivo(m, jid) {
  const ctx = m.message.extendedTextMessage?.contextInfo;
  const t = ctx?.mentionedJid?.[0] || ctx?.participant;
  if (!t) return null;
  let ids = [num(t)], jidMencion = t;
  if (jid.endsWith('@g.us')) {
    const meta = await sock.groupMetadata(jid).catch(() => null);
    const p = meta?.participants.find(p => idsDe(p).includes(num(t)));
    if (p) { ids = [...new Set([...ids,...idsDe(p)])]; jidMencion = p.id; }
  }
  return { ids, jid: jidMencion };
}
const cdRestante = (u, k, ms) => Math.max(0, (u.cd[k] || 0) + ms - Date.now());
const cdPoner = (u, k) => { u.cd[k] = Date.now(); };

// ----- /daily: sale por día calendario argentino (00:00 a 00:00). La racha es GLOBAL (una por persona, vale para todos los grupos):
//       se cobra una vez por grupo y por día, pero la racha solo sube un día por día calendario. Si se pasa un día entero sin cobrar en ningún grupo, vuelve a 30.000 -----
const ayerAR = () => new Date(Date.now() - AR_OFFSET - 86400e3).toISOString().slice(0, 10);
// la racha global vive en eco['@racha'] (dentro de economia.json, así entra en el /backup)
function ecoRacha(ids) {
  const R = eco['@racha'] || (eco['@racha'] = {});
  const k = Object.keys(R).find(k => R[k].ids.some(x => ids.includes(x)));
  if (k) { const r = R[k]; r.ids = [...new Set([...r.ids,...ids])]; return r; }
  // primera vez: hereda la racha que ya tenía en sus grupos (la mejor de las que siguen vivas: hoy o ayer; si ninguna, la más reciente)
  const hoy = hoyAR(), ayer = ayerAR();
  let dias = 0, ult = null, vivas = false;
  for (const [chat, g] of Object.entries(eco)) {
    if (chat === '@racha') continue;
    for (const u of Object.values(g)) {
      if (!u.ids?.some(x => ids.includes(x)) ||!u.ultDaily) continue;
      const viva = u.ultDaily === hoy || u.ultDaily === ayer;
      if (viva &&!vivas) { vivas = true; dias = 0; ult = null; }   // desde que hay una viva, las muertas ya no cuentan
      if (vivas &&!viva) continue;
      if (vivas? u.dias > dias : (!ult || u.ultDaily > ult)) { dias = u.dias; if (!vivas) ult = u.ultDaily; }
      if (vivas && (!ult || u.ultDaily > ult)) ult = u.ultDaily;
    }
  }
  return (R[ids[0]] = { ids: [...ids], dias, ultDaily: ult });
}

module.exports = { DAILY_BASE, DAILY_MAX, DAILY_PASO, ECO_RE, ayerAR, cdPoner, cdRestante, din, ecoGet, ecoIds, ecoObjetivo, ecoRacha, ecoTocar, fmtTiempo, hoyAR, msHastaMedianoche, rnd };
