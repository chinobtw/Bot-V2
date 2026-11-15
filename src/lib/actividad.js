// Actividad por grupo, XP y nivel global
const { act, actDisco, perf, perfDisco } = require('../db/social');
const { subReg } = require('../db/subbots');
const { SOC_DIAS_MAX, diaN } = require('./social');
const { senderIds } = require('./state');

// ===== actividad: mensajes por persona y por día (solo cuenta el bot elegido del grupo) =====
const actIdx = new Map();   // grupo -> Map(id -> registro)
const actVistos = new Set();
// nivel global: sube con los comandos de economía y apuestas (no con los mensajes). XP para llegar al nivel n = 25n(n-1)+100; del n al n+1 cuesta 50n
const xpDe = n => n < 1? 0 : 25 * n * (n - 1) + 100;
const nivelDe = xp => {
  xp = Math.max(0, xp || 0); if (xp < 100) return 0;
  let n = Math.max(1, Math.floor((25 + Math.sqrt(625 + 100 * (xp - 100))) / 50));
  while (xpDe(n + 1) <= xp) n++; while (n > 1 && xpDe(n) > xp) n--;
  return n;
};
function actIndex(chat) {
  let ix = actIdx.get(chat);
  if (!ix) { ix = new Map(); for (const r of Object.values(act[chat]?.u || {})) for (const id of r.ids) ix.set(id, r); actIdx.set(chat, ix); }
  return ix;
}
function actUnir(chat, rs) {   // la misma persona figuraba con dos ids (número y LID): se juntan sus datos
  const [a,...resto] = rs, g = act[chat];
  for (const b of resto) {
    a.n += b.n; a.xp += b.xp; a.p = Math.min(a.p, b.p); a.t = Math.max(a.t, b.t); a.xt = Math.max(a.xt || 0, b.xt || 0);
    for (const [k, v] of Object.entries(b.d || {})) a.d[k] = (a.d[k] || 0) + v;
    for (const id of b.ids) if (!a.ids.includes(id)) a.ids.push(id);
    const k = Object.keys(g.u).find(k => g.u[k] === b); if (k) delete g.u[k];
  }
  const ix = actIndex(chat); for (const id of a.ids) ix.set(id, a);
  return a;
}
function actBuscar(chat, ids) {
  if (!act[chat]) return null;
  const ix = actIndex(chat), rs = [...new Set(ids.map(id => ix.get(id)).filter(Boolean))];
  return rs.length > 1? actUnir(chat, rs) : (rs[0] || null);
}
function actReg(chat, ids, jid) {
  let r = actBuscar(chat, ids);
  if (!r) {
    const g = act[chat] || (act[chat] = { desde: Date.now(), u: {} });
    r = { ids: [], jid: jid || null, n: 0, t: 0, p: Date.now(), xp: 0, xt: 0, d: {} };
    g.u[ids[0]] = r;
  }
  const ix = actIndex(chat);
  for (const id of ids) if (!r.ids.includes(id)) { r.ids.push(id); ix.set(id, r); }
  if (jid) r.jid = jid;
  return r;
}
function actContar(m, jid) {
  const mm = m.message;
  if (mm.protocolMessage || mm.reactionMessage || mm.senderKeyDistributionMessage || mm.pollUpdateMessage) return;
  if (m.key.fromMe && /^3EB0/.test(m.key.id || '')) return;   // lo que manda el propio bot (lo que se escribe a mano desde el celular no lleva ese prefijo)
  const ids = senderIds(m, jid); if (!ids.length) return;
  if (ids.some(x => Object.keys(subReg).includes(x))) return;  // los sub-bots no cuentan
  const ts = (Number(m.messageTimestamp) || 0) * 1000 || Date.now();
  if (Date.now() - ts > 2 * 86400e3) return;                   // mensajes viejos (al reconectar) no se cuentan
  const clave = jid + '|' + m.key.id;
  if (actVistos.has(clave)) return;
  actVistos.add(clave); if (actVistos.size > 500) actVistos.delete(actVistos.values().next().value);
  const r = actReg(jid, ids, m.key.participant || null);
  r.n++; r.t = Math.max(r.t, ts);
  const dia = diaN(ts); r.d[dia] = (r.d[dia] || 0) + 1;
  const claves = Object.keys(r.d);
  if (claves.length > SOC_DIAS_MAX + 5) for (const k of claves) if (+k < dia - SOC_DIAS_MAX) delete r.d[k];
  actDisco.luego();
}
const actVentana = (r, dias) => { if (!dias) return r.n; const d0 = diaN() - dias + 1; let s = 0; for (const [k, v] of Object.entries(r.d || {})) if (+k >= d0) s += v; return s; };
// quien entra al grupo queda registrado desde ese momento (así se sabe desde cuándo no habla)
function actAlta(chat, ids, jid) { if (!actBuscar(chat, ids)) { const r = actReg(chat, ids, jid); r.t = Date.now(); actDisco.luego(); } }

// ===== perfiles (globales: valen en todos los grupos) =====
function perfGet(ids, crear = false, jid = null) {
  const k = Object.keys(perf.u).find(k => perf.u[k].ids.some(x => ids.includes(x)));
  if (k) { const u = perf.u[k], nuevos = ids.filter(x => !u.ids.includes(x)); if (nuevos.length) { u.ids.push(...nuevos); perfDisco.luego(); } if (jid) u.jid = jid; return u; }
  if (!crear) return null;
  return (perf.u[ids[0]] = { ids: [...new Set(ids)], jid, hist: [] });
}
const XP_RE = /^\/(daily|w|work|crime|delito|minar|hacking|rob|dep|d|deposit|depositar|with|retirar|withdraw|rt|roulette|ruleta|cf|coinflip|bj|blackjack|maq|maquinita|pay|givecoins|coinsgive)(\s|$)/i;   // economía y apuestas (lo que solo consulta, como /bal, no suma)
const XP_MIN = 30, XP_MAX = 65, XP_CD = 3e3;   // XP por comando (30 a 65); dentro de los 3 s del anterior suma el comando pero no la XP
const xpVistos = new Set();
function xpComando(m, jid) {
  if (m.key.fromMe && /^3EB0/.test(m.key.id || '')) return;
  const ids = senderIds(m, jid); if (!ids.length) return;
  if (ids.some(x => Object.keys(subReg).includes(x))) return;
  const clave = jid + '|' + m.key.id; if (xpVistos.has(clave)) return;
  xpVistos.add(clave); if (xpVistos.size > 500) xpVistos.delete(xpVistos.values().next().value);
  const u = perfGet(ids, true, m.key.participant || (jid.endsWith('@g.us')? null : jid)), ahora = Date.now();
  u.cmds = (u.cmds || 0) + 1;
  if (ahora - (u.xt || 0) >= XP_CD) { u.xt = ahora; u.xp = (u.xp || 0) + XP_MIN + Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)); }
  perfDisco.luego();
}
const xpPuesto = xp => Object.values(perf.u).filter(x => (x.xp || 0) > xp).length + 1;

module.exports = { XP_RE, actAlta, actBuscar, actContar, actVentana, nivelDe, perfGet, xpComando, xpDe, xpPuesto };
