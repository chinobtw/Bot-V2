// /killinactive: expulsa a los de la lista de inactivos
const { botIds, idsDe, isAdmin, isOwner, sleep, sock } = require('../../src/lib/state');

function parseSel(args) {
  if (/^all$/i.test(args.trim())) return 'all';
  const set = new Set();
  for (const tk of args.split(/[,\s]+/).filter(Boolean)) {
    const r = tk.match(/^(\d+)(?:-(\d+))?$/); if (!r) return null;
    const a = +r[1], b = r[2]? +r[2] : a; if (b < a) return null;
    for (let i = a; i <= b; i++) set.add(i);
  }
  return set.size? set : null;
}
async function killInactive(m, jid, text) {
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!(await isOwner(m, jid)) &&!(await isAdmin(jid, m).catch(() => false))) return reply('⛔ Solo admins');
  const args = text.trim().split(/\s+/).slice(1).join(' '); const sel = parseSel(args);
  const ctx = m.message.extendedTextMessage?.contextInfo; const q = ctx?.quotedMessage;
  if (!sel ||!q) return reply('Respondé a #topinactive con: /killinactive all | 5 | 1-8');
  const qt = q.conversation || q.extendedTextMessage?.text || ''; const qm = q.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (!qm.length) return reply('❌ Sin menciones');
  const filas = qt.split('\n').map(l => l.match(/\*#(\d+)\*/)).filter(Boolean).map(r => +r[1]);
  const entradas = filas.map((n, i) => ({ n, jid: qm[i] }));
  const elegidas = sel === 'all'? entradas : entradas.filter(e => sel.has(e.n));
  if (!elegidas.length) return reply('❌ Ninguno en lista');
  const meta = await sock.groupMetadata(jid);
  if (!meta.participants.some(p => p.admin && idsDe(p).some(x => botIds().includes(x)))) return reply('⚠️ Necesito ser admin');
  await reply(`🚀 Expulsando ${elegidas.length}...`);
  for (const e of elegidas) { try { await sock.groupParticipantsUpdate(jid, [e.jid], 'remove'); } catch {} await sleep(1500); }
}
const CMD_KILLINACTIVE = [{ test: c => c.enGrupo && /^\/killinactive(\s|$)/i.test(c.text), run: c => killInactive(c.m, c.jid, c.text) }];

module.exports = { parseSel };
module.exports.commands = [...CMD_KILLINACTIVE];
