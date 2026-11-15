// /mute y /unmute
const { OWNER } = require('../../config');
const { mutes, saveMutes } = require('../../src/db/mutes');
const { botIds, idsDe, isAdmin, isOwner, num, senderIds, sock } = require('../../src/lib/state');

const UNIDADES = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 };
const UNIDAD_TXT = { s: 'segundo(s)', m: 'minuto(s)', h: 'hora(s)', d: 'día(s)' };
function isMuted(jid, m) {
  const g = mutes[jid];
  if (!g) return false;
  const ids = senderIds(m, jid);
  for (const [k, e] of Object.entries(g)) {
    if (e.until && Date.now() > e.until) { delete g[k]; saveMutes(); continue; }
    if (e.ids.some(x => ids.includes(x))) return true;
  }
  return false;
}
function restante(ms) {
  const a = new Date(), b = new Date(Date.now() + ms);
  let y = b.getUTCFullYear() - a.getUTCFullYear(); let mo = b.getUTCMonth() - a.getUTCMonth();
  let d = b.getUTCDate() - a.getUTCDate(); let h = b.getUTCHours() - a.getUTCHours();
  let mi = b.getUTCMinutes() - a.getUTCMinutes(); let s = b.getUTCSeconds() - a.getUTCSeconds();
  if (s < 0) { s += 60; mi--; } if (mi < 0) { mi += 60; h--; } if (h < 0) { h += 24; d--; }
  if (d < 0) { d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); mo--; } if (mo < 0) { mo += 12; y--; }
  return [y, mo, d, h, mi, s];
}
function fmtRestante(until) {
  if (!until) return '♾️ Permanente';
  const v = restante(until - Date.now()).map(x => String(x).padStart(2, '0')).join(' | ');
  return '```AA | MM | DD | HH | MM | SS\n' + v + '```';
}
async function muteStatus(jid, target, reply) {
  const g = mutes[jid] || {}; let dirty = false;
  for (const [k, e] of Object.entries(g)) if (e.until && Date.now() > e.until) { delete g[k]; dirty = true; }
  const meta = await sock.groupMetadata(jid);
  const jidDe = e => e.jid || meta.participants.find(p => idsDe(p).some(x => e.ids.includes(x)))?.id;
  if (target) {
    const p = meta.participants.find(p => idsDe(p).includes(num(target)));
    const ids = p? idsDe(p) : [num(target)];
    const e = Object.values(g).find(e => e.ids.some(x => ids.includes(x)));
    if (dirty) saveMutes();
    if (!e) return reply(`@${num(target)} no está muteado`, [target]);
    return reply(`🔇 @${num(target)}\n${fmtRestante(e.until)}`, [target]);
  }
  const lista = Object.values(g);
  if (!lista.length) { if (dirty) saveMutes(); return reply('No hay muteados'); }
  const mentions = []; const bloques = lista.map(e => {
    const j = jidDe(e); if (j &&!e.jid) { e.jid = j; dirty = true; } if (j) mentions.push(j);
    return `🔇 @${num(j || e.ids[0])}\n${fmtRestante(e.until)}`;
  });
  if (dirty) saveMutes();
  return reply(bloques.join('\n\n'), mentions);
}
async function muteCmd(m, jid, text, unmute) {
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!(await isOwner(m, jid)) &&!(await isAdmin(jid, m).catch(() => false))) return reply('⛔ Solo admins');
  const ctx = m.message.extendedTextMessage?.contextInfo;
  const target = ctx?.mentionedJid?.[0] || ctx?.participant;
  if (!unmute && /^status$/i.test(text.trim().split(/\s+/)[1] || '')) return muteStatus(jid, target, reply);
  if (!target) return reply('Uso: /mute @usuario 30s | 5m | 2h | perma');
  const meta = await sock.groupMetadata(jid);
  const p = meta.participants.find(p => idsDe(p).includes(num(target)));
  const ids = p? idsDe(p) : [num(target)];
  if (ids.includes(OWNER) || ids.some(x => botIds().includes(x))) return reply('No puedo mutear a ese');
  const g = (mutes[jid] ||= {}); const previos = Object.keys(g).filter(k => g[k].ids.some(x => ids.includes(x)));
  if (unmute) { previos.forEach(k => delete g[k]); saveMutes(); return reply(`🔊 @${num(target)} desmuteado`, [target]); }
  let until = null, label = '';
  for (const w of text.trim().split(/\s+/).slice(1)) {
    const d = w.match(/^(\d+)([smhd])$/i);
    if (d) { const u = d[2].toLowerCase(); until = Date.now() + (+d[1]) * UNIDADES[u]; label = `${d[1]} ${UNIDAD_TXT[u]}`; break; }
    if (/^perma/i.test(w)) { until = 0; label = 'permanente'; break; }
  }
  if (until === null) return reply('Falta duración: 30s, 5m, 2h, 7d o perma');
  if (!meta.participants.some(p => p.admin && idsDe(p).some(x => botIds().includes(x)))) return reply('⚠️ Necesito ser admin');
  previos.forEach(k => delete g[k]); g[ids[0]] = { ids, until, jid: target }; saveMutes();
  reply(`🔇 @${num(target)} muteado (${label})`, [target]);
}
const CMD_MUTE = [{ test: c => c.enGrupo && /^\/(un)?mute(\s|$)/i.test(c.text), run: c => muteCmd(c.m, c.jid, c.text, /^\/unmute/i.test(c.text)) }];

module.exports = { isMuted };
module.exports.commands = [...CMD_MUTE];
