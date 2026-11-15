// /automsj: mensajes automáticos programados
const { data, save } = require('../../src/db/automsj');
const { ctxBot, getMainSock, instances, isAdmin, sock } = require('../../src/lib/state');

const DIAS = { D: 0, L: 1, M: 2, X: 3, J: 4, V: 5, S: 6 };
const NOMBRES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
function parse(args) {
  const [m, h, d] = args.split('|').map(s => s.trim());
  if (!m ||!h ||!d) return null;
  const msg = m.replace(/^["“”]|["“”]$/g, '').trim();
  const t = h.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!msg ||!t) return null;
  const hh = +t[1], mm = +(t[2] || 0);
  if (hh > 23 || mm > 59) return null;
  let dias;
  if (/^todos/i.test(d)) dias = [0, 1, 2, 3, 4, 5, 6];
  else {
    const tk = d.toUpperCase().split(/[\s,]+/).filter(Boolean);
    if (!tk.length ||!tk.every(x => x in DIAS)) return null;
    dias = [...new Set(tk.map(x => DIAS[x]))];
  }
  return { msg, h: hh, m: mm, dias };
}
async function handle(m, jid, args) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!(await isAdmin(jid, m).catch(() => false))) return reply('⛔ Solo admins');
  if (/^off$/i.test(args)) {
    const n = (data[jid] || []).length;
    delete data[jid]; save();
    return reply(n? `🛑 ${n} eliminada(s)` : 'No había nada');
  }
  if (/^list$/i.test(args)) {
    const l = data[jid] || [];
    if (!l.length) return reply('No hay automatizaciones');
    return reply(l.map((a, i) => `${i + 1}. "${a.msg}" — ${String(a.h).padStart(2, '0')}:${String(a.m).padStart(2, '0')} — ${a.dias.length === 7? 'todos' : a.dias.map(x => NOMBRES[x]).join(' ')}`).join('\n'));
  }
  const p = parse(args);
  if (!p) return reply('Uso: /automsj "mensaje" | 14:30 | todos');
  (data[jid] ||= []).push({...p, bot: ctxBot().id }); save();
  reply('✅ Programado');
}

function tick() {
  if (!getMainSock()) return;
  const n = new Date(Date.now() - 3 * 3600e3);
  const dia = n.getUTCDay(), hh = n.getUTCHours(), mm = n.getUTCMinutes();
  const key = `${n.getUTCFullYear()}-${n.getUTCMonth()}-${n.getUTCDate()} ${hh}:${mm}`;
  let dirty = false;
  for (const [jid, list] of Object.entries(data)) for (const a of list) if (a.h === hh && a.m === mm && a.dias.includes(dia) && a.last!== key) {
    a.last = key; dirty = true; (instances.get(a.bot || 'main')?.sock || getMainSock()).sendMessage(jid, { text: a.msg }).catch(() => {});
  }
  if (dirty) save();
}
setInterval(tick, 20000);
const CMD_AUTOMSJ = [{ test: c => c.enGrupo && /^\/automsj(\s|$)/i.test(c.text), run: c => handle(c.m, c.jid, c.text.slice(8).trim()) }];

module.exports.commands = [...CMD_AUTOMSJ];
