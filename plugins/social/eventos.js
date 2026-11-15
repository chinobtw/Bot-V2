// Bienvenida y despedida de grupos
const { modBots } = require('../admin/moderacion');
const { grp } = require('../../src/db/social');
const { actAlta } = require('../../src/lib/actividad');
const { soyElElegido } = require('../../src/lib/eleccion');
const { num, sock } = require('../../src/lib/state');

// ===== bienvenida y despedida =====
const BIENVENIDA = '👋 ¡Bienvenid@ @user a *{grupo}*!\n> Ya somos {miembros}. Usá /menu para ver qué puedo hacer.';
const DESPEDIDA = '👋 @user se fue de *{grupo}*. ¡Suerte!';
async function grupoEvento(ev) {
  const jid = ev?.id; if (!jid || !jid.endsWith('@g.us')) return;
  const accion = ev.action, lista = (ev.participants || []).map(p => typeof p === 'string'? { id: p } : p).filter(p => p?.id);
  if (!lista.length || (accion !== 'add' && accion !== 'remove')) return;
  const bots = modBots(), gente = lista.filter(p => ![p.id, p.phoneNumber, p.lid].filter(Boolean).map(num).some(x => bots.includes(x)));
  if (!gente.length || !(await soyElElegido(jid))) return;
  if (accion === 'add') for (const p of gente) actAlta(jid, [p.id, p.phoneNumber, p.lid].filter(Boolean).map(num), p.id);
  const c = grp[jid]; if (!c || !(accion === 'add'? c.welcome : c.goodbye)) return;
  const meta = await sock.groupMetadata(jid).catch(() => null);
  const mentions = gente.map(p => p.id);
  const txt = (accion === 'add'? (c.welcomeMsg || BIENVENIDA) : (c.goodbyeMsg || DESPEDIDA))
    .replace(/@user/gi, mentions.map(j => '@' + num(j)).join(', ')).replace(/\{grupo\}/gi, meta?.subject || 'el grupo').replace(/\{miembros\}/gi, meta?.participants?.length ?? '?');
  await sock.sendMessage(jid, { text: txt, mentions }).catch(e => console.error('[bienvenida]', e.message));
}

module.exports = { BIENVENIDA, DESPEDIDA, grupoEvento };
