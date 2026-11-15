// Moderación: close, open, tag, kick, warns, ban, promote, demote, onlyadmin
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const { OWNER } = require('../../config');
const { parseSel } = require('./killinactive');
const { isAllowed } = require('../owner/whitelist');
const { mdr, saveMdr } = require('../../src/db/moderacion');
const { rxLimpio, rxNombreDe } = require('../../src/lib/nombres');
const { botIds, idsDe, instances, isAdmin, num, senderIds, sock } = require('../../src/lib/state');

const MOD_RE = /^\/(close|open|tag|hidetag|todos|everyone|all|onlyadmin|kick|promote|demote|warn|setwarnlimit|warnstotal|delwarn|ban|pardon)(\s|$)/i;
const WARN_LIMITE = 3;
const warnLimite = jid => mdr.warnlimit[jid] || WARN_LIMITE;
const modCtx = m => Object.values(m.message || {}).map(v => v?.contextInfo).find(Boolean);
const modObjetivo = m => { const c = modCtx(m); return c?.mentionedJid?.[0] || c?.participant || null; };
const modPuede = async (m, jid) => (await isAllowed(m, jid).catch(() => false)) || (await isAdmin(jid, m).catch(() => false));
const modBotAdmin = meta => meta.participants.some(p => p.admin && idsDe(p).some(x => botIds().includes(x)));
const modBots = () => [...new Set([...botIds(), ...[...instances.values()].flatMap(i => [i.sock?.user?.id, i.sock?.user?.lid]).filter(Boolean).map(num)])];
const modProtegido = ids => ids.includes(OWNER) || ids.some(x => modBots().includes(x));
function modRef(meta, t) {
  const p = meta?.participants.find(p => idsDe(p).includes(num(t)));
  return { p, ids: p? [...new Set([num(t), ...idsDe(p)])] : [num(t)], jid: p?.id || t };
}
const modFecha = t => new Date(t).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
// "@usuario" si sigue en el grupo; si no, su nombre de WhatsApp (pushName) o el número
function modEtiqueta(meta, ids, jidGuardado, nombre) {
  const p = meta?.participants.find(p => idsDe(p).some(x => ids.includes(x)));
  if (p) return { txt: '@' + num(p.id), jid: p.id };
  return { txt: nombre || rxNombreDe(ids) || '+' + num(jidGuardado || ids[0]), jid: null };
}
const modWarnEntrada = (jid, ids) => { const g = mdr.warns[jid]; const k = g && Object.keys(g).find(k => g[k].ids.some(x => ids.includes(x))); return k? [g, k] : [g, null]; };
function esBaneado(m, jid) {
  if (!mdr.bans.length) return false;
  const ids = senderIds(m, jid);
  const e = mdr.bans.find(e => e.ids.some(x => ids.includes(x)));
  if (!e) return false;
  const nuevos = ids.filter(x => !e.ids.includes(x));
  if (nuevos.length) { e.ids.push(...nuevos); saveMdr(); }   // aprende su otro id (número / LID)
  return true;
}
// manda el mensaje citado tal cual (texto, foto, video, audio, sticker, documento) mencionando a todos, respondiendo al comando
const TAG_TIPOS = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage', 'contactMessage', 'locationMessage'];
async function modReenviar(m, jid, citado, mentions) {
  const tipo = Object.keys(citado).find(k => k !== 'messageContextInfo');
  if (!TAG_TIPOS.includes(tipo)) return false;
  const contenido = tipo === 'conversation'
    ? { extendedTextMessage: { text: citado.conversation, contextInfo: { mentionedJid: mentions } } }
    : { [tipo]: { ...citado[tipo], contextInfo: { mentionedJid: mentions } } };
  const msg = generateWAMessageFromContent(jid, contenido, { quoted: m, userJid: sock.user.id });
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
  return true;
}
async function modCmd(m, jid, text) {
  const nombre = ((text.match(/^\/(\w+)/) || [])[1] || '').toLowerCase();
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  const args = text.replace(/^\/\S+\s*/, '').trim();
  const grupo = jid.endsWith('@g.us');

  // ---- ban / pardon: solo dueño y whitelist (los demás, silencio) ----
  if (nombre === 'ban' || nombre === 'pardon') {
    if (!(await isAllowed(m, jid).catch(() => false))) return;
    let ids, tj = null;
    const t = modObjetivo(m);
    if (t) {
      const meta = grupo? await sock.groupMetadata(jid).catch(() => null) : null;
      const r = modRef(meta, t); ids = r.ids; tj = r.jid;
    } else {
      const n = args.replace(/[\s+\-()]/g, '');
      if (!/^\d{8,15}$/.test(n)) return reply(`Uso: /${nombre} @usuario (o respondiendo a su mensaje, o el número a secas)`);
      ids = [n]; tj = n + '@s.whatsapp.net';
    }
    const idx = mdr.bans.findIndex(e => e.ids.some(x => ids.includes(x)));
    const tag = '@' + num(tj);
    if (nombre === 'ban') {
      if (modProtegido(ids)) return reply('No puedo banear a ese');
      if (idx >= 0) return reply(`${tag} ya estaba baneado`, [tj]);
      mdr.bans.push({ ids, jid: tj, t: Date.now(), por: num(senderIds(m, jid)[0]) }); saveMdr();
      return reply(`🔨 ${tag} fue baneado: no puede usar el bot hasta que lo desbaneen`, [tj]);
    }
    if (idx < 0) return reply(`${tag} no estaba baneado`, [tj]);
    mdr.bans.splice(idx, 1); saveMdr();
    return reply(`✅ ${tag} desbaneado: ya puede usar el bot de nuevo`, [tj]);
  }

  // ---- /warnstotal lo puede ver cualquiera ----
  if (!grupo) return reply('Este comando es solo para grupos');
  if (nombre !== 'warnstotal' && !(await modPuede(m, jid))) return reply('⛔ Solo admins');
  const meta = await sock.groupMetadata(jid);
  const limite = warnLimite(jid);

  if (nombre === 'close' || nombre === 'open') {
    if (!modBotAdmin(meta)) return reply('⚠️ Necesito ser admin');
    await sock.groupSettingUpdate(jid, nombre === 'close'? 'announcement' : 'not_announcement');
    return void sock.sendMessage(jid, { react: { text: '✅', key: m.key } }).catch(() => {});
  }

  if (/^(tag|hidetag|todos|everyone|all)$/.test(nombre)) {
    const mentions = meta.participants.map(p => p.id);
    if (args) return void await sock.sendMessage(jid, { text: args, mentions }, { quoted: m });
    const cit = modCtx(m)?.quotedMessage;
    if (!cit) return reply(`Uso: /${nombre} mensaje (o respondé a un mensaje con /${nombre})`);
    if (!(await modReenviar(m, jid, cit, mentions))) return reply('❌ No puedo reenviar ese tipo de mensaje');
    return;
  }

  if (nombre === 'onlyadmin') {
    const a = args.toLowerCase();
    if (!a) return reply(`🛡️ Solo admins: *${mdr.onlyadmin[jid]? 'activado' : 'desactivado'}* en este grupo\n> Se cambia con /onlyadmin on o /onlyadmin off`);
    if (a !== 'on' && a !== 'off') return reply('Uso: /onlyadmin on | /onlyadmin off | /onlyadmin (ver el estado)');
    if (a === 'on') mdr.onlyadmin[jid] = true; else delete mdr.onlyadmin[jid];
    saveMdr();
    return reply(a === 'on'? '🛡️ Listo: ahora solo los admins pueden usar el bot en este grupo' : '✅ Ahora todos pueden usar el bot en este grupo');
  }

  if (nombre === 'setwarnlimit') {
    if (!args) return reply(`⚠️ Límite de advertencias: *${limite}*\n> Se cambia con /setwarnlimit <número>`);
    const n = /^\d{1,2}$/.test(args)? +args : 0;
    if (n < 1 || n > 20) return reply('Uso: /setwarnlimit <número del 1 al 20>');
    mdr.warnlimit[jid] = n; saveMdr();
    return reply(`✅ Límite de advertencias: *${n}* (al llegar, se expulsa al usuario)`);
  }

  if (nombre === 'warnstotal') {
    const t = modObjetivo(m);
    const g = mdr.warns[jid] || {};
    let ents = Object.values(g).filter(e => e.lista.length);
    if (t) { const { ids } = modRef(meta, t); ents = ents.filter(e => e.ids.some(x => ids.includes(x))); }
    if (!ents.length) return reply(t? '✅ Ese usuario no tiene advertencias' : '✅ Nadie tiene advertencias en este grupo');
    const bloques = ents.map(e => {
      const u = modEtiqueta(meta, e.ids, e.jid), ms = u.jid? [u.jid] : [];
      const lineas = [`👤 ${u.txt} — ${e.lista.length}/${limite}`];
      e.lista.forEach((w, i) => {
        const q = modEtiqueta(meta, [w.por], w.por + '@s.whatsapp.net', w.porNombre);
        if (q.jid) ms.push(q.jid);
        lineas.push(`  ${i + 1}) ${modFecha(w.t)} · por ${q.txt}`, `     Razón: ${w.razon}`);
      });
      return { txt: lineas.join('\n'), ms };
    });
    let txt = `⚠️ *Advertencias* (límite ${limite})`, ms = [];
    for (const b of bloques) {
      if ((txt + '\n\n' + b.txt).length > 3500) { await reply(txt, ms); txt = ''; ms = []; }
      txt += (txt? '\n\n' : '') + b.txt; ms.push(...b.ms);
    }
    return reply(txt, [...new Set(ms)]);
  }

  // ---- los que necesitan un objetivo (@ o mensaje citado) ----
  const t = modObjetivo(m);
  const sinMenciones = args.replace(/(^|\s)@\S+/g, ' ').trim();   // saca las menciones del texto
  if (!t) {
    return reply({ kick: 'Uso: /kick @usuario (o respondiendo a su mensaje)', promote: 'Uso: /promote @usuario (o respondiendo a su mensaje)', demote: 'Uso: /demote @usuario (o respondiendo a su mensaje)', warn: 'Uso: /warn <razón> con @usuario (o respondiendo a su mensaje)', delwarn: `Uso: /delwarn @usuario <1-${limite}|all> (o respondiendo a su mensaje)` }[nombre]);
  }
  const r = modRef(meta, t), tag = '@' + num(r.jid);
  if (!r.p) return reply('Ese usuario no está en el grupo');
  if (nombre!== 'promote' &&!(nombre === 'demote' && r.p.admin === 'superadmin') && modProtegido(r.ids)) return reply(nombre === 'kick'? 'No puedo expulsar a ese' : 'No puedo hacerle eso a ese');
  const quienEs = (await isAllowed(m, jid).catch(() => false));

  if (nombre === 'kick') {
    if (r.p.admin && !quienEs) return reply('🛡️ No puedo expulsar a un admin');
    if (!modBotAdmin(meta)) return reply('⚠️ Necesito ser admin');
    await sock.groupParticipantsUpdate(jid, [r.jid], 'remove');
    return reply(`👢 ${tag} fue expulsado del grupo`, [r.jid]);
  }

  if (nombre === 'promote' || nombre === 'demote') {
    const dar = nombre === 'promote';
    if (dar && r.p.admin) return reply(`${tag} ya es admin`, [r.jid]);
    if (!dar &&!r.p.admin) return reply(`${tag} no es admin`, [r.jid]);
    if (!dar && r.p.admin === 'superadmin') return reply('🛡️ Ese es el creador del grupo: no se le puede sacar el admin');
    if (!modBotAdmin(meta)) return reply('⚠️ Necesito ser admin');
    const res = await sock.groupParticipantsUpdate(jid, [r.jid], dar? 'promote' : 'demote');
    const st = String(res?.[0]?.status || '200');
    if (st!== '200') return reply(`❌ No pude ${dar? 'darle' : 'sacarle'} el admin a ${tag} (código ${st})`, [r.jid]);
    return reply(dar? `👑 ${tag} ahora es admin` : `⬇️ ${tag} ya no es admin`, [r.jid]);
  }

  if (nombre === 'warn') {
    if (r.p.admin) return reply('🛡️ No puedo advertir a un admin');
    const razon = (sinMenciones || 'Sin razón').slice(0, 200);
    const g = (mdr.warns[jid] ||= {});
    let [, k] = modWarnEntrada(jid, r.ids);
    if (!k) { k = r.ids[0]; g[k] = { ids: r.ids, jid: r.jid, lista: [] }; }
    const e = g[k]; e.ids = [...new Set([...e.ids, ...r.ids])]; e.jid = r.jid;
    const por = senderIds(m, jid)[0];
    e.lista.push({ t: Date.now(), por, porNombre: rxLimpio(m.pushName), razon });
    const n = e.lista.length;
    if (n >= limite) {
      if (!modBotAdmin(meta)) { saveMdr(); return reply(`⚠️ ${tag} llegó al límite (${n}/${limite}) pero necesito ser admin para expulsarlo\nRazón: ${razon}`, [r.jid]); }
      delete g[k]; saveMdr();
      await sock.groupParticipantsUpdate(jid, [r.jid], 'remove');
      return reply(`🚫 ${tag} llegó al límite de advertencias (${n}/${limite}) y fue expulsado\nÚltima razón: ${razon}`, [r.jid]);
    }
    saveMdr();
    return reply(`⚠️ ${tag} recibió una advertencia (${n}/${limite})\nRazón: ${razon}`, [r.jid]);
  }

  if (nombre === 'delwarn') {
    const [g, k] = modWarnEntrada(jid, r.ids);
    if (!k || !g[k].lista.length) return reply(`✅ ${tag} no tiene advertencias`, [r.jid]);
    const sel = parseSel(sinMenciones);
    if (!sel) return reply(`Uso: /delwarn @usuario <1-${limite}|all> (ej: 2, 1-3 o all)`);
    const e = g[k], antes = e.lista.length;
    if (sel === 'all') e.lista = [];
    else e.lista = e.lista.filter((_, i) => !sel.has(i + 1));
    const borradas = antes - e.lista.length;
    if (!borradas) return reply(`❌ ${tag} tiene ${antes} advertencia${antes === 1? '' : 's'}: elegí un número del 1 al ${antes} o all`, [r.jid]);
    if (!e.lista.length) delete g[k];
    saveMdr();
    return reply(`✅ ${borradas} advertencia${borradas === 1? '' : 's'} eliminada${borradas === 1? '' : 's'} a ${tag} (ahora ${e.lista.length}/${limite})`, [r.jid]);
  }
}
const CMD_MOD = [{ test: c => MOD_RE.test(c.text), run: c => modCmd(c.m, c.jid, c.text) }];

module.exports = { esBaneado, modBotAdmin, modBots, modCtx, modPuede };
module.exports.commands = [...CMD_MOD];
