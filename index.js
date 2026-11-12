// index.js - para bot-hosting.net
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { AsyncLocalStorage } = require('async_hooks');
const http = require('http');
const crypto = require('crypto');

// carga el archivo .env (CLAVE=valor, con o sin espacios alrededor del =); las variables del panel tienen prioridad
try {
  for (const l of require('fs').readFileSync('./.env', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || l.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch {}

const OWNER = '5493329679781';
const FILE = './automsj.json';
const MUTES = './mutes.json';
const DIAS = { D: 0, L: 1, M: 2, X: 3, J: 4, V: 5, S: 6 };
const NOMBRES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const UNIDADES = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 };
const UNIDAD_TXT = { s: 'segundo(s)', m: 'minuto(s)', h: 'hora(s)', d: 'día(s)' };

let data = fs.existsSync(FILE)? JSON.parse(fs.readFileSync(FILE)) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
let mutes = fs.existsSync(MUTES)? JSON.parse(fs.readFileSync(MUTES)) : {};
const saveMutes = () => fs.writeFileSync(MUTES, JSON.stringify(mutes, null, 2));
const WL = './whitelist.json';
let wl = fs.existsSync(WL)? JSON.parse(fs.readFileSync(WL)) : [];
const saveWl = () => fs.writeFileSync(WL, JSON.stringify(wl, null, 2));
const NSFW_FILE = './nsfw.json';   // { "<grupo>": true }: solo están los grupos donde un admin lo activó (por defecto apagado)
let nsfw = fs.existsSync(NSFW_FILE)? JSON.parse(fs.readFileSync(NSFW_FILE)) : {};
const saveNsfw = () => fs.writeFileSync(NSFW_FILE, JSON.stringify(nsfw, null, 2));
const nsfwOn = jid => !jid.endsWith('@g.us') || !!nsfw[jid];   // en el privado siempre; en grupos, solo si un admin lo activó
const BOT_NAME = process.env.BOT_NAME || 'Bot'; // nombre por defecto (cada instancia puede tener el suyo)
const als = new AsyncLocalStorage();
let mainSock;                  // socket del bot principal
const instances = new Map();   // id ('main' o número) -> { id, name, sock }
// "sock" apunta siempre al socket de la instancia que está procesando el mensaje
const sock = new Proxy({}, {
  get(_, p) {
    const s = als.getStore()?.sock || mainSock;
    const v = s?.[p];
    return typeof v === 'function'? v.bind(s) : v;
  },
});
const ctxBot = () => als.getStore() || { id: 'main', name: BOT_NAME };

const num = j => (j || '').split('@')[0].split(':')[0];
const botIds = () => [sock.user?.id, sock.user?.lid].filter(Boolean).map(num);
const idsDe = p => [p.id, p.phoneNumber, p.lid].filter(Boolean).map(num);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function senderIds(m, jid) {
  const g = jid.endsWith('@g.us');
  const ids = g? [m.key.participant, m.key.participantAlt, m.participant] : [jid, m.key.remoteJidAlt];
  if (m.key.fromMe) ids.push(sock.user?.id, sock.user?.lid);
  return ids.filter(Boolean).map(num);
}
async function isAdmin(jid, m) {
  const meta = await sock.groupMetadata(jid);
  const ids = senderIds(m, jid);
  return meta.participants.some(p => p.admin && idsDe(p).some(x => ids.includes(x)));
}
async function isOwner(m, jid) {
  const ids = senderIds(m, jid);
  if (ids.includes(OWNER)) return true;
  if (!jid.endsWith('@g.us')) return false;
  const meta = await sock.groupMetadata(jid);
  const p = meta.participants.find(p => idsDe(p).some(x => ids.includes(x)));
  return!!p && idsDe(p).includes(OWNER);
}
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

// === LYRICS QUE SI FUNCIONA EN bot-hosting.net ===
const ax = axios.create({ timeout: 7000, headers: { 'User-Agent': 'Mozilla/5.0' } });

async function handleLyrics(sock, chatId, query, msg) {
    if (!query) return sock.sendMessage(chatId, { text: 'Uso: /lyrics artista - titulo\nEj: /lyrics The Weeknd - Blinding Lights' }, { quoted: msg });
    await sock.sendMessage(chatId, { text: `🔍 Buscando *${query}*...` }, { quoted: msg });

    let result = null;
    let qArtist = '', qTitle = query;
    if (query.includes('-')) {
        const s = query.split('-');
        qArtist = s[0].trim();
        qTitle = s.slice(1).join('-').trim();
    }

    // 1) LRCLIB SEARCH - mejor de todas
    try {
        const { data } = await ax.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
        if (data && data.length) {
            const best = data[0];
            if (best.plainLyrics) result = { artist: best.artistName, title: best.trackName, lyrics: best.plainLyrics, src: 'lrclib.net' };
        }
    } catch(e) { console.log('[lyrics] lrclib search fail:', e.message) }

    // 2) LRCLIB GET exacto si tenemos artista y titulo
    if (!result && qArtist && qTitle) {
        try {
            const { data } = await ax.get(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(qArtist)}&track_name=${encodeURIComponent(qTitle)}`);
            if (data?.plainLyrics) result = { artist: data.artistName, title: data.trackName, lyrics: data.plainLyrics, src: 'lrclib.net' };
        } catch {}
    }

    // 3) lyrics.ovh SUGGEST + V1 (cadena real)
    if (!result) {
        try {
            const sug = await ax.get(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`).catch(()=>null);
            const first = sug?.data?.data?.[0];
            if (first) {
                const art = first.artist.name;
                const tit = first.title;
                const lyr = await ax.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(art)}/${encodeURIComponent(tit)}`);
                if (lyr.data?.lyrics) result = { artist: art, title: tit, lyrics: lyr.data.lyrics, src: 'lyrics.ovh' };
            }
        } catch(e) { console.log('[lyrics] ovh suggest fail:', e.message) }
    }

    // 4) lyrics.ovh directo con lo que puso el usuario
    if (!result && qArtist && qTitle) {
        try {
            const lyr = await ax.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(qArtist)}/${encodeURIComponent(qTitle)}`);
            if (lyr.data?.lyrics) result = { artist: qArtist, title: qTitle, lyrics: lyr.data.lyrics, src: 'lyrics.ovh' };
        } catch {}
    }

    if (!result) return sock.sendMessage(chatId, { text: `❌ No encontré "${query}"\nProbá con: /lyrics artista - titulo` }, { quoted: msg });

    let txt = result.lyrics.trim();
    if (txt.length > 3800) txt = txt.slice(0, 3800) + '\n\n...[recortado]';

    await sock.sendMessage(chatId, {
        text: `🎵 *${result.title}* — ${result.artist}\n_Fuente: ${result.src}_\n\n${txt}`
    }, { quoted: msg });
}

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

// ---------- MODERACIÓN: /close /open /tag /onlyadmin /kick /warn /setwarnlimit /warnstotal /delwarn /ban /pardon ----------
// Los de grupo los usan admins, dueño y whitelist. /ban y /pardon solo dueño y whitelist (en silencio para los demás).
const MOD_FILE = './moderacion.json';   // { onlyadmin: { "<grupo>": true }, warnlimit: { "<grupo>": n }, warns: { "<grupo>": { "<id>": { ids, jid, lista: [{ t, por, porNombre, razon }] } } }, bans: [{ ids, jid, t, por }] }
let mdr = { onlyadmin: {}, warnlimit: {}, warns: {}, bans: [] };
try { if (fs.existsSync(MOD_FILE)) mdr = { ...mdr, ...JSON.parse(fs.readFileSync(MOD_FILE)) }; } catch (e) { console.error('[mod] no pude leer moderacion.json:', e.message); }
const saveMdr = () => { try { fs.writeFileSync(MOD_FILE, JSON.stringify(mdr, null, 2)); } catch (e) { console.error('[mod]', e.message); } };
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

// ---------- $ <comando>: ejecuta un comando en la shell del host (SOLO el dueño, en privado o en grupos) ----------
// Ejemplos: $ npm i   |   $ ls -la   |   $ pm2 restart all. Cada comando corre en una shell nueva dentro de la carpeta del bot (un cd no se arrastra al siguiente).
// Tope de tiempo: SHELL_TIMEOUT segundos en el .env (120 por defecto); pasado el tiempo, se corta. Un solo comando a la vez.
// La salida se manda COMPLETA: si no entra en un mensaje de WhatsApp (~65.000 caracteres), se parte en varios (por renglones).
const SH_TIMEOUT = (Number(process.env.SHELL_TIMEOUT) || 120) * 1000;
const SH_CHUNK = Math.min(Number(process.env.SHELL_CHUNK) || 65000, 68000);   // caracteres por mensaje (WhatsApp aguanta ~65.536 por mensaje de texto)
const SH_TOPE = Number(process.env.SHELL_MAX_CHARS) || 1000000;               // tope de seguridad de toda la salida (RAM y no mandar cientos de mensajes); si se pasa, se manda el final
const SH_VIEJO = 120;                     // segundos: un mensaje más viejo que esto no se ejecuta (evita repetir comandos al reconectar)
const shHechos = new Set();               // ids de mensajes ya ejecutados
let shEnCurso = false;
const shEsComando = t => /^\$\s+\S/.test(String(t || '').trim());
const shAnsi = s => String(s).replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\r(?!\n)/g, '\n');
function shEdad(m) {
  const t = m.messageTimestamp, n = t && typeof t === 'object'? (t.toNumber? t.toNumber() : Number(t.low)) : Number(t);
  return n? Date.now() / 1000 - n : 0;
}
// parte el texto en trozos de hasta `max` caracteres, cortando en saltos de línea (y, si un renglón es más largo que el tope, en el medio)
function shPartir(t, max) {
  const partes = []; let cur = '';
  for (let l of t.split('\n')) {
    while (l.length > max) {
      if (cur) { partes.push(cur); cur = ''; }
      partes.push(l.slice(0, max)); l = l.slice(max);
    }
    if (cur.length + l.length + 1 > max) { partes.push(cur); cur = l; }
    else cur = cur? cur + '\n' + l : l;
  }
  if (cur || !partes.length) partes.push(cur);
  return partes;
}
async function shellCmd(m, jid, texto) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const cmd = String(texto).trim().replace(/^\$\s+/, '');
  if (shEnCurso) return reply('⏳ Ya hay un comando corriendo. Esperá a que termine');
  shEnCurso = true;
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  reaccion('⏳');
  const t0 = Date.now();
  let salida = '', cortado = false, vencio = false;
  try {
    const codigo = await new Promise(ok => {
      const hijo = spawn('exec 2>&1\n' + cmd, { shell: true,   // el error va por la misma salida: queda todo en orden
         cwd: process.cwd(), env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const junta = d => { salida += d; if (salida.length > SH_TOPE * 2) { salida = salida.slice(-SH_TOPE); cortado = true; } };
      hijo.stdout.on('data', junta); hijo.stderr.on('data', junta);
      const reloj = setTimeout(() => { vencio = true; try { process.kill(-hijo.pid, 'SIGKILL'); } catch { try { hijo.kill('SIGKILL'); } catch {} } }, SH_TIMEOUT);
      hijo.on('error', e => { clearTimeout(reloj); salida += String(e.message); ok(-1); });
      hijo.on('close', (c, sig) => { clearTimeout(reloj); ok(c === null? (sig || -1) : c); });
    });
    let out = shAnsi(salida).trim().replace(/```/g, '`\u200b``');   // que la salida no rompa el bloque de código
    if (out.length > SH_TOPE) { out = out.slice(-SH_TOPE); cortado = true; }
    const seg = ((Date.now() - t0) / 1000).toFixed(1);
    const estado = vencio? `⏱️ cortado a los ${SH_TIMEOUT / 1000} s` : codigo === 0? `✅ código 0 · ${seg} s` : `❌ código ${codigo} · ${seg} s`;
    const partes = shPartir(out || '(sin salida)', SH_CHUNK - 300);
    for (let i = 0; i < partes.length; i++) {
      const cab = `🖥️ *Shell* · ${i === 0? estado : 'seguimos'}${partes.length > 1? ` · parte ${i + 1}/${partes.length}` : ''}`;
      const txt = `${cab}\n\`\`\`${cortado && i === 0? '…(solo el final)\n' : ''}${partes[i]}\`\`\``;
      await sock.sendMessage(jid, { text: txt }, i === 0? { quoted: m } : undefined);
      if (i < partes.length - 1) await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {
    console.error('[shell]', e.message);
    await reply('❌ No pude ejecutarlo: ' + String(e.message).slice(0, 200));
  } finally { shEnCurso = false; reaccion(''); }
}

// ---------- SOCIAL: actividad y nivel, grupos (antilink / bienvenida), perfil, economía extra y utilidades ----------
// Archivos (entran en el /backup): actividad.json (mensajes y XP por grupo), grupos.json (config por grupo), perfiles.json (perfil, pareja y stickers de cada persona)
const ACT_FILE = './actividad.json';   // { "<grupo>": { desde, u: { "<id>": { ids, jid, n, t, p, xp, xt, d: { "<día>": n } } } } }
const GRP_FILE = './grupos.json';      // { "<grupo>": { antilink, welcome, goodbye, welcomeMsg, goodbyeMsg, noeco, cumple } }
const PERF_FILE = './perfiles.json';   // { u: { "<id>": { ids, jid, nombre, desc, cumple: { d, m, a }, meta: { pack, autor }, pareja, hist: [] } } }
const socLeer = (f, def) => { try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f)); } catch (e) { console.error('[social] no pude leer ' + f + ':', e.message); } return def; };
const act = socLeer(ACT_FILE, {}), grp = socLeer(GRP_FILE, {}), perf = socLeer(PERF_FILE, { u: {} });
if (!perf.u) perf.u = {};
const socGuardador = (f, get, ms) => {
  let t = null;
  const ya = () => { clearTimeout(t); t = null; try { fs.writeFileSync(f, JSON.stringify(get())); } catch (e) { console.error('[social]', f, e.message); } };
  const luego = () => { if (t) return; t = setTimeout(ya, ms); t.unref?.(); };
  return { luego, ya };
};
const actDisco = socGuardador(ACT_FILE, () => act, 20000);
const grpDisco = socGuardador(GRP_FILE, () => grp, 1500);
const perfDisco = socGuardador(PERF_FILE, () => perf, 1500);
const socGuardarTodo = () => { actDisco.ya(); grpDisco.ya(); perfDisco.ya(); };
for (const sg of ['SIGTERM', 'SIGINT']) process.once(sg, () => { socGuardarTodo(); process.exit(0); });   // no perder lo contado al reiniciar

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

// ===== antilink: borra el mensaje y expulsa (links de invitación de grupos de WhatsApp) =====
const ANTILINK_RE = /(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?[A-Za-z0-9]{15,}/i;
const alAvisos = new Map();   // grupo -> última vez que se avisó que falta ser admin
const mensajeTexto = m => { const x = socDesenvolver(m.message); return x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption || x.documentMessage?.caption || ''; };
async function antilinkVer(m, jid) {
  const txt = mensajeTexto(m);
  if (!ANTILINK_RE.test(txt)) return false;
  if (await modPuede(m, jid).catch(() => false)) return false;       // admins, dueño y whitelist pueden
  const meta = await sock.groupMetadata(jid).catch(() => null); if (!meta) return false;
  if (!modBotAdmin(meta)) {
    if (Date.now() - (alAvisos.get(jid) || 0) > 3600e3) { alAvisos.set(jid, Date.now()); await sock.sendMessage(jid, { text: '⚠️ El antilink está activado pero necesito ser admin para borrar el mensaje y expulsar.' }).catch(() => {}); }
    return false;
  }
  const quien = m.key.participant; if (!quien) return false;
  await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
  await sock.groupParticipantsUpdate(jid, [quien], 'remove').catch(e => console.error('[antilink]', e.message));
  await sock.sendMessage(jid, { text: `🚫 @${num(quien)} mandó un link de grupo y fue expulsado`, mentions: [quien] }).catch(() => {});
  return true;
}

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
const socMetaDe = ids => { const u = perfGet(ids); return u?.meta?.pack? u.meta : null; };
const diasEn = (d, m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] >= d;
function cumpleHoy(c, hoy) {   // el 29/02 se festeja el 28/02 en los años que no son bisiestos
  const f = new Date(hoy + 'T00:00:00Z'), d = f.getUTCDate(), m = f.getUTCMonth() + 1, y = f.getUTCFullYear();
  if (c.d === d && c.m === m) return true;
  return c.d === 29 && c.m === 2 && d === 28 && m === 2 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
}
function diasHastaCumple(c, hoy) {
  const f = new Date(hoy + 'T00:00:00Z');
  for (let i = 0; i < 366; i++) { const x = new Date(f.getTime() + i * 86400e3); if (cumpleHoy(c, x.toISOString().slice(0, 10))) return i; }
  return 999;
}
const edadDe = (c, hoy) => { if (!c.a) return null; const y = +hoy.slice(0, 4), md = +hoy.slice(5, 7) * 100 + +hoy.slice(8, 10); return y - c.a - (md < c.m * 100 + c.d? 1 : 0); };
const cumpleTxt = c => `${c.d} de ${MESES[c.m - 1]}`;
const marryPorMsg = new Map();   // id del mensaje de propuesta -> { bot, jid, a, b, t }
const MARRY_MS = 10 * 60e3;
setInterval(() => { for (const [k, v] of marryPorMsg) if (Date.now() - v.t > MARRY_MS) marryPorMsg.delete(k); }, 5 * 60e3).unref();
const durTxt = ms => { const d = Math.floor(ms / 86400e3); return d >= 1? `${d} día${d === 1? '' : 's'}` : 'menos de un día'; };
async function marryResp(m, jid, g, qid, acepta) {
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!senderIds(m, jid).some(x => g.b.ids.includes(x))) return;   // solo contesta a quien se le propuso
  marryPorMsg.delete(qid);
  if (Date.now() - g.t > MARRY_MS) return reply('⌛ La propuesta venció. Que lo intenten de nuevo con /marry.');
  const tagA = '@' + num(g.a.jid), tagB = '@' + num(g.b.jid), ms = [g.a.jid, g.b.jid];
  if (!acepta) return reply(`💔 ${tagB} rechazó la propuesta de ${tagA}. Ouch.`, ms);
  const ua = perfGet(g.a.ids, true, g.a.jid), ub = perfGet(g.b.ids, true, g.b.jid);
  if (ua.pareja || ub.pareja) return reply('⚠️ Alguno de los dos ya se casó con otra persona mientras tanto.', ms);
  const t = Date.now();
  ua.pareja = { ids: g.b.ids, jid: g.b.jid, nombre: g.b.nombre, desde: t };
  ub.pareja = { ids: g.a.ids, jid: g.a.jid, nombre: g.a.nombre, desde: t };
  perfDisco.luego();
  return reply(`💍 ¡${tagA} y ${tagB} se casaron! 🎉\n> Que sean felices (o que se divorcien con /divorce).`, ms);
}

// cumpleaños: cada día, a partir de las 9 (hora argentina), el bot elegido de cada grupo saluda a los que cumplen
async function cumpleTick(ahora = Date.now()) {
  if (new Date(ahora - SOC_AR).getUTCHours() < 9) return;
  const hoy = new Date(ahora - SOC_AR).toISOString().slice(0, 10);
  if (!Object.values(perf.u).some(u => u.cumple && cumpleHoy(u.cumple, hoy))) return;
  for (const inst of instances.values()) {
    if (!inst.online || inst.cumpleDia === hoy) continue;
    await als.run(inst, async () => {
      let gs; try { gs = await sock.groupFetchAllParticipating(); } catch { return; }
      inst.cumpleDia = hoy;
      for (const [gid, meta] of Object.entries(gs)) {
        if (grp[gid]?.cumple === hoy) continue;                       // otro bot ya avisó hoy en este grupo
        const mp = socMapa(meta), fest = [];
        for (const u of Object.values(perf.u)) { if (!u.cumple || !cumpleHoy(u.cumple, hoy)) continue; const p = socMiembro(mp, u.ids); if (p) fest.push({ u, p }); }
        if (!fest.length || !(await soyElElegido(gid))) continue;
        (grp[gid] ||= {}).cumple = hoy; grpDisco.luego();
        const ms = fest.map(f => f.p.id);
        const txt = `🎂 *¡Hoy cumple${fest.length > 1? 'n' : ''}!*\n` + fest.map(f => { const e = edadDe(f.u.cumple, hoy); return `• @${num(f.p.id)}${e? ` (${e} años)` : ''}`; }).join('\n') + '\n\n🎉 ¡Feliz cumpleaños!';
        await sock.sendMessage(gid, { text: txt, mentions: ms }).catch(() => {});
        await sleep(1500);
      }
    });
  }
}
setInterval(() => { cumpleTick().catch(e => console.error('[cumple]', e.message)); }, 15 * 60e3).unref();

// ===== stickers con pack y autor propios (/setmeta): se escribe el bloque EXIF dentro del WebP =====
function webpConMeta(buf, pack, autor, w = 512, h = 512) {
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return buf;
  const json = Buffer.from(JSON.stringify({ 'sticker-pack-id': crypto.randomBytes(16).toString('hex'), 'sticker-pack-name': pack, 'sticker-pack-publisher': autor, emojis: [''] }), 'utf8');
  const cab = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const exif = Buffer.concat([cab, json]); exif.writeUInt32LE(json.length, 14);
  let chunks = [], off = 12;
  while (off + 8 <= buf.length) {
    const tag = buf.toString('ascii', off, off + 4), sz = buf.readUInt32LE(off + 4);
    chunks.push({ tag, data: buf.subarray(off + 8, off + 8 + sz) }); off += 8 + sz + (sz & 1);
  }
  chunks = chunks.filter(c => c.tag !== 'EXIF');
  let vp = chunks.find(c => c.tag === 'VP8X');
  if (vp) { vp = { tag: 'VP8X', data: Buffer.from(vp.data) }; vp.data[0] |= 0x08; chunks = [vp,...chunks.filter(c => c.tag !== 'VP8X')]; }
  else {
    const d = Buffer.alloc(10);
    d[0] = 0x08 | (chunks.some(c => c.tag === 'ALPH' || c.tag === 'VP8L')? 0x10 : 0);
    d.writeUIntLE(w - 1, 4, 3); d.writeUIntLE(h - 1, 7, 3);
    chunks.unshift({ tag: 'VP8X', data: d });
  }
  chunks.push({ tag: 'EXIF', data: exif });
  const partes = [Buffer.from('WEBP')];
  for (const c of chunks) {
    const cb = Buffer.alloc(8); cb.write(c.tag, 0, 'ascii'); cb.writeUInt32LE(c.data.length, 4);
    partes.push(cb, c.data); if (c.data.length & 1) partes.push(Buffer.alloc(1));
  }
  const cuerpo = Buffer.concat(partes), cab2 = Buffer.alloc(8); cab2.write('RIFF', 0, 'ascii'); cab2.writeUInt32LE(cuerpo.length, 4);
  return Buffer.concat([cab2, cuerpo]);
}

// ===== los comandos =====
const SOC_ALIAS = {
  pay: 'pay', givecoins: 'pay', coinsgive: 'pay',
  baltop: 'baltop', economyboard: 'baltop', eboard: 'baltop',
  economyinfo: 'einfo', einfo: 'einfo',
  economy: 'economy', economia: 'economy',
  antilink: 'antilink', antienlace: 'antilink',
  welcome: 'welcome', bienvenida: 'welcome', goodbye: 'goodbye', despedida: 'goodbye',
  setwelcome: 'setwelcome', setgoodbye: 'setgoodbye',
  del: 'del', delete: 'del',
  toimg: 'toimg', toimage: 'toimg',
  pfp: 'pfp', getpic: 'pfp',
  setmeta: 'setmeta', setstickermeta: 'setmeta', delmeta: 'delmeta', delstickermeta: 'delmeta',
  level: 'level', lvl: 'level',
  top: 'top', leaderboard: 'top', lboard: 'top',
  msgcount: 'msgcount', count: 'msgcount', messages: 'msgcount', mensajes: 'msgcount',
  topcount: 'topcount', topmessages: 'topcount', topmsgcount: 'topcount', topmensajes: 'topcount',
  topinactive: 'topinactive', topinactivos: 'topinactive', topinactiveusers: 'topinactive',
  profile: 'profile', perfil: 'profile',
  setdesc: 'setdesc', setdescription: 'setdesc',
  setbirth: 'setbirth', delbirth: 'delbirth',
  birthdays: 'birthdays', cumpleaños: 'birthdays', cumpleanos: 'birthdays', births: 'birthdays',
  marry: 'marry', casarse: 'marry', divorce: 'divorce',
  marryhistory: 'marryhistory', marriagehistory: 'marryhistory', historialmatrimonio: 'marryhistory',
  join: 'join', setstatus: 'setstatus', setpfp: 'setpfp',
};
const SOC_RE = new RegExp('^\\/(' + Object.keys(SOC_ALIAS).join('|') + ')(\\s|$)', 'iu');
// comandos de la economía (para poder apagarla por grupo con /economy off)
const ECO_RE = /^\/(daily|w|work|crime|delito|minar|hacking|rob|dep|d|deposit|depositar|with|retirar|withdraw|bal|balance|rt|roulette|ruleta|cf|coinflip|bj|blackjack|maq|maquinita|pay|givecoins|coinsgive|baltop|economyboard|eboard|economyinfo|einfo)(\s|$)/i;
const SOLO_GRUPO = new Set(['pay', 'baltop', 'einfo', 'economy', 'antilink', 'welcome', 'goodbye', 'setwelcome', 'setgoodbye', 'msgcount', 'topcount', 'topinactive', 'birthdays', 'marry']);
const SOLO_ADMIN = new Set(['setwelcome', 'setgoodbye', 'del', 'topinactive']);

// objetivo de un comando: mención o mensaje citado; o un número a secas. Devuelve { ids, jid } (con todos los ids que el grupo le conoce)
async function socObjetivo(m, jid, args) {
  const t = await ecoObjetivo(m, jid); if (t) return t;
  const tok = String(args || '').split(/\s+/).map(x => x.replace(/[+\-()]/g, '')).find(x => /^\d{8,15}$/.test(x));
  if (!tok) return null;
  let ids = [tok], j = tok + '@s.whatsapp.net';
  if (jid.endsWith('@g.us')) { const meta = await sock.groupMetadata(jid).catch(() => null), p = meta?.participants.find(p => idsDe(p).includes(tok)); if (p) { ids = [...new Set([...ids,...idsDe(p)])]; j = p.id; } }
  return { ids, jid: j };
}
const socDias = args => { for (const t of String(args || '').split(/\s+/)) { const r = t.match(/^(\d{1,3})d?$/i); if (r && +r[1] >= 1) return Math.min(+r[1], SOC_DIAS_MAX); } return 0; };
const nombreDe = (m, ids) => rxNombreDe(ids) || rxLimpio(m.pushName);

async function socToggle(c, clave, etiqueta, cmd, textoOn, textoOff, activoFn) {
  const a = c.args.toLowerCase(), activo = activoFn? activoFn() : !!grp[c.jid]?.[clave];
  if (!a) return c.reply(`${etiqueta}: *${activo? 'activado' : 'desactivado'}* en este grupo\n> Se cambia con /${cmd} on o /${cmd} off`);
  if (a !== 'on' && a !== 'off') return c.reply(`Uso: /${cmd} on | /${cmd} off | /${cmd} (ver el estado)`);
  if (!(await modPuede(c.m, c.jid))) return c.reply('⛔ Solo admins');
  const g = (grp[c.jid] ||= {});
  if (clave === 'noeco') { if (a === 'off') g.noeco = true; else delete g.noeco; }
  else if (a === 'on') g[clave] = true; else delete g[clave];
  grpDisco.luego();
  await c.reply(a === 'on'? textoOn : textoOff);
  return a;
}

const SOC = {
  // ---------- economía ----------
  async pay(c) {
    const t = await ecoObjetivo(c.m, c.jid);
    if (!t) return c.reply('Uso: /pay @usuario <monto|all> (o respondiendo a su mensaje)');
    const ids = await ecoIds(c.m, c.jid), arg = c.args.replace(/(^|\s)@\S+/g, ' ').trim();
    if (t.ids.some(x => ids.includes(x))) return c.reply('No podés pagarte a vos mismo 🤨');
    if (t.ids.some(x => botIds().includes(x))) return c.reply('Yo no cobro propinas 🙂');
    const u = ecoGet(c.jid, ids); u.ult = Date.now();
    if (!/^(\d[\d.,\s]*|all|todo)$/i.test(arg)) return c.reply(`Uso: /pay @usuario <monto|all>\n👛 Billetera: ${din(u.cartera)}`);
    const n = ecoMonto(arg, u.cartera);
    if (!n || n < 1) return c.reply(u.cartera < 1? '👛 No tenés plata afuera del banco para pagar. Sacá del banco con /retirar.' : 'Uso: /pay @usuario <monto|all>');
    if (n > u.cartera) return c.reply(`No tenés tanto afuera del banco. Tenés ${din(u.cartera)}.`);
    const v = ecoGet(c.jid, t.ids);
    u.cartera -= n; v.cartera += n; saveEco();
    const yo = quienJid(c.m, c.jid);
    return c.reply(`💸 @${num(yo)} le pagó ${din(n)} a @${num(t.jid)}\n\n👛 Te quedan: ${din(u.cartera)}`, [yo, t.jid]);
  },
  async baltop(c) {
    const meta = await sock.groupMetadata(c.jid), mp = socMapa(meta), filas = [];
    for (const u of Object.values(eco[c.jid] || {})) { const p = socMiembro(mp, u.ids), tot = u.cartera + u.banco; if (p && tot > 0) filas.push({ u, p, tot }); }
    filas.sort((a, b) => b.tot - a.tot);
    if (!filas.length) return c.reply('Todavía nadie tiene plata en este grupo. Empezá con /daily 😉');
    const pg = socPag(filas, parseInt(c.args)), ms = [];
    const lineas = pg.items.map((f, i) => {
      const e = socEtiq(f.p, f.u.ids); if (e.jid) ms.push(e.jid);
      const pos = pg.ini + i;
      return `${['🥇', '🥈', '🥉'][pos] || `*${pos + 1}.*`} ${e.txt} — ${din(f.tot)}`;
    });
    return c.reply(`🏆 *Ranking de economía*\n\n${lineas.join('\n')}\n\n> Página ${pg.p}/${pg.total}${pg.p < pg.total? ` · /baltop ${pg.p + 1} para la siguiente` : ''}`, ms);
  },
  async einfo(c) {
    const t = await ecoObjetivo(c.m, c.jid), ids = t? t.ids : await ecoIds(c.m, c.jid);
    const u = ecoGet(c.jid, ids, false), quien = t? t.jid : quienJid(c.m, c.jid);
    if (!u) return c.reply(`💼 @${num(quien)} todavía no tiene movimientos de economía en este grupo.`, [quien]);
    const orden = Object.values(eco[c.jid] || {}).map(x => x.cartera + x.banco).sort((a, b) => b - a), tot = u.cartera + u.banco;
    const puesto = orden.indexOf(tot) + 1, r = ecoRacha(ids), hoy = hoyAR();
    const cd = (k, ms) => { const x = cdRestante(u, k, ms); return x > 0? `⏳ ${fmtTiempo(x)}` : '✅ listo'; };
    return c.reply(`💼 *Economía de @${num(quien)}*\n\n👛 Billetera: ${din(u.cartera)}\n🏦 Banco: ${din(u.banco)}\n💰 Total: ${din(tot)}\n🏆 Puesto: #${puesto} de ${orden.length}\n\n🔥 Racha de daily: ${r.dias} día${r.dias === 1? '' : 's'} (${u.ultDaily === hoy? 'hoy ya cobraste' : 'hoy te falta cobrar'})\n\n⏱️ *Tiempos*\n• /w: ${cd('w', ACCIONES.w.cd)}\n• /crime: ${cd('crime', ACCIONES.crime.cd)}\n• /minar: ${cd('minar', ACCIONES.minar.cd)}\n• /hacking: ${cd('hacking', ACCIONES.hacking.cd)}\n• /rob: ${cd('rob', 3600e3)}`, [quien]);
  },
  economy: c => socToggle(c, 'noeco', '💰 Economía', 'economy', '✅ Economía activada en este grupo', '🚫 Economía desactivada en este grupo (los comandos de plata no van a responder)', () => !grp[c.jid]?.noeco),

  // ---------- grupo ----------
  async antilink(c) {
    const r = await socToggle(c, 'antilink', '🔗 Antilink', 'antilink', '🔗 Antilink activado: borro los links de grupos de WhatsApp y expulso a quien los mande (los admins pueden)', '✅ Antilink desactivado');
    if (r === 'on') { const meta = await sock.groupMetadata(c.jid).catch(() => null); if (meta && !modBotAdmin(meta)) await c.reply('⚠️ Ojo: necesito ser admin del grupo para poder borrar y expulsar.'); }
  },
  welcome: c => socToggle(c, 'welcome', '👋 Bienvenida', 'welcome', '👋 Bienvenida activada. Podés cambiar el texto con /setwelcome', '✅ Bienvenida desactivada'),
  goodbye: c => socToggle(c, 'goodbye', '👋 Despedida', 'goodbye', '👋 Despedida activada. Podés cambiar el texto con /setgoodbye', '✅ Despedida desactivada'),
  async setwelcome(c) { return SOC_texto(c, 'welcomeMsg', 'setwelcome', BIENVENIDA); },
  async setgoodbye(c) { return SOC_texto(c, 'goodbyeMsg', 'setgoodbye', DESPEDIDA); },
  async del(c) {
    const ctx = modCtx(c.m), q = ctx?.quotedMessage;
    if (!q || !ctx.stanzaId) return c.reply('Uso: respondé al mensaje que quieras borrar con /del');
    const mio = botIds().includes(num(ctx.participant || ''));
    if (c.grupo) { const meta = await sock.groupMetadata(c.jid); if (!mio && !modBotAdmin(meta)) return c.reply('⚠️ Necesito ser admin para borrar mensajes de otros'); }
    else if (!mio) return c.reply('En privado solo puedo borrar mis propios mensajes');
    await sock.sendMessage(c.jid, { delete: { remoteJid: c.jid, fromMe: mio, id: ctx.stanzaId, ...(ctx.participant? { participant: ctx.participant } : {}) } });
    sock.sendMessage(c.jid, { react: { text: '✅', key: c.m.key } }).catch(() => {});
  },

  // ---------- utilidades ----------
  async toimg(c) {
    if (!sharp) return c.reply('⚠️ Falta instalar el paquete sharp (npm i sharp)');
    const ctx = modCtx(c.m), q = ctx?.quotedMessage;
    const base = socDesenvolver(q || c.m.message);
    const tipo = base.stickerMessage? 'stickerMessage' : base.imageMessage? 'imageMessage' : base.videoMessage? 'videoMessage' : null;
    if (!tipo) return c.reply('Respondé a un sticker o a una foto (también las de "ver una vez") con /toimg');
    const fuente = q? { key: { remoteJid: c.jid, id: ctx.stanzaId, participant: ctx.participant }, message: base } : { key: c.m.key, message: base };
    let buf; try { buf = await socBajar(fuente); } catch (e) { console.error('[toimg]', e.message); return c.reply('❌ No pude descargar eso (puede haber vencido o ya no estar disponible)'); }
    try {
      if (tipo === 'videoMessage') return void await sock.sendMessage(c.jid, { video: buf, mimetype: 'video/mp4', caption: base.videoMessage.caption || '' }, { quoted: c.m });
      if (tipo === 'imageMessage') return void await sock.sendMessage(c.jid, { image: buf, caption: base.imageMessage.caption || '' }, { quoted: c.m });
      if (base.stickerMessage.isAnimated) {   // sticker animado: pasa a GIF-video
        try { const mp4 = await rxTurno(async () => rxMp4(await sharp(buf, { animated: true }).gif().toBuffer())); return void await sock.sendMessage(c.jid, { video: mp4, mimetype: 'video/mp4', gifPlayback: true }, { quoted: c.m }); }
        catch (e) { console.error('[toimg] animado:', e.message); }
      }
      await sock.sendMessage(c.jid, { image: await sharp(buf).png().toBuffer() }, { quoted: c.m });
    } catch (e) { console.error('[toimg]', e.message); await c.reply('❌ No pude convertirlo'); }
  },
  async pfp(c) {
    const t = await socObjetivo(c.m, c.jid, c.args), quien = t? t.jid : quienJid(c.m, c.jid);
    const cand = [...new Set([quien, ...(t?.ids || []).map(x => x + '@s.whatsapp.net')])];
    let url = null;
    for (const j of cand) { try { url = await sock.profilePictureUrl(j, 'image'); if (url) break; } catch {} }
    if (!url) return c.reply(`🖼️ @${num(quien)} no tiene foto de perfil, o la tiene oculta.`, [quien]);
    await sock.sendMessage(c.jid, { image: { url }, caption: `🖼️ Foto de perfil de @${num(quien)}`, mentions: [quien] }, { quoted: c.m });
  },
  async setmeta(c) {
    if (!c.args) { const u = perfGet(await ecoIds(c.m, c.jid)); return c.reply(`Uso: /setmeta Pack | Autor\n> Ej: /setmeta Memes del grupo | Vand4lw\nActual: ${u?.meta? `*${u.meta.pack}* de *${u.meta.autor || '—'}*` : 'sin configurar'}\n(/delmeta para quitarlo)`); }
    const [pack, ...r] = c.args.split('|'), autor = limpiar(r.join('|')) || rxLimpio(c.m.pushName), pk = limpiar(pack);
    if (!pk) return c.reply('Uso: /setmeta Pack | Autor');
    if (pk.length > 40 || autor.length > 40) return c.reply('⚠️ El pack y el autor pueden tener hasta 40 caracteres cada uno');
    const ids = await ecoIds(c.m, c.jid), u = perfGet(ids, true, quienJid(c.m, c.jid));
    u.meta = { pack: pk, autor }; perfDisco.luego();
    return c.reply(`✅ Tus stickers ahora salen con pack *${pk}* y autor *${autor}*\n> Probalo con /s`);
  },
  async delmeta(c) {
    const u = perfGet(await ecoIds(c.m, c.jid));
    if (!u?.meta) return c.reply('No tenías pack ni autor configurados');
    delete u.meta; perfDisco.luego();
    return c.reply('🗑️ Listo: tus stickers vuelven a salir sin pack ni autor');
  },

  // ---------- nivel y actividad ----------
  async level(c) {
    const t = await socObjetivo(c.m, c.jid, c.args), ids = t? t.ids : await ecoIds(c.m, c.jid), quien = t? t.jid : quienJid(c.m, c.jid);
    const u = perfGet(ids), xp = u?.xp || 0, niv = nivelDe(xp), a = xpDe(niv), b = xpDe(niv + 1), nombre = rxNombreDe(ids) || (t? '' : rxLimpio(c.m.pushName));
    return c.reply(`*「✿」Usuario* ◢ ${nombre || '@' + num(quien)} ◤\n\n☆ Experiencia » *${socFmt(xp)}*\n❖ Nivel » *${niv}*\n➨ Progreso » *${xp - a} / ${b - a}*  _(${Math.floor((xp - a) / (b - a) * 100)}%)_\n# Puesto » *#${xpPuesto(xp)}*\n\n❒ Comandos totales » *${u?.cmds || 0}*`, nombre? [] : [quien]);
  },
  async top(c) {
    const filas = Object.values(perf.u).filter(u => (u.xp || 0) > 0).sort((a, b) => b.xp - a.xp);
    if (!filas.length) return c.reply('Todavía nadie tiene XP. Se gana usando los comandos de economía y apuestas.');
    const pg = socPag(filas, parseInt(c.args)), ms = [];
    const lineas = pg.items.map((u, i) => { const n = rxNombreDe(u.ids), j = u.jid || (u.ids[0] + '@s.whatsapp.net'); if (!n) ms.push(j); const pos = pg.ini + i; return `${['🥇', '🥈', '🥉'][pos] || `*${pos + 1}.*`} ${n || '@' + num(j)} — nivel ${nivelDe(u.xp)} · ${socFmt(u.xp)} XP · ${socFmt(u.cmds || 0)} cmds`; });
    return c.reply(`🏆 *Ranking global de nivel*\n\n${lineas.join('\n')}\n\n> Página ${pg.p}/${pg.total}${pg.p < pg.total? ` · /top ${pg.p + 1} para la siguiente` : ''}`, ms);
  },
  async msgcount(c) {
    const t = await socObjetivo(c.m, c.jid, c.args.replace(/(^|\s)@\S+/g, ' ')), ids = t? t.ids : await ecoIds(c.m, c.jid), quien = t? t.jid : quienJid(c.m, c.jid);
    const dias = socDias(c.args.replace(/(^|\s)\+?\d{8,15}(?=\s|$)/g, ' ')), r = actBuscar(c.jid, ids), desde = act[c.jid]?.desde;
    if (!r) return c.reply(`📊 @${num(quien)} todavía no tiene mensajes contados en este grupo.${desde? `\n> Cuento desde el ${socFecha(desde)}.` : ''}`, [quien]);
    const lin = [`📊 *Mensajes de @${num(quien)}*`, ''];
    if (dias) lin.push(`📅 Últimos ${dias} día${dias === 1? '' : 's'}: *${socFmt(actVentana(r, dias))}*`);
    lin.push(`💬 Total contado: *${socFmt(r.n)}*`, `🕒 Último mensaje: ${r.t? 'hace ' + fmtTiempo(Date.now() - r.t) : '—'}`, '', `> Cuento desde el ${socFecha(desde)}`);
    return c.reply(lin.join('\n'), [quien]);
  },
  async topcount(c) {
    const dias = socDias(c.args), meta = await sock.groupMetadata(c.jid), mp = socMapa(meta), filas = [];
    for (const r of Object.values(act[c.jid]?.u || {})) { const p = socMiembro(mp, r.ids), n = actVentana(r, dias); if (p && n > 0) filas.push({ r, p, n }); }
    filas.sort((a, b) => b.n - a.n);
    if (!filas.length) return c.reply('Todavía no hay mensajes contados' + (dias? ` en los últimos ${dias} días` : '') + '.');
    const ms = [], lineas = filas.slice(0, 15).map((f, i) => { const e = socEtiq(f.p, f.r.ids); if (e.jid) ms.push(e.jid); return `${['🥇', '🥈', '🥉'][i] || `*${i + 1}.*`} ${e.txt} — ${socFmt(f.n)} mensajes`; });
    return c.reply(`💬 *Top de mensajes${dias? ` (últimos ${dias} días)` : ''}*\n\n${lineas.join('\n')}\n\n> Cuento desde el ${socFecha(act[c.jid]?.desde || Date.now())} · /topcount 7 para la última semana`, ms);
  },
  // la lista sale con el formato que lee /killinactive: "*#N* @usuario ..." y las menciones en el mismo orden
  async topinactive(c) {
    const nums = c.args.split(/\s+/).filter(Boolean);
    let pagina = 1, dias = 7;
    const sueltos = nums.filter(x => /^\d{1,3}$/.test(x)), conD = nums.find(x => /^\d{1,3}d$/i.test(x));
    if (sueltos[0]) pagina = +sueltos[0];
    if (sueltos[1]) dias = +sueltos[1]; else if (conD) dias = parseInt(conD);
    dias = Math.min(Math.max(1, dias), 365);
    const meta = await sock.groupMetadata(c.jid), g = act[c.jid], limite = Date.now() - dias * 86400e3, bots = [...modBots(),...Object.keys(subReg)];
    const desde = g?.desde || Date.now();
    if (Date.now() - desde < dias * 86400e3) return c.reply(`💤 Todavía no puedo saber quién está inactivo hace ${dias} día${dias === 1? '' : 's'}: recién empecé a contar el ${socFecha(desde)}.\n> Probá con menos días (ej: /topinactive 1 ${Math.max(1, Math.floor((Date.now() - desde) / 86400e3))}) o esperá un poco.`);
    const filas = [];
    for (const p of meta.participants) {
      const ids = idsDe(p);
      if (p.admin || ids.includes(OWNER) || ids.some(x => bots.includes(x))) continue;   // no se listan admins, el dueño ni los bots
      const r = actBuscar(c.jid, ids), ult = r? (r.t || r.p) : desde;
      if (ult < limite) filas.push({ p, r, ult });
    }
    filas.sort((a, b) => a.ult - b.ult);
    if (!filas.length) return c.reply(`✅ Nadie lleva más de ${dias} día${dias === 1? '' : 's'} sin escribir.`);
    const pg = socPag(filas, pagina, 20), ms = pg.items.map(f => f.p.id);
    const lineas = pg.items.map((f, i) => `*#${pg.ini + i + 1}* @${num(f.p.id)} · ${Math.floor((Date.now() - f.ult) / 86400e3)} d sin escribir · ${socFmt(f.r?.n || 0)} msj`);
    return c.reply(`💤 *Inactivos* (más de ${dias} día${dias === 1? '' : 's'} sin escribir)\n> Página ${pg.p}/${pg.total} · ${filas.length} en total · cuento desde el ${socFecha(desde)}\n\n${lineas.join('\n')}\n\n> Para sacarlos, respondé a este mensaje con /killinactive all | 5 | 1-8${pg.p < pg.total? `\n> Siguiente página: /topinactive ${pg.p + 1} ${dias}` : ''}`, ms);
  },

  // ---------- perfil ----------
  async profile(c) {
    const t = await socObjetivo(c.m, c.jid, c.args), ids = t? t.ids : await ecoIds(c.m, c.jid), quien = t? t.jid : quienJid(c.m, c.jid), hoy = hoyAR();
    const u = perfGet(ids), r = c.grupo? actBuscar(c.jid, ids) : null, e = c.grupo? ecoGet(c.jid, ids, false) : null;
    const lin = [`👤 *Perfil de @${num(quien)}*`, ''];
    lin.push(`📝 ${u?.desc || '_Sin descripción (se cambia con /setdesc)_'}`);
    lin.push(`🎂 Cumpleaños: ${u?.cumple? cumpleTxt(u.cumple) + (edadDe(u.cumple, hoy) != null? ` (${edadDe(u.cumple, hoy)} años)` : '') : '_sin definir (/setbirth)_'}`);
    const ms = [quien];
    if (u?.pareja) { lin.push(`💍 Pareja: @${num(u.pareja.jid)} · hace ${durTxt(Date.now() - u.pareja.desde)}`); ms.push(u.pareja.jid); } else lin.push('💍 Pareja: _soltero/a_');
    if (u?.xp) lin.push('', `⭐ Nivel ${nivelDe(u.xp)} · ${socFmt(u.xp)} XP · ${socFmt(u.cmds || 0)} comandos`);
    if (r) lin.push(`💬 ${socFmt(r.n)} mensajes en este grupo`);
    if (e) lin.push(`💰 Plata: ${din(e.cartera + e.banco)}`);
    let url = null; try { url = await sock.profilePictureUrl(quien, 'image'); } catch {}
    const txt = lin.join('\n');
    if (url) { try { return void await sock.sendMessage(c.jid, { image: { url }, caption: txt, mentions: ms }, { quoted: c.m }); } catch {} }
    return c.reply(txt, ms);
  },
  async setdesc(c) {
    const ids = await ecoIds(c.m, c.jid);
    if (!c.args) return c.reply('Uso: /setdesc <texto> (hasta 200 caracteres)\n> /setdesc reset para borrarla');
    if (/^(reset|borrar|off)$/i.test(c.args)) { const u = perfGet(ids); if (u) { delete u.desc; perfDisco.luego(); } return c.reply('🗑️ Descripción borrada'); }
    const d = limpiar(c.args);
    if (d.length > 200) return c.reply('⚠️ La descripción puede tener hasta 200 caracteres');
    perfGet(ids, true, quienJid(c.m, c.jid)).desc = d; perfDisco.luego();
    return c.reply('✅ Descripción guardada. Mirala con /profile');
  },
  async setbirth(c) {
    const r = c.args.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{4}))?$/);
    if (!r) return c.reply('Uso: /setbirth día/mes (o día/mes/año)\n> Ej: /setbirth 15/03 o /setbirth 15/03/1999');
    const d = +r[1], mes = +r[2], a = r[3]? +r[3] : null;
    if (mes < 1 || mes > 12 || d < 1 || !diasEn(d, mes)) return c.reply('⚠️ Esa fecha no existe');
    if (a && (a < 1930 || a > new Date().getUTCFullYear() - 5)) return c.reply('⚠️ Ese año no me cierra');
    perfGet(await ecoIds(c.m, c.jid), true, quienJid(c.m, c.jid)).cumple = { d, m: mes, ...(a? { a } : {}) }; perfDisco.luego();
    return c.reply(`🎂 Listo, tu cumpleaños es el *${cumpleTxt({ d, m: mes })}*${a? ` de ${a}` : ''}. Te voy a saludar ese día.`);
  },
  async delbirth(c) {
    const u = perfGet(await ecoIds(c.m, c.jid));
    if (!u?.cumple) return c.reply('No tenías cumpleaños guardado');
    delete u.cumple; perfDisco.luego();
    return c.reply('🗑️ Cumpleaños borrado');
  },
  async birthdays(c) {
    const meta = await sock.groupMetadata(c.jid), mp = socMapa(meta), hoy = hoyAR(), filas = [];
    for (const u of Object.values(perf.u)) { if (!u.cumple) continue; const p = socMiembro(mp, u.ids); if (p) filas.push({ u, p, en: diasHastaCumple(u.cumple, hoy) }); }
    filas.sort((a, b) => a.en - b.en);
    if (!filas.length) return c.reply('🎂 Nadie del grupo cargó su cumpleaños todavía. Se hace con /setbirth 15/03');
    const ms = [], lineas = filas.slice(0, 10).map(f => { ms.push(f.p.id); return `• @${num(f.p.id)} — ${cumpleTxt(f.u.cumple)} (${f.en === 0? '¡hoy! 🎉' : f.en === 1? 'mañana' : `en ${f.en} días`})`; });
    return c.reply(`🎂 *Próximos cumpleaños*\n\n${lineas.join('\n')}`, ms);
  },
  async marry(c) {
    const t = await rxObjetivo(c.m, c.jid);
    if (!t) return c.reply('Uso: /marry @usuario (o respondiendo a su mensaje)');
    const ids = await ecoIds(c.m, c.jid), yo = quienJid(c.m, c.jid);
    if (t.ids.some(x => ids.includes(x))) return c.reply('No podés casarte con vos mismo 🤨');
    if (t.ids.some(x => modBots().includes(x))) return c.reply('Soy un bot, no tengo tiempo para el amor 💔');
    const ua = perfGet(ids), ub = perfGet(t.ids);
    if (ua?.pareja) return c.reply(`Ya estás casado/a con @${num(ua.pareja.jid)}. Primero /divorce.`, [ua.pareja.jid]);
    if (ub?.pareja) return c.reply(`@${num(t.jid)} ya está casado/a con @${num(ub.pareja.jid)} 😬`, [t.jid, ub.pareja.jid]);
    const s = await sock.sendMessage(c.jid, { text: `💍 @${num(yo)} le propuso casamiento a @${num(t.jid)}\n\n@${num(t.jid)}, respondé a este mensaje con *sí* o *no* (tenés 10 minutos).`, mentions: [yo, t.jid] }, { quoted: c.m });
    if (s?.key?.id) marryPorMsg.set(s.key.id, { bot: ctxBot(), jid: c.jid, t: Date.now(), a: { ids, jid: yo, nombre: nombreDe(c.m, ids) }, b: { ids: t.ids, jid: t.jid, nombre: t.nombre || rxNombreDe(t.ids) } });
  },
  async divorce(c) {
    const ids = await ecoIds(c.m, c.jid), ua = perfGet(ids);
    if (!ua?.pareja) return c.reply('No estás casado/a con nadie 🤷');
    const ub = perfGet(ua.pareja.ids), ahora = Date.now(), p = ua.pareja, yo = quienJid(c.m, c.jid);
    ua.hist.push({ ids: p.ids, jid: p.jid, nombre: p.nombre, desde: p.desde, hasta: ahora });
    if (ub?.pareja) { ub.hist.push({ ids: ua.ids, jid: ua.jid || yo, nombre: nombreDe(c.m, ids), desde: ub.pareja.desde, hasta: ahora }); delete ub.pareja; }
    delete ua.pareja; perfDisco.luego();
    return c.reply(`💔 @${num(yo)} y @${num(p.jid)} se divorciaron después de ${durTxt(ahora - p.desde)}.`, [yo, p.jid]);
  },
  async marryhistory(c) {
    const t = await socObjetivo(c.m, c.jid, c.args), ids = t? t.ids : await ecoIds(c.m, c.jid), quien = t? t.jid : quienJid(c.m, c.jid);
    const u = perfGet(ids);
    if (!u || (!u.pareja && !(u.hist || []).length)) return c.reply(`💍 @${num(quien)} nunca se casó.`, [quien]);
    const ms = [quien], lin = [`💍 *Matrimonios de @${num(quien)}*`, ''];
    if (u.pareja) { lin.push(`• Actual: @${num(u.pareja.jid)} · desde el ${socFecha(u.pareja.desde)} (${durTxt(Date.now() - u.pareja.desde)})`); ms.push(u.pareja.jid); }
    for (const h of [...u.hist].reverse().slice(0, 15)) lin.push(`• ${h.nombre || '+' + num(h.jid)} · ${socFecha(h.desde)} → ${socFecha(h.hasta)} (${durTxt(h.hasta - h.desde)})`);
    return c.reply(lin.join('\n'), ms);
  },

  // ---------- del bot ----------
  async join(c) {
    if (!(await isAllowed(c.m, c.jid).catch(() => false))) return;   // solo dueño y whitelist (los demás, silencio)
    const q = modCtx(c.m)?.quotedMessage, qt = q? (q.conversation || q.extendedTextMessage?.text || '') : '';
    const cod = (`${c.args} ${qt}`.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{15,})/i) || [])[1] || (/^[A-Za-z0-9]{20,24}$/.test(c.args)? c.args : '');
    if (!cod) return c.reply('Uso: /join <link de invitación> (o respondiendo a un mensaje con el link)');
    try { await sock.groupAcceptInvite(cod); return c.reply('✅ Listo, me uní al grupo'); }
    catch (e) {
      const st = String(e?.output?.statusCode || e?.data || '');
      return c.reply(st === '409'? 'Ya estoy en ese grupo' : st === '410' || st === '404'? '❌ Ese link venció o no existe' : st === '403' || st === '401'? '❌ No me dejan entrar a ese grupo' : st === '500'? '❌ El grupo está lleno' : `❌ No pude unirme (${String(e?.message || e).slice(0, 80)})`);
    }
  },
  async setstatus(c) {
    if (!(await puedePersonalizar(c.m, c.jid))) return c.reply('⛔ Solo el dueño del bot puede personalizarlo');
    const s = limpiar(c.args);
    if (!s) return c.reply('Uso: /setstatus <texto> (hasta 139 caracteres)');
    if (s.length > 139) return c.reply('⚠️ El estado puede tener hasta 139 caracteres');
    try { await sock.updateProfileStatus(s); return c.reply('✅ Estado actualizado'); } catch (e) { return c.reply('❌ No pude cambiar el estado: ' + String(e.message).slice(0, 80)); }
  },
  async setpfp(c) {
    if (!(await puedePersonalizar(c.m, c.jid))) return c.reply('⛔ Solo el dueño del bot puede personalizarlo');
    if (!sharp) return c.reply('⚠️ Falta instalar el paquete sharp (npm i sharp)');
    const ctx = modCtx(c.m), q = ctx?.quotedMessage;
    const fuente = c.m.message.imageMessage? c.m : q?.imageMessage? { key: { remoteJid: c.jid, id: ctx.stanzaId, participant: ctx.participant }, message: q } : null;
    if (!fuente) return c.reply('Mandá una foto con el texto /setpfp, o respondé a una foto con /setpfp');
    try {
      const img = await sharp(await socBajar(fuente)).rotate().resize(640, 640, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
      await sock.updateProfilePicture(`${num(sock.user?.id)}@s.whatsapp.net`, img);
      return c.reply('✅ Foto de perfil actualizada');
    } catch (e) { console.error('[setpfp]', e.message); return c.reply('❌ No pude cambiar la foto: ' + String(e.message).slice(0, 80)); }
  },
};
async function SOC_texto(c, clave, cmd, defecto) {
  if (!c.args) { const g = grp[c.jid] || {}; return c.reply(`Uso: /${cmd} <texto>\n> Podés usar @user (la persona), {grupo} y {miembros}\n> /${cmd} reset vuelve al texto original\n\nActual:\n${g[clave] || defecto}`); }
  if (/^(reset|borrar)$/i.test(c.args)) { if (grp[c.jid]) delete grp[c.jid][clave]; grpDisco.luego(); return c.reply('✅ Texto restablecido'); }
  const t = c.args.slice(0, 500);
  (grp[c.jid] ||= {})[clave] = t; grpDisco.luego();
  return c.reply(`✅ Texto guardado${/@user/i.test(t)? '' : '\n> Tip: poné @user donde quieras que mencione a la persona'}`);
}
async function socCmd(m, jid, text) {
  const nombre = SOC_ALIAS[((text.match(/^\/(\S+)/u) || [])[1] || '').toLowerCase()];
  const grupo = jid.endsWith('@g.us');
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!nombre || !SOC[nombre]) return;
  if (!grupo && SOLO_GRUPO.has(nombre)) return reply('Este comando es solo para grupos');
  if (grupo && SOLO_ADMIN.has(nombre) && !(await modPuede(m, jid))) return reply('⛔ Solo admins');
  await SOC[nombre]({ m, jid, text, args: text.replace(/^\/\S+\s*/, '').trim(), grupo, reply });
}

// ---------- whitelist ----------
async function isAllowed(m, jid) {
  if (await isOwner(m, jid)) return true;
  const ids = senderIds(m, jid);
  return wl.some(e => e.ids.some(x => ids.includes(x)));
}

async function wlCmd(m, jid, text, remove) {
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!(await isOwner(m, jid))) return; // solo el dueño, sin responder a los demás

  const sub = (text.trim().split(/\s+/)[1] || '').toLowerCase();
  if (!remove && sub === 'list') {
    if (!wl.length) return reply('La whitelist está vacía');
    return reply(
      '✅ Whitelist:\n' + wl.map(e => `• @${num(e.jid || e.ids[0])}`).join('\n'),
      wl.map(e => e.jid).filter(Boolean)
    );
  }

  const ctx = m.message.extendedTextMessage?.contextInfo;
  const target = ctx?.mentionedJid?.[0] || ctx?.participant;
  if (!target) return reply('Uso:\n/whitelist @usuario (o respondiendo a su mensaje)\n/unwhitelist @usuario\n/whitelist list');

  const meta = await sock.groupMetadata(jid);
  const p = meta.participants.find(p => idsDe(p).includes(num(target)));
  const ids = p? idsDe(p) : [num(target)];
  const tag = `@${num(target)}`;

  if (ids.includes(OWNER)) return reply('Vos ya sos el dueño 😄');
  if (ids.some(x => botIds().includes(x))) return reply('No hace falta, soy el bot');

  const idx = wl.findIndex(e => e.ids.some(x => ids.includes(x)));
  if (remove) {
    if (idx < 0) return reply(`${tag} no estaba en la whitelist`, [target]);
    wl.splice(idx, 1); saveWl();
    return reply(`🚫 ${tag} sacado de la whitelist`, [target]);
  }
  if (idx >= 0) return reply(`${tag} ya estaba en la whitelist`, [target]);
  wl.push({ ids, jid: target }); saveWl();
  reply(`✅ ${tag} agregado a la whitelist (puede usar comandos de owner.)`, [target]);
}

function tick() {
  if (!mainSock) return;
  const n = new Date(Date.now() - 3 * 3600e3);
  const dia = n.getUTCDay(), hh = n.getUTCHours(), mm = n.getUTCMinutes();
  const key = `${n.getUTCFullYear()}-${n.getUTCMonth()}-${n.getUTCDate()} ${hh}:${mm}`;
  let dirty = false;
  for (const [jid, list] of Object.entries(data)) for (const a of list) if (a.h === hh && a.m === mm && a.dias.includes(dia) && a.last!== key) {
    a.last = key; dirty = true; (instances.get(a.bot || 'main')?.sock || mainSock).sendMessage(jid, { text: a.msg }).catch(() => {});
  }
  if (dirty) save();
}
setInterval(tick, 20000);

// ---------- personalización (por instancia: el principal y cada sub-bot tienen la suya) ----------
const CFG = './settings.json';          // { "main": { name, currency }, "<numero>": {...} }
const BANNER_DIR = './banners';          // banners/<instancia>.jpg
const BANNER_URL = process.env.BANNER_URL || 'https://vand4licc.dpdns.org'; // dominio que se muestra abajo de la tarjeta
const BANNER_BODY = process.env.BANNER_BODY || 'Powered by Vand4lw';
const DEFAULT_CURRENCY = process.env.CURRENCY || '💰';
let settings = fs.existsSync(CFG)? JSON.parse(fs.readFileSync(CFG)) : {};
const saveCfg = () => fs.writeFileSync(CFG, JSON.stringify(settings, null, 2));
const cfgOf = id => settings[id] || {};
function setCfg(id, patch) {
  const c = { ...(settings[id] || {}), ...patch };
  for (const k of Object.keys(c)) if (c[k] == null) delete c[k];
  if (Object.keys(c).length) settings[id] = c; else delete settings[id];
  saveCfg();
}
const bannerPath = id => `${BANNER_DIR}/${id}.jpg`;
// banner de fábrica: se usa cuando un bot no tiene banner propio (en el menú y en la vista previa de la página)
const DEFAULT_BANNER = Buffer.from([
  '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',
].join(''), 'base64');
// la foto del bot: la suya si la cargó, y si no la de fábrica
const bannerBuf = id => fs.existsSync(bannerPath(id))? fs.readFileSync(bannerPath(id)) : DEFAULT_BANNER;
const bannerVer = id => fs.existsSync(bannerPath(id))? Math.floor(fs.statSync(bannerPath(id)).mtimeMs) : 0;
// WhatsApp recorta la foto de la tarjeta del menú a un rectángulo ancho (1.91:1). Para que no se corte nada, la foto se acomoda ENTERA
// dentro de ese rectángulo y el resto se rellena con la misma foto desenfocada. Se guarda en memoria hasta que cambie el banner.
const CARD_W = 1200, CARD_H = 628;
const cardCache = new Map();   // id de bot -> { ver, buf }
async function bannerCard(id) {
  const origen = bannerBuf(id), ver = bannerVer(id), c = cardCache.get(id);
  if (c && c.ver === ver) return c.buf;
  let buf = origen;
  if (sharp) {
    try {
      const frente = await sharp(origen).rotate().resize({ width: CARD_W, height: CARD_H, fit: 'inside', withoutEnlargement: true }).toBuffer();
      const fondo = await sharp(origen).rotate().resize({ width: CARD_W, height: CARD_H, fit: 'cover' }).blur(30).modulate({ brightness: 0.7 }).toBuffer();
      buf = await sharp(fondo).composite([{ input: frente, gravity: 'centre' }]).jpeg({ quality: 82 }).toBuffer();
    } catch (e) { console.error('[banner] no pude armar la tarjeta, uso la foto original:', e.message); buf = origen; }
  }
  cardCache.set(id, { ver, buf });
  return buf;
}
const botName = () => cfgOf(ctxBot().id).name || ctxBot().name || BOT_NAME;
const currency = () => cfgOf(ctxBot().id).currency || DEFAULT_CURRENCY; // para los comandos de economía

// quién puede personalizar: dueño y whitelist, y el dueño de cada sub-bot (su propia cuenta)
async function puedePersonalizar(m, jid) {
  if (await isAllowed(m, jid)) return true;
  const id = ctxBot().id;
  return id!== 'main' && senderIds(m, jid).includes(id);
}
const limpiar = t => String(t).replace(/[\u0000-\u001f\u007f]/g, '').trim();

async function setBotName(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!(await puedePersonalizar(m, jid))) return reply('⛔ Solo el dueño del bot puede personalizarlo');
  const arg = limpiar(text.trim().split(/\s+/).slice(1).join(' '));
  if (!arg) return reply(`Uso: /setbotname <nombre>\nActual: *${botName()}*\n(/setbotname reset para volver al original)`);
  if (/^reset$/i.test(arg)) { setCfg(ctxBot().id, { name: null }); return reply(`✅ Nombre restablecido: *${botName()}*`); }
  if (arg.length > 40) return reply('⚠️ El nombre puede tener hasta 40 caracteres');
  setCfg(ctxBot().id, { name: arg });
  reply(`✅ Nombre del bot: *${arg}*`);
}

async function setBotCurrency(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!(await puedePersonalizar(m, jid))) return reply('⛔ Solo el dueño del bot puede personalizarlo');
  const arg = limpiar(text.trim().split(/\s+/).slice(1).join(' '));
  if (!arg) return reply(`Uso: /setbotcurrency <moneda>\nActual: *${currency()}*\n(/setbotcurrency reset para volver a la original)`);
  if (/^reset$/i.test(arg)) { setCfg(ctxBot().id, { currency: null }); return reply(`✅ Moneda restablecida: *${currency()}*`); }
  if (arg.length > 20) return reply('⚠️ La moneda puede tener hasta 20 caracteres');
  setCfg(ctxBot().id, { currency: arg });
  reply(`✅ Moneda del bot: *${arg}*`);
}

// foto con el texto /setbanner, o respondiendo a una foto
async function setBanner(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!(await puedePersonalizar(m, jid))) return reply('⛔ Solo el dueño del bot puede personalizarlo');
  const id = ctxBot().id;
  if (/^(reset|borrar|off)$/i.test(text.trim().split(/\s+/)[1] || '')) {
    fs.rmSync(bannerPath(id), { force: true });
    return reply('🗑️ Banner eliminado (vuelve a usarse el de fábrica)');
  }
  const ctx = m.message.extendedTextMessage?.contextInfo;
  const fuente = m.message.imageMessage? m
    : ctx?.quotedMessage?.imageMessage? { key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: ctx.quotedMessage }
    : null;
  if (!fuente) return reply('Mandá una foto con el texto /setbanner, o respondé a una foto con /setbanner.\n(/setbanner reset para quitarlo)');
  let buf;
  try { buf = await downloadMediaMessage(fuente, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }); }
  catch (e) { console.error('[setbanner]', e.message); return reply('❌ No pude descargar la foto'); }
  if (buf.length > 1.5e6) return reply('⚠️ La foto pesa demasiado. Mandala como foto normal (no como documento).');
  fs.mkdirSync(BANNER_DIR, { recursive: true });
  fs.writeFileSync(bannerPath(id), buf);
  reply('✅ Banner actualizado. Probalo con /menu');
}

// ---------- portada de página (la tarjeta del menú apunta a una página pública con la foto del banner) ----------
const PUBLIC_URL = (process.env.BANNER_PUBLIC_URL || '').replace(/\/+$/, ''); // ej: https://bot.vand4licc.dpdns.org
const HTTP_PORT = Number(process.env.WEB_PORT || process.env.SERVER_PORT || process.env.PORT || 0);
// identificador opaco para las URLs (así no se ve el número de los sub-bots)
const slugOf = id => crypto.createHash('sha256').update('banner:' + id).digest('hex').slice(0, 12);
function idBySlug(slug) { // cualquier bot (tenga o no banner propio) para poder mostrar el de fábrica
  return ['main',...Object.keys(subReg)].find(id => slugOf(id) === slug) || null;
}
const nameOfId = id => cfgOf(id).name || subReg[id]?.name || BOT_NAME;
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- página web: vincular y administrar bots (se sirve en la raíz del dominio) ----------
const WEB_NOMBRE = process.env.WEB_NOMBRE || "Vandal's bot service"; // nombre que muestra la página (título, barra lateral y vista previa)
const WEB_CANAL = process.env.WEB_CANAL || 'https://whatsapp.com/channel/0029VbDFJ3kDZ4LjAMBSz92O';
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const webJobs = new Map();   // id de vinculación -> estado (lo consulta la página)
const limites = new Map();   // "clave|ip" -> [horas de los intentos]
const ipDe = req => String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '');
function limite(clave, max, ms) {
  const ahora = Date.now(), a = (limites.get(clave) || []).filter(t => ahora - t < ms);
  if (a.length >= max) { limites.set(clave, a); return false; }
  a.push(ahora); limites.set(clave, a); return true;
}
setInterval(() => {
  const ahora = Date.now();
  for (const [k, a] of limites) { const f = a.filter(t => ahora - t < 3600e3); f.length? limites.set(k, f) : limites.delete(k); }
  for (const [k, j] of webJobs) if (ahora - j.t > 10 * 60e3) webJobs.delete(k);
}, 60e3).unref();

const jsonRes = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj)); };
function leerCuerpo(req, max) {
  return new Promise((ok, mal) => {
    const ch = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { mal(Object.assign(new Error('Archivo demasiado grande'), { code: 413 })); req.destroy(); return; } ch.push(c); });
    req.on('end', () => ok(Buffer.concat(ch))); req.on('error', mal);
  });
}
// los "dueños" se reconocen por un secreto que el navegador guarda al vincular; acá solo se guarda su hash
const tokensDe = req => String(req.headers['x-owner-tokens'] || '').split(',').map(s => s.trim()).filter(s => /^[a-f0-9]{48}$/.test(s)).slice(0, 20).map(sha);
const esMio = (id, hs) => id!== 'main' &&!!subReg[id]?.tok && hs.includes(subReg[id].tok);
const idPorSlug = slug => ['main',...Object.keys(subReg)].find(id => slugOf(id) === slug) || null;

const gruposCache = new Map(); // id -> { n, t, cargando }
function gruposDe(id) {
  const c = gruposCache.get(id) || {}, inst = instances.get(id);
  if (inst?.online &&!c.cargando && (!c.t || Date.now() - c.t > 5 * 60e3)) {
    c.cargando = true; gruposCache.set(id, c);
    Promise.resolve().then(() => inst.sock.groupFetchAllParticipating())
      .then(g => { c.n = Object.keys(g).length; }).catch(() => {})
      .finally(() => { c.t = Date.now(); c.cargando = false; });
  }
  return c.n?? null;
}
function infoBot(id, hs) {
  const inst = instances.get(id), slug = slugOf(id), bp = bannerPath(id), mio = esMio(id, hs);
  return {
    slug, nombre: nameOfId(id), principal: id === 'main', online:!!inst?.online, desde: inst?.since || null, grupos: gruposDe(id),
    banner: fs.existsSync(bp)? `/b/${slug}.jpg?v=${Math.floor(fs.statSync(bp).mtimeMs)}` : null,
    mio,...(mio? { numero: id, prefijo: prefijo(id), moneda: cfgOf(id).currency || DEFAULT_CURRENCY } : {}),
  };
}

function opcionesWeb(numero, modo, job) {
  const fallar = msg => { if (job.estado === 'conectado') return; job.estado = 'error'; job.error = msg; bajaSub(numero); };
  return {
    authDir: `${SUB_DIR}/${numero}`,
    name: BOT_NAME,
    pairingNumber: modo === 'code'? numero : null,
    onPairing: code => { if (job.estado!== 'conectado') { job.code = code; job.estado = 'codigo'; } },
    onQR: async qr => {
      if (modo!== 'qr' ||!pendientes.has(numero)) return;
      try { job.qr = await QRCode.toDataURL(qr, { scale: 8, margin: 1 }); job.estado = 'qr'; } catch (e) { console.error('[web qr]', e.message); }
    },
    onOpen: async s => {
      const p = pendientes.get(numero);
      if (!p) return; // reconexión normal de un sub-bot ya registrado
      if (modo === 'qr' && num(s.user?.id)!== numero) { // con QR puede escanear cualquier cuenta: tiene que ser la del número indicado
        const otro = num(s.user?.id);
        try { await s.logout(); } catch {}
        return fallar(`Ese QR lo escaneó otra cuenta (${otro}) y no el número ${numero}. Probá de nuevo con la cuenta correcta.`);
      }
      clearTimeout(p.timer); pendientes.delete(numero);
      const token = crypto.randomBytes(24).toString('hex');
      subReg[numero] = { name: BOT_NAME, chat: null, quien: null, since: Date.now(), tok: sha(token), web: true }; saveSubs();
      job.token = token; job.estado = 'conectado';
    },
    onClose: code => {
      if (!pendientes.has(numero) || code === DisconnectReason.restartRequired) return false;
      fallar(modo === 'qr'? 'El QR venció. Probá de nuevo.' : 'El código venció o se cortó la conexión. Probá de nuevo.');
      return true;
    },
    onLoggedOut: () => { const era = pendientes.has(numero); if (era) fallar('No se pudo vincular. Probá de nuevo.'); else bajaSub(numero); },
  };
}

const MIME_IMG = b => (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) || (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP');

async function webApi(req, res, path) {
  const ip = ipDe(req), hs = tokensDe(req);
  let m;
  if (req.method === 'GET' && path === '/api/stats') {
    const ids = ['main',...Object.keys(subReg)];
    const gs = ids.map(id => gruposDe(id)).filter(n => n!= null);
    return jsonRes(res, 200, {
      nombre: nameOfId('main'), online: ids.filter(id => instances.get(id)?.online).length, total: ids.length,
      grupos: gs.length? gs.reduce((a, b) => a + b, 0) : null,
      comandos: countCmds(buildMenu({ botName: '', system: '', user: '', totalCommands: 0 })),
      uptime: Math.floor(process.uptime()), usados: Object.keys(subReg).length, max: MAX_SUBBOTS,
    });
  }
  if (req.method === 'GET' && path === '/api/bots') {
    return jsonRes(res, 200, { bots: ['main',...Object.keys(subReg)].map(id => infoBot(id, hs)), max: MAX_SUBBOTS });
  }
  if (req.method === 'POST' && path === '/api/link') {
    let b; try { b = JSON.parse((await leerCuerpo(req, 2000)).toString() || '{}'); } catch { return jsonRes(res, 400, { error: 'Pedido inválido' }); }
    const numero = String(b.numero || '').replace(/\D/g, ''), modo = b.modo === 'qr'? 'qr' : 'code';
    if (numero.length < 8 || numero.length > 15) return jsonRes(res, 400, { error: 'Ingresá un número válido, con código de país.' });
    if (botIds().includes(numero)) return jsonRes(res, 400, { error: 'Ese número es el del bot principal.' });
    if (subReg[numero]) return jsonRes(res, 409, { error: 'Ese número ya es un sub-bot activo.' });
    if (pendientes.has(numero)) return jsonRes(res, 409, { error: 'Ya hay una vinculación en curso para ese número. Esperá un par de minutos.' });
    if (Object.keys(subReg).length + pendientes.size >= MAX_SUBBOTS) return jsonRes(res, 409, { error: `Se alcanzó el máximo de sub-bots (${MAX_SUBBOTS}).` });
    if (modo === 'qr' &&!QRCode) return jsonRes(res, 500, { error: 'El QR no está disponible en este servidor. Usá el código.' });
    if (!limite('link|' + ip, 3, 3600e3)) return jsonRes(res, 429, { error: 'Hiciste demasiados intentos. Probá de nuevo en un rato.' });
    const id = crypto.randomBytes(8).toString('hex');
    const job = { id, numero, modo, estado: 'esperando', code: null, qr: null, error: null, token: null, t: Date.now() };
    webJobs.set(id, job);
    const pend = { qrCount: 0 };
    pend.timer = setTimeout(() => {
      if (pendientes.get(numero)!== pend) return;
      job.estado = 'error'; job.error = 'Se agotó el tiempo. Probá de nuevo.'; bajaSub(numero);
    }, PEND_MS);
    pendientes.set(numero, pend);
    startInstance(numero, opcionesWeb(numero, modo, job)).catch(e => {
      console.error('[web] no pude iniciar', e.message);
      if (job.estado!== 'conectado') { job.estado = 'error'; job.error = 'No pude iniciar la vinculación. Probá de nuevo.'; bajaSub(numero); }
    });
    return jsonRes(res, 200, { id });
  }
  if (req.method === 'GET' && (m = path.match(/^\/api\/link\/([a-f0-9]{16})$/))) {
    const j = webJobs.get(m[1]);
    if (!j) return jsonRes(res, 404, { error: 'Vinculación no encontrada' });
    return jsonRes(res, 200, { estado: j.estado, code: j.estado === 'codigo'? j.code : null, qr: j.estado === 'qr'? j.qr : null, error: j.error, token: j.estado === 'conectado'? j.token : null, restante: Math.max(0, Math.round((j.t + PEND_MS - Date.now()) / 1000)) });
  }
  if (req.method === 'POST' && (m = path.match(/^\/api\/bot\/([a-f0-9]{12})\/(config|banner|banner\/borrar)$/))) {
    const id = idPorSlug(m[1]);
    if (!id ||!esMio(id, hs)) return jsonRes(res, 403, { error: 'Este bot no está vinculado desde este navegador.' });
    if (!limite('cfg|' + ip, 40, 600e3)) return jsonRes(res, 429, { error: 'Demasiados cambios seguidos. Esperá un momento.' });
    if (m[2] === 'config') {
      let b; try { b = JSON.parse((await leerCuerpo(req, 4000)).toString() || '{}'); } catch { return jsonRes(res, 400, { error: 'Pedido inválido' }); }
      const nombre = limpiar(b.nombre?? ''), moneda = limpiar(b.moneda?? ''), pref = Array.from(limpiar(b.prefijo?? ''));
      if (nombre.length > 40) return jsonRes(res, 400, { error: 'El nombre puede tener hasta 40 caracteres.' });
      if (moneda.length > 20) return jsonRes(res, 400, { error: 'La moneda puede tener hasta 20 caracteres.' });
      if (pref.length > 1 || (pref.length === 1 &&!/^[\p{L}\p{P}\p{S}]$/u.test(pref[0]))) return jsonRes(res, 400, { error: 'El prefijo tiene que ser un solo símbolo o letra.' });
      const nuevo = { name: nombre || null, currency: moneda && moneda!== DEFAULT_CURRENCY? moneda : null, prefix: pref[0] && pref[0]!== '/'? pref[0] : null };
      setCfg(id, nuevo);
      return jsonRes(res, 200, { ok: true });
    }
    if (m[2] === 'banner/borrar') { fs.rmSync(bannerPath(id), { force: true }); return jsonRes(res, 200, { ok: true }); }
    let buf;
    try { buf = await leerCuerpo(req, 8 * 1048576); } catch (e) { return jsonRes(res, e.code === 413? 413 : 400, { error: 'La imagen pesa demasiado (máx. 8 MB).' }); }
    if (!buf.length ||!MIME_IMG(buf)) return jsonRes(res, 400, { error: 'Tiene que ser una imagen JPG, PNG o WEBP.' });
    if (sharp) { try { buf = await sharp(buf).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(); } catch { return jsonRes(res, 400, { error: 'No pude leer esa imagen.' }); } }
    else if (buf.length > 1.5e6) return jsonRes(res, 413, { error: 'La imagen pesa demasiado (máx. 1.5 MB).' });
    fs.mkdirSync(BANNER_DIR, { recursive: true });
    fs.writeFileSync(bannerPath(id), buf);
    return jsonRes(res, 200, { ok: true });
  }
  return jsonRes(res, 404, { error: 'No encontrado' });
}

const WEB_PAGE = String.raw`<!doctype html>
<html lang="es" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>__NOMBRE__ · Vincular bot</title>
<meta name="description" content="Vinculá tu número y tené tu propio bot de WhatsApp en un minuto. Hecho por Vand4lw.">
<meta name="theme-color" content="#08050a">
<meta property="og:title" content="__NOMBRE__ · Tu propio bot de WhatsApp">
<meta property="og:description" content="Vinculá tu número con código o QR, sin registro. Hecho por Vand4lw.">
<meta property="og:image" content="__IMG__">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%2310060c'/%3E%3Ccircle cx='16' cy='16' r='5' fill='%23ff5fa8'/%3E%3Cellipse cx='16' cy='16' rx='12' ry='5' fill='none' stroke='%23ff9ccb' stroke-width='1.6' transform='rotate(-28 16 16)'/%3E%3Ccircle cx='26' cy='11' r='2' fill='%23ffd2e8'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root{--h:338;--disp:"Sora","Avenir Next","Segoe UI",system-ui,-apple-system,sans-serif;--body:"Instrument Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
:root,:root[data-theme=dark]{color-scheme:dark;
 --bg:hsl(calc(var(--h) - 30) 34% 3.6%);--g1:hsl(0 0% 100% / .075);--g2:hsl(0 0% 100% / .022);
 --rim:hsl(0 0% 100% / .17);--rim2:hsl(0 0% 100% / .05);--line:hsl(0 0% 100% / .1);
 --text:hsl(var(--h) 30% 97%);--mut:hsl(var(--h) 10% 72%);
 --acc:hsl(var(--h) 96% 68%);--acc2:hsl(calc(var(--h) - 72) 92% 74%);--acc3:hsl(calc(var(--h) + 38) 100% 76%);
 --on:hsl(calc(var(--h) - 30) 60% 6%);--soft:hsl(var(--h) 96% 68% / .14);--glow:hsl(var(--h) 96% 68% / .5);
 --ok:#5dffb0;--bad:#ff6b8b;--shadow:0 30px 60px -32px #000d;--inp:hsl(0 0% 0% / .3);--dock:hsl(calc(var(--h) - 30) 30% 7% / .9);
 --a1:.2;--a2:.14;--a3:.12;--star:.55}
:root[data-theme=light]{color-scheme:light;
 --bg:hsl(calc(var(--h) - 30) 40% 96.5%);--g1:hsl(0 0% 100% / .7);--g2:hsl(0 0% 100% / .36);
 --rim:hsl(0 0% 100% / .95);--rim2:hsl(calc(var(--h) - 30) 30% 40% / .13);--line:hsl(calc(var(--h) - 30) 25% 30% / .14);
 --text:hsl(calc(var(--h) - 30) 45% 9%);--mut:hsl(calc(var(--h) - 30) 14% 36%);
 --acc:hsl(var(--h) 85% 46%);--acc2:hsl(calc(var(--h) - 72) 70% 48%);--acc3:hsl(calc(var(--h) + 38) 90% 46%);
 --on:#fff;--soft:hsl(var(--h) 85% 46% / .1);--glow:hsl(var(--h) 85% 46% / .32);
 --ok:#0a8a4a;--bad:#c4183f;--shadow:0 24px 50px -30px hsl(var(--h) 40% 30% / .45);--inp:hsl(0 0% 100% / .72);--dock:hsl(0 0% 100% / .92);
 --a1:.15;--a2:.11;--a3:.1;--star:0}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{scroll-padding-top:96px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 var(--body);overflow-x:hidden;min-height:100vh;-webkit-font-smoothing:antialiased;transition:background .3s,color .3s}
a{color:inherit;text-decoration:none}
button,input{font:inherit;color:inherit}
h1,h2,h3,h4,p,ol,ul{margin:0}
:focus-visible{outline:2px solid var(--acc);outline-offset:3px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
code{font-family:var(--mono);font-size:.78em;padding:2px 7px;border-radius:7px;background:var(--soft);color:var(--acc);box-shadow:inset 0 0 0 1px var(--rim2)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* ---------- fondo ---------- */
.bgfx{position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden}
.bgfx::before{content:"";position:absolute;inset:-10%;background:
 radial-gradient(46% 40% at 78% 6%,hsl(var(--h) 96% 62% / var(--a1)),transparent 70%),
 radial-gradient(40% 42% at 4% 58%,hsl(calc(var(--h) - 72) 90% 60% / var(--a2)),transparent 72%),
 radial-gradient(60% 40% at 50% 112%,hsl(calc(var(--h) + 38) 100% 60% / var(--a3)),transparent 70%)}
.bgfx::after{content:"";position:absolute;inset:0;opacity:var(--star);background-image:
 radial-gradient(1px 1px at 8% 14%,hsl(0 0% 100% / .7),transparent),radial-gradient(1px 1px at 22% 52%,hsl(0 0% 100% / .5),transparent),
 radial-gradient(1.5px 1.5px at 31% 8%,hsl(0 0% 100% / .6),transparent),radial-gradient(1px 1px at 47% 31%,hsl(0 0% 100% / .45),transparent),
 radial-gradient(1px 1px at 58% 72%,hsl(0 0% 100% / .55),transparent),radial-gradient(1.5px 1.5px at 66% 18%,hsl(0 0% 100% / .5),transparent),
 radial-gradient(1px 1px at 74% 44%,hsl(0 0% 100% / .5),transparent),radial-gradient(1px 1px at 86% 66%,hsl(0 0% 100% / .6),transparent),
 radial-gradient(1.5px 1.5px at 93% 28%,hsl(0 0% 100% / .5),transparent),radial-gradient(1px 1px at 14% 84%,hsl(0 0% 100% / .5),transparent),
 radial-gradient(1px 1px at 39% 90%,hsl(0 0% 100% / .45),transparent),radial-gradient(1px 1px at 81% 92%,hsl(0 0% 100% / .5),transparent)}
.grain{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.05;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
:root[data-theme=light] .grain{display:none}
.spot{position:fixed;left:0;top:0;width:560px;height:560px;margin:-280px 0 0 -280px;border-radius:50%;pointer-events:none;z-index:0;background:radial-gradient(circle,hsl(var(--h) 96% 68% / .13),transparent 62%);opacity:0;transition:opacity .45s;will-change:transform}
.spot.on{opacity:1}
:root[data-theme=light] .spot{background:radial-gradient(circle,hsl(var(--h) 90% 55% / .1),transparent 62%)}
.rxwrap{position:fixed;left:0;top:0;z-index:0;pointer-events:none;transform-origin:0 0;will-change:transform}
.rxwrap[hidden]{display:none}
.rxwrap canvas{display:block;position:relative;z-index:1;width:100%;height:100%;-webkit-mask-image:radial-gradient(closest-side,#000 80%,transparent 100%);mask-image:radial-gradient(closest-side,#000 80%,transparent 100%)}
.rxwrap i{position:absolute;z-index:0;display:block;pointer-events:none;border-radius:50%}
.rxhalo{left:0;top:0;width:100%;height:100%;background:radial-gradient(closest-side,hsl(var(--h) 96% 68% / .62) 8%,hsl(var(--h) 96% 68% / .2) 42%,transparent 100%);animation:hin 1.4s ease-out both,breathe 5.5s ease-in-out 1.4s infinite;will-change:transform,opacity}
.rxhalo::after{content:"";position:absolute;left:23%;top:23%;width:54%;height:54%;border-radius:50%;background:radial-gradient(closest-side,hsl(calc(var(--h) + 38) 100% 80% / .72) 12%,hsl(calc(var(--h) + 38) 100% 78% / .22) 45%,transparent 100%)}
.rxplat{left:-6%;top:71%;width:112%;height:39%;background:radial-gradient(closest-side,hsl(var(--h) 96% 68% / .7) 10%,hsl(var(--h) 96% 68% / .22) 42%,transparent 100%);animation:hin 1.4s ease-out both;will-change:transform}
:root[data-theme=dark]:not([data-fx=lite]) .rxwrap canvas{mix-blend-mode:screen}
.rxwrap.flash .rxhalo{filter:brightness(1.9) saturate(1.3);transition:filter .12s}
:root[data-theme=light] .rxhalo{background:radial-gradient(closest-side,hsl(var(--h) 90% 55% / .26) 8%,hsl(var(--h) 90% 55% / .09) 42%,transparent 100%)}
:root[data-theme=light] .rxhalo::after{background:radial-gradient(closest-side,hsl(calc(var(--h) + 38) 95% 55% / .3) 12%,hsl(calc(var(--h) + 38) 95% 55% / .09) 45%,transparent 100%)}
:root[data-theme=light] .rxplat{background:radial-gradient(closest-side,hsl(var(--h) 90% 55% / .3) 10%,hsl(var(--h) 90% 55% / .1) 42%,transparent 100%)}
@keyframes hin{from{opacity:0}to{opacity:1}}
@keyframes breathe{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.07);opacity:.8}}

/* ---------- vidrio ---------- */
.glass{--r:24px;position:relative;isolation:isolate;border-radius:var(--r);background:linear-gradient(150deg,var(--g1),var(--g2) 55%,var(--g1));box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2),var(--shadow)}
.glass::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;background:radial-gradient(340px circle at var(--mx,50%) var(--my,-40%),hsl(0 0% 100% / .14),transparent 62%);opacity:0;transition:opacity .35s}
.glass.lit::before{opacity:1}
:root[data-theme=light] .glass::before{background:radial-gradient(340px circle at var(--mx,50%) var(--my,-40%),hsl(var(--h) 90% 60% / .1),transparent 62%)}
.glass::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(140deg,hsl(0 0% 100% / .42),transparent 26%,transparent 64%,var(--soft) 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);mask-composite:exclude}
:root[data-theme=light] .glass::after{background:linear-gradient(140deg,hsl(0 0% 100% / 1),transparent 30%,transparent 66%,var(--soft) 100%)}
.glass.blur{-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5)}
.pad{padding:clamp(20px,3vw,32px)}
.tilt{transform:perspective(1100px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .18s ease-out}
.tilt.lit{will-change:transform}

/* ---------- cabecera ---------- */
.top{--r:999px;position:fixed;top:14px;left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100% - 24px);z-index:40;display:flex;align-items:center;gap:6px;padding:7px 8px 7px 18px;background:linear-gradient(150deg,var(--dock),var(--dock))}
.brand{display:flex;align-items:center;gap:10px;font:600 14px/1 var(--disp);letter-spacing:-.01em;min-width:0;margin-right:10px}
.brand b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;font-weight:600}
.svc{display:none;font-size:13px;color:var(--mut);white-space:nowrap;margin:0 8px}
.menu{display:flex;gap:2px}
.menu a{display:flex;align-items:center;gap:8px;padding:9px 15px;color:var(--mut);font-weight:500;font-size:15px;white-space:nowrap;border-radius:999px;transition:color .2s,background .2s}
.menu a i{display:none;width:22px;height:22px}
.menu a svg{width:100%;height:100%}
.menu a:hover{color:var(--text)}
.menu a.on{color:var(--text);background:var(--soft);box-shadow:inset 0 0 0 1px hsl(var(--h) 96% 68% / .28)}
.tone{width:40px;height:40px;border-radius:50%;border:0;background:var(--g1);box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2);display:grid;place-items:center;cursor:pointer;flex:none;margin-left:6px;transition:box-shadow .2s}
.tone:hover{box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--acc),0 0 20px -6px var(--glow)}
.tone svg{width:18px;height:18px}
.led{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px hsl(150 100% 60% / .16),0 0 12px var(--ok);flex:none}
.led.off{background:var(--bad);box-shadow:0 0 0 3px hsl(350 100% 70% / .16),0 0 12px var(--bad)}
.page{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:96px clamp(16px,4vw,40px) 80px}

/* ---------- piezas ---------- */
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:46px;padding:11px 22px;border:0;border-radius:14px;cursor:pointer;font:600 15px/1.1 var(--body);color:var(--text);background:linear-gradient(180deg,var(--g1),var(--g2));box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2);white-space:nowrap;overflow:hidden;transition:transform .15s,box-shadow .25s,filter .2s}
.btn::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,hsl(0 0% 100% / .24) 50%,transparent 65%);transform:translateX(-120%);transition:transform .7s}
.btn:hover::after{transform:translateX(120%)}
.btn:hover{box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px hsl(var(--h) 96% 68% / .55),0 12px 30px -14px var(--glow)}
.btn:active{transform:scale(.97)}
.btn svg{width:17px;height:17px;flex:none}
.btn.pri{color:var(--on);background:linear-gradient(115deg,var(--acc),var(--acc2));box-shadow:inset 0 1px 0 hsl(0 0% 100% / .55),0 14px 34px -12px var(--glow)}
.btn.pri:hover{filter:brightness(1.08);box-shadow:inset 0 1px 0 hsl(0 0% 100% / .55),0 16px 40px -10px var(--glow)}
.btn[disabled]{opacity:.45;pointer-events:none}
.title{font:600 clamp(26px,3.8vw,40px)/1.15 var(--disp);letter-spacing:-.03em}
.sub{color:var(--mut);margin-top:10px;max-width:56ch}
.sh{margin:clamp(64px,10vw,112px) 0 24px}
.sh h2{font:600 clamp(21px,2.7vw,30px)/1.2 var(--disp);letter-spacing:-.025em}
.sh p{color:var(--mut);margin-top:8px;max-width:56ch}
h3{font:600 16px/1.3 var(--disp);letter-spacing:-.01em;margin-bottom:14px}
label,.lbl{display:block;font-size:14px;color:var(--mut);margin:0 0 7px}
.inp{width:100%;padding:12px 14px;border:0;border-radius:12px;background:var(--inp);outline:none;color:var(--text);font:500 15px var(--body);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .2s}
.inp:focus{box-shadow:inset 0 0 0 1.5px var(--acc),0 0 0 4px var(--soft)}
.field{display:flex;align-items:stretch;border-radius:14px;background:var(--inp);box-shadow:inset 0 0 0 1px var(--line),inset 0 2px 10px hsl(0 0% 0% / .22);transition:box-shadow .25s}
.field:focus-within{box-shadow:inset 0 0 0 1.5px var(--acc),0 0 0 4px var(--soft),0 0 32px -8px var(--glow)}
.field .pr{display:grid;place-items:center;padding:0 14px;color:var(--acc);font:600 15px var(--mono)}
.field .inp{border-radius:0 14px 14px 0;box-shadow:none;background:none;font:500 16px var(--mono);letter-spacing:.02em;padding-left:0}
.hint{font-size:13.5px;color:var(--mut);margin-top:10px;min-height:22px}
.hint.ok{color:var(--ok)}.hint.bad{color:var(--bad)}
.err{margin-top:16px;padding:12px 15px;border-radius:12px;background:hsl(350 100% 65% / .12);box-shadow:inset 3px 0 0 var(--bad);font-size:14.5px}
.empty{padding:38px 20px;text-align:center;color:var(--mut);border-radius:20px;box-shadow:inset 0 0 0 1px var(--line)}
.skel{height:78px;border-radius:20px;background:linear-gradient(90deg,var(--g2),var(--g1),var(--g2));background-size:200% 100%;animation:sh 1.4s infinite;margin-bottom:12px}
@keyframes sh{to{background-position:-200% 0}}
.acts{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px}
.center{text-align:center}
.foot{margin-top:clamp(64px,10vw,112px);padding-top:22px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;color:var(--mut);font-size:14px}
.foot a{color:var(--text);font-weight:600}
.foot a:hover{color:var(--acc)}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
.slot{position:relative;aspect-ratio:1;pointer-events:none}

/* ---------- inicio ---------- */
.hero{position:relative;display:grid;grid-template-columns:minmax(0,520px) minmax(0,1fr);align-items:center;min-height:clamp(560px,calc(100vh - 150px),840px);min-height:clamp(560px,calc(100svh - 150px),840px)}
.hero .copy{position:relative;z-index:3;grid-column:1;grid-row:1;padding:24px 0}
.hero .slot{position:absolute;right:calc(-1 * clamp(0px,4vw,60px));top:50%;width:min(92vw,900px);transform:translateY(-50%)}
.hero h1{font:600 clamp(30px,4.3vw,54px)/1.1 var(--disp);letter-spacing:-.035em;text-shadow:0 2px 40px var(--bg)}
.hero h1 .w{display:inline-block;white-space:nowrap}
.hero h1.boot .c{display:inline-block;animation:cin .6s both;animation-delay:calc(var(--n) * 24ms + 150ms)}
@keyframes cin{0%{opacity:0;color:var(--acc);text-shadow:0 0 24px var(--acc);transform:translateY(.18em)}55%{opacity:1;color:var(--acc);text-shadow:0 0 18px var(--glow)}100%{opacity:1;text-shadow:0 2px 40px var(--bg)}}
.lede{margin:22px 0 30px;color:var(--mut);font-size:18px;max-width:38ch;text-shadow:0 1px 24px var(--bg)}
.console{max-width:470px;padding:22px}
.console.boot{animation:rise .8s .55s cubic-bezier(.2,.8,.2,1) backwards}
.quickbtns{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.quickbtns .btn{flex:1 1 150px}
.readout{position:absolute;z-index:3;right:clamp(0px,2vw,24px);bottom:clamp(18px,6vh,64px);padding:16px 22px 16px 20px;display:flex;align-items:center;gap:16px;border-radius:22px}
.readout b{font:600 clamp(34px,4.6vw,52px)/1 var(--disp);letter-spacing:-.04em}
.readout span{color:var(--mut);font-size:14px;line-height:1.35}
.readout .tip{display:block;font-size:12.5px;opacity:.85;margin-top:3px}

.tele{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:clamp(28px,4vw,48px);--r:26px}
.tele>div{padding:22px 24px;min-width:0;position:relative}
.tele>div+div::before{content:"";position:absolute;left:0;top:22px;bottom:22px;width:1px;background:var(--line)}
.tele .k{display:block;color:var(--mut);font-size:13.5px}
.tele b{display:block;font:600 clamp(20px,2.3vw,28px)/1.25 var(--mono);margin-top:5px;white-space:nowrap;font-weight:600}
.seg{display:flex;gap:3px;margin-top:12px}
.seg i{flex:1;height:6px;border-radius:3px;background:var(--line)}
.seg i.on{background:linear-gradient(90deg,var(--acc),var(--acc2));box-shadow:0 0 10px var(--glow)}

.split{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(16px,4vw,48px);align-items:center}
.split .slot{width:min(100%,430px);justify-self:center}
.lines{list-style:none;padding:0;--r:26px;overflow:hidden}
.lines li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px 24px;transition:background .25s;cursor:default}
.lines li+li{box-shadow:inset 0 1px 0 var(--line)}
.lines li.hot{background:var(--soft)}
.lines b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lines small{display:block;color:var(--mut);font-size:13px}
.lines .up{font-size:13px;color:var(--acc)}
.lines .none{display:block;color:var(--mut);padding:26px 24px}

/* funciones: carrusel con profundidad */
.car{display:flex;gap:22px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;width:100vw;margin-left:calc(50% - 50vw);padding:34px max(clamp(16px,4vw,40px),calc((100vw - 1120px) / 2 + clamp(16px,4vw,40px))) 46px;scroll-padding:0 max(clamp(16px,4vw,40px),calc((100vw - 1120px) / 2 + clamp(16px,4vw,40px)))}
.car::-webkit-scrollbar{display:none}
.card{flex:0 0 min(340px,80vw);scroll-snap-align:start;min-height:380px;padding:26px;display:flex;flex-direction:column;transform:perspective(1000px) rotateX(var(--rx,0deg)) rotateY(calc(var(--d,0) * -22deg + var(--ry,0deg))) scale(calc(1 - var(--a,0) * .08));transform-origin:50% 50%;opacity:calc(1 - var(--a,0) * .28);outline-offset:4px}
.card.back{transition:transform .3s ease-out}
.card h3{font-size:17px;margin:20px 0 9px}
.card p{color:var(--mut);font-size:15px}
.card .cmds{margin-top:auto;padding-top:18px}
.cmds{display:flex;flex-wrap:wrap;gap:7px}
.car:not(.vis) .viz *{animation-play-state:paused!important}
.carnav{display:flex;gap:10px;justify-content:flex-end;margin-top:-8px}
.carnav .btn{min-height:42px;padding:9px 16px}
.viz{height:128px;border-radius:18px;padding:16px;display:flex;flex-direction:column;justify-content:center;gap:10px;background:var(--inp);box-shadow:inset 0 0 0 1px var(--line),inset 0 2px 14px hsl(0 0% 0% / .22);overflow:hidden;position:relative;font-size:13px}
.v-dl .file{display:flex;justify-content:space-between;font:500 12.5px var(--mono)}
.v-dl .file span{color:var(--mut)}
.v-dl .bar{height:7px;border-radius:4px;background:var(--line);overflow:hidden}
.v-dl .bar i{display:block;height:100%;width:4%;border-radius:4px;background:linear-gradient(90deg,var(--acc),var(--acc3));animation:fill 3.6s ease-in-out infinite}
@keyframes fill{0%{width:4%}68%{width:100%}100%{width:100%}}
.v-dl .src{display:flex;gap:6px;flex-wrap:wrap}
.v-dl .src span{padding:2px 9px;border-radius:20px;font-size:11.5px;color:var(--mut);box-shadow:inset 0 0 0 1px var(--line)}
.v-st{flex-direction:row;align-items:center;justify-content:center;gap:22px}
.v-st .ph{width:58px;height:58px;border-radius:9px;background:linear-gradient(135deg,var(--acc3),var(--acc) 55%,var(--acc2))}
.v-st .ar{color:var(--mut);font-family:var(--mono)}
.v-st .sk{width:62px;height:62px;border-radius:44%;background:linear-gradient(135deg,var(--acc3),var(--acc) 55%,var(--acc2));box-shadow:0 0 0 4px hsl(0 0% 100% / .92),0 10px 24px -8px #000a;animation:wig 3.2s ease-in-out infinite}
@keyframes wig{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg) scale(1.04)}}
.v-eco p{display:flex;justify-content:space-between;font:500 12.5px var(--mono);color:var(--mut)}
.v-eco b{font-weight:600}
.v-eco .up{color:var(--ok)}.v-eco .dn{color:var(--bad)}
.v-ai{gap:8px}
.v-ai span{align-self:flex-start;padding:7px 12px;border-radius:14px 14px 14px 4px;background:var(--soft);font-size:12.5px}
.v-ai .me{align-self:flex-end;border-radius:14px 14px 4px 14px;background:var(--g1);box-shadow:inset 0 0 0 1px var(--line)}
.v-ai .bot{display:inline-flex;gap:4px;padding:10px 13px}
.v-ai .bot em{width:6px;height:6px;border-radius:50%;background:var(--acc);animation:dots 1.2s infinite}
.v-ai .bot em:nth-child(2){animation-delay:.2s}.v-ai .bot em:nth-child(3){animation-delay:.4s}
@keyframes dots{0%,60%,100%{opacity:.25;transform:none}30%{opacity:1;transform:translateY(-3px)}}
.v-gr{flex-direction:row;align-items:center;justify-content:space-between}
.v-gr .av3{display:flex}
.v-gr .av3 i{width:34px;height:34px;border-radius:50%;margin-left:-9px;box-shadow:0 0 0 3px var(--bg)}
.v-gr .av3 i:first-child{margin-left:0}
.v-gr .av3 i:nth-child(1){background:linear-gradient(135deg,var(--acc),var(--acc2))}
.v-gr .av3 i:nth-child(2){background:linear-gradient(135deg,var(--acc3),var(--acc))}
.v-gr .av3 i:nth-child(3){background:linear-gradient(135deg,var(--acc2),var(--acc3))}
.v-gr .av3 i:nth-child(4){background:var(--g1);box-shadow:0 0 0 3px var(--bg),inset 0 0 0 1px var(--line)}

/* ruta: tres pasos */
.path{list-style:none;padding:0;position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:26px}
.path::before{content:"";position:absolute;left:26px;right:26px;top:25px;height:2px;background:repeating-linear-gradient(90deg,var(--line) 0 8px,transparent 8px 14px)}
.path .pulse{position:absolute;top:23px;left:26px;width:80px;height:6px;border-radius:3px;background:linear-gradient(90deg,transparent,var(--acc));box-shadow:0 0 16px var(--glow);opacity:0}
.path.go .pulse{animation:travx 3s ease-in-out forwards}
@keyframes travx{0%{left:26px;opacity:1}85%{opacity:1}100%{left:calc(100% - 106px);opacity:0}}
.path li{position:relative;padding-top:70px}
.path .node{position:absolute;top:0;left:0;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--g1);box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2);font:600 17px var(--disp);color:var(--mut);transition:all .4s}
.path.go .node{animation:lit .5s forwards;animation-delay:calc(var(--i) * 1.1s + .1s)}
@keyframes lit{to{background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--on);box-shadow:0 0 28px -4px var(--glow)}}
.path b{display:block;font:600 16px/1.3 var(--disp);margin-bottom:8px}
.path p{color:var(--mut);max-width:34ch}

/* ---------- vincular ---------- */
.phead{position:relative;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;padding-top:clamp(8px,3vw,28px)}
.phead .slot{position:absolute;right:clamp(170px,19vw,250px);top:60%;width:190px;transform:translateY(-50%)}
.vgrid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:20px;margin-top:30px;align-items:start}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px}
.opt{position:relative;text-align:left;padding:16px;border:0;border-radius:18px;background:var(--inp);cursor:pointer;display:grid;gap:4px;box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .25s,background .25s}
.opt .oi{width:26px;height:26px;color:var(--acc);margin-bottom:6px}
.opt .oi svg{width:100%;height:100%}
.opt b{font-weight:600}
.opt span.d{font-size:13.5px;color:var(--mut);line-height:1.4}
.opt:hover{box-shadow:inset 0 0 0 1px hsl(var(--h) 96% 68% / .5)}
.opt.on{background:var(--soft);box-shadow:inset 0 0 0 1.5px var(--acc),0 0 30px -10px var(--glow)}
.vside .slot{width:min(100%,300px);margin:-6px auto 4px}
.rail{list-style:none;padding:0}
.rail li{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);gap:14px;padding-bottom:22px;color:var(--mut);font-size:15px}
.rail li:last-child{padding-bottom:0}
.rail li::before{content:"";position:absolute;left:16px;top:38px;bottom:2px;width:2px;background:var(--line)}
.rail li:last-child::before{display:none}
.rail .k{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--g1);box-shadow:inset 0 0 0 1px var(--line);font:600 13px var(--disp);color:var(--mut);transition:all .3s}
.rail li>div{padding-top:5px}
.rail b{color:var(--text);font-weight:600}
.rail li.on .k{background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--on);box-shadow:0 0 22px -4px var(--glow)}
.rail li.on>div{color:var(--text)}
.rail li.done .k{background:var(--soft);color:var(--acc);box-shadow:inset 0 0 0 1px hsl(var(--h) 96% 68% / .4)}
.note{display:flex;gap:10px;margin-top:22px;padding-top:16px;border-top:1px solid var(--line);font-size:14px;color:var(--mut)}
.note svg{width:18px;height:18px;flex:none;color:var(--acc);margin-top:2px}
.wait{display:flex;align-items:center;gap:14px;margin:6px 0 4px}
.wait i{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--line);border-top-color:var(--acc);animation:spin .8s linear infinite;flex:none}
.bigcode{display:flex;justify-content:center;gap:6px;margin:24px 0 20px}
.bigcode span{flex:0 1 46px;min-width:0;padding:14px 0;text-align:center;font:600 clamp(20px,6vw,28px)/1 var(--mono);border-radius:12px;background:linear-gradient(180deg,var(--g1),var(--g2));box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2),0 8px 16px -8px #000a,0 2px 0 hsl(var(--h) 96% 68% / .5);animation:pop .45s cubic-bezier(.22,.8,.3,1) backwards}
.bigcode span.sep{flex:0 0 12px;box-shadow:none;background:none;color:var(--mut);padding:14px 0}
.cdrow{display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap}
.ring{position:relative;width:78px;height:78px;flex:none}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:3;stroke-linecap:round}
.ring .rt{stroke:var(--line)}
.ring .rp{stroke:var(--acc);stroke-dasharray:100;transition:stroke-dashoffset .5s linear,stroke .3s;filter:drop-shadow(0 0 4px var(--glow))}
.ring.low .rp{stroke:var(--bad)}
.ring b{position:absolute;inset:0;display:grid;place-items:center;font:600 20px var(--mono)}
.qrbox{position:relative;width:min(270px,100%);aspect-ratio:1;margin:22px auto;padding:14px;background:#fff;border-radius:18px;box-shadow:0 20px 50px -20px var(--glow)}
.qrbox img{width:100%;height:100%;display:block;image-rendering:pixelated}
.qrbox::before{content:"";position:absolute;inset:-7px;pointer-events:none;border-radius:22px;background:
 linear-gradient(var(--acc),var(--acc)) 0 0/24px 2px no-repeat,linear-gradient(var(--acc),var(--acc)) 0 0/2px 24px no-repeat,
 linear-gradient(var(--acc),var(--acc)) 100% 0/24px 2px no-repeat,linear-gradient(var(--acc),var(--acc)) 100% 0/2px 24px no-repeat,
 linear-gradient(var(--acc),var(--acc)) 0 100%/24px 2px no-repeat,linear-gradient(var(--acc),var(--acc)) 0 100%/2px 24px no-repeat,
 linear-gradient(var(--acc),var(--acc)) 100% 100%/24px 2px no-repeat,linear-gradient(var(--acc),var(--acc)) 100% 100%/2px 24px no-repeat}
.qrbox .scan{position:absolute;left:14px;right:14px;top:14px;height:3px;border-radius:2px;background:var(--acc);box-shadow:0 0 16px 3px var(--glow);animation:scan 2.4s ease-in-out infinite alternate}
@keyframes scan{to{top:calc(100% - 17px)}}
.okm{width:64px;height:64px;margin:6px auto 16px;border-radius:50%;display:grid;place-items:center;background:var(--ok);color:var(--on);box-shadow:0 0 40px -4px var(--ok);animation:pop .5s cubic-bezier(.22,.8,.3,1)}
.okm svg{width:30px;height:30px}

/* ---------- bots ---------- */
.tabs{display:inline-flex;margin:28px 0 22px;padding:4px;border-radius:16px;background:var(--inp);box-shadow:inset 0 0 0 1px var(--line)}
.tabs button{padding:10px 22px;border:0;border-radius:12px;background:none;cursor:pointer;color:var(--mut);font-weight:600;transition:color .2s,background .2s}
.tabs button:hover{color:var(--text)}
.tabs button.on{background:linear-gradient(115deg,var(--acc),var(--acc2));color:var(--on)}
.bot{margin-bottom:14px;--r:26px}
.bhead{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:6px 18px;padding:18px 24px}
.avs{position:relative;display:block;width:52px;height:52px}
.avw{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 200deg,var(--acc),var(--acc2),var(--acc3),var(--acc))}
.av{position:absolute;inset:2.5px;display:grid;place-items:center;border-radius:50%;background:var(--bg) center/cover;font:600 18px/1 var(--disp);color:var(--acc)}
.avs .led{position:absolute;right:-2px;bottom:0;border:2px solid var(--bg)}
.avs.off .avw{background:var(--line)}
.bname b{display:block;font-weight:600;overflow-wrap:anywhere}
.num{display:block;color:var(--mut);font-size:12.5px}
.chipst{display:inline-flex;align-items:center;gap:8px;font-size:14px}
.chipst.main{color:var(--acc);font-weight:600}
.chipst.off{color:var(--mut)}
.bmeta{display:flex;gap:18px;color:var(--mut);font-size:14px;align-items:center}
.bmeta .mono{font-size:13px;color:var(--text)}
.edit{padding:22px 24px 24px;box-shadow:inset 0 1px 0 var(--line);display:grid;gap:16px}
.edit .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.prev{display:block;width:100%;max-height:150px;object-fit:cover;border-radius:14px;box-shadow:0 0 0 1px var(--line)}
.up-btn{width:100%;margin:0;color:var(--text)}

/* ---------- estado ---------- */
.eh{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:clamp(12px,3vw,36px);margin-top:30px;padding:clamp(18px,3vw,30px);--r:30px}
.eh .slot{width:clamp(170px,25vw,300px);margin:-18px 0}
.eh .mini{display:grid;gap:22px;margin:0;padding-left:clamp(16px,3.5vw,44px);border-left:1px solid var(--line)}
.eh .mini dt{color:var(--mut);font-size:14px}
.eh .mini dd{margin:3px 0 0;font:600 clamp(22px,2.6vw,32px)/1.15 var(--mono)}
.eh .k{color:var(--mut);font-size:14px}
.big{font:600 clamp(26px,4vw,44px)/1.15 var(--mono);display:block;margin:4px 0 12px;font-weight:600}
.chipst .led{margin-right:0}
.gauges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
.g{display:flex;align-items:center;gap:20px;padding:22px 24px;--r:26px}
.gv{position:relative;width:112px;height:112px;flex:none}
.gv svg{width:100%;height:100%;transform:rotate(135deg)}
.gv circle{fill:none;stroke-width:8;stroke-linecap:round}
.gv .gt{stroke:var(--line);stroke-dasharray:75 100}
.gv .gp{stroke-dasharray:0 100;transition:stroke-dasharray 1.1s cubic-bezier(.3,.8,.2,1);filter:drop-shadow(0 0 5px var(--glow))}
.gv b{position:absolute;inset:0;display:grid;place-items:center;font:600 18px var(--mono)}
.g .gl b{display:block;font-weight:600}
.g .gl span{color:var(--mut);font-size:14px}
.lat{margin-top:16px;padding:24px;--r:26px}
.lat h3{margin-bottom:4px}
.lat .st{display:flex;flex-wrap:wrap;gap:6px 26px;margin:6px 0 14px;color:var(--mut);font-size:14px}
.lat .st b{color:var(--text);font-family:var(--mono);font-weight:600}
.spark{display:block;width:100%;height:96px}
.spark .sl{fill:none;stroke:var(--acc);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round;filter:drop-shadow(0 0 4px var(--glow))}
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
.tiles>div{padding:22px 24px;--r:26px}
.tiles span{color:var(--mut);font-size:14px}
.tiles .big{font-size:clamp(22px,2.6vw,30px);margin:6px 0 0}

/* ---------- colores y efectos ---------- */
.themep{--r:24px;position:fixed;right:clamp(12px,3vw,32px);top:78px;z-index:60;width:min(300px,calc(100vw - 24px));padding:22px;animation:pop .2s ease;background:linear-gradient(150deg,var(--dock),var(--dock))}
.themep[hidden]{display:none}
.themep{-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4)}
:root[data-fx=lite] .themep{-webkit-backdrop-filter:none;backdrop-filter:none;background:linear-gradient(var(--bg),var(--bg))}
.themep h4{margin:0 0 14px;font:600 15px/1 var(--disp)}
.seg2{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:14px;background:var(--inp);box-shadow:inset 0 0 0 1px var(--line)}
.seg2 button{padding:9px;border:0;border-radius:11px;background:none;cursor:pointer;color:var(--mut);font-weight:600;font-size:14px}
.seg2 button.on{background:linear-gradient(115deg,var(--acc),var(--acc2));color:var(--on)}
.sw{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
.sw button{width:30px;height:30px;border-radius:50%;border:0;cursor:pointer;position:relative;box-shadow:inset 0 1px 0 hsl(0 0% 100% / .5)}
.sw button.on{box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--text)}
.themep .row{margin-top:16px}
input[type=range]{width:100%;height:8px;appearance:none;-webkit-appearance:none;border-radius:8px;background:linear-gradient(90deg,hsl(0 90% 60%),hsl(60 90% 55%),hsl(120 80% 50%),hsl(180 85% 50%),hsl(240 90% 62%),hsl(300 85% 60%),hsl(360 90% 60%));outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid var(--acc);cursor:pointer}
input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--acc);cursor:pointer}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;padding:12px 20px;border-radius:16px;background:var(--dock);box-shadow:inset 0 0 0 1px hsl(var(--h) 96% 68% / .5),0 0 34px -8px var(--glow);animation:pop .3s ease;font-size:15px;max-width:90vw}

/* ---------- modo ligero ---------- */
:root[data-fx=lite] .glass.blur,:root[data-fx=lite] .top,:root[data-fx=lite] .menu{-webkit-backdrop-filter:none;backdrop-filter:none}
:root[data-fx=lite] .spot{display:none}
:root[data-fx=lite] .btn::after{display:none}
:root[data-fx=lite] .glass.blur,:root[data-fx=lite] .readout{background:linear-gradient(150deg,var(--dock),var(--dock))}
:root[data-fx=lite] .grain{display:none}

/* ---------- responsive ---------- */
@media(min-width:1100px){.svc{display:block}}
@media(max-width:960px){
 .phead .slot{display:none}
 .hero{display:flex;flex-direction:column;min-height:0;padding-top:6px}
 .hero .slot{position:relative;order:-1;right:auto;top:auto;transform:none;width:min(100%,440px);width:min(100%,440px,50svh);margin:0 auto -34px}
 .hero .copy{padding:0}
 .readout{position:relative;right:auto;bottom:auto;align-self:center;margin-top:22px}
 .split{grid-template-columns:1fr}
 .split .slot{order:-1;width:min(100%,320px)}
 .vgrid{grid-template-columns:1fr}
 .tele{grid-template-columns:1fr 1fr}
 .tele>div:nth-child(3)::before{display:none}
 .tele>div:nth-child(n+3){box-shadow:inset 0 1px 0 var(--line)}
 .path{grid-template-columns:1fr;gap:30px}
 .path::before{left:25px;right:auto;top:26px;bottom:26px;width:2px;height:auto;background:repeating-linear-gradient(180deg,var(--line) 0 8px,transparent 8px 14px)}
 .path .pulse{left:23px;top:26px;width:6px;height:80px;background:linear-gradient(180deg,transparent,var(--acc))}
 .path.go .pulse{animation-name:travy}
 @keyframes travy{0%{top:26px;opacity:1}85%{opacity:1}100%{top:calc(100% - 106px);opacity:0}}
 .path li{padding:6px 0 0 72px;min-height:52px}
 .gauges{grid-template-columns:1fr}
}
@media(max-width:760px){
 html{scroll-padding-top:72px}
 .top{top:0;width:auto;max-width:none;margin:0;border-radius:0;justify-content:space-between;padding:10px 14px;-webkit-backdrop-filter:none;backdrop-filter:none}
 .top.glass.blur{-webkit-backdrop-filter:none;backdrop-filter:none}
 .top{background:linear-gradient(var(--bg),var(--bg))}
 .top::after{border-radius:0}
 .brand{margin-right:0}
 .brand b{max-width:56vw}
 .tone{margin-left:0}
 .menu{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:45;display:grid;grid-template-columns:repeat(5,1fr);gap:0;padding:5px;border-radius:22px;background:var(--dock);box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2),0 -10px 40px -10px #000a;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
 :root[data-fx=lite] .menu{background:var(--bg)}
 .menu a{flex-direction:column;gap:3px;padding:8px 2px 7px;font-size:11.5px;text-align:center;justify-content:center;border-radius:17px}
 .menu a i{display:block}
 .page{padding-top:76px;padding-bottom:112px}
 .themep{top:62px}
 .bhead{grid-template-columns:auto minmax(0,1fr) auto}
 .bmeta{grid-column:2 / -1}
 .gv{width:96px;height:96px}
 .eh{grid-template-columns:1fr;justify-items:center;text-align:center}
 .eh .slot{margin:-10px 0 -6px}
 .eh .mini{grid-template-columns:1fr 1fr;border-left:0;border-top:1px solid var(--line);padding:18px 0 0;width:100%;text-align:center}
}
@media(max-width:560px){
 .opts,.edit .two,.tiles{grid-template-columns:1fr}
 .hero h1{font-size:clamp(27px,8.2vw,36px)}
 .tele>div{padding:18px 18px}
 .readout{padding:14px 18px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.path .node{background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--on)}.path .pulse{display:none}}

</style>
</head>
<body>
<div class="bgfx" aria-hidden="true"></div>
<div class="grain" aria-hidden="true"></div>
<div class="spot" id="spot" aria-hidden="true"></div>
<div class="rxwrap" id="rxwrap" hidden><i class="rxhalo"></i><i class="rxplat" id="rxplat"></i><canvas id="rxc" role="img" aria-label="Núcleo con bots orbitando"></canvas></div>
<header class="top glass blur">
 <a class="brand" href="#/inicio"><span class="led" id="dot"></span><b id="bn">__NOMBRE__</b></a>
 <span class="svc" id="pst" role="status">Conectando…</span>
 <nav class="menu" aria-label="Secciones">
  <a data-r="inicio" href="#/inicio"><i data-i="home"></i>Inicio</a>
  <a data-r="vincular" href="#/vincular"><i data-i="link"></i>Vincular</a>
  <a data-r="bots" href="#/bots"><i data-i="bot"></i>Bots</a>
  <a data-r="estado" href="#/estado"><i data-i="pulse"></i>Estado</a>
  <a href="__CANAL__" target="_blank" rel="noopener"><i data-i="ext"></i>Canal</a>
 </nav>
 <button class="tone" id="tbtn" type="button" aria-label="Cambiar colores y efectos" aria-expanded="false"><span data-i="palette" style="display:contents"></span></button>
</header>
<div class="themep glass" id="themep" hidden>
 <h4>Colores y efectos</h4>
 <div class="seg2" id="mode"><button type="button" data-m="dark">Oscuro</button><button type="button" data-m="light">Claro</button></div>
 <div class="sw" id="sw"></div>
 <label for="hue">Tono</label>
 <input type="range" min="0" max="360" id="hue">
 <div class="row"><span class="lbl">Efectos</span><div class="seg2" id="fx"><button type="button" data-v="full">Completos</button><button type="button" data-v="lite">Ligeros</button></div></div>
 <button class="btn" type="button" style="width:100%;margin-top:18px" id="treset">Restablecer</button>
</div>
<main class="page" id="page"></main>
<script>
/* ================= Reactor 3D (canvas 2D, proyección propia) ================= */
var Reactor=(function(){
var TAU=Math.PI*2,sin=Math.sin,cos=Math.cos,pow=Math.pow,sqrt=Math.sqrt,floor=Math.floor,abs=Math.abs;
function clamp(v,a,b){return v<a?a:(v>b?b:v)}
function ease(t){t=clamp(t,0,1);return 1-pow(1-t,3)}
function eob(t){t=clamp(t,0,1);return 1+2.4*pow(t-1,3)+1.4*pow(t-1,2)}
function hash(n){var x=sin(n*127.1+311.7)*43758.5453;return x-floor(x)}
function hyp(a,b){return sqrt(a*a+b*b)}
function pc(c,a,dl){return 'hsla('+c[0]+','+c[1]+'%,'+clamp(c[2]+(dl||0),0,100)+'%,'+clamp(a,0,1).toFixed(3)+')'}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}

/* icosaedro subdividido una vez: 42 vértices, 120 aristas */
var ICO=(function(){
 var t=(1+sqrt(5))/2,v=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
 var f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 function nrm(p){var l=sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2]);return [p[0]/l,p[1]/l,p[2]/l]}
 v=v.map(nrm);var cache={};
 function mid(a,b){var k=a<b?a+'_'+b:b+'_'+a;if(cache[k]!=null)return cache[k];v.push(nrm([(v[a][0]+v[b][0])/2,(v[a][1]+v[b][1])/2,(v[a][2]+v[b][2])/2]));return (cache[k]=v.length-1)}
 var f2=[];f.forEach(function(q){var a=mid(q[0],q[1]),b=mid(q[1],q[2]),c=mid(q[2],q[0]);f2.push([q[0],a,c],[q[1],b,a],[q[2],c,b],[a,b,c])});
 var seen={},e=[];
 f2.forEach(function(q){[[q[0],q[1]],[q[1],q[2]],[q[2],q[0]]].forEach(function(p){var k=p[0]<p[1]?p[0]+'_'+p[1]:p[1]+'_'+p[0];if(!seen[k]){seen[k]=1;e.push(p)}})});
 return {v:v,e:e,f:f2};
})();

/* matriz de Euler Rz(c)·Rx(a)·Ry(b) */
function eul(a,b,c,m){
 var ca=cos(a),sa=sin(a),cb=cos(b),sb=sin(b),cc=cos(c),sc=sin(c);
 m[0]=cc*cb-sc*sa*sb;m[1]=-sc*ca;m[2]=cc*sb+sc*sa*cb;
 m[3]=sc*cb+cc*sa*sb;m[4]=cc*ca;m[5]=sc*sb-cc*sa*cb;
 m[6]=-ca*sb;m[7]=sa;m[8]=ca*cb;
}

var RINGS=[
 {r:1.0,w:2.3,c:'acc',a:function(t){return 1.15+0.14*sin(t*0.21)},b:function(t){return t*0.16},z:function(){return 0.35}},
 {r:0.8,w:1.9,c:'acc2',a:function(t){return 0.55+0.1*sin(t*0.17)},b:function(t){return 1.1-t*0.23},z:function(t){return t*0.09}},
 {r:0.6,w:1.6,c:'acc3',a:function(t){return -0.95+0.2*sin(t*0.3)},b:function(t){return t*0.37},z:function(t){return -t*0.12}}
];
var BA=[0.16,0.32,0.62,0.95],BW=[0.8,1,1.35,1.8];
var CFG=[
 {ring:40,orb:0,trail:8,dust:24,glow:0,light:0,plat:0,fac:0,oall:0,fps:20,slow:70},
 {ring:64,orb:36,trail:14,dust:70,glow:0,light:1,plat:1,fac:1,oall:0,fps:30,slow:48},
 {ring:96,orb:64,trail:20,dust:150,glow:1,light:1,plat:1,fac:1,oall:1,fps:60,slow:27}
];
var MAXS=16;

function create(canvas,opt){
 opt=opt||{};
 var cx=canvas.getContext('2d');
 var W=0,DPR=1,S=1,CC=0,U=1,VS=1;
 var Q=opt.quality==null?2:opt.quality,cfg=CFG[Q],dark=true,hue=338,dirty=true,still=false;
 var P={},SP={};
 var t=0,tr=0,age=0,spd=1,spdT=1,mode='idle',modeT=3;
 var yaw=0.55,pitch=0.36,pyaw=0,ppitch=0,vyaw=0,vpitch=0,tx=0,ty=0,gx=0,gy=0;
 var lx=0.5,ly=0.4,lxT=0.5,lyT=0.4,lOn=0,lOnT=0;
 var hover=-1,focus=-1,pin=-1,pinT=0,drag=false;
 var bots=[],sats=[],waves=[],flash=0;
 var raf=0,running=false,lastT=0,ema=16.7,slow=0,frames=0,vis=true,paused=false,minDt=1000/cfg.fps;
 var cyw=1,syw=0,cpw=1,spw=0,FOC=3.4,PX=0,PY=0,PZ=0,platN=0.9,platS=0.35;
 var RP=[new Float32Array(96*3),new Float32Array(96*3),new Float32Array(96*3)];
 var M=new Float32Array(9),CV=new Float32Array(ICO.v.length*3),NV=new Float32Array(ICO.v.length*3),LV=[0.3,0.5,0.8];
 var DUST=(function(n){var d=new Float32Array(n*4);for(var i=0;i<n;i++){var u=hash(i+1)*TAU,v=hash(i+77)*2-1,r=1.2+hash(i+31)*0.85,s=sqrt(1-v*v);d[i*4]=r*s*cos(u);d[i*4+1]=r*v*0.85;d[i*4+2]=r*s*sin(u);d[i*4+3]=0.6+hash(i+9)*1.4}return d})(150);
 var DP=new Float32Array(150*3),TK=new Float32Array(72*5),OP=new Float32Array(MAXS*64*3);

 function pj(x,y,z){
  var x1=x*cyw+z*syw,z1=z*cyw-x*syw,y1=y*cpw-z1*spw,z2=y*spw+z1*cpw,k=FOC/(FOC-z2);
  PX=CC+x1*k*S;PY=CC-y1*k*S;PZ=z2;
 }
 function calcU(){U=DPR*clamp(pow(1/VS,0.72),1,2.6)}

 /* ---------- tema y sprites ---------- */
 function glow(c){
  var n=96,cv=document.createElement('canvas');cv.width=cv.height=n;
  var g=cv.getContext('2d'),r=n/2,gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,dark?pc([c[0],c[1],97],1):pc(c,0.9));gr.addColorStop(0.14,pc(c,dark?0.95:0.7));
  gr.addColorStop(0.42,pc(c,dark?0.28:0.16));gr.addColorStop(1,pc(c,0));
  g.fillStyle=gr;g.fillRect(0,0,n,n);return cv;
 }
 function setTheme(h,d){
  hue=h;dark=!!d;
  P.acc=[h,96,dark?68:50];P.acc2=[(h+288)%360,92,dark?74:52];P.acc3=[(h+38)%360,100,dark?78:52];P.hot=[(h+14)%360,100,dark?94:58];P.ok=[158,100,dark?70:34];P.mut=[h,14,dark?70:40];
  SP.hot=glow(P.hot);SP.ok=glow(P.ok);
  dirty=true;
 }
 function setQuality(q){Q=clamp(q,0,2);cfg=CFG[Q];minDt=1000/cfg.fps;dirty=true;if(opt.onQuality)opt.onQuality(Q)}

 /* ---------- tamaño ---------- */
 function resize(css,cap){
  DPR=Math.min(window.devicePixelRatio||1,cap||2);
  var px=Math.max(64,Math.round(css*DPR));
  if(px!==W){W=px;canvas.width=W;canvas.height=W}
  canvas.style.width=css+'px';canvas.style.height=css+'px';
  S=W*0.33;CC=W/2;calcU();dirty=true;
 }
 function setViewScale(s){var v=clamp(s,0.1,1.6);if(abs(v-VS)>0.004){VS=v;calcU()}}

 /* ---------- satélites ---------- */
 function setBots(list){
  var old={};sats.forEach(function(s){old[s.key]=s});
  bots=(list||[]).slice(0,MAXS);
  var first=sats.length===0&&age<2;
  sats=bots.map(function(b,i){
   var key=b.slug||b.nombre||String(i),o=old[key];
   var h1=hash(i*3.7+(b.nombre||'').length*1.3),h2=hash(i*5.1+2),h3=hash(i*7.9+4);
   var inc=(h2-0.5)*1.5+(i%2?0.3:-0.3),node=i*2.39996;
   var s={key:key,b:b,i:i,r:[0.62,0.86,1.12,1.34][i%4]+(h1-0.5)*0.08,inc:inc,ci:cos(inc),si:sin(inc),node:node,cn:cos(node),sn:sin(node),
    w:(0.24+h3*0.2)*(i%2?1:-1)*(b.online?1:0.35),ph:h1*TAU,on:!!b.online,pr:!!b.principal,size:3.4+Math.min(b.grupos||0,24)*0.14,
    birth:o?o.birth:(still?0:(first?0.75+i*0.13:age+0.1)),rs:1,sp:1,hx:0,hy:0,hz:0,vis:false,tr:new Float32Array(25*3),pk:1+hash(i+5)*4,pt:-1,la:o?o.la:1};
   return s;
  });
  if(hover>=sats.length)hover=-1;if(focus>=sats.length)focus=-1;if(pin>=sats.length)pin=-1;
  dirty=true;
 }
 function satPos(s,th,rs){
  var r=s.r*rs,x=r*cos(th),z=r*sin(th),y1=-z*s.si,z1=z*s.ci;
  pj(x*s.cn+z1*s.sn,y1,z1*s.cn-x*s.sn);
 }
 function prepSats(){
  var L=cfg.trail,step=0.06,i,j,k;
  for(i=0;i<sats.length;i++){
   var s=sats[i],a=age-s.birth;
   s.sp=ease(a/0.8);s.rs=0.35+0.65*eob(a/1.1);
   if(s.sp<=0.001){s.vis=false;continue}
   var th=s.ph+s.w*tr;
   satPos(s,th,s.rs);s.hx=PX;s.hy=PY;s.hz=PZ;s.vis=true;
   var dir=s.w>=0?1:-1;
   for(k=0;k<=L;k++){satPos(s,th-dir*k*step,s.rs);s.tr[k*3]=PX;s.tr[k*3+1]=PY;s.tr[k*3+2]=PZ}
  }
  /* órbitas */
  var n=cfg.orb;
  if(n){for(i=0;i<sats.length;i++){var q=sats[i];if(!q.vis)continue;if(!cfg.oall&&!(i===hover||i===focus||i===pin))continue;for(j=0;j<=n;j++){satPos(q,j/n*TAU,q.rs);var o=(i*64+j)*3;OP[o]=PX;OP[o+1]=PY;OP[o+2]=PZ}}}
 }

 /* ---------- actualización ---------- */
 function pulse(){waves.push({a:t,k:1})}
 function setMode(m){
  mode=m;modeT=0.05;
  spdT=m==='wait'?2.6:(m==='code'||m==='qr')?1.7:m==='ok'?1.5:1;
  if(m==='ok')burst();
  dirty=true;
 }
 function burst(){flash=1;waves.push({a:t,k:2},{a:t+0.16,k:2},{a:t+0.34,k:2})}
 function update(dt){
  t+=dt;age+=dt;
  var kk=Math.min(1,dt*4);
  spd+=(spdT-spd)*Math.min(1,dt*2.5);tr+=dt*spd;
  pyaw+=(tx*0.55+gx*0.5-pyaw)*kk;ppitch+=(-ty*0.2+gy*0.3-ppitch)*kk;
  if(!drag){yaw+=vyaw*dt;pitch+=vpitch*dt;vyaw*=pow(0.06,dt);vpitch*=pow(0.06,dt);yaw+=dt*0.1*spd}
  pitch=clamp(pitch,-0.15,1.05);
  lx+=(lxT-lx)*kk;ly+=(lyT-ly)*kk;lOn+=(lOnT-lOn)*Math.min(1,dt*3);
  flash*=pow(0.03,dt);
  modeT-=dt;
  if(modeT<=0){if(mode==='wait'){pulse();modeT=1.05}else if(mode==='code'||mode==='qr'){pulse();modeT=2.4}else if(mode==='idle'){pulse();modeT=6}else modeT=6}
  for(var i=waves.length-1;i>=0;i--)if(t-waves[i].a>2.2)waves.splice(i,1);
  if(pin>=0){pinT-=dt;if(pinT<=0)pin=-1}
  for(i=0;i<sats.length;i++){var s=sats[i];
   if(s.on&&s.vis){s.pk-=dt;if(s.pk<=0&&s.pt<0){s.pt=0;s.pk=2.2+hash(i+t)*4}}
   if(s.pt>=0){s.pt+=dt/0.9;if(s.pt>=1)s.pt=-1}
  }
 }

 /* ---------- dibujo ---------- */
 function prepRing(i,rm){
  var R=RINGS[i],n=cfg.ring,r=R.r*rm,out=RP[i];
  eul(R.a(tr),R.b(tr),R.z(tr),M);
  for(var j=0;j<n;j++){var a=j/n*TAU,x=r*cos(a),y=r*sin(a);
   pj(M[0]*x+M[1]*y,M[3]*x+M[4]*y,M[6]*x+M[7]*y);
   out[j*3]=PX;out[j*3+1]=PY;out[j*3+2]=PZ/r;
  }
 }
 function ringBands(c,i,b0,b1,am){
  var out=RP[i],n=cfg.ring,R=RINGS[i],col=P[R.c];
  for(var b=b0;b<b1;b++){
   c.beginPath();var any=false,open=false;
   for(var j=0;j<n;j++){
    var j2=j+1===n?0:j+1,z=(out[j*3+2]+out[j2*3+2])*0.5,bb=z<-0.5?0:z<0?1:z<0.5?2:3;
    if(bb!==b){open=false;continue}
    if(!open){c.moveTo(out[j*3],out[j*3+1]);open=true}
    c.lineTo(out[j2*3],out[j2*3+1]);any=true;
   }
   if(!any)continue;
   c.strokeStyle=pc(col,BA[b]*am*(dark?1:1.3));c.lineWidth=BW[b]*R.w*U*(dark?0.9:1.05);c.stroke();
   if(cfg.glow&&b>=2){c.strokeStyle=pc(col,BA[b]*am*0.16);c.lineWidth=BW[b]*R.w*U*4.4;c.stroke()}
  }
 }
 function prepTicks(rm){
  eul(1.22,-tr*0.06,0.1,M);
  for(var k=0;k<72;k++){
   var a=k/72*TAU,ca=cos(a),sa=sin(a),r0=1.17*rm,r1=(k%6===0?1.28:1.23)*rm,o=k*5;
   var x=r0*ca,y=r0*sa;pj(M[0]*x+M[1]*y,M[3]*x+M[4]*y,M[6]*x+M[7]*y);TK[o]=PX;TK[o+1]=PY;var z0=PZ;
   x=r1*ca;y=r1*sa;pj(M[0]*x+M[1]*y,M[3]*x+M[4]*y,M[6]*x+M[7]*y);TK[o+2]=PX;TK[o+3]=PY;TK[o+4]=(z0+PZ)*0.5;
  }
 }
 function ticks(c,front,am){
  c.beginPath();
  for(var k=0;k<72;k++){var o=k*5,f=TK[o+4]>=0;if(f!==front)continue;c.moveTo(TK[o],TK[o+1]);c.lineTo(TK[o+2],TK[o+3])}
  c.strokeStyle=pc(P.acc,(front?0.55:0.2)*am);c.lineWidth=U*(front?1.1:0.8);c.stroke();
 }
 function scanner(c,am,idx,spd,col,ln){
  var n=cfg.ring,out=RP[idx],len=Math.max(6,floor((n>>3)*ln)),j0=((floor(tr*(n/6)*spd)%n)+n)%n;
  c.beginPath();var open=false;
  for(var d=0;d<len;d++){var j=(j0+d)%n,j2=(j+1)%n;if(out[j*3+2]<-0.15){open=false;continue}
   if(!open){c.moveTo(out[j*3],out[j*3+1]);open=true}c.lineTo(out[j2*3],out[j2*3+1])}
  c.strokeStyle=pc(col,0.9*am);c.lineWidth=U*2.8;c.lineCap='round';c.stroke();
  if(cfg.glow){c.strokeStyle=pc(col,0.25*am);c.lineWidth=U*9;c.stroke()}
 }
 function platform(c,am){
  var y=-1.34,i,j,a;
  var R=[0.9,1.35,1.82],A=[0.2,0.12,0.07];
  for(i=0;i<3;i++){c.beginPath();for(j=0;j<=56;j++){a=j/56*TAU;pj(R[i]*cos(a),y,R[i]*sin(a));if(j)c.lineTo(PX,PY);else c.moveTo(PX,PY)}c.strokeStyle=pc(P.acc,A[i]*am);c.lineWidth=U;c.stroke()}
  /* marcas y barrido */
  c.beginPath();for(j=0;j<24;j++){a=j/24*TAU+tr*0.05;pj(1.35*cos(a),y,1.35*sin(a));c.moveTo(PX,PY);pj(1.45*cos(a),y,1.45*sin(a));c.lineTo(PX,PY)}
  c.strokeStyle=pc(P.acc,0.3*am);c.lineWidth=U;c.stroke();
  a=tr*0.9;
  for(var q=0;q<3;q++){var wd=[0.75,0.42,0.16][q];c.beginPath();pj(0,y,0);c.moveTo(PX,PY);for(j=0;j<=8;j++){var aa=a-wd*j/8;pj(1.82*cos(aa),y,1.82*sin(aa));c.lineTo(PX,PY)}c.closePath();c.fillStyle=pc(P.acc,0.045*am);c.fill()}
  c.beginPath();pj(0,y,0);c.moveTo(PX,PY);pj(1.82*cos(a),y,1.82*sin(a));c.lineTo(PX,PY);c.strokeStyle=pc(P.acc,0.22*am);c.lineWidth=U*1.2;c.stroke();
 }
 function dust(c,front,am){
  var n=cfg.dust,rot=tr*0.03,cr=cos(rot),sr=sin(rot),i;
  c.fillStyle=pc(P.hot,1);
  for(i=0;i<n;i++){
   var x=DUST[i*4],y=DUST[i*4+1],z=DUST[i*4+2];
   pj(x*cr+z*sr,y,z*cr-x*sr);
   if((PZ>=0)!==front)continue;
   var d=hyp(PX-CC,PY-CC)/CC,af=clamp((1-d)*3.2,0,1);if(af<=0)continue;
   var za=clamp((PZ+1.9)/3.8,0,1),sz=DUST[i*4+3]*U*(0.7+0.6*za);
   c.globalAlpha=(0.12+0.6*za)*am*af;c.fillRect(PX-sz/2,PY-sz/2,sz,sz);
  }
  c.globalAlpha=1;
 }
 function lightVec(){
  /* luz en espacio de vista: sigue al puntero; sin puntero deriva sola */
  var dx=0.5*cos(tr*0.4),dy=0.55+0.1*sin(tr*0.3),dz=0.75;
  var px=(lx-0.5)*2.4,py=-(ly-0.5)*2.4,pz=0.9,k=lOn;
  var x=dx+(px-dx)*k,y=dy+(py-dy)*k,z=dz+(pz-dz)*k,l=sqrt(x*x+y*y+z*z)||1;
  LV[0]=x/l;LV[1]=y/l;LV[2]=z/l;
 }
 function facets(c,am){
  var F=ICO.f,n=F.length,i,a,b,d,nx,ny,nz,x1,y1,z1,z2,l,dif,rim,al,L0=LV[0],L1=LV[1],L2=LV[2];
  for(i=0;i<n;i++){
   a=F[i][0];b=F[i][1];d=F[i][2];
   if(CV[a*3+2]+CV[b*3+2]+CV[d*3+2]<0)continue;
   nx=NV[a*3]+NV[b*3]+NV[d*3];ny=NV[a*3+1]+NV[b*3+1]+NV[d*3+1];nz=NV[a*3+2]+NV[b*3+2]+NV[d*3+2];
   x1=nx*cyw+nz*syw;z1=nz*cyw-nx*syw;y1=ny*cpw-z1*spw;z2=ny*spw+z1*cpw;
   l=sqrt(x1*x1+y1*y1+z2*z2)||1;x1/=l;y1/=l;z2/=l;
   dif=x1*L0+y1*L1+z2*L2;if(dif<0)dif=0;
   rim=1-(z2>0?z2:0);rim*=rim;
   al=(0.035+0.34*dif*dif+0.16*rim)*am;
   c.beginPath();c.moveTo(CV[a*3],CV[a*3+1]);c.lineTo(CV[b*3],CV[b*3+1]);c.lineTo(CV[d*3],CV[d*3+1]);c.closePath();
   c.fillStyle=pc(i%3===0?P.acc2:P.acc,al);c.fill();
   if(dif>0.72){c.fillStyle=pc(P.hot,(dif-0.72)*1.5*am);c.fill()}
  }
 }
 function core(c,am,front){
  var br=1+0.05*sin(tr*2.2)+flash*0.3,i,e;
  if(!front){
   /* vértices: se rotan una vez por cuadro y se guardan también sin proyectar (para las normales) */
   var ry=tr*0.33,rx=tr*0.21,cy=cos(ry),sy=sin(ry),cxx=cos(rx),sx=sin(rx),r0=0.27*br*Math.min(1,0.4+age*0.9);
   for(i=0;i<ICO.v.length;i++){var v=ICO.v[i],x=v[0]*cy+v[2]*sy,z=v[2]*cy-v[0]*sy,y=v[1]*cxx-z*sx,z2=v[1]*sx+z*cxx;
    NV[i*3]=x;NV[i*3+1]=y;NV[i*3+2]=z2;
    pj(x*r0,y*r0,z2*r0);CV[i*3]=PX;CV[i*3+1]=PY;CV[i*3+2]=PZ}
  }
  c.beginPath();
  for(e=0;e<ICO.e.length;e++){var a=ICO.e[e][0],b=ICO.e[e][1],f=(CV[a*3+2]+CV[b*3+2])>=0;if(f!==front)continue;c.moveTo(CV[a*3],CV[a*3+1]);c.lineTo(CV[b*3],CV[b*3+1])}
  c.strokeStyle=pc(P.hot,(front?0.85:0.3)*am);c.lineWidth=U*(front?1.2:0.8);c.stroke();
  if(!front){
   lightVec();if(cfg.fac)facets(c,am);
   var ns=S*1.12*(0.95+0.1*sin(tr*2.6))*(1+flash*0.9);c.globalAlpha=(dark?0.9:0.42)*am;c.drawImage(SP.hot,CC-ns/2,CC-ns/2,ns,ns);c.globalAlpha=1;
  }
 }
 function satDraw(c,s,front,am){
  if(!s.vis||(s.hz>=0)!==front)return;
  var L=cfg.trail,hv=(s.i===hover||s.i===focus||s.i===pin),al=s.sp*am,col=s.on?P.ok:P.mut,k,ch;
  if(s.on){
   var chunks=Q>=1?3:1,per=L/chunks;
   for(ch=0;ch<chunks;ch++){
    c.beginPath();var k0=floor(ch*per),k1=floor((ch+1)*per);
    c.moveTo(s.tr[k0*3],s.tr[k0*3+1]);for(k=k0+1;k<=k1;k++)c.lineTo(s.tr[k*3],s.tr[k*3+1]);
    c.strokeStyle=pc(col,(0.55-ch*0.19)*al*(hv?1.3:1));c.lineWidth=U*(1.9-ch*0.45)*(hv?1.4:1);c.lineCap='round';c.stroke();
   }
  }
  var rad=s.size*U*(hv?1.4:1)*(0.85+0.15*s.sp);
  if(s.on){
   var g=rad*6.5;c.globalAlpha=al*(hv?1:0.85);c.drawImage(SP.ok,s.hx-g/2,s.hy-g/2,g,g);c.globalAlpha=1;
   c.beginPath();c.arc(s.hx,s.hy,rad*0.5,0,TAU);c.fillStyle=pc([col[0],40,dark?97:92],al);c.fill();
  }else{
   c.beginPath();c.arc(s.hx,s.hy,rad*0.6,0,TAU);c.strokeStyle=pc(col,0.5*al);c.lineWidth=U*1.3;c.stroke();
  }
  if(s.pr||hv){c.beginPath();c.arc(s.hx,s.hy,rad*(hv?1.5:1.3),0,TAU);c.strokeStyle=pc(P.acc3,(hv?0.9:0.55)*al);c.lineWidth=U*1.2;c.stroke()}
 }
 function orbits(c,front,am){
  var n=cfg.orb;if(!n)return;
  c.beginPath();var hl=-1;
  for(var i=0;i<sats.length;i++){var s=sats[i];if(!s.vis)continue;
   if(s.i===hover||s.i===focus||s.i===pin){hl=i;continue}
   if(!cfg.oall)continue;
   var open=false;
   for(var j=0;j<n;j++){var o=(i*64+j)*3,o2=o+3,f=(OP[o+2]+OP[o2+2])>=0;if(f!==front){open=false;continue}
    if(!open){c.moveTo(OP[o],OP[o+1]);open=true}c.lineTo(OP[o2],OP[o2+1])}
  }
  c.strokeStyle=pc(P.acc,0.09*am);c.lineWidth=U;c.stroke();
  if(hl>=0){c.beginPath();var op=false;for(var q=0;q<n;q++){var u=(hl*64+q)*3,u2=u+3,ff=(OP[u+2]+OP[u2+2])>=0;if(ff!==front){op=false;continue}if(!op){c.moveTo(OP[u],OP[u+1]);op=true}c.lineTo(OP[u2],OP[u2+1])}c.strokeStyle=pc(P.acc3,0.5*am);c.lineWidth=U*1.4;c.stroke()}
 }
 function links(c,am){
  c.beginPath();var i,s;
  for(i=0;i<sats.length;i++){s=sats[i];if(!s.vis||!s.on||s.i===hover||s.i===focus||s.i===pin)continue;c.moveTo(CC,CC);c.lineTo(s.hx,s.hy)}
  c.strokeStyle=pc(P.acc,0.07*am*1);c.lineWidth=U;c.stroke();
  for(i=0;i<sats.length;i++){s=sats[i];if(!s.vis||!s.on)continue;
   if(s.i===hover||s.i===focus||s.i===pin){c.beginPath();c.moveTo(CC,CC);c.lineTo(s.hx,s.hy);c.strokeStyle=pc(P.acc3,0.55*am);c.lineWidth=U*1.3;c.stroke()}
   if(s.pt>=0){var p=ease(s.pt),px=CC+(s.hx-CC)*p,py=CC+(s.hy-CC)*p,g=U*14;c.globalAlpha=am*(1-Math.abs(s.pt-0.5)*0.8);c.drawImage(SP.hot,px-g/2,py-g/2,g,g);c.globalAlpha=1}
  }
 }
 function waveDraw(c,am){
  for(var i=0;i<waves.length;i++){var w=waves[i],a=t-w.a;if(a<0)continue;
   var p=a/(w.k===2?1.7:2.1),r=0.2+p*(w.k===2?2.1:1.6),al=(1-p)*(w.k===2?0.7:0.32)*am;if(al<=0.01)continue;
   c.beginPath();for(var j=0;j<=64;j++){var th=j/64*TAU;pj(r*cos(th),-0.04,r*sin(th));if(j)c.lineTo(PX,PY);else c.moveTo(PX,PY)}
   c.strokeStyle=pc(w.k===2?P.ok:P.acc3,al);c.lineWidth=U*(w.k===2?2.4:1.6)*(1-p*0.5);c.stroke();
  }
 }
 function labels(c,am){
  var fs=clamp(12.5/VS,12,34)*DPR,showAll=sats.length<=4&&VS>0.42,i,s;
  for(i=0;i<sats.length;i++){
   s=sats[i];if(!s.vis||s.sp<0.9)continue;
   var hv=(s.i===hover||s.i===focus||s.i===pin);
   if(!hv&&!(showAll&&s.on&&s.hz>-0.15))continue;
   var name=String(s.b.nombre||'Bot'),sub=opt.sub?opt.sub(s.b):'';
   c.textBaseline='middle';
   if(hv){
    c.font='600 '+fs+'px "Instrument Sans",system-ui,sans-serif';var w1=c.measureText(name).width;
    c.font='500 '+(fs*0.84)+'px "JetBrains Mono",ui-monospace,monospace';var w2=sub?c.measureText(sub).width:0;
    var pw=Math.max(w1,w2)+fs*1.5,ph=fs*(sub?2.9:1.9),bx=s.hx+fs*1.1,by=s.hy-ph-fs*0.4;
    if(bx+pw>W*0.93)bx=s.hx-pw-fs*1.1;if(by<W*0.06)by=s.hy+fs*0.8;var m0=W*0.07;bx=clamp(bx,m0,Math.max(m0,W-m0-pw));
    rr(c,bx,by,pw,ph,fs*0.7);c.fillStyle=dark?'rgba(12,7,18,0.82)':'rgba(255,255,255,0.9)';c.fill();
    c.strokeStyle=dark?'rgba(255,255,255,0.2)':'rgba(30,20,40,0.16)';c.lineWidth=DPR;c.stroke();
    c.fillStyle=dark?'#fff':'#1c1226';c.font='600 '+fs+'px "Instrument Sans",system-ui,sans-serif';c.fillText(name,bx+fs*0.75,by+ph*(sub?0.33:0.5));
    if(sub){c.fillStyle=dark?'rgba(255,255,255,0.68)':'rgba(30,20,40,0.65)';c.font='500 '+(fs*0.84)+'px "JetBrains Mono",ui-monospace,monospace';c.fillText(sub,bx+fs*0.75,by+ph*0.7)}
   }else{
    var av=opt.avoid?opt.avoid(s.hx/DPR,s.hy/DPR):1;s.la+=(av-s.la)*0.2;
    if(s.la>0.04){
     c.font='600 '+(fs*0.92)+'px "Instrument Sans",system-ui,sans-serif';
     var a=clamp((s.hz+0.15)*1.2,0.35,1)*am*0.9*s.la;
     c.lineWidth=fs*0.28;c.lineJoin='round';c.strokeStyle=dark?'rgba(8,4,14,'+(0.7*a).toFixed(2)+')':'rgba(255,255,255,'+(0.8*a).toFixed(2)+')';
     var tw=c.measureText(name).width,tx0=s.hx+fs*0.9;if(tx0+tw>W-6)tx0=s.hx-fs*0.9-tw;if(tx0<6)tx0=6;
     c.strokeText(name,tx0,s.hy-fs*0.9);c.fillStyle=dark?'rgba(255,255,255,'+a.toFixed(2)+')':'rgba(28,18,38,'+a.toFixed(2)+')';c.fillText(name,tx0,s.hy-fs*0.9);
    }
   }
  }
 }
 function lightPass(c){
  if(!cfg.light||!dark||lOn<0.03)return;
  var px=lx*W,py=ly*W,r=W*0.26,g=c.createRadialGradient(px,py,0,px,py,r);
  g.addColorStop(0,'hsla('+hue+',100%,92%,'+(0.42*lOn).toFixed(3)+')');g.addColorStop(1,'hsla('+hue+',100%,92%,0)');
  c.globalCompositeOperation='source-atop';c.fillStyle=g;c.fillRect(px-r,py-r,r*2,r*2);c.globalCompositeOperation='source-over';
 }
 function draw(){
  if(!W)return;
  var c=cx,i;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,W,W);c.lineCap='round';c.lineJoin='round';
  cyw=cos(yaw+pyaw);syw=sin(yaw+pyaw);cpw=cos(pitch+ppitch);spw=sin(pitch+ppitch);
  var am=ease(age/0.8),rm=0.45+0.55*eob(age/1.5);
  pj(0,-1.34,0);platN=PY/W;platS=Math.max(0.14,abs(spw));
  prepSats();for(i=0;i<3;i++)prepRing(i,rm);prepTicks(rm);
  c.globalCompositeOperation=dark?'lighter':'source-over';
  if(cfg.plat)platform(c,am);
  dust(c,false,am);
  for(i=0;i<3;i++)ringBands(c,i,0,2,am);
  ticks(c,false,am);
  orbits(c,false,am);
  links(c,am);
  for(i=0;i<sats.length;i++)satDraw(c,sats[i],false,am);
  core(c,am,false);
  core(c,am,true);
  for(i=0;i<3;i++)ringBands(c,i,2,4,am);
  scanner(c,am,0,1,P.hot,1);if(cfg.glow){scanner(c,am,1,-0.7,P.acc2,0.7);scanner(c,am,2,1.3,P.acc3,0.55)}
  ticks(c,true,am);
  orbits(c,true,am);
  for(i=0;i<sats.length;i++)satDraw(c,sats[i],true,am);
  waveDraw(c,am);
  dust(c,true,am);
  c.globalCompositeOperation='source-over';
  lightPass(c);
  labels(c,am);
 }

 /* ---------- bucle ---------- */
 function loop(ts){
  raf=requestAnimationFrame(loop);
  var dtm=ts-lastT;if(dtm<minDt-2)return;
  lastT=ts;var dt=Math.min(0.05,dtm/1000);
  if(opt.tick)opt.tick(dt);
  if(!vis){paused=true;return}
  if(still&&!dirty)return;
  if(!still)update(dt);
  draw();dirty=false;
  if(paused){paused=false;return}
  if(!still&&++frames>40){ema+=(dtm-ema)*0.08;if(ema>cfg.slow){if(++slow>45){if(Q>0)setQuality(Q-1);else if(!still){setStill(true);if(opt.onQuality)opt.onQuality(-1)}slow=0;ema=16.7}}else slow=Math.max(0,slow-2)}
 }
 function start(){if(running)return;running=true;lastT=performance.now();raf=requestAnimationFrame(loop)}
 function stop(){running=false;cancelAnimationFrame(raf)}
 function setStill(v){still=!!v;if(still){age=3;tr=2.5;t=2.5;spdT=spd=1}dirty=true}
 function setVisible(v){vis=!!v}

 /* ---------- entradas ---------- */
 function pointer(nx,ny,on){tx=clamp(nx,-1.3,1.3);ty=clamp(ny,-1.3,1.3);lxT=0.5+nx*0.5;lyT=0.5+ny*0.5;lOnT=on?1:0;idleT=0;if(still)dirty=true}
 var idleT=0;
 function pick(nx,ny,rad){
  var px=CC+nx*CC,py=CC+ny*CC,best=-1,bd=1e9,r=rad*DPR/VS;
  for(var i=0;i<sats.length;i++){var s=sats[i];if(!s.vis||s.sp<0.9)continue;var d=hyp(s.hx-px,s.hy-py);if(d<r&&d<bd){bd=d;best=i}}
  return best;
 }
 function setHover(i){if(i!==hover){hover=i;dirty=true}}
 function setFocus(i){if(i!==focus){focus=i;dirty=true}}
 function setPin(i){pin=i;pinT=4.5;dirty=true}
 function dragBy(dx,dy){drag=true;yaw+=dx*0.0085;pitch+=dy*0.0065;vyaw=vyaw*0.5+dx*0.0085*30;vpitch=vpitch*0.5+dy*0.0065*30;dirty=true}
 function dragEnd(){drag=false}
 function tilt(a,b){gx=clamp(a,-1,1);gy=clamp(b,-1,1);if(still)dirty=true}
 function restart(){age=0;setBots(bots);dirty=true}

 setTheme(hue,dark);
 return {start:start,stop:stop,resize:resize,setViewScale:setViewScale,setTheme:setTheme,setQuality:setQuality,setBots:setBots,setMode:setMode,burst:burst,pulse:pulse,
  pointer:pointer,pick:pick,setHover:setHover,setFocus:setFocus,pin:setPin,drag:dragBy,dragEnd:dragEnd,tilt:tilt,setVisible:setVisible,still:setStill,restart:restart,
  get quality(){return still&&Q===0?-1:Q},get plat(){return [platN,platS]},get count(){return sats.length},canvas:canvas,_draw:function(){dirty=true}};
}
return {create:create};
})();

</script>
<script>
(function(){
'use strict';
var NOMBRE=document.getElementById('bn').textContent, CANAL='__CANAL__';
var $=function(s,r){return (r||document).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clamp(v,a,b){return v<a?a:(v>b?b:v)}
var P={
 ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
 palette:'<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.2-1-1.4-1-2.5 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4A8.5 8.5 0 0 0 12 3z"/><path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01"/>',
 copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 up:'<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
 shield:'<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>',
 home:'<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
 link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 bot:'<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M9 13h.01M15 13h.01M9 16h6M3 12v3M21 12v3"/>',
 pulse:'<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
 keys:'<path d="M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01" stroke-width="3"/>',
 qr:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v6h-4M14 18v2"/>',
 prev:'<path d="m15 5-7 7 7 7"/>',
 next:'<path d="m9 5 7 7-7 7"/>'
};
function ic(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||'')+'</svg>'}
$$('[data-i]').forEach(function(e){e.innerHTML=ic(e.getAttribute('data-i'))});

/* ---------- almacenamiento (puede fallar en modo privado) ---------- */
function ls(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
function toast(t){var d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=t;document.body.appendChild(d);setTimeout(function(){d.style.opacity='0';d.style.transition='opacity .4s';setTimeout(function(){d.remove()},400)},2600)}

/* ---------- datos compartidos ---------- */
var BOTS=[],BOTS_OK=false,S=null,Sat=0,lat=[],timers=[],onbots=null;
function tokens(){var t=ls('tokens');return Array.isArray(t)?t:[]}
function api(path,opt){
 opt=opt||{};var h=opt.headers||{};var t=tokens();if(t.length)h['x-owner-tokens']=t.join(',');
 return fetch(path,{method:opt.method||'GET',headers:h,body:opt.body}).then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.error||('Error '+r.status));return j})})
}
function grupos(n){return n==null?'— grupos':n+(n===1?' grupo':' grupos')}
function dur(ms){var s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
 if(d)return d+'d '+h+'h';if(h)return h+'h '+m+'m';if(m)return m+'m '+(s%60)+'s';return s+'s'}

/* ---------- colores y efectos ---------- */
var DEF_H=338;
var PRE=[['Rosé',338],['Violeta',268],['Azul',222],['Cian',190],['Verde',152],['Naranja',22]];
var REDUCED=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
var HOVER=!!(window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches);
var DEBIL=(navigator.deviceMemory&&navigator.deviceMemory<=2)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4);
var tema=ls('tema3')||{};
if(tema.h==null)tema.h=DEF_H;
if(!tema.m)tema.m=(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';
function fxActual(){return tema.fx||(DEBIL?'lite':'full')}

/* ---------- reactor: un solo lienzo que vuela entre los huecos de cada sección ---------- */
var RXM=(function(){
 var wrap=$('#rxwrap'),cv=$('#rxc'),spot=$('#spot'),rx=null,slots=[],act=null,base=0,X=0,Y=0,Sc=1,snap=true,pageVis=true,slotVis=true,running=false,av=null,copyEl=null,scr=false,scrT=0,platEl=$('#rxplat');
 var ptr={down:false,lx:0,ly:0,moved:0},sp={x:-999,y:-999,raf:0,on:false};
 var INTER='a,button,input,select,textarea,label,summary,.top,.menu,.themep,.car,.carnav';
 function cap(){if(rx&&rx.quality<=0)return 1;return fxActual()==='lite'?1.25:1.75}
 function sub(b){var a=[];if(b.grupos!=null)a.push(grupos(b.grupos));if(b.online&&b.desde)a.push(dur(Date.now()-b.desde));return a.join(' · ')}
 function init(){
  rx=Reactor.create(cv,{quality:fxActual()==='lite'?1:2,tick:tick,sub:sub,avoid:avoid,onQuality:function(){if(base)rx.resize(base,cap())}});
  rx.setTheme(tema.h,tema.m==='dark');
  if(REDUCED)rx.still(true);
  rx.setBots(BOTS);
 }
 function apply(){if(rx)rx.setVisible(pageVis&&slotVis&&!scr)}
 function avoid(x,y){if(!av)return 1;var vx=X+x*Sc,vy=Y+y*Sc;return(vx>av.l&&vx<av.r&&vy>av.t&&vy<av.b)?0:1}
 function tick(dt){
  if(!slots.length)return;
  var vh=window.innerHeight,i,r,best=null,bel=null,bd=1e9;
  for(i=0;i<slots.length;i++){r=slots[i].getBoundingClientRect();if(r.width<8)continue;var d=Math.abs(r.top+r.height/2-vh*0.5);if(d<bd){bd=d;best=r;bel=slots[i]}}
  if(!best)return;
  act=best;
  if(copyEl&&bel&&bel.getAttribute('data-slot')==='hero'){var cr=copyEl.getBoundingClientRect();av={l:cr.left-12,r:cr.right+12,t:cr.top-12,b:cr.bottom+12}}else av=null;
  var sc=best.width/base,tx=best.left+best.width/2-base*sc/2,ty=best.top+best.height/2-base*sc/2,k=(snap||REDUCED)?1:1-Math.pow(0.03,dt||0.016);
  snap=false;X+=(tx-X)*k;Y+=(ty-Y)*k;Sc+=(sc-Sc)*k;
  wrap.style.transform='translate3d('+X.toFixed(1)+'px,'+Y.toFixed(1)+'px,0) scale('+Sc.toFixed(4)+')';
  rx.setViewScale(Sc);
  var pl=rx.plat;platEl.style.transform='translateY('+((pl[0]-0.905)*base).toFixed(1)+'px) scaleY('+(pl[1]/0.35).toFixed(3)+')';
  var sz=base*Sc,v=X+sz>-40&&X<window.innerWidth+40&&Y+sz>-40&&Y<vh+40;
  if(v!==slotVis){slotVis=v;apply()}
 }
 function refresh(){
  slots=$$('[data-slot]').filter(function(e){return e.getBoundingClientRect().width>=8});copyEl=$('.hero .copy');av=null;
  if(!slots.length){wrap.hidden=true;if(rx&&running){rx.stop();running=false}return}
  if(!rx)init();
  var mx=0;slots.forEach(function(e){mx=Math.max(mx,e.getBoundingClientRect().width)});
  var size=clamp(Math.round(mx),200,960);
  if(size!==base){base=size;rx.resize(base,cap());wrap.style.width=base+'px';wrap.style.height=base+'px'}
  wrap.hidden=false;snap=true;slotVis=true;apply();
  tick(0.016);
  if(!running){rx.start();running=true}
  rx.setBots(BOTS);label();
 }
 function label(){var n=BOTS.filter(function(b){return b.online}).length;cv.setAttribute('aria-label',n===1?'Núcleo con 1 bot en línea orbitando':'Núcleo con '+n+' bots en línea orbitando')}
 function bots(){if(!rx)return;rx.setBots(BOTS);label()}
 function toN(x,y){var half=base*Sc/2;return [(x-(X+half))/half,(y-(Y+half))/half]}
 function inActive(x,y){if(!act)return false;var m=act.width/2,dx=x-(act.left+m),dy=y-(act.top+act.height/2);return dx*dx+dy*dy<m*m*1.1}
 function isUI(e){
  var t=e.target;if(!t||!t.closest)return false;
  if(t.closest(INTER))return true;
  var g=t.closest('.glass');
  if(g){if(!g.querySelector('[data-slot]'))return true;return !inActive(e.clientX,e.clientY)}
  return false;
 }
 function spotMove(e){
  if(!HOVER||fxActual()==='lite'||e.pointerType==='touch')return;
  sp.x=e.clientX;sp.y=e.clientY;if(!sp.on){sp.on=true;spot.classList.add('on')}
  if(!sp.raf)sp.raf=requestAnimationFrame(function(){sp.raf=0;spot.style.transform='translate3d('+sp.x+'px,'+sp.y+'px,0)'});
 }
 function onMove(e){
  if(!rx||wrap.hidden)return;
  spotMove(e);
  var n=toN(e.clientX,e.clientY),ui=isUI(e),inside=Math.abs(n[0])<1&&Math.abs(n[1])<1;
  rx.pointer(n[0],n[1],inside&&!ui);
  if(ptr.down){var dx=e.clientX-ptr.lx,dy=e.clientY-ptr.ly;ptr.lx=e.clientX;ptr.ly=e.clientY;ptr.moved+=Math.abs(dx)+Math.abs(dy);rx.drag(dx,dy);return}
  if(e.pointerType==='mouse'||e.pointerType==='pen'){var i=(inside&&!ui)?rx.pick(n[0],n[1],20):-1;rx.setHover(i);document.documentElement.style.cursor=i>=0?'pointer':''}
 }
 function onDown(e){
  if(!rx||wrap.hidden||e.button>0||e.pointerType==='touch')return;
  var n=toN(e.clientX,e.clientY);if(Math.abs(n[0])>=1||Math.abs(n[1])>=1||isUI(e))return;
  ptr.down=true;ptr.lx=e.clientX;ptr.ly=e.clientY;ptr.moved=0;document.body.classList.add('dragging');e.preventDefault();
 }
 function onUp(){if(ptr.down){ptr.down=false;rx.dragEnd();document.body.classList.remove('dragging')}}
 function onClick(e){
  if(!rx||wrap.hidden)return;
  var mv=ptr.moved;ptr.moved=0;if(mv>6||isUI(e))return;
  var n=toN(e.clientX,e.clientY);if(Math.abs(n[0])>=1||Math.abs(n[1])>=1)return;
  var i=rx.pick(n[0],n[1],e.pointerType==='touch'?30:24);if(i>=0)rx.pin(i);else if(inActive(e.clientX,e.clientY))rx.pulse();
 }
 document.addEventListener('pointermove',onMove,{passive:true});
 document.addEventListener('pointerdown',onDown);
 document.addEventListener('pointerup',onUp);
 document.addEventListener('pointercancel',onUp);
 document.addEventListener('click',onClick);
 document.documentElement.addEventListener('mouseleave',function(){spot.classList.remove('on');sp.on=false;if(rx)rx.pointer(0,0,false)});
 document.addEventListener('visibilitychange',function(){pageVis=!document.hidden;apply()});
 window.addEventListener('scroll',function(){if(fxActual()!=='lite'||!rx)return;scr=true;apply();clearTimeout(scrT);scrT=setTimeout(function(){scr=false;apply()},140)},{passive:true});
 window.addEventListener('resize',function(){if(slots.length)refresh()});
 window.addEventListener('deviceorientation',function(e){if(!rx||e.gamma==null||e.beta==null)return;rx.tilt(clamp(e.gamma/28,-1,1),clamp((e.beta-55)/28,-1,1))});
 return {
  refresh:refresh,bots:bots,
  theme:function(){if(rx)rx.setTheme(tema.h,tema.m==='dark')},
  fx:function(){if(!rx)return;rx.still(REDUCED);rx.setQuality(fxActual()==='lite'?1:2);if(base)rx.resize(base,cap())},
  mode:function(m){if(rx)rx.setMode(m);if(m==='ok'){wrap.classList.add('flash');setTimeout(function(){wrap.classList.remove('flash')},650)}},
  reset:function(){if(rx){rx.setFocus(-1);rx.setHover(-1)}},
  focus:function(i){if(rx)rx.setFocus(i)},
  pin:function(i){if(rx)rx.pin(i)}
 };
})();

/* ---------- vidrio: brillo que sigue al puntero e inclinación ---------- */
(function(){
 var GL={el:null,raf:0,ev:null};
 function out(el){el.classList.remove('lit');if(el.hasAttribute('data-tilt')){el.classList.add('back');setTimeout(function(){el.classList.remove('back')},340)}el.style.removeProperty('--rx');el.style.removeProperty('--ry')}
 document.addEventListener('pointermove',function(e){
  if(e.pointerType==='touch')return;
  var g=e.target.closest?e.target.closest('.glass'):null;
  if(g!==GL.el){if(GL.el)out(GL.el);GL.el=g;if(g)g.classList.add('lit')}
  if(!g)return;
  GL.ev=e;
  if(!GL.raf)GL.raf=requestAnimationFrame(function(){
   GL.raf=0;var el=GL.el,ev=GL.ev;if(!el||!ev)return;
   var r=el.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top;
   el.style.setProperty('--mx',x.toFixed(0)+'px');el.style.setProperty('--my',y.toFixed(0)+'px');
   if(el.hasAttribute('data-tilt')&&fxActual()!=='lite'&&!REDUCED){el.style.setProperty('--ry',((x/r.width-0.5)*9).toFixed(2)+'deg');el.style.setProperty('--rx',(-(y/r.height-0.5)*9).toFixed(2)+'deg')}
  });
 },{passive:true});
 document.documentElement.addEventListener('mouseleave',function(){if(GL.el){out(GL.el);GL.el=null}});
})();

/* ---------- panel de colores ---------- */
function aplicar(){
 var d=document.documentElement;
 d.setAttribute('data-theme',tema.m);d.setAttribute('data-fx',fxActual());d.style.setProperty('--h',tema.h);
 var mt=document.querySelector('meta[name=theme-color]');if(mt)mt.content=tema.m==='dark'?'#08050a':'#f6f1f4';
 $$('#mode button').forEach(function(b){b.classList.toggle('on',b.dataset.m===tema.m)});
 $$('#fx button').forEach(function(b){b.classList.toggle('on',b.dataset.v===fxActual())});
 $$('#sw button').forEach(function(b){b.classList.toggle('on',Number(b.dataset.h)===Number(tema.h))});
 $('#hue').value=tema.h;ls('tema3',tema);
 RXM.theme();
}
$('#sw').innerHTML=PRE.map(function(p){return '<button title="'+p[0]+'" aria-label="'+p[0]+'" data-h="'+p[1]+'" style="background:linear-gradient(135deg,hsl('+p[1]+' 96% 68%),hsl('+((p[1]+288)%360)+' 92% 74%))"></button>'}).join('');
$('#sw').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tema.h=Number(b.dataset.h);aplicar()});
$('#mode').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tema.m=b.dataset.m;aplicar()});
$('#fx').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tema.fx=b.dataset.v;aplicar();RXM.fx()});
$('#hue').addEventListener('input',function(e){tema.h=Number(e.target.value);aplicar()});
$('#treset').addEventListener('click',function(){tema={h:DEF_H,m:'dark'};aplicar();RXM.fx()});
function panel(v){var p=$('#themep');p.hidden=!v;$('#tbtn').setAttribute('aria-expanded',v?'true':'false')}
$('#tbtn').addEventListener('click',function(e){e.stopPropagation();panel($('#themep').hidden)});
document.addEventListener('click',function(e){var p=$('#themep');if(!p.hidden&&!p.contains(e.target))panel(false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape')panel(false)});
aplicar();

/* ---------- estado global ---------- */
function limpiar(){timers.forEach(function(t){clearInterval(t);clearTimeout(t)});timers=[];onbots=null;RXM.mode('idle');RXM.reset()}
function cargarStats(){var t0=performance.now();return api('/api/stats').then(function(s){S=s;Sat=Date.now();S.ping=Math.round(performance.now()-t0);lat.push(S.ping);if(lat.length>40)lat.shift();$('#dot').classList.remove('off');$('#pst').textContent='Servicio en línea';return s}).catch(function(){$('#dot').classList.add('off');$('#pst').textContent='Sin conexión'})}
function ordenar(a){return a.slice().sort(function(x,y){if(!!x.online!==!!y.online)return x.online?-1:1;return (x.desde||1e15)-(y.desde||1e15)})}
function cargarBots(){return api('/api/bots').then(function(r){BOTS=ordenar(r.bots||[]);BOTS_OK=true;RXM.bots();if(onbots)onbots();return BOTS}).catch(function(){return BOTS})}
cargarStats();cargarBots();setInterval(cargarStats,20000);setInterval(cargarBots,15000);
function relojes(){$$('[data-d]').forEach(function(e){var d=Number(e.getAttribute('data-d'));if(d)e.textContent=dur(Date.now()-d)})}
function segs(n,total){var N=14,on=total?Math.round(n/total*N):0;if(n>0&&on<1)on=1;var h='';for(var i=0;i<N;i++)h+='<i'+(i<on?' class="on"':'')+'></i>';return '<div class="seg" aria-hidden="true">'+h+'</div>'}
function tween(el,to,ms){
 if(!el)return;
 if(REDUCED||fxActual()==='lite'||!to){el.textContent=String(to);return}
 var t0=performance.now();(function f(t){var p=Math.min(1,(t-t0)/ms);el.textContent=String(Math.round(to*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(f)})(t0);
}

/* ---------- números ---------- */
var PAISES={'54':'Argentina','52':'México','56':'Chile','57':'Colombia','51':'Perú','598':'Uruguay','595':'Paraguay','591':'Bolivia','593':'Ecuador','58':'Venezuela','55':'Brasil','34':'España','1':'EE. UU., Canadá o Caribe','506':'Costa Rica','507':'Panamá','502':'Guatemala','503':'El Salvador','504':'Honduras','505':'Nicaragua','53':'Cuba','39':'Italia','33':'Francia','49':'Alemania','44':'Reino Unido','351':'Portugal'};
function pais(n){for(var l=3;l>=1;l--){var p=n.slice(0,l);if(PAISES[p])return {c:p,n:PAISES[p]}}return null}
function pista(n){
 if(!n)return {t:'Con código de país, sin + ni espacios.',k:''};
 var p=pais(n),pre=p?p.n+' (+'+p.c+') · ':'';
 if(n.length<8)return {t:pre+'Faltan dígitos.',k:''};
 if(n.length>15)return {t:'Es muy largo: revisá que no sobren dígitos.',k:'bad'};
 if(n.indexOf('54')===0&&n.indexOf('549')!==0&&n.length<=12)return {t:'En Argentina los celulares llevan un 9 después del 54: 549 + área + número.',k:'bad'};
 return {t:pre+n.length+' dígitos. Listo para vincular.',k:'ok'};
}

/* ---------- páginas ---------- */
var page=$('#page');
var booted=false;
var vinc={estado:'form',modo:'code',numero:'',id:null,err:'',data:null,auto:false,fin:0};
var CMD=['/tt','/ytaudio','/ytvideo','/search','/ig','/fb','/x','/pin','/mf','/apk'];
function chars(t){var n=0;return t.split(' ').map(function(w){return '<span class="w">'+w.split('').map(function(c){return '<span class="c" style="--n:'+(n++)+'">'+esc(c)+'</span>'}).join('')+'</span>'}).join(' ')}

function card(viz,t,p,extra){return '<article class="card glass" data-tilt tabindex="0"><div class="viz '+viz[0]+'">'+viz[1]+'</div><h3>'+t+'</h3><p>'+p+'</p>'+(extra||'')+'</article>'}

function pInicio(){
 var primera=!booted;booted=true;var anim=primera&&!REDUCED;
 var H1='Tu bot de WhatsApp, en un minuto.';
 page.innerHTML=
 '<section class="hero" id="hero"><div class="copy">'+
 '<h1 aria-label="'+esc(H1)+'" class="'+(anim?'boot':'')+'">'+(anim?'<span aria-hidden="true">'+chars(H1)+'</span>':esc(H1))+'</h1>'+
 '<p class="lede">Vinculá tu número con un código o un QR. Sin registro y sin instalar nada.</p>'+
 '<div class="glass blur console'+(anim?' boot':'')+'"><label for="qn">Tu número de WhatsApp</label><div class="field"><span class="pr">+</span><input class="inp" id="qn" inputmode="numeric" autocomplete="tel" placeholder="5493331234567"></div>'+
 '<p class="hint" id="qh">Con código de país, sin + ni espacios.</p>'+
 '<div class="quickbtns"><button class="btn pri" type="button" data-m="code">Obtener código</button><button class="btn" type="button" data-m="qr">Generar QR</button></div></div></div>'+
 '<div class="slot" data-slot="hero"></div>'+
 '<div class="readout glass blur"><b id="rn">–</b><span><span id="rl">bots en línea</span><span class="tip">'+(HOVER?'Pasá el mouse por un satélite':'Tocá un satélite')+'</span></span></div></section>'+

 '<section class="glass tele" aria-label="Estado en vivo">'+
 '<div><span class="k">Tiempo en línea</span><b id="t-up">—</b></div>'+
 '<div><span class="k">Bots conectados</span><b id="t-on">—</b><div id="t-seg"></div></div>'+
 '<div><span class="k">Grupos atendidos</span><b id="t-gr">—</b></div>'+
 '<div><span class="k">Comandos</span><b id="t-cm">—</b></div></section>'+

 '<div class="sh"><h2>En línea ahora</h2></div>'+
 '<div class="split"><ol class="glass lines" id="lines"><li class="none">Buscando bots…</li></ol><div class="slot" data-slot="online"></div></div>'+

 '<div class="sh"><h2>Qué puede hacer tu bot</h2><p>Deslizá para ver todo lo que trae.</p></div>'+
 '<div class="car" id="car" aria-label="Funciones del bot">'+
  card(['v-dl','<div class="file"><b>video.mp4</b><span>4,2 MB</span></div><div class="bar"><i></i></div><div class="src"><span>TikTok</span><span>YouTube</span><span>Instagram</span><span>MediaFire</span></div>'],'Descargas','Videos, audios, fotos y archivos de las redes de siempre, sin marca de agua. También busca en YouTube.','<div class="cmds">'+CMD.map(function(c){return '<code>'+c+'</code>'}).join('')+'</div>')+
  card(['v-st','<i class="ph"></i><span class="ar">&rarr;</span><i class="sk"></i>'],'Stickers','Mandá una foto con <code>/s</code> y vuelve como sticker. Si mandás varias juntas, convierte todas.')+
  card(['v-eco','<p><span>/daily</span><b class="up">+35.000</b></p><p><span>/work</span><b class="up">+12.400</b></p><p><span>/crime</span><b class="dn">&minus;71.000</b></p>'],'Economía','Daily, trabajos, apuestas y robos entre amigos, con la moneda que elijas para tu bot.')+
  card(['v-ai','<span class="me">/gemini ¿qué es un agujero negro?</span><span class="bot"><em></em><em></em><em></em></span>'],'IA y letras','<code>/gemini</code> responde y recuerda la conversación de cada persona. <code>/lyrics</code> busca por título y artista.')+
  card(['v-gr','<div class="av3"><i></i><i></i><i></i><i></i></div><code>/mute @user 10m</code>'],'Grupos','Silenciar personas, expulsar inactivos y programar mensajes automáticos.')+
 '</div>'+
 '<div class="carnav"><button class="btn" type="button" id="cprev" aria-label="Anterior">'+ic('prev')+'</button><button class="btn" type="button" id="cnext" aria-label="Siguiente">'+ic('next')+'</button></div>'+

 '<div class="sh"><h2>Cómo se vincula</h2></div>'+
 '<ol class="path" id="path"><i class="pulse" aria-hidden="true"></i>'+
 '<li style="--i:0"><span class="node">1</span><b>Elegí código o QR</b><p>El código de 8 caracteres se escribe en WhatsApp. El QR se escanea desde otro dispositivo.</p></li>'+
 '<li style="--i:1"><span class="node">2</span><b>Personalizalo</b><p>Ponele nombre, foto y, si querés, tu propio prefijo de comandos.</p></li>'+
 '<li style="--i:2"><span class="node">3</span><b>Escribile en WhatsApp</b><p>Cuando termina de vincularse, el bot aparece en Mis bots y ya responde.</p></li></ol>'+
 '<footer class="foot"><span>Hecho por <b>Vand4lw</b></span><a href="'+esc(CANAL)+'" target="_blank" rel="noopener">Canal oficial</a></footer>';

 /* número rápido */
 function ir(m){
  var n=$('#qn').value.replace(/\D/g,'');
  if(n.length<8||n.length>15){toast('Ingresá un número válido, con código de país.');$('#qn').focus();return}
  vinc={estado:'form',modo:m,numero:n,id:null,err:'',data:null,auto:true,fin:0};
  location.hash='#/vincular';
 }
 $$('.quickbtns button').forEach(function(b){b.addEventListener('click',function(){ir(b.dataset.m)})});
 $('#qn').addEventListener('keydown',function(e){if(e.key==='Enter')ir('code')});
 $('#qn').addEventListener('input',function(){var n=this.value.replace(/\D/g,''),p=pista(n),h=$('#qh');h.textContent=p.t;h.className='hint '+p.k});

 /* bots en línea: lista, número y reactor */
 var lastN=-1;
 function lista(){
  var on=BOTS.filter(function(b){return b.online});
  var rn=$('#rn');
  if(rn&&lastN!==on.length){if(lastN<0)tween(rn,on.length,primera?1400:500);else rn.textContent=String(on.length);lastN=on.length}
  var rl=$('#rl');if(rl)rl.textContent=on.length===1?'bot en línea':'bots en línea';
  var tp=$('.readout .tip');if(tp)tp.textContent=on.length?(HOVER?'Pasá el mouse por un satélite':'Tocá un satélite'):(BOTS_OK?'Vinculá el primero desde acá':'Buscando bots…');
  var el=$('#lines');if(!el)return;
  el.innerHTML=on.length?on.slice(0,8).map(function(b){return '<li data-i="'+BOTS.indexOf(b)+'"><span class="led"></span><div><b>'+esc(b.nombre)+'</b><small>'+grupos(b.grupos)+'</small></div><span class="up mono" data-d="'+(b.desde||'')+'">'+(b.desde?dur(Date.now()-b.desde):'—')+'</span></li>'}).join(''):'<li class="none">'+(BOTS_OK?'Todavía no hay bots en línea. El tuyo puede ser el primero.':'Buscando bots…')+'</li>';
 }
 onbots=lista;lista();
 var ls1=$('#lines');
 ls1.addEventListener('pointerover',function(e){if(e.pointerType==='touch')return;var li=e.target.closest('li[data-i]');$$('li.hot',ls1).forEach(function(x){if(x!==li)x.classList.remove('hot')});if(li){li.classList.add('hot');RXM.focus(Number(li.dataset.i))}});
 ls1.addEventListener('pointerleave',function(e){if(e.pointerType==='touch')return;$$('li.hot',ls1).forEach(function(x){x.classList.remove('hot')});RXM.focus(-1)});
 ls1.addEventListener('click',function(e){var li=e.target.closest('li[data-i]');if(li)RXM.pin(Number(li.dataset.i))});

 /* telemetría */
 var primeraTele=primera;
 function tele(){
  if(!S){timers.push(setTimeout(tele,300));return}
  var seg=$('#t-seg');if(!seg)return;
  seg.innerHTML=segs(S.online,S.total);
  $('#t-on').textContent=S.online+' de '+S.total;
  if(primeraTele){tween($('#t-gr'),S.grupos||0,1000);tween($('#t-cm'),S.comandos||0,1000)}
  else{$('#t-gr').textContent=S.grupos==null?'—':S.grupos;$('#t-cm').textContent=S.comandos}
  primeraTele=false;
  function up(){var e=$('#t-up');if(e&&S)e.textContent=dur(S.uptime*1000+(Date.now()-Sat))}
  up();timers.push(setInterval(function(){up();relojes()},1000));
 }
 tele();

 /* carrusel con profundidad */
 var car=$('#car'),cards=$$('.card',car),rafC=0;
 function prof(){
  rafC=0;var r=car.getBoundingClientRect(),mid=r.left+r.width/2;
  cards.forEach(function(c){var b=c.getBoundingClientRect(),d=clamp(((b.left+b.width/2)-mid)/(b.width+22),-2,2);c.style.setProperty('--d',d.toFixed(3));c.style.setProperty('--a',Math.abs(d).toFixed(3))});
 }
 car.addEventListener('scroll',function(){if(!rafC)rafC=requestAnimationFrame(prof)},{passive:true});
 if('IntersectionObserver' in window){new IntersectionObserver(function(es){car.classList.toggle('vis',es[0].isIntersecting)},{rootMargin:'80px'}).observe(car)}else car.classList.add('vis');
 prof();setTimeout(prof,120);
 function paso(dir){var w=cards[0].getBoundingClientRect().width+22;car.scrollBy({left:dir*w,behavior:REDUCED?'auto':'smooth'})}
 $('#cprev').addEventListener('click',function(){paso(-1)});$('#cnext').addEventListener('click',function(){paso(1)});

 /* ruta de vuelo: arranca cuando entra en pantalla */
 var pt=$('#path');
 if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){pt.classList.add('go');io.disconnect()}})},{threshold:.5});io.observe(pt)}else pt.classList.add('go');
}

/* --- vincular --- */
function pVincular(){
 function marco(inner){return '<div class="phead"><div><h2 class="title">Vincular un bot</h2><p class="sub">Tu bot queda fijo y se reconecta solo cuando el servicio se reinicia.</p></div></div><div class="vgrid"><section class="glass pad" id="vbox">'+inner+'</section><aside class="glass pad vside"><div class="slot" data-slot="link"></div><h3>Cómo se hace</h3><ol class="rail" id="how"></ol><p class="note">'+ic('shield')+'<span>Podés desvincularlo cuando quieras desde WhatsApp, en Dispositivos vinculados.</span></p></aside></div>'}
 function como(paso){
  var L=vinc.modo==='code'?
   ['Escribí tu número con código de país y tocá <b>Obtener código</b>.','En WhatsApp: Ajustes › Dispositivos vinculados › Vincular un dispositivo › <b>Vincular con el número de teléfono</b>.','Ingresá el código de 8 caracteres.']:
   ['Escribí tu número con código de país y tocá <b>Generar QR</b>.','Abrí WhatsApp <b>en otro dispositivo</b> con esa cuenta: Dispositivos vinculados › Vincular un dispositivo.','Escaneá el QR antes de que venza.'];
  var h=$('#how');if(!h)return;
  h.innerHTML=L.map(function(t,i){return '<li class="'+(i+1===paso?'on':(i+1<paso?'done':''))+'"><span class="k">'+(i+1)+'</span><div>'+t+'</div></li>'}).join('');
 }
 function opt(m,icn,t,d){return '<button type="button" role="radio" aria-checked="'+(vinc.modo===m)+'" data-m="'+m+'" class="opt'+(vinc.modo===m?' on':'')+'"><span class="oi">'+ic(icn)+'</span><b>'+t+'</b><span class="d">'+d+'</span></button>'}
 function form(){
  var p0=pista(vinc.numero);
  page.innerHTML=marco('<h3>Tus datos</h3>'+
   '<span class="lbl">Cómo querés vincularlo</span><div class="opts" id="opts" role="radiogroup" aria-label="Modo de vinculación">'+
   opt('code','keys','Código de 8 caracteres','Lo escribís en WhatsApp. Sirve desde el mismo celular.')+opt('qr','qr','Código QR','Lo escaneás desde otro dispositivo.')+'</div>'+
   '<label for="num">Número de WhatsApp</label><div class="field"><span class="pr">+</span><input class="inp" id="num" inputmode="numeric" autocomplete="tel" placeholder="5493331234567" value="'+esc(vinc.numero)+'"></div>'+
   '<p class="hint '+p0.k+'" id="nh">'+esc(vinc.numero?p0.t:'Con código de país, sin + ni espacios. Argentina: 549 + código de área + número.')+'</p>'+
   (vinc.err?'<div class="err" role="alert">'+esc(vinc.err)+'</div>':'')+
   '<button class="btn pri" id="go" style="width:100%;margin-top:20px">'+(vinc.modo==='code'?'Obtener código':'Generar QR')+'</button>');
  como(1);RXM.refresh();RXM.mode('idle');
  $('#opts').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;vinc.modo=b.dataset.m;vinc.numero=$('#num').value;form()});
  $('#num').addEventListener('keydown',function(e){if(e.key==='Enter')$('#go').click()});
  $('#num').addEventListener('input',function(){var n=this.value.replace(/\D/g,''),p=pista(n),h=$('#nh');h.textContent=n?p.t:'Con código de país, sin + ni espacios. Argentina: 549 + código de área + número.';h.className='hint '+(n?p.k:'')});
  $('#go').addEventListener('click',function(){
   var n=$('#num').value.replace(/\D/g,'');vinc.numero=n;
   if(n.length<8||n.length>15){vinc.err='Ingresá un número válido, con código de país.';return form()}
   vinc.err='';$('#go').disabled=true;
   api('/api/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numero:n,modo:vinc.modo})})
    .then(function(r){vinc.id=r.id;vinc.estado='espera';vinc.data=null;vinc.fin=0;esperar()})
    .catch(function(e){vinc.err=e.message;form()})
  });
  if(vinc.auto){vinc.auto=false;$('#go').click()}
 }
 function ring(left){var p=clamp(left/120,0,1);return '<div class="ring'+(left<20?' low':'')+'" id="ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="rt" cx="22" cy="22" r="19" pathLength="100"/><circle class="rp" cx="22" cy="22" r="19" pathLength="100" stroke-dashoffset="'+(100-p*100).toFixed(1)+'"/></svg><b id="rs">'+left+'</b></div>'}
 function ringSet(left){
  var r=$('#ring');if(!r)return;
  r.classList.toggle('low',left<20);
  var c=$('.rp',r);if(c)c.setAttribute('stroke-dashoffset',(100-clamp(left/120,0,1)*100).toFixed(1));
  var s=$('#rs');if(s)s.textContent=left;
  var h=$('#hl');if(h)h.textContent='Vence en '+left+' s. '+(vinc.modo==='code'?'Esperando que lo ingreses…':'Esperando el escaneo…');
 }
 function restante(){return Math.max(0,Math.round((vinc.fin-Date.now())/1000))}
 function esperar(){
  page.innerHTML=marco('<div class="wait"><i></i><h3 style="margin:0">'+(vinc.modo==='code'?'Generando tu código…':'Generando el QR…')+'</h3></div><p class="sub">Un momento, ya casi.</p>');como(1);RXM.refresh();RXM.mode('wait');
  function sondeo(){
   if(vinc.estado!=='espera'||!document.body.contains($('#vbox')))return;
   api('/api/link/'+vinc.id).then(function(r){
    vinc.data=r;
    if(r.estado==='conectado'){vinc.estado='ok';var t=tokens();if(r.token&&t.indexOf(r.token)<0){t.push(r.token);ls('tokens',t)}return listo()}
    if(r.estado==='error'){vinc.estado='form';vinc.err=r.error||'No se pudo vincular.';return form()}
    pintar(r);timers.push(setTimeout(sondeo,1800));
   }).catch(function(){timers.push(setTimeout(sondeo,3000))});
  }
  sondeo();
  timers.push(setInterval(function(){if(vinc.fin)ringSet(restante())},500));
 }
 function pintar(r){
  var box=$('#vbox');if(!box)return;
  var left=Math.max(0,(r.restante!=null?r.restante:120));vinc.fin=Date.now()+left*1000;
  if(r.estado==='codigo'&&r.code){
   var c=String(r.code).replace(/[^A-Za-z0-9]/g,'');
   if(box.dataset.k==='c:'+c){ringSet(left);return}
   box.dataset.k='c:'+c;
   var spans=c.split('').map(function(ch,i){return (i===4?'<span class="sep mono">-</span>':'')+'<span style="animation-delay:'+(i*45)+'ms">'+esc(ch)+'</span>'}).join('');
   box.innerHTML='<h3>Tu código de vinculación</h3><p class="sub">Ingresalo en WhatsApp ahora.</p><div class="bigcode" aria-label="Código '+esc(c)+'">'+spans+'</div><div class="cdrow">'+ring(left)+'<button class="btn" id="cp">'+ic('copy')+'Copiar código</button></div><p class="hint center" id="hl" style="margin-top:16px">Vence en '+left+' s. Esperando que lo ingreses…</p>';
   var cp=$('#cp');if(cp)cp.onclick=function(){try{navigator.clipboard.writeText(c);toast('Código copiado')}catch(e){toast(c)}};
   como(2);RXM.mode('code');
  }else if(r.estado==='qr'&&r.qr){
   var im=$('#qrimg');
   if(im&&box.dataset.k==='qr'){im.src=r.qr;ringSet(left)}
   else{box.dataset.k='qr';box.innerHTML='<h3>Escaneá el QR</h3><p class="sub">Desde <b>otro dispositivo</b>, con la cuenta del número '+esc(vinc.numero)+'.</p><div class="qrbox"><img id="qrimg" alt="Código QR para vincular" src="'+r.qr+'"><span class="scan" aria-hidden="true"></span></div><div class="cdrow">'+ring(left)+'</div><p class="hint center" id="hl" style="margin-top:14px">Vence en '+left+' s. Esperando el escaneo…</p>';como(2);RXM.mode('code')}
  }
 }
 function listo(){
  page.innerHTML=marco('<div class="center"><div class="okm">'+ic('check')+'</div><h3>Tu bot quedó vinculado</h3><p class="sub" style="margin-inline:auto">Escribile por WhatsApp o personalizalo desde acá.</p><div class="acts"><a class="btn pri" href="#/bots?t=mis">Personalizar mi bot</a><button class="btn" id="otro">Vincular otro</button></div></div>');como(4);RXM.refresh();RXM.mode('ok');
  cargarBots();
  $('#otro').onclick=function(){vinc={estado:'form',modo:'code',numero:'',id:null,err:'',data:null,auto:false,fin:0};form()};
 }
 if(vinc.estado==='espera'&&vinc.id){esperar()}else if(vinc.estado==='ok'){listo()}else{form()}
}

/* --- bots --- */
function fila(b,extra){
 var ini=esc((b.nombre||'?').trim().charAt(0).toUpperCase()||'?');
 var av='<span class="avs'+(b.online?'':' off')+'"><span class="avw"></span><span class="av"'+(b.banner?' style="background-image:url('+esc(b.banner)+')"':'')+'>'+(b.banner?'':ini)+'</span><i class="led'+(b.online?'':' off')+'"></i></span>';
 var est=b.principal?'<span class="chipst main">Principal</span>':(b.online?'<span class="chipst">Conectado</span>':'<span class="chipst off">Desconectado</span>');
 var up=b.online&&b.desde;
 return '<article class="glass bot" data-i="'+BOTS.indexOf(b)+'"><div class="bhead">'+av+'<div class="bname"><b>'+esc(b.nombre)+'</b>'+(b.mio?'<span class="num mono">+'+esc(b.numero)+'</span>':'')+'</div>'+est+
  '<div class="bmeta"><span class="mono"'+(up?' data-d="'+b.desde+'"':'')+'>'+(up?dur(Date.now()-b.desde):'—')+'</span><span>'+grupos(b.grupos)+'</span></div></div>'+(extra||'')+'</article>'
}
function pBots(){
 var q=(location.hash.split('?')[1]||'');var tab=/t=mis/.test(q)?'mis':'todos';
 page.innerHTML='<div class="phead"><div><h2 class="title">Bots</h2><p class="sub">Los bots en línea y los que vinculaste desde este navegador.</p></div><div class="slot" data-slot="bots" aria-hidden="true"></div><a class="btn pri" href="#/vincular">Vincular un bot</a></div><div class="tabs" id="tabs" role="tablist"><button role="tab" data-t="todos">Todos</button><button role="tab" data-t="mis">Mis bots</button></div><div id="lista"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
 RXM.refresh();
 function marcar(){$$('#tabs button').forEach(function(b){b.classList.toggle('on',b.dataset.t===tab);b.setAttribute('aria-selected',b.dataset.t===tab)})}
 function editor(b){
  return '<div class="edit" data-s="'+esc(b.slug)+'">'+(b.banner?'<img class="prev" alt="Banner actual del menú" src="'+esc(b.banner)+'">':'')+'<div class="two"><div><label>Nombre</label><input class="inp" data-f="nombre" maxlength="40" value="'+esc(b.nombre)+'"></div><div><label>Moneda</label><input class="inp" data-f="moneda" maxlength="20" value="'+esc(b.moneda||'')+'"></div></div>'+
  '<div class="two"><div><label>Prefijo (1 símbolo o letra)</label><input class="inp mono" data-f="prefijo" maxlength="2" value="'+esc(b.prefijo||'/')+'"></div><div><label>Banner del menú</label><label class="btn up-btn"><input type="file" accept="image/*" data-f="banner" hidden>'+ic('up')+'Subir imagen</label></div></div>'+
  '<div class="two"><button class="btn pri" data-a="guardar">'+ic('check')+'Guardar cambios</button><button class="btn" data-a="quitar"'+(b.banner?'':' disabled')+'>Quitar banner</button></div></div>'
 }
 function pintar(sin){
  marcar();var l=$('#lista');if(!l||!BOTS_OK)return;
  if(sin&&document.querySelector('.edit input:focus'))return;
  var arr=BOTS.filter(function(b){return tab==='mis'?b.mio:true});
  if(tab==='mis'&&!arr.length){l.innerHTML='<div class="empty">Todavía no vinculaste ningún bot desde este navegador.<div class="acts"><a class="btn pri" href="#/vincular">Vincular mi bot</a></div></div>';return}
  l.innerHTML=arr.map(function(b){return fila(b,tab==='mis'?editor(b):'')}).join('')||'<div class="empty">No hay bots para mostrar.</div>';
 }
 onbots=function(){pintar(true)};
 $('#tabs').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tab=b.dataset.t;history.replaceState(null,'','#/bots'+(tab==='mis'?'?t=mis':''));pintar()});
 page.addEventListener('change',function(e){var f=e.target;if(f.dataset&&f.dataset.f==='banner'&&f.files&&f.files[0]){
  var ed=f.closest('.edit'),file=f.files[0];if(file.size>8*1048576)return toast('La imagen pesa demasiado (máx. 8 MB)');
  toast('Subiendo…');
  api('/api/bot/'+ed.dataset.s+'/banner',{method:'POST',headers:{'Content-Type':file.type||'image/jpeg'},body:file}).then(function(){toast('Banner actualizado');cargarBots().then(function(){pintar()})}).catch(function(er){toast(er.message)})}});
 page.addEventListener('click',function(e){var b=e.target.closest('[data-a]');if(!b)return;var ed=b.closest('.edit'),s=ed.dataset.s;
  if(b.dataset.a==='guardar'){
   var body={nombre:$('[data-f=nombre]',ed).value,moneda:$('[data-f=moneda]',ed).value,prefijo:$('[data-f=prefijo]',ed).value};
   b.disabled=true;api('/api/bot/'+s+'/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(){toast('Cambios guardados');cargarBots().then(function(){pintar()})}).catch(function(er){toast(er.message);b.disabled=false})}
  if(b.dataset.a==='quitar'){api('/api/bot/'+s+'/banner/borrar',{method:'POST'}).then(function(){toast('Banner quitado');cargarBots().then(function(){pintar()})}).catch(function(er){toast(er.message)})}
 });
 var LB=$('#lista');
 LB.addEventListener('pointerover',function(e){if(e.pointerType==='touch')return;var a=e.target.closest('.bot[data-i]');RXM.focus(a?Number(a.dataset.i):-1)});
 LB.addEventListener('pointerleave',function(e){if(e.pointerType==='touch')return;RXM.focus(-1)});
 marcar();pintar();cargarBots();timers.push(setInterval(relojes,1000));
}

/* --- estado --- */
function pEstado(){
 var uid=Math.floor(Math.random()*1e6);
 function gauge(id,val,tot,t1,t2){
  var pct=tot?Math.min(1,val/tot):0;
  return '<div class="glass g"><div class="gv"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="gg'+id+uid+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--acc)"/><stop offset="1" style="stop-color:var(--acc2)"/></linearGradient></defs><circle class="gt" cx="60" cy="60" r="50" pathLength="100"/><circle class="gp" data-p="'+(pct*75).toFixed(1)+'" cx="60" cy="60" r="50" pathLength="100" style="stroke:url(#gg'+id+uid+')"/></svg><b>'+val+'/'+tot+'</b></div><div class="gl"><b>'+t1+'</b><span>'+t2+'</span></div></div>';
 }
 page.innerHTML='<div class="phead"><div><h2 class="title">Estado del servicio</h2><p class="sub">Información en vivo del bot, actualizada cada pocos segundos.</p></div></div><div id="est"><div class="skel" style="margin-top:30px"></div></div><footer class="foot"><span>Hecho por <b>Vand4lw</b></span><a href="'+esc(CANAL)+'" target="_blank" rel="noopener">Canal oficial</a></footer>';
 RXM.refresh();
 var armado=false;
 function armar(){
  armado=true;
  $('#est').innerHTML='<div class="glass eh"><div class="slot" data-slot="estado"></div><div><span class="k">Tiempo en línea</span><b class="big" id="e-up">—</b><span class="chipst"><i class="led"></i>Servicio en línea</span></div><dl class="mini"><div><dt>Grupos atendidos</dt><dd id="e-gr">—</dd></div><div><dt>Comandos disponibles</dt><dd id="e-cm">—</dd></div></dl></div>'+
  '<div class="gauges">'+gauge('a',S.online,S.total,'Bots conectados','De todos los vinculados')+gauge('b',S.usados,S.max,'Sub-bots vinculados','Cupo disponible: '+Math.max(0,S.max-S.usados))+'</div>'+
  '<div class="glass lat"><h3>Respuesta del servidor</h3><div class="st"><span>Último <b id="l-ult">—</b></span><span>Promedio <b id="l-avg">—</b></span><span>Mínimo <b id="l-min">—</b></span><span>Máximo <b id="l-max">—</b></span></div><div id="spk" class="empty" style="padding:26px">Midiendo…</div></div>';
  requestAnimationFrame(function(){$$('.gp').forEach(function(c){c.style.strokeDasharray=c.dataset.p+' 100'})});
  RXM.refresh();
 }
 function spark(){
  var el=$('#spk');if(!el||lat.length<2)return;
  var mn=Math.min.apply(null,lat),mx=Math.max.apply(null,lat),span=Math.max(1,mx-mn),W=300,Hh=80,pts=lat.map(function(v,i){return [i/(lat.length-1)*W,Hh-6-((v-mn)/span)*(Hh-14)]});
  var d=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)}).join(' ');
  el.className='';el.removeAttribute('style');
  el.innerHTML='<svg class="spark" viewBox="0 0 '+W+' '+Hh+'" preserveAspectRatio="none" role="img" aria-label="Gráfico de latencia"><defs><linearGradient id="sg'+uid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--acc);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--acc);stop-opacity:0"/></linearGradient></defs><path style="fill:url(#sg'+uid+')" d="'+d+' L'+W+' '+Hh+' L0 '+Hh+' Z"/><path class="sl" d="'+d+'"/></svg>';
 }
 function pintar(){
  if(!S)return;
  if(!armado)armar();
  var up=S.uptime*1000+(Date.now()-Sat),sum=lat.reduce(function(a,b){return a+b},0);
  $('#e-up').textContent=dur(up);$('#e-gr').textContent=S.grupos==null?'—':S.grupos;$('#e-cm').textContent=S.comandos;
  if(lat.length){$('#l-ult').textContent=lat[lat.length-1]+' ms';$('#l-avg').textContent=Math.round(sum/lat.length)+' ms';$('#l-min').textContent=Math.min.apply(null,lat)+' ms';$('#l-max').textContent=Math.max.apply(null,lat)+' ms'}
  spark();
 }
 cargarStats().then(pintar);
 timers.push(setInterval(function(){cargarStats().then(pintar)},5000));
 timers.push(setInterval(function(){if(S&&armado){$('#e-up').textContent=dur(S.uptime*1000+(Date.now()-Sat))}},1000));
}

/* ---------- ruteo ---------- */
var RUTAS={inicio:pInicio,vincular:pVincular,bots:pBots,estado:pEstado};
function ruta(){
 limpiar();
 var r=(location.hash||'#/inicio').replace(/^#\//,'').split('?')[0];if(!RUTAS[r])r='inicio';
 $$('.menu a[data-r]').forEach(function(n){n.classList.toggle('on',n.dataset.r===r)});
 RUTAS[r]();window.scrollTo(0,0);RXM.refresh();
}
window.addEventListener('hashchange',ruta);
ruta();
})();

</script>
</body>
</html>
`;

function startWeb() {
  if (!PUBLIC_URL ||!HTTP_PORT) { // solo si se configuró el dominio y hay puerto
    console.log(`🌐 Web de banners apagada: ${!PUBLIC_URL? 'falta BANNER_PUBLIC_URL' : ''}${!PUBLIC_URL &&!HTTP_PORT? ' y ' : ''}${!HTTP_PORT? 'no hay puerto (SERVER_PORT / WEB_PORT / PORT)' : ''}`);
    return;
  }
  http.createServer((req, res) => {
    let m;
    const path = (req.url || '/').split('?')[0];
    if (path === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return res.end(WEB_PAGE.replace(/__NOMBRE__/g, esc(WEB_NOMBRE)).replace(/__CANAL__/g, esc(WEB_CANAL)).replace(/__IMG__/g, esc(`${PUBLIC_URL}/b/${slugOf('main')}.jpg?v=${bannerVer('main')}`)));
    }
    if (path.startsWith('/api/')) return webApi(req, res, path).catch(e => { console.error('[web]', e.message); if (!res.headersSent) jsonRes(res, 500, { error: 'Error interno' }); });
    if ((m = path.match(/^\/b\/([a-f0-9]{12})\.jpg$/)) && idBySlug(m[1])) {
      const img = bannerBuf(idBySlug(m[1])); // el del bot o, si no tiene, el de fábrica
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': img.length, 'Cache-Control': 'public, max-age=300' });
      return res.end(img);
    }
    if ((m = path.match(/^\/c\/([a-f0-9]{12})\.jpg$/)) && idBySlug(m[1])) {   // la foto del menú ya acomodada para la tarjeta
      return bannerCard(idBySlug(m[1])).then(img => {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': img.length, 'Cache-Control': 'public, max-age=300' });
        res.end(img);
      }).catch(() => { res.writeHead(500); res.end(); });
    }
    if ((m = path.match(/^\/p\/([a-f0-9]{12})$/)) && idBySlug(m[1])) {
      const id = idBySlug(m[1]), nombre = esc(nameOfId(id)), img = `${PUBLIC_URL}/b/${m[1]}.jpg`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nombre}</title>
<meta property="og:type" content="website"><meta property="og:title" content="${nombre}">
<meta property="og:description" content="${esc(BANNER_BODY)}"><meta property="og:image" content="${img}">
<style>body{margin:0;background:#0b0b0f;color:#eee;font-family:system-ui,sans-serif;text-align:center}img{max-width:100%;display:block;margin:0 auto}h1{font-weight:600}</style>
</head><body><img src="${img}" alt=""><h1>${nombre}</h1><p>${esc(BANNER_BODY)}</p></body></html>`);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  }).on('error', e => console.error('[web]', e.message))
    .listen(HTTP_PORT, '0.0.0.0', () => console.log(`🌐 Web de banners en el puerto ${HTTP_PORT} (${PUBLIC_URL})`));
}

// ---------- menú ----------
function buildMenu({ botName, system, user, totalCommands }) {
  return `◈ ━━━━━━ ◈ ${botName} ◈ ━━━━━━ ◈

⟐  SYSTEM :: ${system}‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌
⊳  USER :: @${user}

╭─[ ⟡ CORE ]
│ • /code - Ser sub-bot por código
│
│ • /qr - Ser sub-bot por QR
│
│ • /sub - Ver sub-bots
│
│ • /p - Latencia
│
│ • /infobot | /bot | /botinfo - Información del bot
│
│ • /menu | /? | /help | /comandos - Este listado
> Varios bots en un grupo: si cada uno tiene un prefijo distinto, alcanza con el prefijo (ej: /help para uno, #help para el otro). Si comparten prefijo, hace falta la inicial del nombre: J/s responde el bot que empieza con J, P/s el que empieza con P. Sin inicial responde el más viejo.
╰───────────

╭─[ ✧ MEDIA DOWNLOADER ]
│ $ /tt | /tiktok - Descargar TikTok sin marca de agua (los slides salen como video con la música)
> Uso: /tt <link> | respondiendo a un mensaje con el link | /tt <búsqueda>
│
│ $ /ytaudio | /ytmp3 - Audio de YouTube (link o título)
> Uso: /ytaudio <link> | /ytaudio <título>
> Con -info recibís solo la ficha del video (sin audio): /ytmp3 -info <link>
│
│ $ /ytvideo | /ytmp4 - Video de YouTube (link o título)
> Uso: /ytvideo <link> | /ytvideo <título>
> Con -info recibís solo la ficha del video (sin descargarlo): /ytmp4 -info <link>
│
│ $ /search - Buscar en YouTube (20 resultados)
> Uso: /search <búsqueda> | título, duración y link de cada uno
│
│ $ /spotify - Audio de Spotify (link o título)
> Uso: /spotify <link de la canción> | /spotify <título y artista>
│
│ $ /r34 - Descarga imágenes en el sitio de Rule34
> Uso: /r34 <query>
│
│ $ /mf | /mediafire - Descargar un archivo de MediaFire
> Uso: /mf <link> | respondiendo a un mensaje con el link
│
│ $ /getrepo | /git - Bajar la rama main de un repositorio de GitHub (.zip)
> Uso: /git usuario/repo
│
│ $ /apk - Buscar y descargar un APK (Aptoide y F-Droid, hasta 20 resultados)
> Uso: /apk <app> y después respondé a la lista con el número (1 a 20)
│
│ $ /fb | /facebook - Descargar video/foto de Facebook
> Uso: /fb <link>
│
│ $ /x | /twitter - Descargar fotos/videos de un tweet
> Uso: /x <link>
│
│ $ /ig | /instagram - Descargar de Instagram
> Uso: /ig <link>
│
│ $ /pin | /pinterest - Descargar de Pinterest o buscar una imagen
> Uso: /pin <link> | /pin <búsqueda>
╰───────────

╭─[ ✧ STICKERS ]
│ $ /s - Imagen a sticker
> Uso: respondé a una imagen (o a un álbum) con /s, o mandá la imagen con /s
│
│ $ /toimg | /toimage - Sticker o foto (también de "ver una vez") a imagen
> Uso: respondé al sticker o a la foto con /toimg
│
│ $ /setmeta pack | autor - Pack y autor de tus stickers
> Uso: /setmeta Memes del grupo | Vand4lw
│
│ $ /delmeta - Quitar el pack y autor de tus stickers
│
│ $ /pfp | /getpic @usuario - Ver la foto de perfil de alguien
╰───────────

╭─[ ✧ PERFIL Y NIVEL ]
│ $ /profile | /perfil @usuario - Ver tu perfil (o el de otro)
│
│ $ /setdesc texto - Tu descripción (/setdesc reset para borrarla)
│
│ $ /setbirth 15/03 - Tu cumpleaños (con año: 15/03/1999). El bot te saluda ese día
│
│ $ /delbirth - Borrar tu cumpleaños
│
│ $ /birthdays | /births - Próximos cumpleaños del grupo
│
│ $ /marry @usuario - Proponerle casamiento (responde con sí o no)
│
│ $ /divorce - Divorciarte
│
│ $ /marryhistory @usuario - Historial de matrimonios
│
│ $ /level | /lvl @usuario - Nivel y XP global (sube con los comandos de economía y apuestas)
│
│ $ /top | /leaderboard | /lboard <página> - Ranking global de nivel
│
│ $ /msgcount | /count @usuario <días> - Cuántos mensajes mandó alguien
│
│ $ /topcount | /topmessages <días> - Top de mensajes del grupo
╰───────────

╭─[ ✧ GROUP ADMIN ]
│ $ /mute @usuario - mutear usuario
> Uso: /mute @usuario 1S 1M 1H 1D
> Uso: /mute (@usuario opcional) status
│
│ $ /unmute @usuario - desmutear usuario
│
│ $ /killinactive - Expulsar inactivos de la lista de #topinactive
> Uso: respondé a la lista con /killinactive all | 5 | 1-8
│
│ $ /nsfw - Activar o desactivar los comandos NSFW del grupo
> Uso: /nsfw on | /nsfw off | /nsfw (ver el estado)
│
│ $ /close - Cerrar el chat (solo hablan los admins)
│
│ $ /open - Abrir el chat
│
│ $ /tag | /hidetag | /todos | /everyone | /all mensaje - Mencionar a todos sin mostrar los @
> Uso: /tag mensaje, o respondé a un mensaje con /tag para mandarlo mencionando a todos
│
│ $ /onlyadmin on | off - Solo los admins pueden usar el bot
> Uso: /onlyadmin on | /onlyadmin off | /onlyadmin (ver el estado)
│
│ $ /kick @usuario - Expulsar del grupo (o respondé a su mensaje)
│
│ $ /promote @usuario - Dar admin (o respondé a su mensaje)
│
│ $ /demote @usuario - Sacar admin (o respondé a su mensaje)
│
│ $ /warn razón - Advertir a alguien (con @usuario o respondiendo a su mensaje)
> Al llegar al límite de advertencias, se lo expulsa
│
│ $ /setwarnlimit número - Límite de advertencias (por defecto 3)
│
│ $ /warnstotal - Ver las advertencias del grupo (o de un @usuario)
│
│ $ /delwarn número | all - Borrar advertencias de un @usuario
> Uso: /delwarn @usuario 2 | /delwarn @usuario 1-3 | /delwarn @usuario all
│
│ $ /antilink on | off - Borra y expulsa a quien mande links de grupos de WhatsApp
│
│ $ /welcome on | off - Mensaje de bienvenida
│
│ $ /goodbye on | off - Mensaje de despedida
│
│ $ /setwelcome texto - Texto de bienvenida (usá @user, {grupo} y {miembros})
│
│ $ /setgoodbye texto - Texto de despedida (usá @user, {grupo} y {miembros})
│
│ $ /del - Borrar el mensaje al que respondas
│
│ $ /economy on | off - Prender o apagar la economía del grupo
│
│ $ /topinactive página días - Lista de inactivos (se usa con /killinactive)
> Uso: /topinactive 1 30 (página 1, 30 días sin escribir). Sin días son 7
│
│ $ /automsj "mensaje" | hora (formato 24HS) | días
> Uso: /automsj "Hello everynyan" | 13:00 | todos
> Uso: /automsj "Feliz jueves" | 01:00 | J
╰───────────

╭─[ ✧ ECONOMÍA ]
│ $ /daily - Recompensa diaria (racha global, se cobra una vez por grupo)
│
│ $ /w | /work - Trabajar (cada 2 min)
│
│ $ /crime | /delito - Cometer un delito (cada 5 min)
│
│ $ /minar - Ir a minar (cada 10 min)
│
│ $ /hacking - Hackear (cada 30 min)
│
│ $ /rob @usuario - Robarle a alguien distraído (cada 1 h)
│
│ $ /dep | /d | /deposit | /depositar <monto|all> - Guardar en el banco
│
│ $ /with | /retirar <monto|all> - Sacar del banco
│
│ $ /bal | /balance - Ver saldo (tuyo o de otro)
│
│ $ /pay | /givecoins @usuario <monto|all> - Pasarle plata a alguien
│
│ $ /baltop | /economyboard | /eboard <página> - Ranking de plata del grupo
│
│ $ /economyinfo | /einfo - Tu plata, puesto, racha y tiempos de espera
╰───────────

╭─[ ✧ APUESTAS ]
│ $ /rt | /roulette | /ruleta <monto|all> <color> - Ruleta
> Rojo o negro: x2 · Verde: x5. Ej: /rt 5000 rojo
│
│ $ /cf | /coinflip <monto|all> <cara|cruz> - Cara o cruz (x2)
│
│ $ /bj | /blackjack <monto|all> - Blackjack contra el bot
> Respondé al mensaje con get (carta) o stand (plantarte)
│
│ $ /maq | /maquinita <monto|all> - La maquinita
╰───────────

╭─[ ✧ AI / TOOLS ]
│ $ /gemini pregunta - Preguntarle a Gemini
> Uso: /gemini on | off | reset (respondiendo a un mensaje lo usa de contexto)
│
│ $ /lyrics | /letra - Buscar letra
> Uso: /lyrics The Weeknd - Blinding Lights
╰───────────

╭─[ ✧ PERSONALIZACIÓN ]
│ $ /setbotname nombre - Nombre del bot (define su inicial)
│
│ $ /setbotcurrency símbolo - Moneda de economía
│
│ $ /setbanner - Foto del menú (enviá o respondé a una imagen)
│
│ $ /setprefix símbolo - Prefijo del bot (uno solo)
│
│ $ /setstatus texto - Estado (info) del bot
│
│ $ /setpfp - Foto de perfil del bot (enviá o respondé a una imagen)
> Uso: /setprefix $ | /setprefix reset
╰───────────

╭─[ ✧ REACCIONES ]
│ ❖ Cariño y amistad
│ $ /hug - Abrazar
│ $ /cuddle - Acurrucarse
│ $ /kiss - Dar un beso
│ $ /peck - Dar un piquito
│ $ /blowkiss - Tirar un beso
│ $ /pat - Hacer cariñitos en la cabeza
│ $ /handhold - Agarrar de la mano
│ $ /lappillow - Usar las piernas de almohada
│ $ /carry - Cargar en brazos
│ $ /feed - Dar de comer
│ $ /handshake - Dar la mano
│ $ /highfive - Chocar los cinco
│
│ ❖ Travesuras
│ $ /slap - Dar una cachetada
│ $ /punch - Dar un puñetazo
│ $ /patada - Patear
│ $ /bite - Morder
│ $ /bonk - Dar un bonk
│ $ /poke - Molestar con el dedo
│ $ /tickle - Hacer cosquillas
│ $ /shoot - Disparar
│ $ /yeet - Lanzar por los aires
│ $ /baka - Decir baka (tonto)
│ $ /kabedon - Acorralar contra la pared
│ $ /tableflip - Dar vuelta la mesa
│
│ ❖ Emociones
│ $ /happy - Estar feliz
│ $ /smile - Sonreír
│ $ /laugh - Reírse
│ $ /teehee - Reírse con picardía
│ $ /cry - Llorar
│ $ /angry - Enojarse
│ $ /pout - Hacer pucheros
│ $ /blush - Sonrojarse
│ $ /bored - Aburrirse
│ $ /yawn - Bostezar
│ $ /sleep - Dormir
│ $ /shocked - Quedarse en shock
│ $ /confused - Estar confundido
│ $ /think - Pensar
│ $ /smug - Poner cara de canchero
│
│ ❖ Gestos y acciones
│ $ /wave - Saludar
│ $ /wink - Guiñar el ojo
│ $ /nod - Asentir
│ $ /nope - Negar
│ $ /shrug - Encogerse de hombros
│ $ /thumbsup - Pulgar arriba
│ $ /clap - Aplaudir
│ $ /salute - Hacer la venia
│ $ /facepalm - Facepalm
│ $ /stare - Mirar fijo
│ $ /lurk - Espiar
│ $ /run - Salir corriendo
│ $ /dance - Bailar
│ $ /spin - Dar vueltas
│ $ /sip - Tomar un sorbo
│ $ /nom - Comer algo rico
│ $ /nya - Hacer nya
│ $ /wag - Mover la cola
│ $ /bleh - Sacar la lengua
│ $ /shake - Sacudirse
> Uso: /hug @usuario (o respondé a su mensaje). Sin etiqueta, la reacción es solo tuya
╰───────────

╭─[ ✧ NSFW ]
│ ❖ En grupos: activar con /nsfw on.
│
│ ❖ Sugerente
│ $ /nsfwneko - Neko
│ $ /nsfwwaifu - Waifu
│ $ /nsfwtrap - Trap
│ $ /nsfwecchi - Ecchi
│ $ /nsfwero - Ero
│ $ /nsfwsolo - Solo
│ $ /nsfwboobs - Boobs
│ $ /nsfwhboobs - Hboobs
│ $ /nsfwoppai - Oppai
│ $ /nsfwass - Culo
│ $ /nsfwhips - Caderas
│ $ /nsfwhmidriff - Rollitos
│ $ /nsfwfoxgirl - Foxgirl
│ $ /nsfwuniform - Uniforme
│ $ /nsfwschool - Escuela
│ $ /nsfwmaid - Maid
│ $ /nsfwnurse - Enfermera
│ $ /nsfwglasses - Anteojos
│ $ /nsfwstockings - Medias
│ $ /nsfwtights - Tights
│ $ /nsfwzettai - Zettai ryouiki
│ $ /nsfwpanties - Pants
│ $ /nsfwfeet - Pies
│ $ /nsfwkemonomimi - Kemonomimi
│ $ /nsfwhanalia - Hanalia
│ $ /nsfwhasshaku - Hasshaku
│ $ /nsfwhneko - Hneko
│ $ /nsfwhololewd - Holo
│ $ /nsfwlewdk - Lewdk
│ $ /nsfwlewdkemo - Lewdkemo
│ $ /nsfwngif - GIF
│ $ /nsfw4k - 4K
│
│ ❖ Explícito
│ $ /nsfwhentai - Hentai
│ $ /nsfwahegao - Ahegao
│ $ /nsfwpaizuri - Paizuri
│ $ /nsfwblowjob - Blowjob
│ $ /nsfworalsex - Oral
│ $ /nsfwpussy - Vagina
│ $ /nsfwpussywank - Paja
│ $ /nsfwanal - Anal
│ $ /nsfwcreampie - Creampie
│ $ /nsfwcum - Acabada
│ $ /nsfwdick - Pene
│ $ /nsfworgasm - Orgasmo
│ $ /nsfwmasturbation - Masturbación
│ $ /nsfwthreesome - Trío
│ $ /nsfwyaoi - Yaoi
│ $ /nsfwsolomale - Solo (hombre)
│
│ ❖ Fetiches
│ $ /nsfwtentacles - Tentáculos
│ $ /nsfwbdsm - BDSM
│ $ /nsfwfemdom - Femdom
│ $ /nsfwfootjob - Footjob
│ $ /nsfwgangbang - Gangbang
│ $ /nsfworgy - Orgía
│ $ /nsfwyuri - Yuri
│ $ /nsfwundress - Desnudarse
│ $ /nsfwstrip - Strip
│ $ /nsfwharem - Harén
│ $ /nsfwsuccubus - Súcubo
│ $ /nsfwincest - Incesto
│ $ /nsfwpee - Pee
│ $ /nsfwcuckold - Cuckold
│ $ /nsfwhgame - Hgame
│ $ /nsfwclassic - Clásico
│ $ /nsfwrandom - Al azar
> Uso: /nsfwhentai (o /nsfwhentai @usuario). Sin etiqueta, la imagen es solo tuya
╰───────────

╭─[ ✧ OWNER ]
│ $ /say texto - El bot envía el texto
│
│ $ /whitelist @usuario - Dar permisos de owner
│
│ $ /unwhitelist @usuario - Quitarlos
│
│ $ /join link - Meter al bot en un grupo (dueño y whitelist)
│
│ $ $ <comando> - Ejecutar un comando en la shell del host (ej: $ npm i). Solo el dueño
│
│ $ /ban @usuario | número - Banear: no puede usar el bot (dueño y whitelist)
│
│ $ /pardon @usuario | número - Desbanear
│
│ $ /delsub número - Eliminar un sub-bot
│
│ $ /backup - Backup a tu privado
╰───────────

⚠  Powered by Vand4lw | ${totalCommands} cmds
─── ✦ ─── ✦ ─── ✦ ───`;
}
// cuenta los comandos de las líneas "│ ..." del menú: los alias ("| /help") cuentan como uno y /NA no cuenta
const countCmds = txt => txt.split('\n').filter(l => l.startsWith('│'))
  .reduce((n, l) => {
    const cmd = l.split(' - ')[0].split('|')[0]; // antes de la descripción y de los alias
    const toks = cmd.match(/(?:^|\s)\/[\p{L}?]+/gu) || [];
    return n + toks.filter(t => t.trim().toLowerCase() !== '/na').length;
  }, 0);

async function sendMenu(m, jid) {
  const sender = m.key.participant || (m.key.fromMe? `${num(sock.user?.id)}@s.whatsapp.net` : jid);
  const base = { botName: botName(), system: ctxBot().id === 'main'? 'Main-Bot' : 'Sub-Bot', user: num(sender), totalCommands: 0 };
  const totalCommands = countCmds(buildMenu(base));
  const px = prefijo(), menu = buildMenu({...base, totalCommands });
  const content = { text: px === '/'? menu : menu.replace(/\/(?=[\p{L}?])/gu, px), mentions: [sender] }; // el menú muestra el prefijo del bot
  // el menú sale como tarjeta con la foto grande arriba: la del bot o, si no cargó una, la de fábrica
  const id = ctxBot().id;
  {
    const web = PUBLIC_URL && HTTP_PORT; // con dominio propio: la foto y la página salen de ahí
    const ad = {
      title: base.botName,
      body: BANNER_BODY,
      thumbnail: await bannerCard(id), // respaldo por si el cliente no alcanza a bajar la URL (la foto entera, sin recorte)
      mediaType: 1,
      renderLargerThumbnail: true,
      showAdAttribution: false,
      sourceUrl: web? `${PUBLIC_URL}/p/${slugOf(id)}` : BANNER_URL,
    };
    if (web) ad.thumbnailUrl = `${PUBLIC_URL}/c/${slugOf(id)}.jpg?v=${bannerVer(id)}`;
    content.contextInfo = { mentionedJid: [sender], externalAdReply: ad };
  }
  await sock.sendMessage(jid, content, { quoted: m });
}

// ---------- sub-bots (instancias fijas: se guardan y se reconectan al reiniciar) ----------
const SUB_DIR = './subbots';
const SUB_FILE = './subbots.json';   // registro: { "<numero>": { name, chat, since } }
const MAX_SUBBOTS = Number(process.env.MAX_SUBBOTS || 2);
const PEND_MS = 2 * 60e3;           // si no se vincula en este tiempo, se borra el intento
let subReg = fs.existsSync(SUB_FILE)? JSON.parse(fs.readFileSync(SUB_FILE)) : {};
const saveSubs = () => fs.writeFileSync(SUB_FILE, JSON.stringify(subReg, null, 2));
const pendientes = new Map();        // numero -> { timer, qrCount }
let QRCode; try { QRCode = require('qrcode'); } catch {}

function bajaSub(numero) {
  const p = pendientes.get(numero); if (p) { clearTimeout(p.timer); pendientes.delete(numero); }
  const inst = instances.get(numero); if (inst) { inst.stopped = true; try { inst.sock.end(undefined); } catch {} instances.delete(numero); }
  delete subReg[numero]; saveSubs();
  delete settings[numero]; saveCfg(); fs.rmSync(bannerPath(numero), { force: true });
  fs.rmSync(`${SUB_DIR}/${numero}`, { recursive: true, force: true });
}

const avisar = (chat, content) => chat && mainSock?.sendMessage(chat, content).catch(() => {});

// en grupos se etiqueta a quien pidió el código / QR
const etiqueta = quien => quien? { tag: `@${num(quien)} `, mentions: [quien] } : { tag: '', mentions: [] };

function opcionesSub(numero, modo, chat, quien) {
  const { tag, mentions } = etiqueta(quien);
  const say = txt => avisar(chat, { text: tag + txt, mentions });
  const abortar = txt => { bajaSub(numero); say(txt); };
  return {
    authDir: `${SUB_DIR}/${numero}`,
    name: subReg[numero]?.name || BOT_NAME,
    pairingNumber: modo === 'code'? numero : null,
    onPairing: code => say(`🔑 Código de vinculación: *${code}*\n\nWhatsApp > Dispositivos vinculados > Vincular con el número de teléfono, e ingresá el código.\n(Vence en pocos minutos)`),
    onQR: async qr => {
      const p = pendientes.get(numero);
      if (!p || modo!== 'qr') return;
      // se manda un solo QR; si llega otro evento de QR es que el anterior ya venció
      if (++p.qrCount > 1) return abortar('⌛ El QR venció. Pedí otro con /qr');
      try {
        const png = await QRCode.toBuffer(qr, { scale: 8 });
        avisar(chat, { image: png, mentions, caption: tag + '📷 Escaneá este QR desde *otro dispositivo* (vence en ~1 minuto): WhatsApp > Dispositivos vinculados > Vincular un dispositivo.' });
      } catch (e) { console.error('[qr]', e.message); }
    },
    onOpen: async s => {
      const p = pendientes.get(numero);
      if (!p) return; // reconexión normal de un sub-bot ya registrado
      // con QR puede escanear cualquier cuenta: tiene que ser la del número que lo pidió
      if (modo === 'qr' && num(s.user?.id)!== numero) {
        const otro = num(s.user?.id);
        try { await s.logout(); } catch {}
        return abortar(`❌ Ese QR lo escaneó otra cuenta (${otro}) y no tu número (${numero}). Se canceló; pedí otro con /qr desde la cuenta que querés vincular.`);
      }
      clearTimeout(p.timer); pendientes.delete(numero);
      subReg[numero] = { name: BOT_NAME, chat, quien, since: Date.now() }; saveSubs();
      say('✅ ¡Listo! Tu sub-bot quedó vinculado y fijo: se reconecta solo cuando el bot se reinicia.\nPara darlo de baja, desvinculalo desde Dispositivos vinculados.');
    },
    // si la conexión se corta antes de vincular, se borra el intento (salvo el reinicio normal que pide WhatsApp al vincular)
    onClose: code => {
      if (!pendientes.has(numero) || code === DisconnectReason.restartRequired) return false;
      abortar(modo === 'qr'? '⌛ El QR venció. Pedí otro con /qr' : '⌛ El código venció o se cortó la conexión. Pedí otro con /code');
      return true;
    },
    onLoggedOut: () => {
      const eraPendiente = pendientes.has(numero);
      bajaSub(numero);
      say(eraPendiente? '❌ No se pudo vincular. Probá de nuevo.' : '🔌 Tu sub-bot se desvinculó y fue dado de baja.');
    },
  };
}

// número del que escribe (en privado o en grupo), sin que lo tenga que poner a mano
async function detectarNumero(m, jid) {
  const esPN = j => typeof j === 'string' && j.endsWith('@s.whatsapp.net');
  const enGrupo = jid.endsWith('@g.us');
  let pn = (enGrupo? [m.key.participantAlt, m.key.participant, m.participant] : [jid, m.key.remoteJidAlt]).find(esPN);
  if (!pn && enGrupo) {
    const meta = await sock.groupMetadata(jid);
    const ids = senderIds(m, jid);
    const p = meta.participants.find(p => idsDe(p).some(x => ids.includes(x)));
    if (p?.phoneNumber) pn = String(p.phoneNumber).includes('@')? p.phoneNumber : `${p.phoneNumber}@s.whatsapp.net`;
  }
  return pn? num(pn) : '';
}

async function subCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const modo = /^\/qr/i.test(text)? 'qr' : 'code';
  const enGrupo = jid.endsWith('@g.us');
  if (ctxBot().id!== 'main') return reply('Solo el bot principal puede crear sub-bots');
  if (modo === 'qr' &&!QRCode) return reply('⚠️ Falta instalar el paquete qrcode (npm i qrcode). Mientras tanto usá /code');

  const numero = (await detectarNumero(m, jid).catch(() => '')) || (text.trim().split(/\s+/)[1] || '').replace(/\D/g, '');
  if (numero.length < 8) return reply(`No pude detectar tu número. Probá por privado o usá: /${modo} 5493331234567`);
  if (botIds().includes(numero)) return reply('Ese número es el del bot principal');
  if (subReg[numero]) return reply('✅ Ese número ya es un sub-bot activo');
  if (pendientes.has(numero)) bajaSub(numero); // reintento: se cancela el intento anterior
  if (Object.keys(subReg).length + pendientes.size >= MAX_SUBBOTS) return reply(`⚠️ Se alcanzó el máximo de sub-bots (${MAX_SUBBOTS})`);

  // el código / QR se manda en el mismo chat donde se pidió (grupo o privado)
  const chat = jid;
  const quien = enGrupo? (m.key.participant || m.key.participantAlt) : null;
  const { tag, mentions } = etiqueta(quien);
  const pend = { qrCount: 0 };
  pend.timer = setTimeout(() => {
    if (pendientes.get(numero)!== pend) return;
    bajaSub(numero);
    avisar(chat, { text: `${tag}⌛ Se agotó el tiempo y se canceló la vinculación. Probá de nuevo con /${modo}`, mentions });
  }, PEND_MS);
  pendientes.set(numero, pend);

  await reply(modo === 'code'? '⏳ Generando código de vinculación...' : '⏳ Generando QR...');
  await als.exit(() => startInstance(numero, opcionesSub(numero, modo, chat, quien)));
}

async function cargarSubbots() {
  // restos de intentos que no se vincularon (por ejemplo, si el bot se reinició a la mitad)
  if (fs.existsSync(SUB_DIR))
    for (const d of fs.readdirSync(SUB_DIR)) if (!subReg[d]) fs.rmSync(`${SUB_DIR}/${d}`, { recursive: true, force: true });
  for (const numero of Object.keys(subReg)) {
    if (!fs.existsSync(`${SUB_DIR}/${numero}`)) { delete subReg[numero]; saveSubs(); continue; }
    try { await als.exit(() => startInstance(numero, opcionesSub(numero, null, subReg[numero].chat, subReg[numero].quien))); }
    catch (e) { console.error(`[sub ${numero}]`, e.message); }
    await sleep(2000);
  }
}

// ---------- en un grupo con varios bots (este proceso), responde solo el más viejo ----------
const edad = inst => inst.id === 'main'? 0 : (subReg[inst.id]?.since?? Infinity);
const eleccion = new Map(); // "instancia|grupo" -> { t, v }
// inicial de un bot: primera letra de su nombre (el que se configura con /setbotname), en minúscula
const inicialDe = id => ((nameOfId(id).match(/\p{L}/u) || [''])[0]).toLowerCase();
async function soyElElegido(jid, ini = null, porPrefijo = false) {
  const yo = ctxBot();
  if (yo.id === 'main') return true; // el principal es el más viejo
  const px = prefijo(yo.id), k = `${yo.id}|${jid}|${ini || ''}|${porPrefijo? px : ''}`, c = eleccion.get(k);
  if (c && Date.now() - c.t < 30e3) return c.v;
  // sin inicial compiten todos los bots del grupo; con inicial, solo los que empiezan con esa letra.
  // Con porPrefijo (comandos), solo compiten los que usan el MISMO prefijo: si el prefijo es distinto, no hace falta la inicial
  const mayores = [...instances.values()].filter(i => i.id!== yo.id && i.online && edad(i) < edad(yo) && (!ini || inicialDe(i.id) === ini) && (!porPrefijo || prefijo(i.id) === px));
  let v = true;
  if (mayores.length) {
    try {
      const miembros = (await sock.groupMetadata(jid)).participants.flatMap(idsDe);
      v =!mayores.some(i => [i.sock.user?.id, i.sock.user?.lid].filter(Boolean).map(num).some(x => miembros.includes(x)));
    } catch { v = true; }
  }
  eleccion.set(k, { t: Date.now(), v });
  return v;
}

// ---------- stickers (/s) ----------
let sharp; try { sharp = require('sharp'); } catch {}
const MAX_STICKERS = 30;           // tope de stickers por pedido (un álbum de WhatsApp llega hasta ahí)
const albumCache = new Map();      // idDelAlbum -> { jid, t, items: [{ m, hecho }] }
const albumsSticker = new Map();   // idDelAlbum -> { jid, hasta }: álbumes a los que ya se les pidió /s
const colaSticker = new Map();     // jid -> promesa: los stickers de cada chat salen de a uno, en orden
const sleepMs = ms => new Promise(r => setTimeout(r, ms));

// id del álbum al que pertenece una foto (si es parte de un álbum)
function albumPadre(m) {
  const a = m.message?.messageContextInfo?.messageAssociation || m.message?.imageMessage?.contextInfo?.messageAssociation;
  const esAlbum = a && (a.associationType === 1 || a.associationType === 'MEDIA_ALBUM');
  return esAlbum? (a.parentMessageKey?.id || null) : null;
}
function guardarAlbum(padre, m, jid) {
  let a = albumCache.get(padre);
  if (!a) { a = { jid, t: Date.now(), items: [] }; albumCache.set(padre, a); }
  if (!a.items.some(i => i.m.key.id === m.key.id)) a.items.push({ m, hecho: false });
  if (albumCache.size > 200) { // se descartan los más viejos
    for (const [k] of [...albumCache.entries()].sort((x, y) => x[1].t - y[1].t).slice(0, 50)) albumCache.delete(k);
  }
}
setInterval(() => {
  const lim = Date.now() - 30 * 60e3;
  for (const [k, a] of albumCache) if (a.t < lim) albumCache.delete(k);
  for (const [k, v] of albumsSticker) if (v.hasta < Date.now()) albumsSticker.delete(k);
}, 5 * 60e3).unref();

// imagen -> WebP 512x512 con fondo transparente: no se estira, no se recorta y las fotos chicas no se agrandan
async function aSticker(buf, meta) {
  const base = await sharp(buf).rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).toBuffer();
  let q = 80, out;
  do { // los stickers tienen que pesar menos de ~100 KB: si se pasa, se baja la calidad
    out = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: base, gravity: 'center' }])
      .webp({ quality: q, alphaQuality: 100 }).toBuffer();
    q -= 15;
  } while (out.length > 100 * 1024 && q >= 25);
  return meta? webpConMeta(out, meta.pack, meta.autor) : out;
}

async function enviarSticker(jid, fuente, quoted, meta) {
  const buf = await downloadMediaMessage(fuente, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
  await sock.sendMessage(jid, { sticker: await aSticker(buf, meta) }, quoted? { quoted } : {});
}

// encola una tarea del chat (respeta la instancia: principal o sub-bot)
function cola(jid, tarea) {
  const inst = als.getStore();
  const sig = (colaSticker.get(jid) || Promise.resolve()).then(() => als.run(inst, tarea)).catch(console.error);
  colaSticker.set(jid, sig);
  sig.finally(() => { if (colaSticker.get(jid) === sig) colaSticker.delete(jid); });
}

// foto de un álbum que llega después de pedir /s: se convierte sola
function stickerHijo(padre, m, jid) {
  const cfg = albumsSticker.get(padre);
  if (!cfg || cfg.jid!== jid) return;
  const item = albumCache.get(padre)?.items.find(i => i.m.key.id === m.key.id);
  if (!item || item.hecho) return;
  item.hecho = true;
  cola(jid, async () => {
    try { await enviarSticker(jid, m, null, socMetaDe(senderIds(m, jid))); }
    catch (e) { item.hecho = false; console.error('[sticker]', e.message); }
    await sleepMs(500);
  });
}

async function stickerCmd(m, jid) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!sharp) return reply('⚠️ Falta instalar el paquete sharp (npm i sharp)');
  const ctx = m.message.extendedTextMessage?.contextInfo;
  const q = ctx?.quotedMessage;
  const orden = i => i.m.message?.messageContextInfo?.messageAssociation?.messageIndex?? 0;
  let fuentes;
  if (m.message.imageMessage) {
    const padre = albumPadre(m);
    if (padre) { // foto de un álbum con /s: se hacen todas las del álbum y las que lleguen después
      albumsSticker.set(padre, { jid, hasta: Date.now() + 2 * 60e3 });
      fuentes = (albumCache.get(padre)?.items || []).filter(i =>!i.hecho);
      if (!fuentes.some(i => i.m.key.id === m.key.id)) fuentes.push({ m, hecho: false });
    } else fuentes = [{ m, hecho: false }];
  } else if (q?.albumMessage) { // respondiendo al álbum: todas las fotos
    const a = albumCache.get(ctx.stanzaId);
    if (!a ||!a.items.length) return reply('❌ No encontré las fotos de ese álbum (las guardo un rato, y solo mientras el bot está encendido). Probá respondiendo a cada foto con /s.');
    fuentes = a.items.slice();
  } else if (q?.imageMessage) { // respondiendo a una foto
    fuentes = [{ m: { key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: q }, hecho: false }];
  } else return reply('Respondé a una foto con /s, o mandá una foto con el texto /s.\n(Si respondés a un álbum, convierto todas las fotos.)');

  fuentes.sort((x, y) => orden(x) - orden(y));
  const recortado = fuentes.length > MAX_STICKERS;
  if (recortado) fuentes = fuentes.slice(0, MAX_STICKERS);
  fuentes.forEach(f => { f.hecho = true; });
  if (fuentes.length > 1) await reply(`🖼️ Armando ${fuentes.length} stickers${recortado? ` (máximo ${MAX_STICKERS} por pedido)` : ''}...`);

  const metaSt = socMetaDe(senderIds(m, jid));   // pack y autor del que pidió el sticker (/setmeta)
  cola(jid, async () => {
    let n = 0, fallas = 0;
    for (const f of fuentes) {
      try { await enviarSticker(jid, f.m, n === 0? m : null, metaSt); n++; }
      catch (e) { console.error('[sticker]', e.message); f.hecho = false; fallas++; }
      if (fuentes.length > 1) await sleepMs(500);
    }
    if (fallas) sock.sendMessage(jid, { text: `⚠️ No pude convertir ${fallas} imagen(es).` }, { quoted: m }).catch(() => {});
  });
}

// ---------- prefijo por bot (cada instancia tiene el suyo) ----------
const prefijo = (id = ctxBot().id) => cfgOf(id).prefix || '/';
// pasa el prefijo del bot a "/" para que el resto del código funcione igual; si no empieza con el prefijo, no es comando.
// También acepta "inicial + prefijo + comando" (ej: J/s) y devuelve la inicial (en minúscula) en ini
function normalizar(t, px) {
  if (!t) return { t: '', ini: null };
  if (/^\/setprefix(\s|$)/i.test(t)) return { t, ini: null }; // con "/" siempre anda, así nadie se queda sin poder cambiarlo
  if (t.startsWith(px)) return { t: '/' + t.slice(px.length), ini: null };
  const c = Array.from(t)[0], resto = t.slice(c.length);
  if (/^\p{L}$/u.test(c)) {
    if (resto.startsWith(px)) return { t: '/' + resto.slice(px.length), ini: c.toLowerCase() };
    if (/^\/setprefix(\s|$)/i.test(resto)) return { t: resto, ini: c.toLowerCase() };
  }
  return { t: '', ini: null };
}
async function setPrefix(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const id = ctxBot().id;
  // solo el dueño del bot: la cuenta del sub-bot, o el creador en el principal
  const dueno = id === 'main'? await isOwner(m, jid) : senderIds(m, jid).includes(id);
  if (!dueno) return;
  const arg = limpiar(text.replace(/^\/setprefix\s*/i, ''));
  if (!arg) return reply(`Prefijo actual: *${prefijo()}*\nUso: /setprefix <un símbolo o letra> (ej: $ # . S)\n/setprefix reset - volver a /`);
  if (/^(reset|default)$/i.test(arg)) { setCfg(id, { prefix: null }); eleccion.clear(); return reply('✅ Prefijo vuelto a */*'); }
  const ch = Array.from(arg);
  if (ch.length!== 1 ||!/^[\p{L}\p{P}\p{S}]$/u.test(ch[0])) return reply('❌ Tiene que ser un solo símbolo o letra (ej: $ # . ! S)');
  setCfg(id, { prefix: ch[0] === '/'? null : ch[0] });
  eleccion.clear();
  await reply(`✅ Prefijo cambiado a *${ch[0]}*\nAhora se usa así: ${ch[0]}menu`);
}

// ---------- /sub y /delsub ----------
async function subList(m, jid) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const nums = Object.keys(subReg), pend = [...pendientes.keys()].filter(n =>!subReg[n]);
  if (!nums.length &&!pend.length) return reply('No hay sub-bots activos');
  const fecha = ms => ms? new Date(ms).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '?';
  const lineas = nums.map((n, i) => `${i + 1}. ${n} - ${nameOfId(n)}\n   ${instances.get(n)?.online? '🟢 en línea' : '🔴 desconectado'} · desde ${fecha(subReg[n].since)}`);
  pend.forEach(n => lineas.push(`• ${n}\n   ⏳ vinculando...`));
  await reply(`🤖 Sub-bots (${nums.length}/${MAX_SUBBOTS})\n\n${lineas.join('\n')}`);
}
async function delSub(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!(await isOwner(m, jid))) return; // solo el creador
  let numero = (text.trim().split(/\s+/)[1] || '').replace(/\D/g, '');
  if (!numero) return reply('Uso: /delsub 5493331234567\n(los números se ven con /sub)');
  if (numero.length < 4 && Object.keys(subReg)[Number(numero) - 1]) numero = Object.keys(subReg)[Number(numero) - 1]; // también acepta la posición de la lista
  if (!subReg[numero] &&!pendientes.has(numero)) return reply('❌ Ese número no es un sub-bot');
  await reply(`🗑️ Sub-bot ${numero} eliminado`);
  const inst = instances.get(numero);
  if (inst) {
    inst.stopped = true; // para que el cierre no dispare reconexión ni otro borrado
    if (inst.online) await Promise.race([inst.sock.logout().catch(() => {}), sleep(4000)]); // lo desvincula también de la cuenta
  }
  bajaSub(numero);
}

// ---------- /backup (solo el creador, solo desde el bot principal) ----------
async function backupCmd(m, jid) {
  if (ctxBot().id!== 'main' ||!(await isOwner(m, jid))) return;
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const dest = `${OWNER}@s.whatsapp.net`;
  try { saveGemNow(); saveEcoNow(); socGuardarTodo(); } catch {}
  const archivos = [__filename, FILE, MUTES, WL, NSFW_FILE, NOMBRES_FILE, MOD_FILE, ACT_FILE, GRP_FILE, PERF_FILE, CFG, SUB_FILE, GEM_FILE, ECO_FILE].filter(f => fs.existsSync(f));
  try {
    for (const f of archivos) {
      const nombre = f.split('/').pop();
      await mainSock.sendMessage(dest, { document: fs.readFileSync(f), fileName: nombre, mimetype: nombre.endsWith('.js')? 'text/javascript' : 'application/json' });
      await sleep(400);
    }
    if (jid!== dest) await reply(`📦 Backup enviado a tu privado (${archivos.length} archivos)`);
  } catch (e) { console.error('[backup]', e.message); await reply('❌ No pude mandar el backup: ' + e.message); }
}

// ---------- /gemini (key en la variable GEMINI_API_KEY; modelo en GEMINI_MODEL) ----------
const GEM_FILE = './gemini.json';                                        // { off: { "inst|chat": true }, mem: { "inst|chat|usuario": { t, h: [...] } } }
const GEM_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const GEM_TURNOS = 10;      // pares pregunta/respuesta que recuerda por grupo y usuario
const GEM_MAX_MEM = 300;    // máximo de conversaciones guardadas (se borran las más viejas)
const GEM_SISTEMA = 'Sos un asistente dentro de WhatsApp. Respondé en el idioma de quien escribe (por defecto español rioplatense), claro y breve (máximo ~1500 caracteres). Usá el formato de WhatsApp: *negrita*, _cursiva_ y listas con "-". Sin títulos con # ni tablas.';
let gem = { off: {}, mem: {} };
try { if (fs.existsSync(GEM_FILE)) gem = { off: {}, mem: {},...JSON.parse(fs.readFileSync(GEM_FILE)) }; } catch {}
const saveGemNow = () => fs.writeFileSync(GEM_FILE, JSON.stringify(gem));
let gemTimer; const saveGem = () => { clearTimeout(gemTimer); gemTimer = setTimeout(() => { try { saveGemNow(); } catch {} }, 1000); };
// la key puede estar como GEMINI_API_KEY o GOOGLE_API_KEY, en las variables del panel o en un archivo .env
function geminiKey() {
  const e = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (e) return e.trim();
  try {
    const m = fs.readFileSync('./.env', 'utf8').match(/^\s*(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.+?)\s*$/m);
    return m? m[1].replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}
const aWhatsapp = t => t.replace(/^\s*\*\s+/gm, '- ').replace(/^#{1,6}\s+(.+)$/gm, '*$1*').replace(/\*\*(.+?)\*\*/g, '*$1*');

async function geminiCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const id = ctxBot().id, kc = `${id}|${jid}`;
  const arg = text.replace(/^\/gemini\s*/i, '').trim();
  const sub = arg.toLowerCase();

  if (sub === 'on' || sub === 'off') {
    const ok = !jid.endsWith('@g.us') || (await puedePersonalizar(m, jid)) || (await isAdmin(jid, m).catch(() => false));
    if (!ok) return reply('Solo los admins pueden activar o desactivar Gemini');
    if (sub === 'off') gem.off[kc] = true; else delete gem.off[kc];
    saveGem();
    return reply(sub === 'off'? '😴 Gemini desactivado en este chat' : '✅ Gemini activado en este chat');
  }
  if (gem.off[kc]) return reply('😴 Gemini está desactivado en este chat (/gemini on para activarlo)');

  const key = geminiKey();
  if (!key) return reply('⚠️ Falta la variable GEMINI_API_KEY (o GOOGLE_API_KEY) en el hosting');

  const km = `${kc}|${senderIds(m, jid)[0]}`;
  if (/^(reset|olvidar)$/.test(sub)) { delete gem.mem[km]; saveGem(); return reply('🧹 Listo, me olvidé de lo que hablamos'); }

  const ctx = m.message.extendedTextMessage?.contextInfo, q = ctx?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '').trim() : '';
  if (!arg &&!qt) return reply('Uso: /gemini <pregunta>\nSi respondés a un mensaje, lo uso de contexto.\n/gemini on | off | reset');
  const pregunta = (qt? `[Mensaje citado]: "${qt.slice(0, 2000)}"\n\n` : '') + (arg || 'Comentá o respondé sobre ese mensaje.');

  const hist = gem.mem[km]?.h || [];
  sock.sendPresenceUpdate('composing', jid).catch(() => {});
  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEM_MODEL)}:generateContent`,
      { systemInstruction: { parts: [{ text: GEM_SISTEMA }] }, contents: [...hist, { role: 'user', parts: [{ text: pregunta }] }], generationConfig: { maxOutputTokens: 2048 } },
      { headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const out = (r.data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!out) return reply(r.data?.promptFeedback?.blockReason? '🚫 Gemini bloqueó ese mensaje' : '🤷 Gemini no devolvió respuesta, probá de nuevo');
    gem.mem[km] = { t: Date.now(), h: [...hist, { role: 'user', parts: [{ text: pregunta.slice(0, 2000) }] }, { role: 'model', parts: [{ text: out.slice(0, 2000) }] }].slice(-GEM_TURNOS * 2) };
    const claves = Object.keys(gem.mem);
    if (claves.length > GEM_MAX_MEM) claves.sort((a, b) => gem.mem[a].t - gem.mem[b].t).slice(0, claves.length - GEM_MAX_MEM).forEach(k => delete gem.mem[k]);
    saveGem();
    await reply(aWhatsapp(out).slice(0, 4000));
  } catch (e) {
    const st = e.response?.status, msg = e.response?.data?.error?.message || e.message;
    console.error('[gemini]', st, msg);
    if (st === 429) return reply('⏳ Se alcanzó el límite gratuito de Gemini (por minuto o por día). Probá en un rato');
    if (st === 400 && /API key/i.test(msg)) return reply('⚠️ La API key de Gemini no es válida');
    if (st === 403) return reply('⚠️ La API key de Gemini no tiene permiso (o no está habilitada en tu región)');
    if (st === 404) return reply(`⚠️ El modelo "${GEM_MODEL}" no existe. Cambialo con la variable GEMINI_MODEL`);
    await reply(`❌ Error de Gemini${st? ` (${st})` : ''}, probá de nuevo`);
  }
}

// ---------- /tt /tiktok: video sin marca de agua o slides (tikwm primero, ssstik.io de respaldo) ----------
const TT_MAX = (Number(process.env.MAX_MB) || 200) * 1024 * 1024;   // tope de tamaño de TODAS las descargas (por defecto 200 MiB; se cambia con MAX_MB en el .env)
const TT_DIR = './tmp_tt';          // descargas temporales (se borran solas)
const TT_RE = /https?:\/\/(?:[\w-]+\.)?tiktok\.com\/[^\s<>"']+/i;
const TT_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const TT_ALBUM = 30;                // fotos por álbum
fs.rmSync(TT_DIR, { recursive: true, force: true });

let ttUltimo = 0; // tikwm deja 1 pedido por segundo: se espacian
async function ttTikwm(ruta, params) {
  for (let intento = 0; intento < 2; intento++) {
    const espera = ttUltimo + 1200 - Date.now(); ttUltimo = Math.max(Date.now(), ttUltimo + 1200);
    if (espera > 0) await sleep(espera);
    const r = await axios.post('https://www.tikwm.com' + ruta, new URLSearchParams(params).toString(), {
      timeout: 20000, headers: { 'User-Agent': TT_UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    });
    if (r.data?.code === 0 && r.data.data) return r.data.data;
    if (!/limit/i.test(r.data?.msg || '')) throw new Error('tikwm: ' + (r.data?.msg || 'sin datos'));
  }
  throw new Error('tikwm: límite de pedidos');
}
const ttUrl = u => !u? '' : u.startsWith('//')? 'https:' + u : u.startsWith('/')? 'https://www.tikwm.com' + u : u;
function ttItem(d) { // respuesta de tikwm -> { videos: [urls], images: [urls], music: url, caption }
  const imgs = (d.images || []).map(ttUrl).filter(Boolean);
  const videos = imgs.length? [] : [...new Set([d.hdplay, d.play].map(ttUrl).filter(Boolean))];
  if (!imgs.length &&!videos.length) throw new Error('tikwm: sin archivos');
  const autor = d.author?.unique_id || '';
  return { videos, images: imgs, music: ttUrl(d.music || d.music_info?.play || ''), caption: `${autor? '🎵 @' + autor + '\n' : ''}${(d.title || '').slice(0, 400)}`.trim() };
}
const ttPorLink = async link => ttItem(await ttTikwm('/api/', { url: link, hd: 1 }));
async function ttPorBusqueda(q) {
  const d = await ttTikwm('/api/feed/search', { keywords: q, count: 5, cursor: 0, web: 1, hd: 1 });
  const v = (d.videos || [])[0];
  if (!v) throw new Error('SIN_RESULTADOS');
  return ttItem(v);
}
// respaldo: ssstik.io (no tiene API: se lee su página, se saca el token y se parsea el HTML que devuelve)
async function ttSsstik(link) {
  const H = { 'User-Agent': TT_UA, 'Accept-Language': 'en-US,en;q=0.9' };
  const home = await axios.get('https://ssstik.io/en', { headers: H, timeout: 15000 });
  const html = String(home.data);
  const tt = (html.match(/tt\s*:\s*(?:'|&#39;|&quot;|")([^'"&]+)/) || [])[1];
  const ruta = (html.match(/hx-post="([^"]+)"/) || [])[1] || '/abc?url=dl';
  if (!tt) throw new Error('ssstik: no encontré el token');
  const r = await axios.post(new URL(ruta.replace(/&amp;/g, '&'), 'https://ssstik.io/').href, new URLSearchParams({ id: link, locale: 'en', tt }).toString(), {
    timeout: 20000,
    headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'HX-Request': 'true', 'HX-Target': 'target', 'HX-Current-URL': 'https://ssstik.io/en', Origin: 'https://ssstik.io', Referer: 'https://ssstik.io/en' },
  });
  const h = String(r.data);
  const anchors = [...h.matchAll(/<a\b([^>]*)>/gi)].map(x => ({ cls: (x[1].match(/class="([^"]*)"/) || [])[1] || '', href: ((x[1].match(/href="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&') })).filter(a => /^https?:/.test(a.href));
  const esImg = a => /slide|photo|image/i.test(a.cls) || /\.(jpe?g|webp|png|heic)(\?|$)/i.test(a.href) || /photomode|tos-[\w-]*-i-/i.test(a.href);
  const imgs = [...new Set(anchors.filter(a =>!/music|mp3/i.test(a.cls) && esImg(a)).map(a => a.href))];
  const vid = anchors.find(a => /without_watermark/i.test(a.cls) &&!/music|mp3/i.test(a.cls) &&!esImg(a));
  const titulo = (h.match(/<p[^>]*class="[^"]*maintext[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '';
  const caption = titulo.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim().slice(0, 400);
  const musica = anchors.find(a => /music|mp3/i.test(a.cls) || /\.mp3(\?|$)/i.test(a.href));
  if (imgs.length) return { videos: [], images: imgs, music: musica?.href || '', caption };
  if (vid) return { videos: [vid.href], images: [], caption };
  throw new Error('ssstik: no encontré el video en la respuesta');
}

async function ttBajar(url, dest, referer = 'https://www.tiktok.com/') {
  const r = await axios.get(url, { responseType: 'stream', timeout: 30000, maxRedirects: 5, headers: { 'User-Agent': TT_UA, Referer: referer } });
  if (/text\/html|json/i.test(r.headers['content-type'] || '')) { r.data.destroy(); throw new Error('el enlace no devolvió un video'); }
  if (Number(r.headers['content-length'] || 0) > TT_MAX) { r.data.destroy(); throw new Error('GRANDE'); }
  await new Promise((ok, mal) => {
    let n = 0; const w = fs.createWriteStream(dest);
    r.data.on('data', c => { n += c.length; if (n > TT_MAX) { r.data.destroy(); w.destroy(); mal(new Error('GRANDE')); } });
    r.data.on('error', mal); w.on('error', mal); w.on('finish', ok);
    r.data.pipe(w);
  });
}
const TT_FOTO_S = 15, TT_FOTOS_MAX = 35;   // cada foto dura 15 s en el video de slides (hasta 35 fotos)
// slides: arma un video vertical (720x1280, cada foto entera sobre un fondo borroso de sí misma) con la música de fondo repetida hasta cubrir todo
async function ttSlidesVideo(it) {
  if (!sharp) throw new Error('falta sharp');
  fs.mkdirSync(TT_DIR, { recursive: true });
  const base = `${TT_DIR}/s_${Date.now()}_${Math.random().toString(36).slice(2)}`, fotos = [];
  try {
    for (const u of it.images.slice(0, TT_FOTOS_MAX)) {
      try {
        const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 30e6, headers: { 'User-Agent': TT_UA, Referer: 'https://www.tiktok.com/' } });
        const buf = Buffer.from(r.data), f = `${base}_${fotos.length}.jpg`;
        const fondo = await sharp(buf).rotate().resize(720, 1280, { fit: 'cover' }).blur(25).modulate({ brightness: 0.6 }).jpeg({ quality: 60 }).toBuffer();
        const frente = await sharp(buf).rotate().resize(720, 1280, { fit: 'inside' }).toBuffer();
        await sharp(fondo).composite([{ input: frente, gravity: 'centre' }]).jpeg({ quality: 85 }).toFile(f);
        fotos.push(f);
      } catch (e) { console.error('[tt] foto del video falló:', e.message); }
    }
    if (!fotos.length) throw new Error('ninguna foto se pudo preparar');
    let audio = null;
    if (it.music) { try { audio = `${base}.mp3`; await ttBajar(it.music, audio); } catch (e) { console.error('[tt] música falló:', e.message); audio = null; fs.rmSync(`${base}.mp3`, { force: true }); } }
    const total = fotos.length * TT_FOTO_S, lista = `${base}.txt`, salida = `${base}.mp4`;
    fs.writeFileSync(lista, fotos.map(f => `file '${path.resolve(f)}'\nduration ${TT_FOTO_S}`).join('\n') + `\nfile '${path.resolve(fotos[fotos.length - 1])}'\n`);
    const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lista];
    if (audio) args.push('-stream_loop', '-1', '-i', audio);
    args.push('-t', String(total), '-r', '4', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '30', '-pix_fmt', 'yuv420p', '-threads', '1');
    if (audio) args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '128k', '-af', `afade=t=out:st=${Math.max(0, total - 2)}:d=2`);
    args.push('-movflags', '+faststart', salida);
    await execP('ffmpeg', args, { timeout: 300000 });
    if (fs.statSync(salida).size > TT_MAX) throw new Error('GRANDE');
    return { archivo: salida, audio: !!audio, fotos: fotos.length, segundos: total };
  } finally { for (const f of fotos) fs.rmSync(f, { force: true }); fs.rmSync(`${base}.mp3`, { force: true }); fs.rmSync(`${base}.txt`, { force: true }); }
}
async function ttEnviar(m, jid, it) {
  let citar = m;
  if (it.images.length && await ytTieneFfmpeg()) {   // slides como video con música; si algo falla se mandan las fotos como antes
    let v = null;
    try {
      v = await ttSlidesVideo(it);
      const peso = fs.statSync(v.archivo).size, video = peso <= 40 * 1048576? fs.readFileSync(v.archivo) : { url: v.archivo };
      const sent = await sock.sendMessage(jid, { video, mimetype: 'video/mp4', caption: it.caption }, { quoted: m });
      console.log(`[tt] slides como video: ${v.fotos} foto(s), ${v.segundos} s, ${v.audio? 'con' : 'sin'} música, ${(peso / 1048576).toFixed(1)} MB`);
      return sent;
    } catch (e) { console.error('[tt] slides a video falló, mando las fotos:', e.message); }
    finally { if (v?.archivo) fs.rmSync(v.archivo, { force: true }); }
  }
  if (it.images.length) { // slides (fotos sueltas: sin ffmpeg o si falló el video)
    // con Baileys 7.0.0-rc14 el envío como álbum (album: [...]) no mandaba nada, así que por defecto van de a una;
    // con la variable TT_ALBUM=1 prueba primero el álbum y, si falla, de a una
    const probar = process.env.TT_ALBUM === '1';
    for (let i = 0; i < it.images.length; i += TT_ALBUM) {
      const grupo = it.images.slice(i, i + TT_ALBUM).map((u, j) => ({ image: { url: u },...(i === 0 && j === 0 && it.caption? { caption: it.caption } : {}) }));
      let hecho = false;
      if (probar) {
        try { await sock.sendMessage(jid, { album: grupo }, { quoted: citar }); hecho = true; console.log('[tt] álbum enviado'); }
        catch (e) { console.error('[tt] álbum:', e.message); }
      }
      if (!hecho) {
        let n = 0;
        for (const g of grupo) {
          try { await sock.sendMessage(jid, g, { quoted: citar }); n++; }
          catch (e) { console.error('[tt] foto falló:', e.message); }
          await sleep(500);
        }
        console.log(`[tt] fotos enviadas: ${n}/${grupo.length}`);
        if (!n) throw new Error('no se pudo enviar ninguna foto');
      }
      citar = null;
    }
    return;
  }
  fs.mkdirSync(TT_DIR, { recursive: true });
  let ultimo;
  for (const u of it.videos) { // primero la versión HD; si pesa de más, la normal
    const f = `${TT_DIR}/${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
    try {
      await ttBajar(u, f);
      const peso = fs.statSync(f).size;
      console.log(`[tt] bajado ${(peso / 1048576).toFixed(1)} MB de ${u.slice(0, 80)}`);
      // los chicos se mandan desde memoria (más seguro con Baileys); los grandes desde el archivo para no llenar la RAM
      const video = peso <= 40 * 1048576? fs.readFileSync(f) : { url: f };
      const sent = await sock.sendMessage(jid, { video, mimetype: 'video/mp4', caption: it.caption }, { quoted: m });
      console.log('[tt] video enviado', sent?.key?.id || '(sin id)');
      return sent;
    } catch (e) { ultimo = e; }
    finally { fs.rmSync(f, { force: true }); }
  }
  throw ultimo || new Error('sin video');
}

async function tiktokCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/(tt|tiktok)\s*/i, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '') : '';
  const quitar = l => l && l.replace(/[)\].,;!?]+$/, '');
  const link = quitar((arg.match(TT_RE) || qt.match(TT_RE) || [])[0]);
  if (!link &&!arg) return reply('Uso:\n/tt <link de TikTok>\n/tt (respondiendo a un mensaje con el link)\n/tt <búsqueda>');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  console.log('[tt] pedido:', link || `búsqueda "${arg}"`);
  try {
    let it;
    if (link) {
      try { it = await ttPorLink(link); }
      catch (e) { console.error('[tt] tikwm falló, pruebo ssstik:', e.message); it = await ttSsstik(link); }
    } else it = await ttPorBusqueda(arg);
    console.log(`[tt] listo: ${it.videos.length} video(s), ${it.images.length} foto(s)`);
    await ttEnviar(m, jid, it);
  } catch (e) {
    console.error('[tt] ERROR', e.response?.status || '', e.stack || e.message);
    await reply(e.message === 'GRANDE'? `❌ El video pesa más de ${TT_MAX / 1024 / 1024} MB` : e.message === 'SIN_RESULTADOS'? '🔎 No encontré videos con esa búsqueda' : '❌ No pude descargarlo. Revisá que el link sea público y probá de nuevo');
  } finally { reaccion(''); }
}

// ---------- /ytaudio /ytvideo: YouTube con yt-dlp (se baja solo) y, si YouTube lo bloquea, respaldo por API tipo cobalt ----------
// Variables .env opcionales: YTDLP_PATH (ruta a tu yt-dlp), YT_COOKIES (cookies.txt), YT_PROXY, COBALT_API (+ COBALT_KEY) para el respaldo.
const { execFile, spawn } = require('child_process');
const YT_RE = /https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"']+/i;
const YT_DIR = './bin';
let ytBinPromesa = null, ytUltUpdate = 0, ytFfmpeg = null;
const execP = (cmd, args, opts = {}) => new Promise((ok, mal) =>
  execFile(cmd, args, { timeout: 20 * 60e3, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, so, se) => err? mal(Object.assign(err, { stderr: String(se || '') })) : ok({ out: String(so), err: String(se || '') })));

// consigue el yt-dlp: el tuyo (YTDLP_PATH), el que ya está en ./bin o lo baja de GitHub (binario sin dependencias)
function ytBinario() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) return Promise.resolve(process.env.YTDLP_PATH);
  const ruta = `${YT_DIR}/yt-dlp`;
  if (fs.existsSync(ruta)) return Promise.resolve(ruta);
  if (!ytBinPromesa) ytBinPromesa = (async () => {
    fs.mkdirSync(YT_DIR, { recursive: true });
    const nombre = process.arch === 'arm64'? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
    const tmp = `${ruta}.part`;
    console.log(`[yt] bajando ${nombre} de GitHub (solo la primera vez)...`);
    await ttBajar(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${nombre}`, tmp, 'https://github.com/');
    fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, ruta);
    await execP(ruta, ['--version'], { timeout: 60000 }); // si no corre (arquitectura, permisos) falla acá y no queda roto
    console.log('[yt] yt-dlp listo');
    return ruta;
  })().catch(e => { fs.rmSync(`${YT_DIR}/yt-dlp.part`, { force: true }); fs.rmSync(ruta, { force: true }); throw e; }).finally(() => { ytBinPromesa = null; });
  return ytBinPromesa;
}
async function ytTieneFfmpeg() {
  if (ytFfmpeg === null) ytFfmpeg = await execP('ffmpeg', ['-version'], { timeout: 10000 }).then(() => true, () => false);
  return ytFfmpeg;
}
// de a una descarga por vez (el hosting tiene poca RAM)
let ytCola = Promise.resolve(), ytEnCola = 0;
async function ytTurno(fn) {
  ytEnCola++; const antes = ytCola; let fin; ytCola = new Promise(r => { fin = r; });
  try { await antes; return await fn(); } finally { ytEnCola--; fin(); }
}

const YT_DEBUG = process.env.YT_DEBUG === '1';
// Plugin chiquito para yt-dlp. El tiempo de YouTube se iba en que, EN CADA descarga, node volvía a analizar los ~2 MB de JavaScript
// del reproductor de YouTube (6 a 18 s de CPU en un host chico). yt-dlp trae apagada la caché de ese análisis; este plugin la prende,
// así el análisis se hace una sola vez por versión del reproductor y las demás descargas lo reutilizan.
const YT_PLUGIN_PY = `# generado por el bot, no hace falta tocarlo
try:
    from yt_dlp.extractor.youtube.jsc._builtin.node import NodeJCP
    from yt_dlp.extractor.youtube.jsc.provider import register_preference, register_provider

    @register_provider
    class FastNodeJCP(NodeJCP):
        PROVIDER_NAME = 'fastnode'
        _ENABLE_PREPROCESSED_PLAYER_CACHE = True

    @register_preference(FastNodeJCP)
    def _fastnode_preference(provider, requests):
        return 1000
except Exception:
    pass
`;
let ytPluginListo = false, ytLimpiezaUlt = 0;
function ytPlugin() {
  const dir = path.resolve(YT_DIR, 'plugins');
  if (!ytPluginListo) {
    try {
      const f = path.join(dir, 'fastjsc', 'yt_dlp_plugins', 'extractor', 'fastjsc.py');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== YT_PLUGIN_PY) fs.writeFileSync(f, YT_PLUGIN_PY);
      ytPluginListo = true;
    } catch (e) { console.error('[yt] no pude escribir el plugin de caché (sigue andando, solo más lento):', e.message); return null; }
  }
  return dir;
}
// cada reproductor analizado ocupa varios MB: se dejan los 3 más nuevos y se borra el resto
function ytLimpiarCache() {
  if (Date.now() - ytLimpiezaUlt < 6 * 3600e3) return;
  ytLimpiezaUlt = Date.now();
  try {
    const d = `${YT_DIR}/cache/challenge-solver`;
    const lista = fs.readdirSync(d).filter(n => n.startsWith('player')).map(n => ({ n, t: fs.statSync(`${d}/${n}`).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const x of lista.slice(3)) fs.rmSync(`${d}/${x.n}`, { force: true });
  } catch {}
}
// argumentos comunes: motor de JavaScript, caché (así no resuelve el reproductor de YouTube en cada pedido), cookies y proxy
function ytArgsBase() {
  fs.mkdirSync(`${YT_DIR}/cache`, { recursive: true });
  ytLimpiarCache();
  const a = ['--js-runtimes', `node:${process.execPath}`, '--cache-dir', `${YT_DIR}/cache`];
  const plug = ytPlugin(); if (plug) a.push('--plugin-dirs', plug);
  if (process.env.YT_COOKIES && fs.existsSync(process.env.YT_COOKIES)) a.push('--cookies', process.env.YT_COOKIES);
  if (process.env.YT_PROXY) a.push('--proxy', process.env.YT_PROXY);
  a.push(...(process.env.YT_ARGS || '').split(/\s+/).filter(Boolean));   // argumentos extra de yt-dlp para probar cosas (sin comillas ni espacios dentro de un argumento)
  return a;
}
// con YT_DEBUG=1 muestra cada paso de yt-dlp con su tiempo, para ver qué es lo que tarda
function ytEjecutar(bin, args) {
  if (!YT_DEBUG) return execP(bin, args);
  return new Promise((ok, mal) => {
    const t0 = Date.now(); let out = '', err = '';
    const p = spawn(bin, ['-v', ...args]);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; for (const l of String(d).split('\n')) if (l.trim()) console.log(`[yt +${((Date.now() - t0) / 1000).toFixed(1)}s] ${l.trim().slice(0, 220)}`); });
    p.on('error', mal);
    p.on('close', c => c === 0? ok({ out, err }) : mal(Object.assign(new Error('yt-dlp salió con código ' + c), { stderr: err })));
    setTimeout(() => p.kill('SIGKILL'), 20 * 60e3).unref();
  });
}
// al arrancar el worker: una pasada de prueba para que la primera descarga real no pague el "arranque en frío"
async function ytCalentar() {
  const t0 = Date.now();
  try {
    const bin = await ytBinario();
    await execP(bin, ['--no-warnings', '-q', '--simulate', '--no-playlist', '-f', 'bestaudio', '--print', '%(id)s', ...ytArgsBase(), 'https://www.youtube.com/watch?v=jNQXAC9IVRw'], { timeout: 180000 });
    console.log(`[yt] calentamiento listo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) { console.error('[yt] el calentamiento falló (no pasa nada):', String(e.stderr || e.message).slice(-200)); }
}

// yt-dlp: devuelve { archivo, titulo }
async function ytDlp(entrada, audio) {
  const bin = await ytBinario();
  fs.mkdirSync(TT_DIR, { recursive: true });
  const base = `${TT_DIR}/yt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const formato = audio? 'bestaudio[ext=m4a]/bestaudio'
    : (await ytTieneFfmpeg())? 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[ext=mp4]/b'
    : 'b[height<=720][ext=mp4]/b[ext=mp4]/b';   // sin ffmpeg: solo formatos que ya traen audio y video juntos
  const args = ['--no-playlist', ...(YT_DEBUG? [] : ['--no-warnings']), '-q', '--no-progress', '--no-simulate', '--max-filesize', `${Math.floor(TT_MAX / 1048576)}M`, '--socket-timeout', '20', '--retries', '3',
    '--http-chunk-size', '10M', '-N', '4',            // pedidos de a pedazos: evita que YouTube limite la velocidad de bajada
    ...ytArgsBase(), '-f', formato, '--merge-output-format', 'mp4',
    '-o', `${base}.%(ext)s`, '--print', '%(title)s', '--print', 'after_move:filepath', entrada];
  const t0 = Date.now();
  const correr = () => ytEjecutar(bin, args);
  let r;
  try { r = await correr(); }
  catch (e) {
    // si falló por una versión vieja, se actualiza (como mucho una vez cada 6 h) y se reintenta
    if (!/Sign in to confirm|not a bot|Private video|age|unavailable/i.test(e.stderr) && Date.now() - ytUltUpdate > 6 * 3600e3) {
      ytUltUpdate = Date.now(); console.log('[yt] falló, actualizo yt-dlp y reintento');
      await execP(bin, ['-U'], { timeout: 120000 }).catch(() => {});
      r = await correr();
    } else throw e;
  }
  console.log(`[yt] yt-dlp tardó ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const lineas = r.out.split('\n').map(l => l.trim()).filter(Boolean);
  const archivo = lineas.length >= 2? lineas[lineas.length - 1] : null;
  if (!archivo ||!fs.existsSync(archivo)) {
    const grande = /larger than max-filesize/i.test(r.out + r.err);
    throw new Error(grande? 'GRANDE' : 'sin archivo: ' + (r.err || r.out).slice(-300));
  }
  if (fs.statSync(archivo).size > TT_MAX) { fs.rmSync(archivo, { force: true }); throw new Error('GRANDE'); }
  return { archivo, titulo: lineas[0] };
}

// respaldo 1: buscar el id de un video por texto. Usa el mismo buscador que /search (con las cookies) y se queda con el primer resultado
async function ytBuscarId(q) {
  const lista = await ytBuscarLista(q, 1);
  if (!lista[0]?.id) throw new Error('SIN_RESULTADOS');
  return lista[0].id;
}
// respaldo 2: API compatible con cobalt (COBALT_API=https://tu-instancia, COBALT_KEY opcional)
async function ytCobalt(link, audio) {
  const api = process.env.COBALT_API;
  if (!api) throw new Error('SIN_COBALT');
  const r = await axios.post(api.replace(/\/+$/, '') + '/', { url: link, downloadMode: audio? 'audio' : 'auto', audioFormat: 'mp3', videoQuality: '720', filenameStyle: 'basic' }, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(process.env.COBALT_KEY? { Authorization: `Api-Key ${process.env.COBALT_KEY}` } : {}) },
    timeout: 30000, validateStatus: () => true });
  const d = r.data || {};
  if ((d.status === 'tunnel' || d.status === 'redirect') && d.url) return d;
  throw new Error('cobalt: ' + (d.error?.code || d.status || r.status));
}
async function ytRespaldo(link, audio) {
  const d = await ytCobalt(link, audio);
  fs.mkdirSync(TT_DIR, { recursive: true });
  const archivo = `${TT_DIR}/yt_${Date.now()}_${Math.random().toString(36).slice(2)}.${audio? 'mp3' : 'mp4'}`;
  await ttBajar(d.url, archivo, api_ref());
  return { archivo, titulo: (d.filename || '').replace(/\.\w+$/, '') };
}
const api_ref = () => (process.env.COBALT_API || '').replace(/\/+$/, '') + '/';

// qué pidió la persona: link (en el texto o en el mensaje citado) o título
function ytEntrada(m, text) {
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '') : '';
  const quitar = l => l && l.replace(/[)\].,;!?]+$/, '');
  return { arg, link: quitar((arg.match(YT_RE) || qt.match(YT_RE) || [])[0]) };
}
// ---------- ficha de información de YouTube (tarjeta con la miniatura): se manda antes del audio/video, o sola con -info ----------
const YT_INFO_RE = /(^|\s)-info(?=\s|$)/i;
const YT_ID_RE = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/;
const ytIdDe = l => (YT_ID_RE.exec(l || '') || [])[1] || null;
const ytNum = t => { const d = String(t || '').replace(/\D/g, ''); return d? Number(d) : null; };
// busca las fichas (título, canal, duración, vistas, fecha) dentro del JSON de la página de resultados (formato clásico y "lockup")
function ytFichasDe(obj, out = new Map()) {
  if (!obj || typeof obj!== 'object') return out;
  if (Array.isArray(obj)) { for (const x of obj) ytFichasDe(x, out); return out; }
  const vr = obj.videoRenderer;
  if (vr?.videoId &&!out.has(vr.videoId)) {
    const txt = o => o?.simpleText || (o?.runs || []).map(r => r.text).join('') || '';
    out.set(vr.videoId, { id: vr.videoId, titulo: txt(vr.title), canal: txt(vr.ownerText) || txt(vr.longBylineText), dur: txt(vr.lengthText), vistas: ytNum(txt(vr.viewCountText)), publicado: txt(vr.publishedTimeText) });
  }
  const lk = obj.lockupViewModel;
  if (lk?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && lk.contentId &&!out.has(lk.contentId)) {
    let dur = '';
    for (const o of lk.contentImage?.thumbnailViewModel?.overlays || [])
      for (const b of o.thumbnailBottomOverlayViewModel?.badges || []) dur = dur || b.thumbnailBadgeViewModel?.text || '';
    const filas = (lk.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || []).map(f => (f.metadataParts || []).map(p => p.text?.content || '').filter(Boolean));
    let canal = '', vistas = null, publicado = '';
    for (const fila of filas) for (const t of fila) {
      if (/visualizaci|views|vistas|espectador|watching/i.test(t)) vistas = ytNum(t);
      else if (/\bhace\b|\bago\b|transmitido|streamed/i.test(t)) publicado = t;
      else if (!canal) canal = t;
    }
    out.set(lk.contentId, { id: lk.contentId, titulo: lk.metadata?.lockupMetadataViewModel?.title?.content || '', canal, dur, vistas, publicado });
  }
  for (const k of Object.keys(obj)) if (k!== 'videoRenderer' && k!== 'lockupViewModel') ytFichasDe(obj[k], out);
  return out;
}
// información del video: de un link de YouTube o del primer resultado de un texto. Devuelve null si no se consigue nada (nunca tira error)
async function ytInfo(consulta) {
  const id = ytIdDe(consulta), q = id || String(consulta || '').trim();
  if (!q) return null;
  let f = null;
  try {
    const ck = ytCookieHeader();
    const r = await axios.get(`${YT_WEB}/results`, { params: { search_query: q, hl: 'es', gl: 'AR' }, timeout: 15000, headers: { 'User-Agent': YT_UA_PC, 'Accept-Language': 'es-AR,es;q=0.9', ...(ck? { Cookie: ck } : {}) } });
    const m = /ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(String(r.data));
    if (m) { const fichas = ytFichasDe(JSON.parse(m[1])); f = id? fichas.get(id) : [...fichas.values()].find(x => x.titulo); }
  } catch (e) { console.error('[yt-info] búsqueda:', e.message); }
  if (!f && id) {   // plan B: oEmbed (solo título y canal)
    try {
      const r = await axios.get('https://www.youtube.com/oembed', { params: { url: `https://www.youtube.com/watch?v=${id}`, format: 'json' }, timeout: 10000, headers: { 'User-Agent': YT_UA_PC } });
      if (r.data?.title) f = { id, titulo: r.data.title, canal: r.data.author_name || '', dur: '', vistas: null, publicado: '' };
    } catch (e) { console.error('[yt-info] oembed:', e.message); }
  }
  return f && f.titulo? { ...f, link: `https://youtu.be/${f.id}` } : null;
}
const ytLimpio = s => String(s || '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
function ytTarjeta(f, pie = '') {
  const filas = [
    f.canal && `📺 *Canal* ➜ ${ytLimpio(f.canal)}`,
    f.dur && `⏱️ *Duración* ➜ ${f.dur}`,
    f.vistas!= null && `👁️ *Vistas* ➜ ${f.vistas.toLocaleString('es-AR')}`,
    f.publicado && `📅 *Publicado* ➜ ${ytLimpio(f.publicado)}`,
    `🔗 ${f.link || `https://youtu.be/${f.id}`}`,
  ].filter(Boolean);
  const caja = filas.map((t, i) => `${filas.length === 1? '┗' : i === 0? '┏' : i === filas.length - 1? '┗' : '┣'} ${t}`).join('\n');
  return `▶️ *YouTube*\n━━━━━━━━━━━━━━━━━━\n*${ytLimpio(f.titulo)}*\n\n${caja}\n━━━━━━━━━━━━━━━━━━${pie? `\n${pie}` : ''}`;
}
// miniatura en la mejor calidad que exista (las más grandes no están en todos los videos)
async function ytMiniatura(id) {
  for (const n of ['maxresdefault', 'hq720', 'mqdefault']) {
    try {
      const r = await axios.get(`https://i.ytimg.com/vi/${id}/${n}.jpg`, { responseType: 'arraybuffer', timeout: 10000, headers: { 'User-Agent': YT_UA_PC } });
      if (r.data?.length > 2000) return Buffer.from(r.data);
    } catch {}
  }
  return null;
}
async function ytMandarFicha(m, jid, f, pie) {
  const txt = ytTarjeta(f, pie), img = f.id? await ytMiniatura(f.id) : null;
  if (img) {
    try { return await sock.sendMessage(jid, { image: img, caption: txt }, { quoted: m }); }
    catch (e) { console.error('[yt-info] no pude mandar la foto, va solo el texto:', e.message); }
  }
  return sock.sendMessage(jid, { text: txt }, { quoted: m });
}
// /ytmp3 -info <link o título> y /ytmp4 -info <link o título>: solo la ficha, sin descargar nada
async function ytInfoCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const cmd = (text.match(/^\/\S+/) || ['/ytmp4'])[0].toLowerCase();
  const { arg, link } = ytEntrada(m, text.replace(YT_INFO_RE, ' '));
  if (!link &&!arg) return reply(`Uso:\n${cmd} -info <link de YouTube>\n${cmd} -info <título o búsqueda>\n> Te mando solo la información del video, sin descargarlo.`);
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  try {
    const f = await ytInfo(link || arg);
    if (!f) return await reply(link? '❌ No pude obtener la información de ese video. Revisá el link y probá de nuevo en un rato' : '🔎 No encontré nada con esa búsqueda');
    await ytMandarFicha(m, jid, f);   // la MISMA ficha que se manda antes de descargar
  } catch (e) {
    console.error('[yt-info] ERROR', e.message);
    await reply('❌ No pude obtener la información. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}

// manda el audio o el video ya descargado, precedido por la ficha del video (infoP = promesa de ytInfo, que se pide mientras se descarga)
async function ytEnviar(m, jid, it, audio, infoP) {
  const peso = fs.statSync(it.archivo).size;
  console.log(`[yt] listo ${(peso / 1048576).toFixed(1)} MB: ${it.titulo}`);
  const dato = peso <= 40 * 1048576? fs.readFileSync(it.archivo) : { url: it.archivo };
  const info = await Promise.resolve(infoP).catch(() => null);
  if (info) {
    await ytMandarFicha(m, jid, info).catch(e => console.error('[yt-info] ficha:', e.message));
    if (audio) await sock.sendMessage(jid, { audio: dato, mimetype: /\.mp3$/.test(it.archivo)? 'audio/mpeg' : 'audio/mp4', ptt: false });
    else await sock.sendMessage(jid, { video: dato, mimetype: 'video/mp4' });
    return;
  }
  // sin ficha (no se pudo conseguir la información): como siempre
  if (audio) {
    await sock.sendMessage(jid, { text: `🎵 *${it.titulo}*` }, { quoted: m });
    await sock.sendMessage(jid, { audio: dato, mimetype: /\.mp3$/.test(it.archivo)? 'audio/mpeg' : 'audio/mp4', ptt: false });
  } else {
    await sock.sendMessage(jid, { video: dato, mimetype: 'video/mp4', caption: `🎬 ${it.titulo}` }, { quoted: m });
  }
}

// ---------- API de Sylphy (sylphyy.xyz): primera opción para YouTube y Spotify; yt-dlp queda de respaldo ----------
// .env: SYLPHY_KEY=tu_clave (sin la clave no se usa y todo sigue como antes). Opcionales: SYLPHY_URL, SYLPHY_Q (calidad del video, 720 por defecto)
const SYLPHY_URL = (process.env.SYLPHY_URL || 'https://sylphyy.xyz').replace(/\/+$/, '');
const sylphyOn = () => !!process.env.SYLPHY_KEY;
async function sylphyGet(ruta, params) {
  const r = await axios.get(SYLPHY_URL + ruta, { params, timeout: 60000, validateStatus: () => true,
    headers: { 'X-API-Key': process.env.SYLPHY_KEY, 'User-Agent': TT_UA, Accept: 'application/json' } });
  const d = r.data, res = d && typeof d === 'object'? d.result : null;
  if (r.status !== 200 || !d || d.status === false || !res || res.success === false || (typeof res === 'object' &&!Array.isArray(res) &&!Object.keys(res).length)) {
    const motivo = typeof d === 'string'? d : JSON.stringify(d?.error || res?.error || d || '');
    throw new Error(`sylphy ${ruta} -> ${r.status} ${String(motivo).slice(0, 200)}`);
  }
  return res;
}
const extDe = u => { try { return (new URL(u).pathname.match(/\.([a-z0-9]{2,4})$/i) || [])[1]?.toLowerCase() || ''; } catch { return ''; } };
// baja el archivo que indica la API; devuelve { archivo, titulo }
async function sylphyBajar(res, audio, ref) {
  const u = res.dl_url || res.download_url || res.url;
  if (!/^https?:\/\//i.test(u || '')) throw new Error('la API no devolvió enlace de descarga');
  const ext = extDe(u);
  if (audio? ext &&!/^(mp3|m4a)$/.test(ext) : ext && ext!== 'mp4') throw new Error('formato inesperado: ' + ext);
  fs.mkdirSync(TT_DIR, { recursive: true });
  const archivo = `${TT_DIR}/yt_${Date.now()}_${Math.random().toString(36).slice(2)}.${audio? (ext || 'mp3') : 'mp4'}`;
  try {
    await ttBajar(u, archivo, ref);
    if (fs.statSync(archivo).size < 10 * 1024) throw new Error('archivo vacío');
  } catch (e) { fs.rmSync(archivo, { force: true }); throw e; }
  return { archivo, titulo: String(res.title || res.name || 'Sin título').trim() };
}
// YouTube: audio por /download/ytdl; video por /download/ytdl (720p) y, si falla, /download/v2/ytmp4 (360p)
async function sylphyYT(link, audio) {
  const fuentes = audio
    ? [() => sylphyGet('/download/ytdl', { url: link, mode: 'audio', q: 128 })]
    : [() => sylphyGet('/download/ytdl', { url: link, mode: 'video', q: process.env.SYLPHY_Q || 720 }),
       () => sylphyGet('/download/v2/ytmp4', { url: link })];
  let grande = false, ultimo;
  for (const f of fuentes) {
    try { return await sylphyBajar(await f(), audio, 'https://www.youtube.com/'); }
    catch (e) { if (e.message === 'GRANDE') grande = true; ultimo = e; console.error('[sylphy] YouTube:', e.message); }
  }
  throw grande? new Error('GRANDE') : ultimo;
}
// intenta /ytaudio y /ytvideo con la API. Devuelve true si ya respondió (envió o avisó) y false si hay que seguir con yt-dlp
async function ytSylphyCmd(m, jid, text, audio) {
  if (!sylphyOn()) return false;
  const { arg, link } = ytEntrada(m, text);
  if (!link &&!arg) return false;   // sin nada que descargar: el comando de siempre muestra el uso
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  const infoP = ytInfo(link || arg);   // la ficha se pide mientras se descarga
  console.log(`[sylphy] ${audio? 'audio' : 'video'}:`, link || `búsqueda "${arg}"`);
  let it;
  try {
    const url = link || `https://www.youtube.com/watch?v=${await ytBuscarId(arg)}`;   // la API no busca en YouTube: el id sale de la página de resultados
    it = await sylphyYT(url, audio);
  } catch (e) {
    reaccion('');
    if (e.message === 'GRANDE') { await sock.sendMessage(jid, { text: `❌ El archivo pesa más de ${TT_MAX / 1024 / 1024} MB` }, { quoted: m }); return true; }
    console.log('[sylphy] no se pudo, sigo con yt-dlp');
    return false;
  }
  try { await ytEnviar(m, jid, it, audio, infoP); }
  catch (e) { console.error('[sylphy] no pude enviarlo:', e.message); await sock.sendMessage(jid, { text: '❌ No pude enviarlo. Probá de nuevo en un rato' }, { quoted: m }); }
  finally { fs.rmSync(it.archivo, { force: true }); reaccion(''); }
  return true;
}

// ---------- /spotify: audio de Spotify con la API de Sylphy (link de la canción o título) ----------
const SP_RE = /https?:\/\/open\.spotify\.com\/[^\s<>"']+/i;
const NO_URL = /thumb|cover|image|img|icon|preview|avatar|poster/i;
// busca un enlace http dentro de la respuesta: primero en las claves esperadas y, si no, en cualquier otra que no sea una imagen
function spUrl(o, claves = ['dl_url', 'download_url', 'download', 'url', 'link', 'audio']) {
  if (!o || typeof o!== 'object') return null;
  for (const k of claves) if (typeof o[k] === 'string' && /^https?:\/\//i.test(o[k])) return o[k];
  for (const [k, v] of Object.entries(o)) {
    if (NO_URL.test(k)) continue;
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
    if (v && typeof v === 'object') { const r = spUrl(v, claves); if (r) return r; }
  }
  return null;
}
function spPrimerTema(res) {
  const lista = Array.isArray(res)? res : (Object.values(res).find(Array.isArray) || []);
  const t = lista[0]; if (!t) return null;
  const link = [t.spotify_url, t.url, t.link, t.external_urls?.spotify].find(x => typeof x === 'string' && SP_RE.test(x))
    || (t.id? `https://open.spotify.com/track/${t.id}` : null) || spUrl(t, ['spotify_url', 'url', 'link']);
  return link? { link, titulo: t.title || t.name || '', artista: t.artist || t.artists?.map?.(a => a.name || a).join(', ') || '' } : null;
}
async function spotifyCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || '') : '';
  const link = (arg.match(SP_RE) || qt.match(SP_RE) || [])[0];
  if (!link &&!arg) return reply('Uso:\n/spotify <link de la canción>\n/spotify <título y artista>\n/spotify (respondiendo a un mensaje con el link)');
  if (!sylphyOn()) return reply('❌ Falta SYLPHY_KEY en el .env del bot');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  let it;
  try {
    let url = link, extra = '';
    if (!url) {
      const t = spPrimerTema(await sylphyGet('/search/spotify', { q: arg }));
      if (!t) throw Object.assign(new Error('SIN_RESULTADOS'), { sin: true });
      url = t.link; extra = [t.titulo, t.artista].filter(Boolean).join(' - ');
    }
    const res = await sylphyGet('/download/spotify', { url });
    const dl = spUrl(res);
    if (!dl) { console.log('[spotify] respuesta sin enlace:', JSON.stringify(res).slice(0, 400)); throw new Error('la API no devolvió enlace de descarga'); }
    const titulo = [res.title || res.name, res.artist || res.artists?.map?.(a => a.name || a).join(', ')].filter(x => typeof x === 'string' && x).join(' - ') || extra || 'Spotify';
    it = await sylphyBajar({ dl_url: dl, title: titulo }, true, 'https://open.spotify.com/');
    await ytEnviar(m, jid, it, true);
  } catch (e) {
    console.error('[spotify] ERROR', e.message);
    await reply(e.sin? '🔎 No encontré nada con esa búsqueda' : e.message === 'GRANDE'? `❌ El archivo pesa más de ${TT_MAX / 1024 / 1024} MB`
      : /403|401|certificate|altnames|5\d\d/.test(e.message)? '❌ La API de Spotify no está respondiendo ahora (falla del lado de Sylphy). Probá en un rato' : '❌ No pude descargarlo. Revisá el link y probá de nuevo');
  } finally { if (it?.archivo) fs.rmSync(it.archivo, { force: true }); reaccion(''); }
}

// ---------- REACCIONES (API de NekosBest): /hug @usuario, /cry, etc. ----------
// Baja un GIF de nekos.best, lo pasa a mp4 con ffmpeg (así WhatsApp lo muestra como GIF) y lo manda con una frase.
// NekosBest exige un User-Agent con formato "NOMBRE (CONTACTO)" y bloquea los genéricos; se puede cambiar con NEKOS_UA en el .env
const NEKOS_API = 'https://nekos.best/api/v2/';
const NEKOS_UA = process.env.NEKOS_UA || 'Vand4lwBot (https://bot.vand4licc.dpdns.org)';
// Cada reacción: [emoji, tipo, frases principales (10), frases secundarias (3)]
//   tipo 'con':  las principales son para cuando hay a quién dirigirla ({a} le hace algo a {b}); las secundarias, sin nadie
//   tipo 'solo': las principales son para cuando no hay a quién ({a} hace algo); las secundarias, con alguien
// {a} = nombre de quien usa el comando, {b} = nombre de la otra persona (nombres de WhatsApp, sin @)
const L = s => s.split(' | ');
const RX = {
  // ---- cariño y amistad ----
  hug: ['🤗', 'con', L('{a} le dio un abrazo enorme a {b} | {a} abrazó fuerte a {b} | {a} no soltó a {b} en un buen rato | {a} le regaló un abrazo a {b} | {b} recibió un abrazo de oso de parte de {a} | {a} corrió a abrazar a {b} | {a} abrazó a {b} sin avisar | {a} y {b} se fundieron en un abrazo | {a} le dio a {b} el abrazo que necesitaba | {a} apretó a {b} en un abrazo de los buenos'), L('{a} anda buscando a quién abrazar | {a} abraza al aire a ver si alguien se suma | {a} necesita un abrazo urgente')],
  cuddle: ['🫂', 'con', L('{a} se acurrucó con {b} | {a} y {b} se acurrucaron bajo la manta | {a} mimó a {b} toda la tarde | {a} se pegó a {b} para darle calor | {a} arropó a {b} y se acurrucó al lado | {a} se hizo un ovillo junto a {b} | {a} se apoyó en el hombro de {b} para los mimos | {a} acurrucó a {b} con cariño | {a} le hizo mimos a {b} sin parar | {a} se quedó abrazando a {b} un buen rato'), L('{a} se acurruca con una manta | {a} busca a alguien para acurrucarse | {a} pide mimos y una manta')],
  kiss: ['😘', 'con', L('{a} le dio un beso a {b} | {a} besó a {b} de sorpresa | {a} le plantó un beso a {b} | {b} se llevó un beso de parte de {a} | {a} y {b} se dieron un beso | {a} le dejó un beso en la mejilla a {b} | {a} besó a {b} y salió corriendo | {a} le regaló un beso a {b} | {a} no se aguantó y besó a {b} | {a} le dio un beso larguísimo a {b}'), L('{a} le tira besos al aire | {a} busca a quién besar | {a} manda un beso para todos')],
  peck: ['💋', 'con', L('{a} le dio un piquito a {b} | {a} le dio un besito rápido a {b} | {a} le robó un piquito a {b} | {a} le dejó un besito en la mejilla a {b} | {b} recibió un piquito de parte de {a} | {a} le estampó un besito a {b} | {a} le dio un beso fugaz a {b} | {a} le dio un besito a {b} y se escapó | {a} le plantó un piquito a {b} | {a} le dio un besito en la frente a {b}'), L('{a} anda repartiendo besitos | {a} manda un besito al aire | {a} busca a quién darle un piquito')],
  blowkiss: ['😚', 'con', L('{a} le tiró un beso a {b} | {a} le mandó un beso volador a {b} | {a} le sopló un beso a {b} | {b} recibió un beso volador de {a} | {a} le lanzó un besito a {b} | {a} le mandó un beso a {b} desde lejos | {a} le tiró un beso a {b} con una sonrisa | {a} le dedicó un beso a {b} | {a} le sopló un beso a {b} con cariño | {a} le envió un beso por el aire a {b}'), L('{a} tira besos al aire | {a} manda un beso a quien lo quiera | {a} sopla un beso')],
  pat: ['🫳', 'con', L('{a} le hizo cariñitos en la cabeza a {b} | {a} acarició a {b} | {a} le dio palmaditas en la cabeza a {b} | {b} recibió caricias de parte de {a} | {a} despeinó a {b} con cariño | {a} consintió a {b} con unos mimos | {a} le dio un par de caricias a {b} | {a} le acarició la cabeza a {b} | {a} le hizo patpat a {b} | {a} mimó a {b} un ratito'), L('{a} pide caricias | {a} anda necesitando mimos | {a} busca a quién acariciar')],
  handhold: ['🫶', 'con', L('{a} le agarró la mano a {b} | {a} y {b} van de la mano | {a} tomó de la mano a {b} | {a} le dio la mano a {b} y no la soltó | {a} entrelazó los dedos con {b} | {a} caminó de la mano con {b} | {a} le ofreció la mano a {b} | {a} le agarró la mano a {b} con ternura | {a} le apretó la mano a {b} | {a} y {b} se agarraron de la mano'), L('{a} extiende la mano a ver quién la agarra | {a} busca una mano para agarrar | {a} se queda con la mano estirada')],
  lappillow: ['😌', 'con', L('{a} apoyó la cabeza en el regazo de {b} | {a} se acostó en las piernas de {b} | {a} usó de almohada a {b} | {a} descansó en el regazo de {b} | {b} le prestó las piernas de almohada a {a} | {a} se acomodó en las piernas de {b} | {a} se echó una siesta en el regazo de {b} | {a} se recostó en el regazo de {b} y suspiró | {a} le pidió el regazo prestado a {b} | {a} se relajó en el regazo de {b}'), L('{a} busca un regazo para descansar | {a} se acomoda en una almohada | {a} pide un regazo de almohada')],
  carry: ['💪', 'con', L('{a} cargó a {b} en brazos | {a} llevó a {b} a upa | {a} levantó a {b} como si nada | {a} cargó a {b} en la espalda | {a} se llevó a {b} en brazos | {a} alzó a {b} sin esfuerzo | {a} lleva a {b} a caballito | {a} cargó a {b} todo el camino | {a} levantó a {b} y salió caminando | {a} cargó con {b} hasta la meta'), L('{a} carga con todo | {a} lleva el peso de todos | {a} levanta pesas con una mano')],
  feed: ['🍽️', 'con', L('{a} le dio de comer a {b} | {a} le dio la comida en la boca a {b} | {a} alimentó a {b} con cariño | {a} le convidó un bocado a {b} | {b} recibió comida de parte de {a} | {a} le sirvió un plato a {b} | {a} le dio un bocadito a {b} | {a} le preparó algo rico a {b} | {a} le dio de comer a {b} y no quedó nada | {a} le dio una cucharada a {b}'), L('{a} se prepara algo para comer | {a} ofrece comida a quien quiera | {a} cocina para todos')],
  handshake: ['🤝', 'con', L('{a} le dio la mano a {b} | {a} y {b} cerraron el trato con un apretón | {a} le estrechó la mano a {b} | {a} y {b} se dieron un apretón de manos | {a} le sacudió la mano a {b} | {b} aceptó el apretón de {a} | {a} cerró un acuerdo con {b} | {a} saludó a {b} con un apretón de manos | {a} y {b} sellaron la paz con un apretón | {a} le extendió la mano a {b} con respeto'), L('{a} extiende la mano en busca de un trato | {a} practica su apretón de manos | {a} anda cerrando negocios')],
  highfive: ['🙌', 'con', L('{a} chocó los cinco con {b} | {a} y {b} se chocaron los cinco | {a} le chocó la mano a {b} | {a} le dio los cinco a {b} | {a} le pegó un chócala a {b} | {b} recibió un chócala de {a} | {a} festejó con {b} chocando los cinco | {a} y {b} festejaron con un buen choque de manos | {a} le dio los cinco a {b} sin dudar | {a} le chocó los cinco a {b} con fuerza'), L('{a} levanta la mano esperando un chócala | {a} busca a alguien para chocar los cinco | {a} deja la mano arriba y nadie responde')],
  // ---- travesuras ----
  slap: ['👋', 'con', L('{a} le dio una cachetada a {b} | {a} le estampó un sopapo a {b} | {b} se comió una cachetada de {a} | {a} le pegó un bofetón a {b} | {a} le cruzó la cara a {b} | {a} abofeteó a {b} sin piedad | {a} le dejó la cara roja a {b} | {a} le metió un sopapo a {b} | {a} le sacudió una cachetada a {b} | {a} le dio un chirlo a {b}'), L('{a} se da una cachetada para despertar | {a} anda con ganas de dar un sopapo | {a} le pega a la nada')],
  punch: ['👊', 'con', L('{a} le dio una piña a {b} | {a} le metió una trompada a {b} | {b} se comió una piña de {a} | {a} le estampó el puño a {b} | {a} le pegó un puñetazo a {b} | {a} le soltó un derechazo a {b} | {a} noqueó a {b} de un golpe | {a} le dio un golpe directo a {b} | {a} le acomodó una piña a {b} | {a} sacudió a {b} con un puñetazo'), L('{a} golpea el aire | {a} entrena su derecha contra la nada | {a} le pega a una almohada')],
  patada: ['🦵', 'con', L('{a} le dio una patada a {b} | {a} le metió un puntapié a {b} | {b} se comió una patada de {a} | {a} mandó a volar a {b} de una patada | {a} le pegó una patada voladora a {b} | {a} pateó a {b} sin avisar | {a} le encajó una patada a {b} | {a} le dio una patadita a {b} | {a} sacó a {b} a patadas | {a} le acertó una patada a {b}'), L('{a} patea el aire | {a} patea una piedra | {a} anda con ganas de patear algo')],
  bite: ['😬', 'con', L('{a} mordió a {b} | {a} le pegó un mordisco a {b} | {b} recibió un mordisco de {a} | {a} le clavó los dientes a {b} | {a} le dio un mordisquito a {b} | {a} le mordió el brazo a {b} | {a} le dio un mordiscón a {b} | {a} mordisqueó a {b} sin motivo | {a} le dejó los dientes marcados a {b} | {a} atacó a {b} a mordiscones'), L('{a} muerde el aire | {a} anda con ganas de morder a alguien | {a} muerde una almohada')],
  bonk: ['🔨', 'con', L('{a} le dio un bonk a {b} | {a} mandó a {b} a la cárcel del bonk | {a} le pegó un bonk en la cabeza a {b} | {b} se ganó un bonk de {a} | {a} le dio con el martillito a {b} | {a} le hizo bonk a {b} por portarse mal | {a} le dio un golpecito en la cabeza a {b} | {a} bonkeó a {b} sin piedad | {a} le dio un bonk a {b} para que aprenda | {a} bonkeó a {b} y siguió como si nada'), L('{a} bonkea al aire | {a} anda repartiendo bonks | {a} se da un bonk para despertarse')],
  poke: ['👉', 'con', L('{a} le dio un toquecito a {b} | {a} le pinchó la mejilla a {b} | {a} molestó a {b} con un toque | {a} le tocó el hombro a {b} | {a} le hizo cosquillitas con el dedo a {b} | {a} le tocó la cara a {b} para molestar | {a} insiste en tocar a {b} | {a} tocó a {b} una y otra vez | {a} le dio un golpecito a {b} | {a} le tocó la espalda a {b} para llamar su atención'), L('{a} toca el aire | {a} pincha el vacío | {a} anda buscando a quién molestar')],
  tickle: ['🤭', 'con', L('{a} le hizo cosquillas a {b} | {a} atacó a {b} con cosquillas | {b} no puede parar de reír por las cosquillas de {a} | {a} le hizo cosquillas en las costillas a {b} | {a} le hizo cosquillas a {b} sin piedad | {a} le dio un ataque de cosquillas a {b} | {a} hizo reír a {b} con cosquillas | {a} le buscó el punto débil a {b} con cosquillas | {a} le hizo cosquillas a {b} hasta que se rindió | {a} no dejó de hacerle cosquillas a {b}'), L('{a} se ríe de las cosquillas | {a} busca a quién hacerle cosquillas | {a} mueve los dedos con malas intenciones')],
  shoot: ['🔫', 'con', L('{a} le hizo piu piu a {b} | {a} le disparó a {b} con una pistola de agua | {a} le apuntó a {b} con el dedo y gritó bang | {a} le disparó a {b} con una pistolita de juguete | {a} jugó a los vaqueros con {b} | {a} le acertó a {b} con un disparo de mentira | {a} desafió a {b} a un duelo de vaqueros | {a} le tiró un tiro de espuma a {b} | {a} le hizo bang bang a {b} | {a} sacó la pistola de juguete frente a {b}'), L('{a} practica su puntería | {a} juega a los vaqueros | {a} apunta con el dedo a la nada')],
  yeet: ['🚀', 'con', L('{a} lanzó a {b} por los aires | {a} mandó a volar a {b} | {a} revoleó a {b} bien lejos | {a} tiró a {b} a la estratósfera | {b} salió volando por culpa de {a} | {a} despachó a {b} a otra dimensión | {a} yeeteó a {b} | {a} lanzó a {b} como si nada | {a} arrojó a {b} sin culpa | {a} le dio un buen envión a {b} hacia el espacio'), L('{a} lanza algo bien lejos | {a} yeetea lo primero que encuentra | {a} revolea todo por los aires')],
  baka: ['💢', 'con', L('{a} le dijo baka a {b} | {a} le gritó baka a {b} | {b} se ganó un baka de {a} | {a} le dijo tonto a {b} | {a} trató de baka a {b} | {a} le dijo baka a {b} con cariño | {a} le tiró un baka a {b} en la cara | {a} no aguantó y le dijo baka a {b} | {a} le dijo baka baka baka a {b} | {a} le sacó un baka a {b}'), L('{a} grita baka al aire | {a} anda con ganas de decir baka | {a} se enoja y murmura baka')],
  kabedon: ['🧱', 'con', L('{a} arrinconó a {b} contra la pared | {a} acorraló a {b} contra la pared | {a} le hizo un kabedon a {b} | {a} apoyó la mano en la pared junto a {b} | {b} quedó contra la pared por culpa de {a} | {a} le cerró el paso a {b} contra la pared | {a} puso a {b} contra la pared con una mirada | {a} se acercó a {b} y no le dejó salida | {a} le dio un kabedon a {b} con mucha seguridad | {a} le hizo un kabedon a {b} en medio de todos'), L('{a} apoya la mano en la pared con estilo | {a} practica su kabedon | {a} arrincona a la nada contra la pared')],
  tableflip: ['🪑', 'solo', L('{a} dio vuelta la mesa | {a} volcó la mesa con furia | {a} revoleó la mesa | {a} explotó y tiró la mesa | {a} no aguantó más y dio vuelta la mesa | {a} hizo volar la mesa | {a} se enojó tanto que dio vuelta la mesa | {a} patea el tablero | {a} tiró la mesa y se fue | {a} dio vuelta todo, mesa incluida'), L('{a} dio vuelta la mesa por culpa de {b} | {a} volcó la mesa frente a {b} | {a} le revoleó la mesa a {b}')],
  // ---- emociones ----
  happy: ['😄', 'solo', L('{a} está feliz | {a} está desbordante de alegría | {a} sonríe de oreja a oreja | {a} salta de alegría | {a} anda con una sonrisa enorme | {a} está de mil maravillas | {a} está en las nubes de felicidad | {a} está radiante de alegría | {a} no puede contener la felicidad | {a} está de buen humor hoy'), L('{a} está feliz con {b} | {a} se alegra de ver a {b} | {b} puso feliz a {a}')],
  smile: ['😊', 'solo', L('{a} sonríe | {a} sonrió con ternura | {a} tiene una sonrisa enorme | {a} sonríe de oreja a oreja | {a} sonrió para la foto | {a} sonríe sin motivo | {a} no puede dejar de sonreír | {a} sonríe con ganas | {a} regala una sonrisa | {a} le pone buena cara al día'), L('{a} le sonrió a {b} | {a} le regaló una sonrisa a {b} | {a} no puede dejar de sonreírle a {b}')],
  laugh: ['😂', 'solo', L('{a} se ríe a carcajadas | {a} no puede parar de reír | {a} se muere de risa | {a} se desternilla de risa | {a} lloró de la risa | {a} soltó una carcajada | {a} se rió fuerte | {a} tiene un ataque de risa | {a} se agarra la panza de tanto reír | {a} se ríe hasta que le duele'), L('{a} se ríe de {b} | {a} se rió a carcajadas con {b} | {b} hizo reír a {a}')],
  teehee: ['🤭', 'solo', L('{a} se ríe por lo bajo | {a} suelta una risita pícara | {a} se tapa la boca para reír | {a} se ríe con picardía | {a} hizo una travesura y se ríe | {a} suelta una risita traviesa | {a} se ríe como quien hizo algo | {a} contiene la risa y no puede | {a} se ríe con cara de travesura | {a} hace teehee'), L('{a} se ríe con picardía frente a {b} | {a} le hizo una travesura a {b} y se ríe | {a} suelta una risita por culpa de {b}')],
  cry: ['😭', 'solo', L('{a} se largó a llorar | {a} llora a mares | {a} lloró sin consuelo | {a} sollozó en silencio | {a} se secó las lágrimas | {a} lloró como una Magdalena | {a} no puede parar de llorar | {a} tiene los ojos llenos de lágrimas | {a} se puso a llorar de repente | {a} se quebró y lloró'), L('{a} lloró en el hombro de {b} | {a} se largó a llorar por {b} | {b} hizo llorar a {a}')],
  angry: ['😠', 'solo', L('{a} está que arde de furia | {a} se enojó en serio | {a} explotó de bronca | {a} puso cara de pocos amigos | {a} anda con un humor de perros | {a} tiene la sangre en ebullición | {a} se enfureció | {a} refunfuña y nadie se le acerca | {a} está echando humo | {a} no está para bromas hoy'), L('{a} se enojó con {b} | {a} le puso mala cara a {b} | {a} explotó de bronca con {b}')],
  pout: ['😒', 'solo', L('{a} hace pucheros | {a} infla los cachetes | {a} se ofendió y se cruzó de brazos | {a} puso cara de enojo | {a} está de mal humor | {a} frunce el ceño y hace puchero | {a} se quedó con la cara larga | {a} protesta con un puchero | {a} se fue con la cara larga | {a} se enojó y no habla'), L('{a} le hace pucheros a {b} | {a} se ofendió con {b} | {a} no le habla a {b}')],
  blush: ['😳', 'solo', L('{a} se sonrojó | {a} no puede ocultar su sonrojo | {a} tiene las mejillas coloradas | {a} se ruborizó | {a} se tapó la cara de vergüenza | {a} se derritió de la vergüenza | {a} no sabe dónde meterse | {a} hace como que no pasa nada, pero se le nota | {a} sonríe con las mejillas rojas | {a} quedó con la cara como un tomate'), L('{a} se sonrojó por {b} | {a} se ruborizó al ver a {b} | {a} no puede mirar a {b} sin sonrojarse')],
  bored: ['🥱', 'solo', L('{a} se aburre | {a} se aburre como una ostra | {a} bosteza del aburrimiento | {a} mira el techo sin nada que hacer | {a} cuenta las moscas | {a} no tiene nada para hacer | {a} se muere del aburrimiento | {a} busca algo para hacer y no encuentra | {a} pone cara de aburrimiento total | {a} necesita un poco de acción'), L('{a} se aburre con {b} | {a} mira a {b} con cara de aburrimiento | {a} bosteza mientras habla {b}')],
  yawn: ['🥱', 'solo', L('{a} bostezó | {a} soltó un bostezo | {a} bosteza sin parar | {a} tiene sueño | {a} bosteza de cansancio | {a} bosteza con la boca bien abierta | {a} se estira y bosteza | {a} no aguanta el sueño | {a} bosteza y se frota los ojos | {a} se está durmiendo en el chat'), L('{a} bostezó frente a {b} | {a} bosteza mientras habla {b} | {a} se contagió el bostezo de {b}')],
  sleep: ['😴', 'solo', L('{a} se durmió | {a} duerme profundamente | {a} cayó en la cama y se durmió | {a} ronca como un angelito | {a} se fue a dormir | {a} se durmió en el acto | {a} duerme a pata suelta | {a} cerró los ojos y se durmió | {a} se echa una siestita | {a} descansa plácidamente'), L('{a} se durmió sobre {b} | {a} duerme al lado de {b} | {a} se durmió escuchando a {b}')],
  shocked: ['😱', 'solo', L('{a} quedó en shock | {a} no lo puede creer | {a} abrió los ojos como platos | {a} se quedó con la boca abierta | {a} no sabe qué decir | {a} se llevó las manos a la cara del susto | {a} se quedó sin palabras | {a} casi se cae de espaldas | {a} no da crédito a lo que ve | {a} se asustó muchísimo'), L('{a} quedó en shock por lo que hizo {b} | {a} no puede creer lo que dijo {b} | {b} dejó a {a} sin palabras')],
  confused: ['😕', 'solo', L('{a} no entiende nada | {a} no se ubica | {a} se rasca la cabeza sin entender | {a} puso cara de signo de pregunta | {a} no sabe qué está pasando | {a} se quedó pensando qué pasó | {a} frunce el ceño sin entender | {a} dice: ¿qué? | {a} pide que le expliquen de nuevo | {a} mira a todos lados sin entender'), L('{a} no entiende a {b} | {a} se confundió con lo que dijo {b} | {b} dejó a {a} con cara de signo de pregunta')],
  think: ['🤔', 'solo', L('{a} está pensando | {a} piensa a full | {a} se puso a pensar | {a} se rasca la cabeza pensando | {a} analiza la situación | {a} medita la respuesta | {a} le da vueltas al asunto | {a} tiene la cabeza a mil | {a} se concentra para pensar | {a} piensa algo pero no dice qué'), L('{a} piensa en {b} | {a} analiza lo que dijo {b} | {a} no sabe qué pensar de {b}')],
  smug: ['😏', 'solo', L('{a} puso cara de suficiencia | {a} sonríe con aire de superioridad | {a} se la cree | {a} presume con una sonrisa | {a} mira desde arriba | {a} se siente en la cima del mundo | {a} tiene cara de que ganó | {a} sonríe con picardía | {a} tiene aires de grandeza | {a} levantó una ceja con arrogancia'), L('{a} le puso cara de superioridad a {b} | {a} presume frente a {b} | {a} le sonríe con soberbia a {b}')],
  // ---- gestos y acciones ----
  wave: ['👋', 'solo', L('{a} saluda | {a} saluda con la mano | {a} se despide con la mano | {a} levanta la mano para saludar | {a} saluda a todos | {a} dice hola con la mano | {a} agita la mano | {a} saluda desde lejos | {a} manda un saludo | {a} dice chau con la mano'), L('{a} saludó a {b} | {a} le hizo adiós a {b} | {a} le manda un saludo a {b}')],
  wink: ['😉', 'solo', L('{a} guiña el ojo | {a} hizo un guiño | {a} guiñó con picardía | {a} tira un guiño | {a} guiñó el ojo y sonrió | {a} le guiña el ojo a la cámara | {a} hace un guiño cómplice | {a} soltó un guiño pícaro | {a} guiñó con gracia | {a} mandó un guiño'), L('{a} le guiñó el ojo a {b} | {a} le hizo un guiño a {b} | {a} le tiró un guiño a {b}')],
  nod: ['👍', 'solo', L('{a} asiente con la cabeza | {a} dice que sí moviendo la cabeza | {a} asiente sin decir nada | {a} asintió con firmeza | {a} da el visto bueno | {a} afirma con la cabeza | {a} está de acuerdo | {a} aprueba con un gesto | {a} mueve la cabeza en señal de acuerdo | {a} acepta con un movimiento de cabeza'), L('{a} asiente a lo que dice {b} | {a} está de acuerdo con {b} | {a} le da la razón a {b}')],
  nope: ['🙅', 'solo', L('{a} dijo que no | {a} se negó rotundamente | {a} niega con la cabeza | {a} huye de la idea | {a} ni lo piensa | {a} dijo nop | {a} rechazó la idea | {a} dice que ni loco | {a} se baja de la conversación | {a} se va diciendo nope'), L('{a} le dijo que no a {b} | {a} rechazó a {b} | {a} le hizo un nope a {b}')],
  shrug: ['🤷', 'solo', L('{a} se encogió de hombros | {a} no sabe ni le importa | {a} levanta los hombros | {a} dice: qué sé yo | {a} se encoge de hombros con indiferencia | {a} hace un gesto de ni idea | {a} no tiene ni idea | {a} mira para otro lado | {a} no se mete | {a} no opina'), L('{a} se encogió de hombros ante {b} | {a} no sabe qué decirle a {b} | {a} ignora a {b} encogiéndose de hombros')],
  thumbsup: ['👍', 'solo', L('{a} levantó el pulgar | {a} aprueba con el pulgar | {a} da el visto bueno con el pulgar | {a} dice que está todo bien | {a} hace like | {a} da un pulgar arriba | {a} lo aprueba | {a} muestra el pulgar | {a} da su aprobación | {a} dice todo en orden'), L('{a} le dio un pulgar arriba a {b} | {a} aprueba lo de {b} | {a} le dio el visto bueno a {b}')],
  clap: ['👏', 'solo', L('{a} aplaude | {a} aplaudió con ganas | {a} se levantó a aplaudir | {a} aplaude de pie | {a} da una ovación | {a} aplaude a todos | {a} aplaude fuerte | {a} no para de aplaudir | {a} aplaude con emoción | {a} festeja con aplausos'), L('{a} aplaude a {b} | {a} le dio un aplauso a {b} | {a} ovaciona a {b}')],
  salute: ['🫡', 'solo', L('{a} hace la venia | {a} saluda como militar | {a} se cuadra y saluda | {a} saluda con respeto | {a} se pone firme | {a} hace un saludo militar | {a} saluda con la mano en la frente | {a} se cuadra con seriedad | {a} da el saludo de honor | {a} presenta sus respetos'), L('{a} le hizo la venia a {b} | {a} saluda a {b} con respeto | {a} se cuadró frente a {b}')],
  facepalm: ['🤦', 'solo', L('{a} se tapó la cara con la mano | {a} se pegó una palmada en la frente | {a} no puede creer lo que lee | {a} se agarró la cabeza | {a} suspiró y se tapó la cara | {a} hizo facepalm | {a} sufre vergüenza ajena | {a} se tapó la cara de la vergüenza ajena | {a} se agarró la frente con resignación | {a} escondió la cara entre las manos'), L('{a} se hizo un facepalm por culpa de {b} | {a} no puede creer lo que hizo {b} | {a} sufre vergüenza ajena por {b}')],
  stare: ['👁️', 'solo', L('{a} mira fijo | {a} clava la mirada | {a} mira sin parpadear | {a} se queda mirando | {a} observa fijamente | {a} mira en silencio | {a} no despega la vista | {a} se queda con la vista perdida | {a} mira con cara de nada | {a} tiene la mirada clavada'), L('{a} miró fijo a {b} | {a} le clavó la mirada a {b} | {a} no le saca los ojos de encima a {b}')],
  lurk: ['👀', 'solo', L('{a} anda espiando | {a} mira desde las sombras | {a} se asoma sin decir nada | {a} observa en silencio | {a} está al acecho | {a} espía el chat | {a} lee todo y no dice nada | {a} se esconde y mira | {a} vigila desde lejos | {a} aparece de la nada y mira'), L('{a} espía a {b} | {a} mira a {b} desde las sombras | {a} sigue a {b} sin que se dé cuenta')],
  run: ['🏃', 'solo', L('{a} salió corriendo | {a} corre por su vida | {a} se fue a toda velocidad | {a} escapa como si lo persiguieran | {a} corrió sin mirar atrás | {a} se fue volando | {a} salió disparando | {a} huye a toda velocidad | {a} corre lo más rápido que puede | {a} desapareció a las corridas'), L('{a} corre de {b} | {a} huye de {b} | {a} sale corriendo detrás de {b}')],
  dance: ['💃', 'solo', L('{a} se puso a bailar | {a} mueve el esqueleto | {a} baila como si nadie mirara | {a} se mandó un pasito de baile | {a} armó la pista de baile | {a} baila con todo | {a} saca sus mejores pasos | {a} no puede dejar de bailar | {a} se lució en la pista | {a} baila al ritmo de la música'), L('{a} bailó con {b} | {a} sacó a bailar a {b} | {a} y {b} se pusieron a bailar')],
  spin: ['🌀', 'solo', L('{a} da vueltas | {a} gira como un trompo | {a} se pone a girar | {a} da una vuelta completa | {a} gira sin parar | {a} hace un giro con estilo | {a} se marea de tanto girar | {a} da vueltas y vueltas | {a} gira y gira | {a} se lució con un giro'), L('{a} giró junto a {b} | {a} hizo girar a {b} | {a} y {b} dan vueltas juntos')],
  sip: ['☕', 'solo', L('{a} toma un sorbo | {a} se toma un tecito | {a} toma un traguito | {a} se toma un cafecito tranquilo | {a} sorbe en silencio | {a} se sirve algo calentito | {a} bebe con calma | {a} toma su bebida y mira | {a} disfruta de un sorbo | {a} toma un sorbito mientras mira el chat'), L('{a} toma algo con {b} | {a} tomó un sorbo mirando a {b} | {a} invita a {b} a tomar algo')],
  nom: ['😋', 'solo', L('{a} come feliz | {a} se manda un bocado | {a} come sin parar | {a} devora todo lo que ve | {a} se zampa algo rico | {a} hace nom nom | {a} muerde con ganas | {a} se atraganta de tanto comer | {a} disfruta de su comida | {a} no deja nada en el plato'), L('{a} le robó un bocado a {b} | {a} comió del plato de {b} | {a} no le dejó nada a {b}')],
  nya: ['🐱', 'solo', L('{a} hace nya | {a} maúlla nya | {a} se pone modo gatito | {a} dice nya con ternura | {a} hizo nya con las manitos | {a} se transformó en gatito | {a} ronronea nya | {a} suelta un nya adorable | {a} hace garritas y dice nya | {a} anda con ganas de maullar'), L('{a} le hizo nya a {b} | {a} le maulló a {b} | {a} se acurrucó como gatito junto a {b}')],
  wag: ['🐶', 'solo', L('{a} mueve la colita | {a} mueve la cola de la emoción | {a} está tan feliz que mueve la cola | {a} menea la colita | {a} mueve la cola sin parar | {a} se emociona y mueve la cola | {a} mueve la cola con alegría | {a} anda moviendo la colita | {a} no puede parar de mover la cola | {a} menea la cola como un perrito'), L('{a} le mueve la cola a {b} | {a} menea la colita al ver a {b} | {a} mueve la cola de la emoción por {b}')],
  bleh: ['😛', 'solo', L('{a} sacó la lengua | {a} hace bleh | {a} saca la lengua con picardía | {a} le saca la lengua al mundo | {a} hizo una mueca graciosa | {a} saca la lengua y se ríe | {a} dice bleh | {a} hace una mueca de disgusto | {a} saca la lengua sin vergüenza | {a} hizo bleh con la lengua afuera'), L('{a} le sacó la lengua a {b} | {a} le hizo bleh a {b} | {a} le hizo una mueca a {b}')],
  shake: ['🫨', 'solo', L('{a} se sacude | {a} tiembla | {a} se sacude de arriba abajo | {a} se estremece | {a} sacude todo | {a} se sacude el polvo | {a} no para de moverse | {a} se sacude de los nervios | {a} tiembla de pies a cabeza | {a} se menea sin parar'), L('{a} sacudió a {b} | {a} sacude a {b} para que reaccione | {a} le dio una sacudida a {b}')],
};
const RX_CAT = { patada: 'kick' };   // /patada usa la categoría kick de NekosBest (/kick ahora expulsa del grupo)
const RX_RE = new RegExp('^\\/(' + Object.keys(RX).join('|') + ')(\\s|$)', 'i');
// nombres de WhatsApp (pushName) de quienes escriben o aparecen en los contactos; se guardan en nombres.json para no perderlos al reiniciar
const NOMBRES_FILE = './nombres.json';   // { "<numero>": "Nombre" }
const rxNombres = new Map();
try { if (fs.existsSync(NOMBRES_FILE)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(NOMBRES_FILE)))) rxNombres.set(k, String(v)); } catch (e) { console.error('[reaccion] no pude leer nombres.json:', e.message); }
let rxTimerDisco = null;
const rxGuardarDisco = () => {
  if (rxTimerDisco) return;
  rxTimerDisco = setTimeout(() => { rxTimerDisco = null; try { fs.writeFileSync(NOMBRES_FILE, JSON.stringify(Object.fromEntries(rxNombres))); } catch {} }, 15000);
  rxTimerDisco.unref?.();
};
const rxLimpio = s => String(s || '').replace(/[*_~`‎‏]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
function rxAprender(ids, nombre) {
  const n = rxLimpio(nombre); if (!n) return;
  let cambio = false;
  for (const id of ids) {
    if (!id) continue;
    if (rxNombres.get(id) !== n) cambio = true;
    rxNombres.delete(id); rxNombres.set(id, n);
  }
  while (rxNombres.size > 5000) rxNombres.delete(rxNombres.keys().next().value);
  if (cambio) rxGuardarDisco();
}
const rxGuardarNombre = (m, jid) => rxAprender(senderIds(m, jid), m.pushName);
// contactos que WhatsApp le informa al bot (solo el nombre público "notify")
const rxContactos = cs => { for (const c of cs || []) if (c?.notify) rxAprender([c.id, c.lid, c.phoneNumber].filter(Boolean).map(num), c.notify); };
const rxNombreDe = ids => { for (const id of ids) { const n = rxNombres.get(id); if (n) return n; } return ''; };
// a quién va dirigida la reacción (mención o mensaje citado). Si ya conocemos el nombre NO consulta el grupo (más rápido)
async function rxObjetivo(m, jid) {
  const ctx = Object.values(m.message || {}).map(v => v?.contextInfo).find(Boolean);
  const t = ctx?.mentionedJid?.[0] || ctx?.participant;
  if (!t) return null;
  let ids = [num(t)], mj = t, nombre = rxNombreDe(ids);
  if (!nombre && jid.endsWith('@g.us')) {
    const meta = await Promise.race([sock.groupMetadata(jid), sleep(4000).then(() => null)]).catch(() => null);
    const p = meta?.participants?.find(p => idsDe(p).includes(num(t)));
    if (p) {
      ids = [...new Set([...ids, ...idsDe(p)])]; mj = p.id || t;
      if (p.notify) rxAprender(ids, p.notify);
      nombre = rxNombreDe(ids);
    }
  }
  return { ids, jid: mj, nombre };
}
// una conversión por vez (el hosting tiene poca RAM)
let rxCola = Promise.resolve(), rxEnCurso = 0;
const rxTurno = fn => { const p = rxCola.then(fn); rxCola = p.catch(() => {}); return p; };
async function rxMp4(gif) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rx-'));
  try {
    const i = path.join(dir, 'in.gif'), o = path.join(dir, 'out.mp4');
    fs.writeFileSync(i, gif);
    await execP('ffmpeg', ['-y', '-v', 'error', '-i', i, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-threads', '1', '-an', o], { timeout: 60000 });
    return fs.readFileSync(o);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
async function rxBajarGif(nombre) {
  const r = await axios.get(NEKOS_API + (RX_CAT[nombre] || nombre), { headers: { 'User-Agent': NEKOS_UA }, timeout: 15000 });
  const url = r.data?.results?.[0]?.url;
  if (!/^https:\/\//.test(url || '')) throw new Error('la API no devolvió un GIF');
  return Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 20 * 1024 * 1024, headers: { 'User-Agent': NEKOS_UA } })).data);
}
async function rxCmd(m, jid, text) {
  const nombre = ((text.match(/^\/(\w+)/) || [])[1] || '').toLowerCase();
  const def = RX[nombre]; if (!def) return;
  const [emoji, tipo, prim, sec] = def;
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!(await ytTieneFfmpeg())) return reply('⚠️ Este hosting no tiene ffmpeg, así que no puedo convertir el GIF. Las reacciones necesitan ffmpeg');
  if (rxEnCurso >= 5) return reply('⏳ Hay muchas reacciones en cola, probá de nuevo en un momento');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  rxEnCurso++;
  reaccion('⏳');                                  // sin esperar: no frena el resto
  try {
    const gifP = rxBajarGif(nombre); gifP.catch(() => {});   // el GIF se baja mientras se resuelve a quién va
    const obj = await rxObjetivo(m, jid).catch(() => null);
    const yo = senderIds(m, jid);
    const conObj = !!obj &&!obj.ids.some(x => yo.includes(x));   // si sos vos mismo, cuenta como sin nadie
    const menciones = [];
    // si no se conoce el nombre, se arroba (mención real)
    let a = rxLimpio(m.pushName) || rxNombreDe(yo);
    if (!a) { const sj = m.key.participant || m.key.remoteJid || jid; a = '@' + num(sj); menciones.push(sj); }
    let b = '';
    if (conObj) {
      b = obj.nombre;
      if (!b) { b = '@' + num(obj.jid); menciones.push(obj.jid); }
    }
    const lista = conObj? (tipo === 'con'? prim : sec) : (tipo === 'con'? sec : prim);
    const frase = lista[Math.floor(Math.random() * lista.length)].replaceAll('{a}', a).replaceAll('{b}', b);
    const gif = await gifP;
    const mp4 = await rxTurno(() => rxMp4(gif));
    const msg = { video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption: `${frase} ${emoji}` };
    if (menciones.length) msg.mentions = [...new Set(menciones)];
    await sock.sendMessage(jid, msg, { quoted: m });
  } catch (e) {
    console.error('[reaccion]', nombre, e.message);
    const st = e.response?.status;
    await reply(st === 429? '⏳ NekosBest está limitando las consultas. Probá en un rato'
      : st === 404? '❌ Esa reacción no está disponible en NekosBest ahora'
      : /ffmpeg/i.test(e.message + (e.stderr || ''))? '❌ No pude convertir el GIF con ffmpeg'
      : '❌ No pude mandar la reacción. Probá de nuevo en un rato');
  } finally { rxEnCurso--; reaccion(''); }
}

// ---------- REACCIONES NSFW (PurrBot, NekoBot, NekosAPI y Nekosia): /nsfwneko, /nsfwhentai, etc. ----------
// Cada comando prueba sus fuentes en orden: si una API está caída, no tiene el tag o ratea, se saltea y sigue con la siguiente.
// La última fuente de cada comando está verificada, así que nunca queda en banda. Los GIF se pasan a mp4 con ffmpeg.
// Solo responden si los NSFW están activados en el chat (en el privado siempre; en grupos con /nsfw on).
const NSFW_UA = process.env.NSFW_UA || NEKOS_UA;
const NSFW_REF = process.env.NSFW_REF || '';   // si algún CDN exige otro Referer, se fuerza acá
// las bases se pueden cambiar por .env si algún día cambian de dominio
const NX_BASES = {
  purr:    { url: process.env.PURRBOT_URL || 'https://api.purrbot.site/v2/img/nsfw/', campo: 'link' },
  neko:    { url: process.env.NEKOBOT_URL || 'https://nekobot.xyz/api/image?type=', campo: 'message' },
  nekoapi: { url: process.env.NEKOSAPI_URL || 'https://api.nekosapi.com/v4/images/random?limit=1&rating=explicit&tags=', campo: '[0].url' },
  nekosia: { url: process.env.NEKOSIA_URL || 'https://api.nekosia.cat/api/v1/images/', campo: 'image.original.url', sufijo: '?rating=suggestive' },
};
const NL = s => s.split(' | ');
// [emoji, frases con alguien, frases sin nadie, fuentes en orden]
const NX = {
  // ---- sugerente ----
  nsfwneko: ['🐱', NL('{a} le muestra un neko bien puesto a {b} | {a} le pasó un neko a {b} para que se ponga mal'), NL('{a} se puso en modo pervertido con un neko | {a} encontró un neko que no deja nada a la imaginación | {a} y su debilidad por los nekos'), ['neko:neko', 'purr:neko', 'nekosia:catgirl']],
  nsfwwaifu: ['🌸', NL('{a} le dedicó una waifu a {b} | {a} le mostró a {b} la waifu que le gustaría tener'), NL('{a} está mirando waifus | {a} se quedó babeando con una waifu | {a} dice que esta waifu es la número uno'), ['nekosia:girl', 'nekoapi:exposed_girl_breasts']],
  nsfwtrap: ['🍭', NL('{a} le mostró un trap a {b} | {a} le presentó un trap a {b} y le movió el piso'), NL('{a} cayó en la trampa otra vez | {a} dice que los traps son un camino de ida | {a} anda confundido con este trap'), ['nekoapi:futanari', 'nekoapi:kemonomimi', 'nekosia:girl']],
  nsfwecchi: ['😳', NL('{a} le mandó una ecchi a {b} | {a} le tiró una imagen sugerente a {b}'), NL('{a} se puso a ver ecchi | {a} anda con la cara colorada | {a} dice que esto es arte, pero se le nota la mentira'), ['nekosia:w-sitting', 'nekoapi:exposed_girl_breasts']],
  nsfwero: ['🔥', NL('{a} le mandó una ero a {b} | {a} le dejó una ero a {b} para que se entretenga'), NL('{a} entró en modo ero | {a} está que arde con esta imagen | {a} dice que mirar esto cuenta como hacer ejercicio'), ['nekoapi:exposed_girl_breasts', 'nekosia:girl']],
  nsfwsolo: ['💃', NL('{a} le dedicó una pose a {b} | {a} le mandó a {b} una imagen de esas que no se miran en público'), NL('{a} se quedó en bolas, metafóricamente | {a} está posando para la cámara | {a} se puso en modo solo y sin testigos'), ['purr:solo', 'purr:neko']],
  nsfwboobs: ['🍈', NL('{a} le muestra unas boobs a {b} | {a} le tira las boobs en la cara a {b}'), NL('{a} se quedó mirando fijo | {a} dice que esto es lo mejor que le pasó hoy | {a} necesita un momento a solas'), ['neko:hboobs', 'nekoapi:large_breasts', 'nekosia:girl']],
  nsfwhboobs: ['🍒', NL('{a} le pasó unas hboobs a {b} | {a} le mostró a {b} de qué se está perdiendo'), NL('{a} anda mirando hboobs | {a} no puede con su alma | {a} dice que ya está, que se rinde'), ['neko:hboobs', 'nekoapi:large_breasts']],
  nsfwoppai: ['🍼', NL('{a} le mandó unos oppai a {b} | {a} le dedicó a {b} un par de oppai'), NL('{a} entró a la sección oppai y no salió más | {a} se quedó sin palabras | {a} dice que los oppai son su religión'), ['nekoapi:large_breasts', 'neko:hboobs']],
  nsfwass: ['🍑', NL('{a} le muestra el culo a {b} | {a} le tiró un culo a la cara a {b}'), NL('{a} se dio vuelta para mostrar el culo | {a} dice que el culo es lo primero | {a} se quedó mirando culos'), ['neko:ass', 'nekoapi:ass', 'nekosia:girl']],
  nsfwthighs: ['🦵', NL('{a} le muestra los muslos a {b} | {a} le dedica sus muslos a {b}'), NL('{a} anda mirando muslos | {a} dice que los muslos son lo más subestimado | {a} se derritió con estos muslos'), ['neko:hthigh', 'nekosia:thigh-high-socks']],
  nsfwhthigh: ['🍗', NL('{a} le pasa unos hthigh a {b} | {a} le muestra a {b} unos muslos de otro nivel'), NL('{a} anda en la sección de muslos | {a} dice que así sí vale la pena | {a} se quedó con la boca abierta'), ['neko:hthigh', 'nekosia:thigh-high-socks']],
  nsfwhips: ['🍑', NL('{a} le muestra las caderas a {b} | {a} le dedica a {b} unas caderas peligrosas'), NL('{a} anda mirando caderas | {a} se quedó trabado en esta imagen | {a} dice que las caderas no fallan'), ['neko:hmidriff', 'nekoapi:exposed_girl_breasts']],
  nsfwhmidriff: ['👗', NL('{a} le mostró la panza a {b} | {a} le dedicó a {b} una foto con la panza al aire'), NL('{a} anda mostrando la panza | {a} dice que la panza es lo más lindo | {a} se quedó mirando ombligos'), ['neko:hmidriff', 'nekosia:girl']],
  nsfwfoxgirl: ['🦊', NL('{a} le presentó una foxgirl a {b} | {a} le pasó una foxgirl a {b} y le movió el piso'), NL('{a} entró al bosque de las foxgirls | {a} dice que las foxgirls son otro nivel | {a} se quedó con la cola entre las patas'), ['nekosia:foxgirl', 'nekosia:animal-ears', 'neko:kemonomimi']],
  nsfwuniform: ['🎽', NL('{a} le mostró a {b} un uniforme bien puesto | {a} le dedicó un uniforme a {b}'), NL('{a} anda mirando uniformes | {a} dice que el uniforme hace la diferencia | {a} se quedó mirando'), ['nekosia:uniform', 'nekosia:sailor-uniform']],
  nsfwschool: ['🎒', NL('{a} le mostró a {b} una de la escuela | {a} le pasó a {b} una del colegio'), NL('{a} se quedó en la escuela | {a} dice que ahí sí aprendía | {a} anda con ganas de repetir año'), ['nekosia:sailor-uniform', 'nekosia:uniform']],
  nsfwmaid: ['🧹', NL('{a} le presentó una maid a {b} | {a} le mandó a {b} una maid para que le ordene la vida'), NL('{a} se consiguió una maid | {a} dice que así da gusto que limpien | {a} se quedó mirando la escoba'), ['nekosia:maid', 'nekoapi:maid']],
  nsfwnurse: ['💉', NL('{a} le mandó una enfermera a {b} | {a} le presentó a {b} la enfermera de sus sueños'), NL('{a} dice que le duele todo y necesita una enfermera | {a} anda mirando enfermeras | {a} se quedó esperando el turno'), ['nekoapi:nurse', 'nekosia:uniform']],
  nsfwglasses: ['🤓', NL('{a} le mostró a {b} una con anteojos | {a} le dedicó a {b} una de lentes'), NL('{a} dice que los anteojos son su debilidad | {a} anda mirando gente con lentes | {a} se quedó embobado'), ['nekoapi:glasses', 'nekosia:girl']],
  nsfwstockings: ['🧦', NL('{a} le mostró unas medias a {b} | {a} le dedicó a {b} unas medias de esas'), NL('{a} anda mirando medias | {a} dice que las medias lo matan | {a} se quedó mirando piernas'), ['nekosia:thigh-high-socks', 'nekosia:black-tights']],
  nsfwtights: ['🧵', NL('{a} le mostró unas tights a {b} | {a} le dedicó a {b} unas de esas ajustadas'), NL('{a} anda mirando tights | {a} dice que las tights no perdonan | {a} se quedó mirando piernas'), ['nekosia:white-tights', 'nekosia:black-tights']],
  nsfwzettai: ['🎀', NL('{a} le mostró a {b} un zettai ryouiki | {a} le dedicó a {b} ese espacio entre la falda y la media'), NL('{a} dice que ese espacio es sagrado | {a} anda mirando zettai ryouiki | {a} se quedó sin aire'), ['nekosia:thigh-high-socks', 'nekosia:knee-high-socks']],
  nsfwpanties: ['🩲', NL('{a} le mostró la bombacha a {b} | {a} le dedicó a {b} una foto de esas'), NL('{a} anda mostrando la ropa interior | {a} dice que esto ya es de más | {a} se quedó mirando'), ['nekoapi:panties', 'nekosia:white-tights', 'nekosia:girl']],
  nsfwfeet: ['🦶', NL('{a} le mostró los pies a {b} | {a} le dedicó a {b} una foto de pies'), NL('{a} anda mirando pies | {a} dice que los pies son lo más | {a} se quedó en la sección de pies'), ['neko:feet', 'nekosia:girl']],
  nsfwkemonomimi: ['🐾', NL('{a} le mostró a {b} una kemonomimi | {a} le presentó a {b} una de orejitas'), NL('{a} se quedó con las orejitas | {a} dice que las kemonomimi son lo más tierno | {a} anda mirando orejas'), ['neko:kemonomimi', 'nekosia:animal-ears']],
  nsfwhanalia: ['🌺', NL('{a} le mostró a {b} una hanalia | {a} le pasó a {b} una hanalia y la dejó pensando'), NL('{a} entró en la sección hanalia | {a} se quedó mirando | {a} dice que así sí vale la pena'), ['nekoapi:exposed_girl_breasts', 'nekosia:girl']],
  nsfwhasshaku: ['🐰', NL('{a} le mandó una hasshaku a {b} | {a} le mostró a {b} a la conejita'), NL('{a} se quedó con la conejita | {a} dice que los conejos no son tan inocentes | {a} anda mirando conejitas'), ['nekosia:animal-ears', 'neko:kemonomimi']],
  nsfwhneko: ['😻', NL('{a} le mostró un hneko a {b} | {a} le pasó a {b} un hneko y la dejó sin palabras'), NL('{a} entró en modo hneko | {a} se quedó mirando | {a} dice que los nekos son su perdición'), ['neko:hneko', 'neko:neko']],
  nsfwhololewd: ['🌟', NL('{a} le mostró a {b} una de Holo | {a} le dedicó a {b} una hololewd'), NL('{a} anda mirando a Holo | {a} dice que la loba no se discute | {a} se quedó babeando'), ['nekosia:wolfgirl', 'nekoapi:exposed_girl_breasts']],
  nsfwlewdk: ['🐈', NL('{a} le mostró a {b} una lewdk | {a} le pasó a {b} una de gatita'), NL('{a} anda mirando gatitas | {a} se quedó con la colita | {a} dice que los gatos son otro nivel'), ['neko:neko', 'nekoapi:catgirl']],
  nsfwlewdkemo: ['🐾', NL('{a} le mostró a {b} una lewdkemo | {a} le dedicó a {b} una de orejitas'), NL('{a} anda mirando kemono | {a} se quedó mirando orejitas | {a} dice que esto es demasiado tierno'), ['neko:kemonomimi', 'nekosia:animal-ears']],
  nsfwngif: ['🎞️', NL('{a} le mandó un gif a {b} | {a} le tiró un gif a {b} para que se entretenga'), NL('{a} se puso a mirar gifs | {a} no puede parar de mirar | {a} se quedó en loop'), ['purr:neko', 'purr:fuck']],
  nsfw4k: ['📺', NL('{a} le mostró a {b} una en 4K | {a} le dedicó a {b} una de altísima calidad'), NL('{a} dice que en 4K se ve todo | {a} se quedó mirando la calidad | {a} anda en la sección 4K'), ['neko:4k', 'nekosia:girl']],
  // ---- explícito ----
  nsfwhentai: ['📖', NL('{a} le mandó un hentai a {b} | {a} le dedicó a {b} una página de hentai'), NL('{a} entró en modo hentai | {a} se quedó leyendo | {a} dice que el hentai es cultura'), ['purr:neko', 'nekoapi:exposed_girl_breasts']],
  nsfwahegao: ['🤤', NL('{a} le mostró una cara de ahegao a {b} | {a} le mandó a {b} un ahegao'), NL('{a} se quedó con la boca abierta | {a} anda mirando ahegaos | {a} dice que esa cara no se olvida'), ['nekoapi:ahegao', 'nekoapi:exposed_girl_breasts']],
  nsfwpaizuri: ['🍈', NL('{a} le mostró un paizuri a {b} | {a} le dedicó a {b} un paizuri'), NL('{a} anda mirando paizuri | {a} dice que así se ve todo mejor | {a} se quedó sin palabras'), ['neko:paizuri', 'nekoapi:paizuri', 'nekoapi:large_breasts']],
  nsfwblowjob: ['💦', NL('{a} le mostró un blowjob a {b} | {a} le dedicó a {b} un oral de esos'), NL('{a} anda mirando orales | {a} se quedó con la boca abierta | {a} dice que esto ya es demasiado'), ['purr:blowjob', 'purr:neko']],
  nsfworalsex: ['👄', NL('{a} le mandó un oral a {b} | {a} le dedicó a {b} una buena mamada'), NL('{a} se quedó mirando | {a} anda con ganas | {a} dice que esto es su debilidad'), ['purr:blowjob', 'purr:pussylick']],
  nsfwpussy: ['🐚', NL('{a} le mostró la concha a {b} | {a} le dedicó a {b} una foto de esas'), NL('{a} se quedó mirando | {a} anda en la sección concha | {a} dice que esto no deja nada a la imaginación'), ['nekoapi:pussy', 'purr:neko']],
  nsfwpussywank: ['✊', NL('{a} le mostró a {b} una paja | {a} le dedicó a {b} un gif de esos'), NL('{a} se puso a mirar gifs de pajas | {a} se quedó en loop | {a} anda necesitando una mano'), ['purr:pussylick', 'purr:solo']],
  nsfwanal: ['🍩', NL('{a} le mostró un anal a {b} | {a} le dedicó a {b} uno por atrás'), NL('{a} anda mirando anales | {a} se quedó mirando | {a} dice que por atrás también se siente'), ['purr:anal', 'nekoapi:anal']],
  nsfwcreampie: ['🥧', NL('{a} le mostró un creampie a {b} | {a} le dedicó a {b} un final feliz'), NL('{a} anda mirando creampies | {a} se quedó mirando | {a} dice que así termina todo'), ['nekoapi:creampie', 'purr:cum']],
  nsfwcum: ['💧', NL('{a} le mostró a {b} una de acabadas | {a} le dedicó a {b} un cum'), NL('{a} anda mirando acabadas | {a} se quedó mirando | {a} dice que ya está, que terminó'), ['purr:cum', 'nekoapi:cum']],
  nsfwdick: ['🍆', NL('{a} le mostró una pija a {b} | {a} le dedicó a {b} una de esas'), NL('{a} anda mirando pijas | {a} dice que el tamaño no importa, pero se fija | {a} se quedó mirando'), ['nekoapi:dick', 'purr:neko']],
  nsfworgasm: ['😵', NL('{a} le mostró un orgasmo a {b} | {a} le dedicó a {b} la cara del final'), NL('{a} se quedó con la cara de orgasmo | {a} anda mirando caras | {a} dice que esa cara no se actúa'), ['nekoapi:orgasm', 'purr:solo']],
  nsfwmasturbation: ['🖐️', NL('{a} le mostró a {b} una paja | {a} le dedicó a {b} una de masturbación'), NL('{a} se está tocando | {a} anda a mano | {a} dice que a mano también se disfruta'), ['purr:solo', 'purr:solo_male']],
  nsfwthreesome: ['🔺', NL('{a} le mostró un trío a {b} | {a} le dedicó a {b} una de tres'), NL('{a} se metió en un trío | {a} dice que tres es mejor que dos | {a} anda mirando tríos'), ['purr:threesome_ffm', 'purr:threesome_mmf']],
  nsfwyaoi: ['👬', NL('{a} le mostró un yaoi a {b} | {a} le dedicó a {b} una de dos tipos'), NL('{a} anda mirando yaoi | {a} dice que entre ellos se entienden | {a} se quedó mirando'), ['purr:yaoi', 'nekoapi:yuri']],
  nsfwsolomale: ['🍌', NL('{a} le mostró a {b} una de un tipo solo | {a} le dedicó a {b} una de esas'), NL('{a} anda mirando tipos solos | {a} dice que también cuenta | {a} se quedó mirando'), ['purr:solo_male', 'purr:solo']],
  // ---- fetiches ----
  nsfwtentacles: ['🐙', NL('{a} le mostró unos tentáculos a {b} | {a} le dedicó a {b} una de tentáculos'), NL('{a} se quedó con los tentáculos | {a} anda mirando pulpos | {a} dice que los tentáculos tienen ventaja'), ['nekoapi:tentacle', 'nekoapi:pussy']],
  nsfwbdsm: ['⛓️', NL('{a} le mostró a {b} una de ataduras | {a} le dedicó a {b} una de BDSM'), NL('{a} anda mirando ataduras | {a} se quedó atado | {a} dice que le gusta que manden'), ['nekoapi:restrained', 'nekoapi:bdsm', 'nekoapi:pussy']],
  nsfwfemdom: ['👠', NL('{a} le mostró a {b} una de dominantes | {a} le dedicó a {b} una que manda'), NL('{a} anda mirando dominantes | {a} se quedó sumiso | {a} dice que acá manda ella'), ['nekoapi:femdom', 'nekoapi:pussy']],
  nsfwfootjob: ['🦶', NL('{a} le mostró un footjob a {b} | {a} le dedicó a {b} una de pies'), NL('{a} anda mirando footjobs | {a} se quedó mirando pies | {a} dice que con los pies también se hace'), ['neko:feet', 'purr:neko']],
  nsfwgangbang: ['👥', NL('{a} le mostró a {b} una de varios | {a} le dedicó a {b} una gangbang'), NL('{a} se quedó mirando | {a} dice que cuantos más, mejor | {a} anda mirando de a varios'), ['purr:threesome_ffm', 'purr:threesome_mmf']],
  nsfworgy: ['🎉', NL('{a} le mostró una orgía a {b} | {a} le dedicó a {b} una de esas fiestas'), NL('{a} se metió en una orgía | {a} dice que ahí no sobra nadie | {a} anda mirando fiestas'), ['purr:threesome_fff', 'purr:threesome_ffm']],
  nsfwyuri: ['👭', NL('{a} le mostró un yuri a {b} | {a} le dedicó a {b} una de dos minas'), NL('{a} anda mirando yuri | {a} dice que dos mejor que una | {a} se quedó mirando'), ['purr:yuri', 'nekoapi:yuri']],
  nsfwundress: ['👚', NL('{a} le mostró a {b} cómo se desviste | {a} le dedicó a {b} una de desnudarse'), NL('{a} se está desvistiendo | {a} anda sacándose la ropa | {a} dice que después no se la pone más'), ['nekoapi:undress', 'nekoapi:exposed_girl_breasts']],
  nsfwstrip: ['🎭', NL('{a} le hizo un strip a {b} | {a} le dedicó a {b} un baile'), NL('{a} se mandó un strip | {a} anda bailando | {a} dice que cobra por esto'), ['nekoapi:strip', 'nekosia:lying-down']],
  nsfwharem: ['💞', NL('{a} le mostró un harén a {b} | {a} le dedicó a {b} una de muchas'), NL('{a} anda mirando harenes | {a} dice que no puede elegir una | {a} se quedó con todas'), ['purr:threesome_fff', 'nekosia:girl']],
  nsfwsuccubus: ['😈', NL('{a} le presentó una súcubo a {b} | {a} le mandó a {b} una que se lleva el alma'), NL('{a} se topó con una súcubo | {a} dice que le robó el alma y no le importa | {a} se quedó sin energía'), ['nekoapi:succubus', 'nekoapi:pussy']],
  nsfwincest: ['👪', NL('{a} le mostró una de familia a {b} | {a} le dedicó a {b} una incestuosa'), NL('{a} anda mirando de familia | {a} dice que la familia también cuenta | {a} se quedó mirando'), ['nekoapi:incest', 'nekoapi:pussy']],
  nsfwpee: ['🚽', NL('{a} le mostró una de meadas a {b} | {a} le dedicó a {b} una de esas'), NL('{a} anda mirando meadas | {a} dice que no le hace asco a nada | {a} se quedó mirando'), ['nekoapi:pee', 'purr:neko']],
  nsfwcuckold: ['🐂', NL('{a} le mostró a {b} una de cornudos | {a} le dedicó a {b} una cuckold'), NL('{a} anda mirando cornudos | {a} dice que mirar también gusta | {a} se quedó de espectador'), ['nekoapi:cuckold', 'purr:fuck']],
  nsfwhgame: ['🎮', NL('{a} le mostró a {b} una de videojuegos | {a} le dedicó a {b} una de esas del juego'), NL('{a} se quedó con el videojuego | {a} dice que ahí sí juega | {a} anda mirando personajes'), ['nekoapi:video_game', 'nekosia:vtuber']],
  nsfwclassic: ['🖼️', NL('{a} le mostró a {b} una clásica | {a} le dedicó a {b} una de las de antes'), NL('{a} anda mirando clásicos | {a} dice que lo clásico no falla | {a} se quedó mirando'), ['nekoapi:exposed_girl_breasts', 'nekosia:girl']],
  nsfwrandom: ['🎲', NL('{a} le mandó algo al azar a {b} | {a} le dedicó a {b} una sorpresa'), NL('{a} tiró los dados | {a} no sabe qué le va a salir | {a} se la jugó al azar'), ['purr:neko', 'nekoapi:exposed_girl_breasts']],
};
const NX_RE = new RegExp('^\\/(' + Object.keys(NX).sort((a, b) => b.length - a.length).join('|') + ')(\\s|$)', 'i');
let nxEnCurso = 0;

// lee un campo anidado: 'url', 'message', 'image.original.url' o '[0].url'
function nxCampo(dato, ruta) {
  return ruta.split('.').reduce((o, k) => {
    if (o == null) return undefined;
    return k.startsWith('[') ? o[Number(k.slice(1, -1))] : o[k];
  }, dato);
}
// pide la URL a la primera fuente que devuelva algo válido (las caídas o sin resultados se saltean)
async function nxUrl(fuente) {
  const [api, ruta] = fuente.split(':');
  const base = NX_BASES[api];
  if (!base) throw new Error(api + ': api desconocida');
  const r = await axios.get(base.url + ruta + (base.sufijo || ''), { timeout: 12000, headers: { 'User-Agent': NSFW_UA, Accept: 'application/json' } });
  const u = nxCampo(r.data, base.campo);
  if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
  throw new Error(`${api}:${ruta} sin resultado`);
}
// baja el archivo a memoria y dice si es un GIF (los CDN piden Referer del sitio de origen)
async function nxBajar(url) {
  const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
  const ref = NSFW_REF || (/purrbot/i.test(host) ? 'https://purrbot.site/' : /nekobot/i.test(host) ? 'https://nekobot.xyz/'
    : /nekosapi/i.test(host) ? 'https://nekosapi.com/' : /nekosia/i.test(host) ? 'https://nekosia.cat/' : '');
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 30 * 1024 * 1024,
    headers: { 'User-Agent': NSFW_UA, ...(ref ? { Referer: ref } : {}) } });
  const buf = Buffer.from(r.data);
  if (buf.length < 200) throw new Error('archivo vacío');
  const ct = String(r.headers['content-type'] || '');
  const gif = /gif/i.test(ct) || (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46);
  return { buf, gif, ct };
}
// NekosAPI entrega webp y WhatsApp no siempre lo muestra: se pasa el primer frame a jpg
function nxWebpAJpg(buf) {
  return new Promise((ok, mal) => {
    const { spawn } = require('child_process');
    let p;
    try { p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-q:v', '3', '-f', 'mjpeg', 'pipe:1']); }
    catch (e) { return mal(e); }
    const salida = [], error = [];
    p.stdout.on('data', d => salida.push(d));
    p.stderr.on('data', d => error.push(d));
    p.on('error', mal);
    p.stdin.on('error', () => {});
    p.on('close', c => (c === 0 && Buffer.concat(salida).length > 200)
      ? ok(Buffer.concat(salida))
      : mal(new Error('ffmpeg ' + c + ' ' + Buffer.concat(error).toString().slice(0, 200))));
    p.stdin.end(buf);
  });
}
async function nxCmd(m, jid, text) {
  const nombre = ((text.match(/^\/(\w+)/) || [])[1] || '').toLowerCase();
  const def = NX[nombre]; if (!def) return;
  const [emoji, con, solo, fuentes] = def;
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!nsfwOn(jid)) return reply('🔞 Los comandos NSFW están desactivados en este grupo. Un admin puede activarlos con /nsfw on');
  if (nxEnCurso >= 4) return reply('⏳ Hay muchas imágenes en cola, probá de nuevo en un momento');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  nxEnCurso++; reaccion('⏳');                    // sin esperar: no frena el resto
  try {
    const obj = await rxObjetivo(m, jid).catch(() => null);
    const yo = senderIds(m, jid);
    const conObj = !!obj && !obj.ids.some(x => yo.includes(x));   // si sos vos mismo, cuenta como sin nadie
    const menciones = [];
    let a = rxLimpio(m.pushName) || rxNombreDe(yo);
    if (!a) { const sj = m.key.participant || m.key.remoteJid || jid; a = '@' + num(sj); menciones.push(sj); }
    let b = '';
    if (conObj) { b = obj.nombre; if (!b) { b = '@' + num(obj.jid); menciones.push(obj.jid); } }
    const lista = conObj ? con : solo;
    const frase = lista[Math.floor(Math.random() * lista.length)].replaceAll('{a}', a).replaceAll('{b}', b);
    let archivo = null, ultimo;
    for (const f of fuentes) {                    // las fuentes se prueban en orden hasta que una devuelva algo
      try { archivo = await nxBajar(await nxUrl(f)); break; }
      catch (e) { ultimo = e; console.error('[nsfw]', nombre, f, e.message); }
    }
    if (!archivo) throw ultimo || new Error('sin archivo');
    const extra = menciones.length ? { mentions: [...new Set(menciones)] } : {};
    const caption = `${frase} ${emoji}`;
    if (archivo.gif && await ytTieneFfmpeg()) {
      const mp4 = await rxTurno(() => rxMp4(archivo.buf));
      await sock.sendMessage(jid, { video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption, ...extra }, { quoted: m });
    } else {
      let img = archivo.buf, mime = archivo.ct || 'image/jpeg';
      if (/webp/i.test(mime)) {                   // webp a jpg, si no algunos clientes no lo abren
        try { img = await rxTurno(() => nxWebpAJpg(archivo.buf)); mime = 'image/jpeg'; }
        catch (e) { console.error('[nsfw] webp', e.message); }
      }
      await sock.sendMessage(jid, { image: img, mimetype: mime, caption, ...extra }, { quoted: m });
    }
  } catch (e) {
    console.error('[nsfw]', nombre, e.message);
    await reply('❌ No pude traer la imagen (las APIs están fallando). Probá de nuevo en un rato');
  } finally { nxEnCurso--; reaccion(''); }
}

// ---------- /nsfw on|off: habilita o deshabilita los comandos NSFW (como /r34) en el grupo; lo cambian los admins y el dueño ----------
// Para bloquear otro comando NSFW, ponele esta línea al principio:  if (!nsfwOn(jid)) return reply('🔞 Los comandos NSFW están desactivados en este grupo. Un admin puede activarlos con /nsfw on');
async function nsfwCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!jid.endsWith('@g.us')) return reply('🔞 En el privado los comandos NSFW están siempre habilitados. /nsfw es solo para grupos');
  const arg = text.replace(/^\/\S+\s*/, '').trim().toLowerCase();
  if (!arg) return reply(`🔞 Comandos NSFW: *${nsfwOn(jid)? 'activados' : 'desactivados'}* en este grupo\n> Los cambia un admin con /nsfw on o /nsfw off`);
  if (arg!== 'on' && arg!== 'off') return reply('Uso: /nsfw on | /nsfw off | /nsfw (ver el estado)');
  if (!(await isAdmin(jid, m).catch(() => false)) &&!(await isOwner(m, jid).catch(() => false))) return reply('⛔ Solo admins');
  if (arg === 'on') nsfw[jid] = true; else delete nsfw[jid];
  saveNsfw();
  await reply(arg === 'on'? '🔞 Comandos NSFW *activados* en este grupo' : '✅ Comandos NSFW *desactivados* en este grupo');
}

// ---------- /nuevo: descarga imágenes de un sitio con la API de Sylphy (único parámetro: query) ----------
// Usa sylphyGet() y sylphyOn() de más arriba (header X-API-Key y SYLPHY_KEY del .env). sylphyGet ya devuelve el "result" de la respuesta.
const R34_RUTA = '/search/rule34';   // ← la ruta exacta que dice la doc de Sylphy
const R34_PARAM = 'text';                 // ← el nombre exacto del parámetro en la doc (ojo: /search/spotify usa 'q')
const R34_MAX = 10;                         // ← cuántas imágenes manda como máximo
const R34_REF = '';                        // ← si el CDN da 403, poné acá la web del sitio (ej. 'https://sitio.com/')
// junta las URLs de imagen de la respuesta (lista de strings, lista de objetos con url, o una clave que trae la lista)
function r34Urls(res) {
  const lista = Array.isArray(res) ? res : (Object.values(res || {}).find(Array.isArray) || []);
  return lista.map(x => typeof x === 'string' ? x : spUrl(x, ['url', 'image', 'img', 'src', 'link'])).filter(u => /^https?:\/\//i.test(u || ''));
}
// baja una imagen a memoria (no se la pasamos a WhatsApp por URL: muchos CDN bloquean el hotlink)
async function r34Bajar(u) {
  const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 15 * 1024 * 1024, maxRedirects: 5,
    headers: { 'User-Agent': TT_UA, ...(R34_REF ? { Referer: R34_REF } : {}) } });
  if (!/^image\//i.test(r.headers['content-type'] || '')) throw new Error('no es una imagen');
  return Buffer.from(r.data);
}
async function r34Cmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!nsfwOn(jid)) return reply('🔞 Los comandos NSFW están desactivados en este grupo. Un admin puede activarlos con /nsfw on');
  // if (!(await isAllowed(m, jid))) return;   // ← descomentá si lo tiene que usar solo el dueño o la whitelist
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const citado = q ? (q.conversation || q.extendedTextMessage?.text || '') : '';
  const query = (text.replace(/^\/\S+\s*/, '').trim() || citado).trim();   // el texto del comando o, si no hay, el del mensaje citado
  if (!query) return reply('Uso: /r34 <búsqueda>\n> Ejemplo: /r34 Rias_Gremory\n> También podés responder a un mensaje con /r34');
  if (!sylphyOn()) return reply('❌ Falta SYLPHY_KEY en el .env del bot');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  try {
    const urls = r34Urls(await sylphyGet(R34_RUTA, { [R34_PARAM]: query }));
    console.log(`[r34] "${query}": ${urls.length} imágenes`);
    if (!urls.length) throw Object.assign(new Error('sin imágenes'), { sin: true });
    await reply('Enviando... 📤');
    const imgs = [];
    for (const u of urls.slice(0, R34_MAX * 3)) {   // las que fallen se saltean; se prueba con las siguientes
      if (imgs.length >= R34_MAX) break;
      try { imgs.push(await r34Bajar(u)); }
      catch (e) { console.error('[r34] imagen salteada:', u.slice(0, 90), e.message); }
    }
    if (!imgs.length) throw new Error('no pude bajar ninguna imagen');
    for (const img of imgs) await sock.sendMessage(jid, { image: img });   // sin citar y sin texto, una tras otra: WhatsApp las junta en álbum

  } catch (e) {
    console.error('[r34] ERROR', e.message);
    await reply(e.sin ? '🔎 No encontré nada con esa búsqueda'
      : /-> 429/.test(e.message) ? '⏳ Se están limitando las consultas. Probá en un rato'
      : /-> (401|403)/.test(e.message) ? '❌ Se rechazó la consulta (clave inválida o sin permiso). Revisá SYLPHY_KEY'
      : /certificate|altnames|-> 5\d\d|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timeout/i.test(e.message) ? '❌ La API de Sylphy no responde ahora. Probá en un rato'
      : e.message === 'no pude bajar ninguna imagen' ? '❌ No pude bajar las imágenes (el sitio las bloquea o no responden). Probá en un rato'
      : '❌ No pude procesarlo. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}

// ---------- /search: busca en YouTube y lista los primeros 20 (título, duración y link) ----------
// Va directo a la web de YouTube con tus cookies (YT_COOKIES=./cookies.txt, formato Netscape), sin yt-dlp: es liviano y no tumba el hosting por memoria.
const YT_WEB = (process.env.YT_WEB_URL || 'https://www.youtube.com').replace(/\/+$/, '');
const YT_UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// lee el cookies.txt y arma el encabezado Cookie solo con las de youtube.com
function ytCookieHeader() {
  const f = process.env.YT_COOKIES;
  if (!f ||!fs.existsSync(f)) return '';
  const v = new Map();
  for (let l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (l.startsWith('#HttpOnly_')) l = l.slice(10); else if (!l.trim() || l.startsWith('#')) continue;
    const c = l.split('\t'); if (c.length < 7) continue;
    if (!/(^|\.)youtube\.com$/i.test(c[0].replace(/^\./, ''))) continue;
    if (Number(c[4]) > 0 && Number(c[4]) < Date.now() / 1000) continue;   // vencida
    v.set(c[5], c.slice(6).join('\t').trim());
  }
  return [...v].map(([k, x]) => `${k}=${x}`).join('; ');
}
// recorre el JSON de YouTube y junta los videos (soporta el formato clásico y el nuevo "lockup")
function ytVideosDe(obj, out = new Map(), cont = { t: null }) {
  if (!obj || typeof obj!== 'object') return out;
  if (Array.isArray(obj)) { for (const x of obj) ytVideosDe(x, out, cont); return out; }
  const vr = obj.videoRenderer;
  if (vr?.videoId &&!out.has(vr.videoId)) {
    const live = (vr.thumbnailOverlays || []).some(o => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE') ||!vr.lengthText;
    out.set(vr.videoId, { id: vr.videoId, titulo: (vr.title?.runs || []).map(r => r.text).join('') || vr.title?.simpleText || '', dur: vr.lengthText?.simpleText || (live? 'en vivo' : '') });
  }
  const lk = obj.lockupViewModel;
  if (lk?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && lk.contentId &&!out.has(lk.contentId)) {
    let dur = '';
    for (const o of lk.contentImage?.thumbnailViewModel?.overlays || [])
      for (const b of o.thumbnailBottomOverlayViewModel?.badges || []) dur = dur || b.thumbnailBadgeViewModel?.text || '';
    out.set(lk.contentId, { id: lk.contentId, titulo: lk.metadata?.lockupMetadataViewModel?.title?.content || '', dur });
  }
  const tk = obj.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  if (tk) cont.t = tk;
  for (const k of Object.keys(obj)) if (k!== 'videoRenderer' && k!== 'lockupViewModel') ytVideosDe(obj[k], out, cont);
  return out;
}
async function ytBuscarLista(q, max = 20) {
  const ck = ytCookieHeader();
  const hdr = { 'User-Agent': YT_UA_PC, 'Accept-Language': 'es-AR,es;q=0.9', ...(ck? { Cookie: ck } : {}) };
  const r = await axios.get(`${YT_WEB}/results`, { params: { search_query: q, hl: 'es', gl: 'AR' }, timeout: 20000, headers: hdr });
  const html = String(r.data);
  const m = /ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
  if (!m) throw new Error('YT_SIN_DATOS');
  const cont = { t: null }, out = new Map();
  ytVideosDe(JSON.parse(m[1]), out, cont);
  // si la primera página no llega a 20, pide las siguientes
  const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1], ver = /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1] || '2.20240101.00.00';
  for (let i = 0; i < 3 && out.size < max && cont.t && key; i++) {
    const tk = cont.t; cont.t = null;
    try {
      const r2 = await axios.post(`${YT_WEB}/youtubei/v1/search`, { context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'es', gl: 'AR' } }, continuation: tk }, { params: { key }, timeout: 20000, headers: { ...hdr, 'Content-Type': 'application/json' } });
      ytVideosDe(r2.data, out, cont);
    } catch (e) { console.error('[search] página siguiente falló:', e.message); break; }
  }
  const lista = [...out.values()].filter(v => v.titulo).slice(0, max);
  if (!lista.length) { console.log('[search] sin videos; claves de la página:', Object.keys(JSON.parse(m[1])).join(',')); throw new Error('SIN_RESULTADOS'); }
  return lista;
}
async function searchCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const q = text.replace(/^\/\S+\s*/, '').trim();
  if (!q) return reply('Uso: /search <búsqueda>\n> Ejemplo: /search los gardelitos\n> Te muestro los primeros 20 resultados de YouTube con título, duración y link.');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  try {
    const lista = await ytBuscarLista(q, 20);
    const cortar = t => t.length > 90? t.slice(0, 89).trimEnd() + '…' : t;
    const cuerpo = lista.map((v, i) => `*${i + 1}.* ${cortar(v.titulo)}\n> ⏱ ${v.dur || '—'}\n> https://youtu.be/${v.id}`).join('\n\n');
    await sock.sendMessage(jid, { text: `🔎 *Resultados para "${q}"*\n\n${cuerpo}` }, { quoted: m });
    console.log(`[search] "${q}": ${lista.length} resultados${process.env.YT_COOKIES? '' : ' (sin cookies)'}`);
  } catch (e) {
    console.error('[search] ERROR', e.response?.status || '', e.message);
    await reply(e.message === 'SIN_RESULTADOS'? '🔎 No encontré nada con esa búsqueda'
      : e.response?.status === 429 || e.response?.status === 403? '❌ YouTube bloqueó la búsqueda ahora. Probá de nuevo en un rato'
      : '❌ No pude buscar en YouTube ahora. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}

async function ytCmd(m, jid, text, audio) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const { arg, link } = ytEntrada(m, text);
  const cmd = audio? '/ytaudio' : '/ytvideo';
  if (!link &&!arg) return reply(`Uso:\n${cmd} <link de YouTube>\n${cmd} <título o búsqueda>\n${cmd} (respondiendo a un mensaje con el link)`);
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  if (ytEnCola) await reply('⏳ Hay otra descarga de YouTube en curso. Te toca en un rato.');
  console.log(`[yt] ${audio? 'audio' : 'video'}:`, link || `búsqueda "${arg}"`);
  const infoP = ytInfo(link || arg);   // la ficha se pide mientras se descarga
  let it;
  try {
    it = await ytTurno(async () => {
      try { return await ytDlp(link || `ytsearch1:${arg}`, audio); }
      catch (e) {
        if (e.message === 'GRANDE') throw e;
        console.error('[yt] yt-dlp falló:', (e.stderr || e.message).slice(-400));
        if (!process.env.COBALT_API) throw e;
        console.log('[yt] pruebo el respaldo (cobalt)');
        const url = link || `https://www.youtube.com/watch?v=${await ytBuscarId(arg)}`;
        return await ytRespaldo(url, audio);
      }
    });
    await ytEnviar(m, jid, it, audio, infoP);
  } catch (e) {
    const raw = `${e.stderr || ''} ${e.message}`;
    console.error('[yt] ERROR', raw.slice(-500));
    await reply(
      e.message === 'GRANDE'? `❌ El archivo pesa más de ${TT_MAX / 1024 / 1024} MB` :
      e.message === 'SIN_RESULTADOS'? '🔎 No encontré nada con esa búsqueda' :
      /Sign in to confirm|not a bot/i.test(raw)? '❌ YouTube bloqueó la IP del hosting ("confirmá que no sos un bot"). Configurá YT_COOKIES o COBALT_API en el .env.' :
      /Private video|members-only|Sign in to confirm your age|age-restricted/i.test(raw)? '❌ Ese video es privado o tiene restricción de edad.' :
      /ENOENT|EACCES|ENOEXEC|spawn/i.test(raw)? '❌ No pude ejecutar yt-dlp en este hosting. Mirá la consola.' :
      '❌ No pude descargarlo. Revisá que el link sea público y probá de nuevo');
  } finally {
    if (it?.archivo) fs.rmSync(it.archivo, { force: true });
    reaccion('');
  }
}

// ---------- /apk: busca en Aptoide y F-Droid (hasta 20 resultados) y manda el APK (se elige respondiendo a la lista con el número) ----------
const APK_API = 'https://ws75.aptoide.com/api/7/apps/search';
const APK_ESPERA = 5 * 60e3;                 // la lista vale 5 minutos
const apkPorMsg = new Map();                 // id del mensaje con la lista -> { bot, jid, ids, items }
const fmtMB = n => `${(n / 1048576).toFixed(n >= 10485760? 0 : 1)} MB`;
const APK_TOTAL = 20, APK_POR_FUENTE = 10;   // la lista tiene hasta 20: 10 de cada fuente (si una trae menos, la otra completa)
const FD_WEB = 'https://f-droid.org';
async function apkAptoide(q) {
  const r = await axios.get(`${APK_API}/query=${encodeURIComponent(q)}/limit=${APK_TOTAL}`, { timeout: 20000, headers: { 'User-Agent': TT_UA, Accept: 'application/json' } });
  const lista = r.data?.datalist?.list || [];
  return lista.filter(a => a.file?.path).slice(0, APK_TOTAL).map(a => ({
    fuente: 'Aptoide', nombre: a.name, paquete: a.package, version: a.file.vername || '', tam: a.file.filesize || a.size || 0,
    url: a.file.path, malware: String(a.file.malware?.rank || '').toUpperCase(), obb: !!a.obb,
  }));
}
// F-Droid: la búsqueda sale de la API de Sylphy (solo devuelve links de fichas) y el nombre, la versión y el APK salen de la ficha pública de F-Droid
const fdPaquete = u => (/\/packages\/([A-Za-z0-9._]+)/.exec(String(u?.url || u)) || [])[1] || null;
const fdBytes = (n, u) => Math.round(parseFloat(String(n).replace(/,/g, '')) * ({ KIB: 1024, MIB: 1048576, GIB: 1073741824 }[String(u).toUpperCase()] || 0)) || 0;
function fdFicha(html, paquete) {
  const esc = paquete.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`https://f-droid\\.org/repo/${esc}_(\\d+)(_[0-9a-f]+)?\\.apk`, 'g'), apks = [];
  for (let m; (m = re.exec(html));) apks.push({ code: Number(m[1]), suf: m[2] || '', url: m[0], pos: m.index });
  if (!apks.length) return null;
  const buenos = apks.filter(x => !x.suf), elegido = (buenos.length? buenos : apks).reduce((p, x) => x.code > p.code? x : p);   // la versión más nueva (sin variante de firma)
  const nombre = dec((/<title>\s*([^<|]+?)\s*\|/.exec(html) || [])[1] || '').trim() || paquete;
  const antes = html.slice(Math.max(0, elegido.pos - 1500), elegido.pos), vers = [...antes.matchAll(/<b>\s*(?:Version|Versi[oó]n)\s+([^<]+?)\s*<\/b>/gi)].pop();
  const resto = html.slice(elegido.pos + 30, elegido.pos + 700), corte = resto.indexOf('/repo/'), peso = /([\d][\d.,]*)\s*(KiB|MiB|GiB)/i.exec(corte > 0? resto.slice(0, corte) : resto);   // el peso que figura después del link y antes del siguiente
  return { nombre, paquete, version: vers? dec(vers[1]) : `build ${elegido.code}`, tam: peso? fdBytes(peso[1], peso[2]) : 0, url: elegido.url, malware: '', obb: false, fuente: 'F-Droid' };
}
async function apkPool(lista, n, fn) {   // corre fn sobre cada elemento, de a n por vez; lo que falla queda en null
  const out = new Array(lista.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) { const k = i++; out[k] = await fn(lista[k], k).catch(() => null); } }));
  return out;
}
async function apkFDroid(q) {
  if (!sylphyOn()) return [];
  const res = await sylphyGet('/search/fdroid', { q });
  const paquetes = [...new Set((Array.isArray(res)? res : []).map(fdPaquete).filter(Boolean))].slice(0, APK_POR_FUENTE + 4);
  const fichas = await apkPool(paquetes, 5, async p => {
    const r = await axios.get(`${FD_WEB}/en/packages/${p}/`, { timeout: 9000, responseType: 'text', maxContentLength: 4e6, headers: { 'User-Agent': TT_UA, 'Accept-Language': 'en' } });
    const f = fdFicha(String(r.data), p);
    if (f &&!f.tam) { try { f.tam = Number((await axios.head(f.url, { timeout: 5000, headers: { 'User-Agent': TT_UA } })).headers['content-length']) || 0; } catch {} }   // si la ficha no dice el peso, se lo pregunta al servidor
    return f;
  });
  return fichas.filter(Boolean);
}
async function apkBuscar(q) {
  const [a, f] = await Promise.all([
    apkAptoide(q).catch(e => { console.error('[apk] Aptoide:', e.response?.status || '', e.message); return null; }),
    apkFDroid(q).catch(e => { console.error('[apk] F-Droid:', e.response?.status || '', e.message); return null; }),
  ]);
  if (!a &&!f) throw new Error('APK_FUENTES');
  const A = a || [], F = f || [];
  let nA = Math.min(A.length, APK_POR_FUENTE), nF = Math.min(F.length, APK_POR_FUENTE), resto = APK_TOTAL - nA - nF;
  const extraA = Math.min(A.length - nA, resto); nA += extraA; resto -= extraA;
  nF += Math.min(F.length - nF, resto);
  return [...A.slice(0, nA), ...F.slice(0, nF)];
}
const apkSello = r => r === 'TRUSTED'? '✅' : r === 'UNKNOWN' || !r? '⚠️' : '❌';
async function apkCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const q = text.replace(/^\/\S+\s*/, '').trim();
  if (!q) return reply('Uso: /apk <nombre de la app>\n> Ejemplo: /apk whatsapp\n> Después respondé a la lista con el número de la que querés.');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  try {
    const items = await apkBuscar(q);
    if (!items.length) return await reply('🔎 No encontré apps con esa búsqueda');
    const bloques = []; let ult = '';
    items.forEach((a, i) => {
      if (a.fuente!== ult) { ult = a.fuente; bloques.push(`── *${ult}* ──`); }
      bloques.push(`*${i + 1}.* ${a.nombre}\n> ${a.paquete}\n> ${/^\d/.test(a.version)? 'v' : ''}${a.version} · ${a.tam? fmtMB(a.tam) : '?'} ${a.fuente === 'F-Droid'? '🌿' : apkSello(a.malware)}${a.tam > TT_MAX? ' · 🚫 pesa más del tope' : ''}${a.obb? ' · ⚠️ usa OBB (no se incluye)' : ''}`);
    });
    const lista = bloques.join('\n\n');
    const s = await sock.sendMessage(jid, { text: `📦 *Resultados para "${q}"*\n\n${lista}\n\n> Respondé a este mensaje con el número (1-${items.length}) para descargarlo\n> ✅ verificado por Aptoide · ⚠️ sin verificar · 🌿 F-Droid (código abierto)` }, { quoted: m });
    if (s?.key?.id) {
      const ids = await ecoIds(m, jid);
      apkPorMsg.set(s.key.id, { bot: ctxBot(), jid, ids, items });
      setTimeout(() => apkPorMsg.delete(s.key.id), APK_ESPERA).unref?.();
    }
  } catch (e) {
    console.error('[apk] ERROR búsqueda', e.response?.status || '', e.message);
    await reply('❌ No pude buscar ahora. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}
// respuesta con el número a la lista de /apk
async function apkElegir(m, jid, st, n) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const ids = await ecoIds(m, jid);
  if (!ids.some(x => st.ids.includes(x))) return reply('Esa lista no es tuya 🙄 Pedí la tuya con /apk');
  const a = st.items[n - 1]; if (!a) return;
  if (a.tam > TT_MAX) return reply(`❌ *${a.nombre}* pesa ${fmtMB(a.tam)} y el tope es ${TT_MAX / 1024 / 1024} MB.`);
  return descargar(m, jid, 'apk', { a }, () => apkEnviar(m, jid, a));
}
// baja el APK elegido y lo envía (en modo worker corre en el worker)
async function apkEnviar(m, jid, a) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  fs.mkdirSync(TT_DIR, { recursive: true });
  const f = `${TT_DIR}/apk_${Date.now()}_${Math.random().toString(36).slice(2)}.apk`;
  try {
    if (ytEnCola) await reply('⏳ Hay otra descarga en curso. Te toca en un rato.');
    await ytTurno(async () => {
      console.log(`[apk] bajando ${a.nombre} ${a.version} (${fmtMB(a.tam)})`);
      await ttBajar(a.url, f, a.fuente === 'F-Droid'? 'https://f-droid.org/' : 'https://www.aptoide.com/');
      const peso = fs.statSync(f).size;
      const nombre = `${a.nombre}_${a.version}`.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '') + '.apk';
      const doc = peso <= 40 * 1048576? fs.readFileSync(f) : { url: f };
      await sock.sendMessage(jid, { document: doc, mimetype: 'application/vnd.android.package-archive', fileName: nombre,
        caption: `📦 *${a.nombre}*\n> ${/^\d/.test(a.version)? 'v' : ''}${a.version} · ${fmtMB(peso)}\n> ${a.paquete}${a.fuente? `\n> Fuente: ${a.fuente}` : ''}${a.obb? '\n> ⚠️ Esta app usa archivos OBB que no se incluyen' : ''}` }, { quoted: m });
      console.log(`[apk] enviado ${nombre} ${fmtMB(peso)}`);
    });
  } catch (e) {
    console.error('[apk] ERROR', e.response?.status || '', e.message);
    await reply(e.message === 'GRANDE'? `❌ El APK pesa más de ${TT_MAX / 1024 / 1024} MB` : '❌ No pude descargar ese APK. Probá con otro de la lista o de nuevo en un rato');
  } finally { fs.rmSync(f, { force: true }); reaccion(''); }
}

// ---------- /mf /mediafire: archivos de MediaFire (links públicos de un archivo; no pide cuenta) ----------
// Saca el enlace directo de la página del archivo y lo baja. Si la página pide contraseña, captcha o verificación, avisa y no intenta esquivarlo.
const MF_RE = /https?:\/\/(?:www\.|download\d*\.)?mediafire\.com\/[^\s<>"']+/i;
const mfHostOk = u => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)mediafire\.com$/i.test(x.hostname); } catch { return false; } };
const MF_MIME = { zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', apk: 'application/vnd.android.package-archive', xapk: 'application/zip',
  pdf: 'application/pdf', mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', json: 'application/json', js: 'text/javascript',
  mcpack: 'application/zip', mcaddon: 'application/zip', mcworld: 'application/zip', mctemplate: 'application/zip', iso: 'application/x-iso9660-image' };
// baja la página del archivo (o detecta que el link ya es la descarga directa)
async function mfPagina(link) {
  const r = await axios.get(link, { responseType: 'stream', timeout: 20000, maxRedirects: 5, validateStatus: () => true,
    headers: { 'User-Agent': YT_UA_PC, 'Accept-Language': 'es-AR,es;q=0.9', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } });
  const final = r.request?.res?.responseUrl || link;
  if (!mfHostOk(final)) { r.data.destroy(); throw new Error('MF_HOST'); }
  if (r.status >= 400) { r.data.destroy(); throw Object.assign(new Error('MF_HTTP'), { status: r.status }); }
  if (!/text\/html/i.test(String(r.headers['content-type'] || ''))) { r.data.destroy(); return { directo: final }; }
  r.data.setEncoding('utf8');
  let html = ''; for await (const c of r.data) { html += c; if (html.length > 3e6) { r.data.destroy(); break; } }
  return { html, final };
}
// busca el enlace de descarga dentro de la página; null si no está
function mfEnlace(html) {
  const limpio = u => { u = dec(u); return mfHostOk(u)? u : null; };
  const scr = /data-scrambled-url="([^"]+)"/.exec(html)?.[1];
  if (scr) { try { const u = limpio(Buffer.from(scr, 'base64').toString('utf8')); if (u) return u; } catch {} }
  for (const re of [/id="downloadButton"[^>]*?href="([^"]+)"/, /href="([^"]+)"[^>]*?id="downloadButton"/, /aria-label="Download file"[^>]*?href="([^"]+)"/, /href="([^"]+)"[^>]*?aria-label="Download file"/]) {
    const u = limpio(re.exec(html)?.[1] || ''); if (u) return u;
  }
  return limpio(/https:\/\/download\d*\.mediafire\.com\/[^"'\s<>]+/.exec(html)?.[0] || '');
}
function mfEstado(html) {
  if (/Invalid or Deleted File|has been (removed|deleted)|file (is )?(no longer|not) (available|found)|key you provided for file download was invalid/i.test(html)) return 'MF_BORRADO';
  if (/type="password"|Enter Password|passwordForm/i.test(html)) return 'MF_CLAVE';
  if (/g-recaptcha|h-captcha|cf-turnstile|Just a moment\.\.\.|Attention Required/i.test(html)) return 'MF_BLOQUEO';
  return 'MF_SIN_ENLACE';
}
async function mfCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '') : '';
  const link = ((arg.match(MF_RE) || qt.match(MF_RE) || [])[0] || '').replace(/[)\].,;!?]+$/, '');
  if (!link) return reply('Uso:\n/mf <link de MediaFire>\n/mediafire <link>\n/mf (respondiendo a un mensaje con el link)');
  if (/mediafire\.com\/folder\//i.test(link)) return reply('📁 Ese link es una carpeta. Por ahora bajo archivos sueltos: abrí la carpeta y mandame el link de cada archivo.');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  fs.mkdirSync(TT_DIR, { recursive: true });
  let f = null;
  try {
    const p = await mfPagina(link);
    let url = p.directo || mfEnlace(p.html);
    if (!url) throw new Error(mfEstado(p.html));
    let nombre = p.html && /<div class="filename"[^>]*>([^<]+)</.exec(p.html)?.[1];
    if (!nombre) { try { nombre = decodeURIComponent(new URL(url).pathname.split('/').pop()); } catch { nombre = ''; } }
    nombre = String(nombre || 'archivo').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').trim().slice(0, 120) || 'archivo';
    const ext = (nombre.match(/\.([a-z0-9]{1,8})$/i) || [])[1]?.toLowerCase() || '';
    f = `${TT_DIR}/mf_${Date.now()}_${Math.random().toString(36).slice(2)}${ext? '.' + ext : ''}`;
    if (ytEnCola) await reply('⏳ Hay otra descarga en curso. Te toca en un rato.');
    await ytTurno(async () => {
      console.log(`[mf] bajando ${nombre}`);
      await ttBajar(url, f, 'https://www.mediafire.com/');
      const peso = fs.statSync(f).size;
      if (peso < 1) throw new Error('MF_VACIO');
      const doc = peso <= 40 * 1048576? fs.readFileSync(f) : { url: f };
      await sock.sendMessage(jid, { document: doc, mimetype: MF_MIME[ext] || 'application/octet-stream', fileName: nombre, caption: `📁 *${nombre}*\n> ${fmtMB(peso)} · MediaFire` }, { quoted: m });
      console.log(`[mf] enviado ${nombre} ${fmtMB(peso)}`);
    });
  } catch (e) {
    console.error('[mf] ERROR', e.status || e.response?.status || '', e.message);
    await reply(
      e.message === 'GRANDE'? `❌ El archivo pesa más de ${TT_MAX / 1024 / 1024} MB` :
      e.message === 'MF_BORRADO' || e.status === 404? '❌ Ese archivo ya no existe en MediaFire (lo borraron o el link está mal).' :
      e.message === 'MF_CLAVE'? '🔒 Ese archivo tiene contraseña. No puedo bajarlo.' :
      e.message === 'MF_BLOQUEO'? '🛡️ MediaFire pide una verificación (captcha) y desde el bot no se puede pasar. Probá más tarde o bajalo vos.' :
      e.message === 'MF_HOST'? '❌ Ese link no es de MediaFire.' :
      '❌ No pude sacar el archivo de ese link. Revisá que sea público y probá de nuevo');
  } finally { if (f) fs.rmSync(f, { force: true }); reaccion(''); }
}

// ---------- /getrepo /git: baja la rama main de un repositorio público de GitHub como .zip ----------
const GIT_NOMBRE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
function gitParse(arg) {   // "usuario/repo", "github.com/usuario/repo", "https://github.com/usuario/repo(.git)(/tree/...)" -> "usuario/repo" o null
  let s = String(arg || '').trim().split(/\s+/)[0].replace(/[)\].,;!?]+$/, '');
  s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/^github\.com\//i, '').replace(/^\/+/, '');
  const p = s.split(/[/?#]/).filter(Boolean); if (p.length < 2) return null;
  const nombre = `${p[0]}/${p[1].replace(/\.git$/i, '')}`;
  return GIT_NOMBRE.test(nombre) &&!/^\.+$/.test(nombre.split('/')[1])? nombre : null;
}
async function gitCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || '') : '';
  const repo = gitParse(arg) || (!arg && gitParse((qt.match(/github\.com\/[^\s<>"']+/i) || [])[0]));
  if (!repo) return reply('Uso:\n/git usuario/repo\n/getrepo usuario/repo\n(también sirve el link del repositorio)');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  fs.mkdirSync(TT_DIR, { recursive: true });
  const f = `${TT_DIR}/git_${Date.now()}_${Math.random().toString(36).slice(2)}.zip`;
  try {
    const bajar = rama => ttBajar(`https://codeload.github.com/${repo}/zip/refs/heads/${rama}`, f, 'https://github.com/');
    let rama = 'main';
    if (ytEnCola) await reply('⏳ Hay otra descarga en curso. Te toca en un rato.');
    await ytTurno(async () => {
      console.log(`[git] bajando ${repo}`);
      try { await bajar(rama); }
      catch (e) {
        if ((e.response?.status || e.status) !== 404) throw e;
        // no hay rama main: se prueba con la rama principal del repo (por ejemplo master); si ni eso, el repo no existe o es privado
        const info = await axios.get(`https://api.github.com/repos/${repo}`, { timeout: 15000, headers: { 'User-Agent': TT_UA, Accept: 'application/vnd.github+json' } }).catch(x => { throw Object.assign(new Error('GIT_NO'), { status: x.response?.status }); });
        rama = info.data?.default_branch;
        if (!rama || rama === 'main') throw new Error('GIT_NO');
        await bajar(rama);
      }
      const peso = fs.statSync(f).size;
      if (peso < 1) throw new Error('GIT_NO');
      const nombre = `${repo.split('/')[1]}-${rama}.zip`, doc = peso <= 40 * 1048576? fs.readFileSync(f) : { url: f };
      await sock.sendMessage(jid, { document: doc, mimetype: 'application/zip', fileName: nombre, caption: `📦 *${repo}*\n> Rama ${rama} · ${fmtMB(peso)} · GitHub` }, { quoted: m });
      console.log(`[git] enviado ${nombre} ${fmtMB(peso)}`);
    });
  } catch (e) {
    console.error('[git] ERROR', e.status || e.response?.status || '', e.message);
    await reply(
      e.message === 'GRANDE'? `❌ El repositorio pesa más de ${TT_MAX / 1024 / 1024} MB` :
      e.message === 'GIT_NO' || e.response?.status === 404? '❌ No encontré ese repositorio, o es privado. Solo bajo repos públicos.' :
      '❌ No pude bajar el repositorio. Revisá el nombre (usuario/repo) y probá de nuevo');
  } finally { fs.rmSync(f, { force: true }); reaccion(''); }
}

// ---------- /fb /x /ig /pin: descargas de otras redes (cada una prueba sus fuentes en orden) ----------
const dec = t => String(t || '').replace(/&amp;/g, '&').replace(/&#x2F;/g, '/').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\u0026/g, '&').replace(/\\\//g, '/');
const aleat = arr => arr[Math.floor(Math.random() * arr.length)];
const redGet = (url, extra = {}) => axios.get(url, { timeout: 15000, maxRedirects: 5, headers: { 'User-Agent': TT_UA, 'Accept-Language': 'en-US,en;q=0.9' },...extra });

// --- X / Twitter (solo link): fxtwitter, y vxtwitter de respaldo ---
async function redX(link) {
  const mm = link.match(/(?:x|twitter|fxtwitter|vxtwitter|fixupx)\.com\/(?:(\w+)\/)?status(?:es)?\/(\d+)/i);
  if (!mm) throw new Error('LINK_INVALIDO');
  const user = mm[1] || 'i', id = mm[2];
  const tipo = t => t === 'photo' || t === 'image'? 'image' : 'video';
  try {
    const t = (await redGet(`https://api.fxtwitter.com/${user}/status/${id}`)).data?.tweet;
    if (!t) throw new Error('fxtwitter: sin tweet');
    const med = t.media || t.quote?.media || {};
    const all = med.all || [...(med.photos || []).map(p => ({ type: 'photo', url: p.url })),...(med.videos || []).map(v => ({ type: 'video', url: v.url }))];
    const items = all.filter(x => x.url).map(x => ({ type: tipo(x.type), urls: [x.url] }));
    if (!items.length) throw new Error('SIN_MEDIA');
    return { items, caption: `𝕏 @${t.author?.screen_name || user}\n${t.text || ''}`.slice(0, 400).trim() };
  } catch (e) {
    if (e.message === 'SIN_MEDIA') throw e;
    console.error('[x] fxtwitter falló, pruebo vxtwitter:', e.message);
    const d = (await redGet(`https://api.vxtwitter.com/${user}/status/${id}`)).data;
    const items = (d?.media_extended || []).filter(x => x.url).map(x => ({ type: tipo(x.type), urls: [x.url] }));
    if (!items.length) throw new Error('SIN_MEDIA');
    return { items, caption: `𝕏 @${d.user_screen_name || user}\n${d.text || ''}`.slice(0, 400).trim() };
  }
}

// --- Pinterest (link o búsqueda) ---
const pinHeaders = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01' };
function pinMedia(d) { // datos de un pin -> items
  const items = [];
  const mp4 = vl => Object.values(vl || {}).filter(v => v?.url && /\.mp4(\?|$)/i.test(v.url)).sort((a, b) => (b.width || 0) - (a.width || 0)).map(v => v.url);
  const vids = mp4(d.videos?.video_list);
  if (vids.length) items.push({ type: 'video', urls: vids });
  const pages = d.story_pin_data?.pages || [];
  for (const pg of pages) for (const b of pg.blocks || []) {
    const v = mp4(b.video?.video_list); const im = b.image?.images?.originals?.url || b.image?.images?.orig?.url;
    if (v.length) items.push({ type: 'video', urls: v }); else if (im) items.push({ type: 'image', urls: [im] });
  }
  if (!items.length) {
    const slots = d.carousel_data?.carousel_slots || [];
    for (const s of slots) { const u = s.images?.orig?.url || s.images?.['736x']?.url; if (u) items.push({ type: 'image', urls: [u] }); }
  }
  if (!items.length) { const u = d.images?.orig?.url, u2 = d.images?.['736x']?.url; if (u || u2) items.push({ type: 'image', urls: [u, u2].filter(Boolean) }); }
  return items;
}
async function redPin(link, q) {
  if (q) { // búsqueda: una sola imagen, al azar entre las primeras
    let urls = [];
    try {
      const data = encodeURIComponent(JSON.stringify({ options: { query: q, scope: 'pins', page_size: 25 }, context: {} }));
      const r = await redGet(`https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent('/search/pins/?q=' + q)}&data=${data}`, { headers: { 'User-Agent': TT_UA,...pinHeaders } });
      urls = (r.data?.resource_response?.data?.results || []).filter(x => x?.images?.orig?.url).map(x => [x.images.orig.url, x.images['736x']?.url].filter(Boolean));
    } catch (e) { console.error('[pin] búsqueda API falló:', e.message); }
    if (!urls.length) {
      try {
        const h = String((await redGet('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(q))).data).replace(/\\\//g, '/');
        urls = [...new Set([...h.matchAll(/"orig":\{"url":"(https:[^"]+)"/g)].map(x => x[1]))].map(u => [u]);
      } catch (e) { console.error('[pin] búsqueda HTML falló:', e.message); }
    }
    if (!urls.length) throw new Error('SIN_RESULTADOS');
    return { items: [{ type: 'image', urls: aleat(urls.slice(0, 5)) }], caption: `📌 ${q}` };
  }
  let url = link;
  if (/pin\.it\//i.test(link)) { const r = await redGet(link); url = r.request?.res?.responseUrl || link; }
  const id = (url.match(/\/pin\/(?:[^\/?#]*--)?(\d+)/) || [])[1];
  if (!id) throw new Error('LINK_INVALIDO');
  try {
    const data = encodeURIComponent(JSON.stringify({ options: { id, field_set_key: 'detailed' }, context: {} }));
    const r = await redGet(`https://www.pinterest.com/resource/PinResource/get/?source_url=${encodeURIComponent('/pin/' + id + '/')}&data=${data}`, { headers: { 'User-Agent': TT_UA,...pinHeaders } });
    const d = r.data?.resource_response?.data;
    const items = d? pinMedia(d) : [];
    if (items.length) return { items, caption: `📌 ${(d.title || d.grid_title || d.description || '').trim()}`.slice(0, 300).trim() };
    throw new Error('sin datos en la API');
  } catch (e) {
    console.error('[pin] API falló, pruebo la página:', e.message);
    const h = String((await redGet(`https://www.pinterest.com/pin/${id}/`)).data).replace(/\\\//g, '/');
    const v = [...new Set([...h.matchAll(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\\\s]+?\.mp4/g)].map(x => x[0]))];
    if (v.length) return { items: [{ type: 'video', urls: v }], caption: '📌' };
    const o = [...new Set([...h.matchAll(/"orig":\{"url":"(https:[^"]+)"/g)].map(x => x[1]))];
    const og = (h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1];
    const urls = [o[0], og && dec(og).replace('/736x/', '/originals/'), og && dec(og)].filter(Boolean);
    if (!urls.length) throw new Error('SIN_MEDIA');
    return { items: [{ type: 'image', urls }], caption: '📌' };
  }
}

// --- Facebook / Instagram (solo link): primero snapsave, después las etiquetas og: de la página ---
function snapDecode(h, u, n, t, e) { // decodificador del JavaScript ofuscado que devuelve snapsave
  const alfa = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
  const aBase10 = (d, desde) => [...d].reverse().reduce((a, c, i) => a + (alfa.slice(0, desde).indexOf(c) >= 0? alfa.indexOf(c) * Math.pow(desde, i) : 0), 0);
  let r = '';
  for (let i = 0; i < h.length; i++) {
    let s = '';
    while (h[i]!== n[e] && i < h.length) { s += h[i]; i++; }
    for (let j = 0; j < n.length; j++) s = s.split(n[j]).join(j);
    r += String.fromCharCode(aBase10(s, e) - t);
  }
  return decodeURIComponent(escape(r));
}
async function redSnapsave(link) {
  const r = await axios.post('https://snapsave.app/action.php?lang=en', new URLSearchParams({ url: link }).toString(), {
    timeout: 20000, headers: { 'User-Agent': TT_UA, 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://snapsave.app', Referer: 'https://snapsave.app/' },
  });
  const txt = String(r.data);
  const ms = [...txt.matchAll(/\(\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g)];
  if (!ms.length) throw new Error('snapsave: respuesta sin datos');
  const [, h, u, n, t, e] = ms[ms.length - 1];
  const js = snapDecode(h, Number(u), n, Number(t), Number(e));
  const html = ((js.match(/innerHTML\s*=\s*"([\s\S]*?)";\s*(?:document|$)/) || [])[1] || js).replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, '\n');
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map(x => ({ href: dec((x[1].match(/href="([^"]+)"/) || [])[1]), texto: x[2].replace(/<[^>]+>/g, ' ') }))
    .filter(a => /^https?:/.test(a.href));
  const esImg = a => /\.(jpe?g|png|webp)(\?|$)/i.test(a.href) || /image|photo|foto/i.test(a.texto);
  const imgs = [...new Set(anchors.filter(esImg).map(a => a.href))];
  if (imgs.length) return { items: imgs.map(u => ({ type: 'image', urls: [u] })), caption: '' };
  const vids = [...new Set(anchors.map(a => a.href))];
  if (!vids.length) throw new Error('snapsave: sin enlaces');
  return { items: [{ type: 'video', urls: vids }], caption: '' }; // la primera suele ser la mejor calidad; las otras, respaldo
}
async function redOg(link) {
  const r = await redGet(link, { headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Accept-Language': 'en' } });
  const h = String(r.data);
  const metas = p => [...h.matchAll(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, 'gi')),...h.matchAll(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, 'gi'))].map(x => dec(x[1]));
  const vids = [...new Set([...metas('og:video:secure_url'),...metas('og:video:url'),...metas('og:video')])].filter(u => /^https?:/.test(u) && /\.mp4|video|fbcdn|cdninstagram/i.test(u));
  if (vids.length) return { items: [{ type: 'video', urls: vids }], caption: '' };
  if (/\/(reels?|tv|videos?|watch)\b|fb\.watch/i.test(link)) throw new Error('og: no hay video público');
  const imgs = [...new Set(metas('og:image'))].filter(u => /^https?:/.test(u));
  if (!imgs.length) throw new Error('og: sin imagen');
  return { items: [{ type: 'image', urls: imgs.slice(0, 1) }], caption: '' };
}
async function redSnapOg(link) {
  try { return await redSnapsave(link); }
  catch (e) { console.error('[red] snapsave falló, pruebo og:', e.message); return await redOg(link); }
}

// --- envío común: de a un archivo, en orden; la descripción va en el primero ---
async function redImg(urls) {
  let ultimo;
  for (const u of urls) {
    try {
      const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 25 * 1048576, headers: { 'User-Agent': TT_UA } });
      if (!/image/i.test(r.headers['content-type'] || '')) throw new Error('no devolvió una imagen');
      return Buffer.from(r.data);
    } catch (e) { ultimo = e; }
  }
  throw ultimo || new Error('sin imagen');
}
async function redEnviar(m, jid, it, tag) {
  fs.mkdirSync(TT_DIR, { recursive: true });
  let cap = it.caption || '', citar = m, ok = 0, fallas = 0, ultimo;
  for (const x of it.items) {
    try {
      const opts = citar? { quoted: citar } : {};
      if (x.type === 'image') {
        await sock.sendMessage(jid, { image: await redImg(x.urls), caption: cap || undefined }, opts);
      } else {
        let hecho = false, falla;
        for (const u of x.urls) { // varias calidades: se prueba una por una
          const f = `${TT_DIR}/${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
          try {
            await ttBajar(u, f, 'https://www.google.com/');
            const peso = fs.statSync(f).size;
            console.log(`[${tag}] bajado ${(peso / 1048576).toFixed(1)} MB`);
            await sock.sendMessage(jid, { video: peso <= 40 * 1048576? fs.readFileSync(f) : { url: f }, mimetype: 'video/mp4', caption: cap || undefined }, opts);
            hecho = true; break;
          } catch (e) { falla = e; } finally { fs.rmSync(f, { force: true }); }
        }
        if (!hecho) throw falla || new Error('sin video');
      }
      ok++; cap = ''; citar = null; console.log(`[${tag}] enviado ${ok}/${it.items.length}`);
      if (it.items.length > 1) await sleep(500);
    } catch (e) { ultimo = e; fallas++; console.error(`[${tag}] archivo falló:`, e.message); }
  }
  if (!ok) throw ultimo || new Error('no se pudo enviar nada');
  return fallas;
}

const RED = {
  fb:  { nombre: 'Facebook',  re: /https?:\/\/(?:[\w-]+\.)?(?:facebook\.com|fb\.watch|fb\.com)\/[^\s<>"']+/i, uso: '/fb <link de Facebook>', fuente: (l) => redSnapOg(l) },
  x:   { nombre: 'X',         re: /https?:\/\/(?:[\w-]+\.)?(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\/[^\s<>"']+/i, uso: '/x <link del tweet>', fuente: (l) => redX(l) },
  ig:  { nombre: 'Instagram', re: /https?:\/\/(?:[\w-]+\.)?instagram\.com\/[^\s<>"']+/i, uso: '/ig <link de Instagram>', fuente: (l) => redSnapOg(l) },
  pin: { nombre: 'Pinterest', re: /https?:\/\/(?:[\w-]+\.)?(?:pinterest\.[a-z.]+|pin\.it)\/[^\s<>"']+/i, uso: '/pin <link de Pinterest>\n/pin <búsqueda>', busca: true, fuente: (l, q) => redPin(l, q) },
};
async function redCmd(m, jid, text, clave) {
  const c = RED[clave];
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '') : '';
  const quitar = l => l && l.replace(/[)\].,;!?]+$/, '');
  const link = quitar((arg.match(c.re) || qt.match(c.re) || [])[0]);
  const busqueda = c.busca &&!link? arg : '';
  if (!link &&!busqueda) return reply(`Uso:\n${c.uso}\n(o respondé a un mensaje que tenga el link)`);
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  console.log(`[${clave}] pedido:`, link || `búsqueda "${busqueda}"`);
  try {
    const it = await c.fuente(link, busqueda);
    console.log(`[${clave}] listo: ${it.items.length} archivo(s)`);
    const fallas = await redEnviar(m, jid, it, clave);
    if (fallas) await reply(`⚠️ No pude enviar ${fallas} archivo(s) de ese post`);
  } catch (e) {
    console.error(`[${clave}] ERROR`, e.response?.status || '', e.stack || e.message);
    await reply(
      e.message === 'GRANDE'? `❌ El video pesa más de ${TT_MAX / 1024 / 1024} MB` :
      e.message === 'SIN_RESULTADOS'? '🔎 No encontré resultados con esa búsqueda' :
      e.message === 'SIN_MEDIA'? '🤷 Ese post no tiene fotos ni videos que pueda bajar' :
      e.message === 'LINK_INVALIDO'? `❌ Ese link no parece ser de ${c.nombre}` :
      `❌ No pude descargarlo. Revisá que el link sea público y probá de nuevo`);
  } finally { reaccion(''); }
}

// ---------- worker de descargas ----------
// Idea: el bot (bot-hosting) no baja nada pesado. Le manda el pedido a un worker (este mismo index.js corriendo en otro hosting con
// WORKER_MODE=1). El worker ejecuta el MISMO comando de siempre con un "sock" falso que solo anota lo que el comando querría enviar
// (texto, reacciones, videos, audios, documentos). El bot va leyendo esa lista, baja los archivos y los envía por WhatsApp.
// Todos los pedidos van firmados con HMAC (la clave WORKER_KEY nunca viaja por la red).
const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/+$/, '');
const WORKER_KEY = process.env.WORKER_KEY || '';
const W_DIR = './tmp_worker';
const W_MEDIA = ['video', 'image', 'audio', 'document', 'sticker'];
const wFirma = (met, ruta, cuerpo, ts) => crypto.createHmac('sha256', WORKER_KEY).update(`${ts}\n${met}\n${ruta}\n${cuerpo}`).digest('hex');

// ===== lado worker =====
const wJobs = new Map();                        // id -> { id, estado, entradas, archivos, t, error }
const wColas = { pesado: Promise.resolve(), liviano: Promise.resolve() };  // YouTube/APK por un lado, el resto por otro
let wPend = 0;
function wSockFalso(job) {
  return {
    user: { id: 'worker@s.whatsapp.net' },
    async sendMessage(jid, content, opts = {}) {
      const e = { c: {}, q: !!opts.quoted };
      for (const [k, v] of Object.entries(content)) {
        if (!W_MEDIA.includes(k)) { e.c[k] = v; continue; }
        if (v?.url && /^https?:\/\//i.test(v.url)) { e.c[k] = v; continue; }  // URL remota (fotos de TikTok): la baja el bot directo
        // el comando borra su archivo apenas lo "envía": se guarda una copia propia para que el bot lo pueda bajar
        const n = job.archivos++, dest = `${W_DIR}/${job.id}_${n}`;
        if (Buffer.isBuffer(v)) fs.writeFileSync(dest, v);
        else if (v?.url) { try { fs.linkSync(v.url, dest); } catch { fs.copyFileSync(v.url, dest); } }
        else { e.c[k] = v; continue; }
        e.c[k] = { f: n };
      }
      job.entradas.push(e);
      return { key: { id: `W${job.id}_${job.entradas.length}`, remoteJid: jid, fromMe: true } };
    },
    async groupMetadata() { throw new Error('no disponible en el worker'); },
  };
}
function wLanzar(cola, job, fn) {
  wPend++;
  wColas[cola] = wColas[cola].then(async () => {
    job.estado = 'corriendo';
    try { await als.run({ id: 'worker', name: 'worker', sock: wSockFalso(job) }, fn); job.estado = 'listo'; }
    catch (e) { console.error('[worker] el trabajo falló:', e.message); job.estado = 'error'; job.error = String(e.message).slice(0, 200); }
    finally { wPend--; job.fin = Date.now(); }
  });
}
const wMensajeFalso = b => ({ key: b.key || { remoteJid: b.jid, id: 'W' }, message: { extendedTextMessage: { text: b.text || '', contextInfo: b.qt? { quotedMessage: { conversation: String(b.qt) } } : {} } } });
function wCrear(b) {
  const jid = String(b.jid || ''), text = String(b.text || '').slice(0, 2000), m = wMensajeFalso(b);
  const job = { id: crypto.randomBytes(6).toString('hex'), estado: 'cola', entradas: [], archivos: 0, t: Date.now() };
  const tipos = {
    tt:   ['liviano', () => tiktokCmd(m, jid, text)],
    red:  ['liviano', () => RED[b.clave] && redCmd(m, jid, text, b.clave)],
    yt:   ['pesado',  () => ytCmd(m, jid, text, !!b.audio)],
    apk:  ['pesado',  () => b.a && /^https:\/\/([\w.-]+\.aptoide\.com|f-droid\.org)\//.test(String(b.a.url)) && apkEnviar(m, jid, b.a)],
    mf:   ['pesado',  () => mfCmd(m, jid, text)],
    git:  ['pesado',  () => gitCmd(m, jid, text)],
  };
  const t = tipos[b.tipo]; if (!t) return null;
  wJobs.set(job.id, job);
  wLanzar(t[0], job, t[1]);
  return job;
}
function wBorrar(job) {
  wJobs.delete(job.id);
  for (let n = 0; n < job.archivos; n++) fs.rmSync(`${W_DIR}/${job.id}_${n}`, { force: true });
}
function wAutorizado(req, ruta, cuerpo) {
  const ts = String(req.headers['x-ts'] || ''), sig = String(req.headers['x-sig'] || '');
  if (!/^\d+$/.test(ts) || Math.abs(Date.now() - Number(ts)) > 5 * 60e3) return false;
  const a = Buffer.from(wFirma(req.method, ruta, cuerpo, ts)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function wAtender(req, res) {
  const json = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    const url = new URL(req.url, 'http://x'), ruta = url.pathname;
    if (req.method === 'GET' && ruta === '/') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('worker ok'); }
    let cuerpo = '';
    for await (const c of req) { cuerpo += c; if (cuerpo.length > 64 * 1024) return json(413, { error: 'cuerpo muy grande' }); }
    if (!wAutorizado(req, ruta, cuerpo)) return json(401, { error: 'no autorizado' });
    if (req.method === 'POST' && ruta === '/run') {
      if (wPend >= 6) return json(429, { error: 'ocupado' });
      const job = wCrear(JSON.parse(cuerpo || '{}'));
      return job? json(200, { id: job.id }) : json(400, { error: 'tipo inválido' });
    }
    const mm = /^\/(job|file)\/([0-9a-f]+)(?:\/(\d+))?$/.exec(ruta);
    const job = mm && wJobs.get(mm[2]);
    if (!job) return json(404, { error: 'no existe' });
    if (req.method === 'GET' && mm[1] === 'job') {
      const desde = Math.max(0, Number(url.searchParams.get('from')) || 0);
      return json(200, { estado: job.estado, error: job.error, entradas: job.entradas.slice(desde) });
    }
    if (req.method === 'GET' && mm[1] === 'file' && mm[3] !== undefined) {
      const f = `${W_DIR}/${job.id}_${mm[3]}`;
      if (!fs.existsSync(f)) return json(404, { error: 'no existe' });
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(f).size });
      return fs.createReadStream(f).pipe(res);
    }
    if (req.method === 'DELETE' && mm[1] === 'job') { wBorrar(job); return json(200, { ok: true }); }
    json(405, { error: 'método no permitido' });
  } catch (e) { console.error('[worker] pedido inválido:', e.message); if (!res.headersSent) json(400, { error: 'pedido inválido' }); else res.end(); }
}
async function startWorker() {
  if (WORKER_KEY.length < 16) { console.error('❌ [worker] Falta WORKER_KEY (mínimo 16 caracteres) en el .env'); process.exit(1); }
  fs.rmSync(W_DIR, { recursive: true, force: true }); fs.mkdirSync(W_DIR, { recursive: true });
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 0);
  if (!port) { console.error('❌ [worker] No hay puerto (SERVER_PORT / PORT)'); process.exit(1); }
  http.createServer(wAtender).listen(port, '0.0.0.0', () => console.log(`🛠️ Worker de descargas escuchando en el puerto ${port}`));
  setInterval(() => { // limpia trabajos viejos
    const ahora = Date.now();
    for (const j of wJobs.values()) if (ahora - j.t > 40 * 60e3 || (j.fin && ahora - j.fin > 15 * 60e3)) wBorrar(j);
  }, 60e3);
  ytBinario().then(() => { console.log('[worker] yt-dlp listo'); ytCalentar(); }, e => console.error('[worker] no pude preparar yt-dlp:', e.message));
}

// ===== lado bot =====
const wReq = (met, ruta, cuerpo, extra = {}) => {
  const body = cuerpo? JSON.stringify(cuerpo) : '', ts = String(Date.now());
  return axios({ method: met, url: WORKER_URL + ruta, data: body || undefined, timeout: 30000, validateStatus: () => true,
    headers: { 'x-ts': ts, 'x-sig': wFirma(met, ruta.split('?')[0], body, ts), 'Content-Type': 'application/json' },...extra });
};
const textoCitado = m => { const q = m.message?.extendedTextMessage?.contextInfo?.quotedMessage; return q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '') : ''; };
// reproduce en WhatsApp una de las cosas que el worker quiso enviar
async function wReproducir(m, jid, e, id) {
  const c = { ...e.c }, tmp = [];
  try {
    for (const k of W_MEDIA) if (c[k]?.f !== undefined) {
      const r = await wReq('GET', `/file/${id}/${c[k].f}`, null, { responseType: 'stream', timeout: 60000 });
      if (r.status !== 200) throw new Error('el worker no tiene el archivo');
      fs.mkdirSync(TT_DIR, { recursive: true });
      const dest = `${TT_DIR}/w_${Date.now()}_${Math.random().toString(36).slice(2)}`; tmp.push(dest);
      await new Promise((ok, mal) => {
        let n = 0; const w = fs.createWriteStream(dest);
        r.data.on('data', x => { n += x.length; if (n > TT_MAX) { r.data.destroy(); w.destroy(); mal(new Error('GRANDE')); } });
        r.data.on('error', mal); w.on('error', mal); w.on('finish', ok); r.data.pipe(w);
      });
      c[k] = fs.statSync(dest).size <= 40 * 1048576? fs.readFileSync(dest) : { url: dest };
    }
    if (c.react) c.react = { ...c.react, key: m.key };
    await sock.sendMessage(jid, c, e.q? { quoted: m } : {});
  } finally { for (const f of tmp) fs.rmSync(f, { force: true }); }
}
// pide el trabajo al worker y va enviando lo que genera; "local" es el plan B si el worker no contesta (null = no hay plan B)
async function remoto(m, jid, tipo, params, local) {
  const aviso = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  let id;
  try {
    const r = await wReq('POST', '/run', { tipo, jid, key: m.key, qt: textoCitado(m),...params });
    if (r.status === 429) { await aviso('⏳ El servidor de descargas está muy ocupado. Probá en un momento.'); return; }
    if (r.status !== 200 ||!r.data?.id) throw new Error(`HTTP ${r.status}${r.data?.error? ' ' + r.data.error : ''}`);
    id = r.data.id;
  } catch (e) {
    console.error('[worker] no pude pedirle el trabajo:', e.message);
    if (local) { console.log('[worker] lo hago acá'); return local(); }
    await aviso('❌ El servidor de descargas no responde ahora. Probá de nuevo en un rato.');
    return;
  }
  let desde = 0; const t0 = Date.now();
  try {
    for (;;) {
      const r = await wReq('GET', `/job/${id}?from=${desde}`);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      for (const e of r.data.entradas) {
        desde++;
        try { await wReproducir(m, jid, e, id); } catch (err) { console.error('[worker] no pude reproducir un mensaje:', err.message); }
      }
      if (r.data.estado === 'listo') break;
      if (r.data.estado === 'error') { await aviso('❌ No pude descargarlo. Probá de nuevo en un rato.'); break; }
      if (Date.now() - t0 > 25 * 60e3) throw new Error('tardó demasiado');
      await sleep(700);
    }
    console.log(`[worker] ${tipo} listo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.error('[worker] se cortó la conexión:', e.message);
    await aviso('❌ Se cortó la conexión con el servidor de descargas. Probá de nuevo.');
  } finally { wReq('DELETE', `/job/${id}`).catch(() => {}); }
}
// punto de entrada de cada comando: con worker configurado va para allá; si no, corre local como siempre
const descargar = (m, jid, tipo, params, local, sinPlanB) => WORKER_URL? remoto(m, jid, tipo, params, sinPlanB? null : local) : local();

// ---------- economía (por grupo y por persona; se guarda en economia.json) ----------
const ECO_FILE = './economia.json';   // { "<chat>": { "<id>": { ids, cartera, banco, dias, ultDaily, cd: {}, ult } }, "@racha": { "<id>": { ids, dias, ultDaily } } }
let eco = {};
try { if (fs.existsSync(ECO_FILE)) eco = JSON.parse(fs.readFileSync(ECO_FILE)); } catch (e) { console.error('[eco] no pude leer economia.json:', e.message); }
const saveEcoNow = () => fs.writeFileSync(ECO_FILE, JSON.stringify(eco));
let ecoTimer; const saveEco = () => { clearTimeout(ecoTimer); ecoTimer = setTimeout(() => { try { saveEcoNow(); } catch (e) { console.error('[eco]', e.message); } }, 800); };

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
async function dailyCmd(m, jid) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const ids = await ecoIds(m, jid);
  const u = ecoGet(jid, ids); u.ult = Date.now();
  const r = ecoRacha(ids);
  const hoy = hoyAR();
  if (u.ultDaily === hoy) {
    return reply(`🗓️ Ya cobraste tu daily de hoy en este grupo.\nVolvé en *${fmtTiempo(msHastaMedianoche())}* (a las 00:00).\n> Días de racha: ${r.dias}`);
  }
  let perdio = 0, nuevoDia = false;
  if (r.ultDaily!== hoy) {                                   // el primer cobro del día (en cualquier grupo) es el que sube la racha
    if (r.ultDaily && r.ultDaily!== ayerAR() && r.dias > 0) { perdio = r.dias; r.dias = 0; }   // se salteó un día → racha a cero
    r.dias++; r.ultDaily = hoy; nuevoDia = true;
  }
  const premio = Math.min(DAILY_MAX, DAILY_BASE + DAILY_PASO * (r.dias - 1));
  u.dias = r.dias; u.ultDaily = hoy; u.cartera += premio; saveEco();
  const sig = Math.min(DAILY_MAX, DAILY_BASE + DAILY_PASO * r.dias);
  await reply(`🎁 *Daily*\nGanaste ${din(premio)}${perdio? `\n💔 Se te pasó un día y perdiste tu racha de ${perdio} día${perdio===1?'':'s'}. Arrancás de nuevo.` : ''}${nuevoDia? '' : '\n🌐 Tu racha ya había sumado hoy en otro grupo: acá cobrás igual, pero no sube de nuevo.'}\n\n> Día #${r.dias} de racha${premio >= DAILY_MAX? ' · ¡tope diario alcanzado!' : ''}\n> Mañana: ${din(sig)}`);
}

// ----- trabajos: /w /crime /minar /hacking -----
const A = (win, ganMin, ganMax, perMin, perMax, cd, verbo, si, no) => ({ win, ganMin, ganMax, perMin, perMax, cd, verbo, si, no });
const ACCIONES = {
  w: A(0.65, 7000, 20000, 11000, 15000, 2 * 60e3, 'trabajar', [
    'La kiosquera te dejó a cargo del local por una semana. Descubriste que el "cambio" siempre se le perdía a todos menos a vos. Te pagó el doble para que te quedes callado.',
    'Cuidaste autos en la puerta de la cancha sin que nadie te lo pidiera. Con la cara que tenés, ninguno se animó a no pagar.',
    'Vendiste pañuelitos descartables en un velorio. Nunca hubo tanta demanda.',
    'Repartiste volantes de un cerrajero que cobra por abrirte tu propia puerta. Esa gente es de otro nivel y vos cobraste comisión.',
    'Hiciste de cadete en una farmacia. Subiste cuatro pisos sin ascensor y el cliente te dio propina por lástima al verte la cara.',
    'Lavaste parabrisas en un semáforo. Los que no pagaron quedaron con el vidrio más sucio que antes. Es el libre mercado.',
    'Fuiste jurado en un concurso de empanadas. Comiste catorce, te dolió todo y cobraste igual.',
    'Trabajaste de extra en una novela de gente que sufre. No necesitaste actuar.',
    'Cuidaste a un viejo millonario con insomnio. Te dejó propina y un único consejo: "no te cases".',
    'Vendiste un curso de cómo hacerse rico. El único que se hizo rico fuiste vos.',
    'Pusiste música en un cumple de 15. Pasaste cumbia, tu tío bailó, la abuela lloró y te pagaron antes de que alguien prendiera las luces.',
    'Ayudaste en una mudanza. Rompiste el espejo y le dijiste al dueño "siete años de mala suerte, pero con mejor plata". Aceptó.',
    'Pintaste una casa. El dueño nunca se dio cuenta de que la segunda mano era agua.',
    'Hiciste de payaso en un cumpleaños. Un nene te pateó la espinilla y su padre te pagó doble para que no lo demandes.',
    'Atendiste el 0800 de reclamos. Dejaste el teléfono descolgado cuatro horas y cobraste igual. Producción récord.',
    'Hiciste de doble de riesgo en una publicidad de seguros. Te cayó un piano encima, pero el seguro lo cubrió, que era el punto.',
    'Fuiste sparring de un boxeador amateur. Te pagaron por cada diente que te sobraba.',
    'Escribiste cartas de amor por encargo. Tres parejas se pelearon, pero cobraste por adelantado.',
    'De estatua viviente, una paloma te usó de baño. La gente aplaudió y pagó por lástima.',
    'Arreglaste una computadora. El cliente nunca supo que lo único que hiciste fue apretar F5.',
    'Cobraste por hacer fila en un banco para alguien. Salió el turno nueve horas después y te pagó igual, porque no tenía alternativa.',
    'Cortaste el pasto del cementerio municipal. El sueldo es bajo, pero los clientes no se quejan.',
    'Fuiste guía turístico en tu propio barrio. Inventaste que ahí murió un prócer. Era un perro. Pagaron igual.',
    'Armaste un puesto de choripán en la puerta del estadio. Se agotó antes del segundo tiempo.',
    'Te colaste en un casamiento al que no te habían invitado. Comiste, bailaste y alguien te dio plata para que te vayas.',
  ], [
    'La kiosquera te contrató por dos días y te echó por robarte los cigarrillos. Encima te cobró los faltantes.',
    'Un tipo te ofreció una changa "fácil". Era una mudanza y la heladera te cayó encima. Los remedios salieron más que el sueldo.',
    'Hiciste de repartidor en bici. Te chocó un colectivo y el pedido era sushi. Todo en el asfalto, y te lo descontaron.',
    'Te hiciste pasar por plomero. Inundaste el departamento de abajo y el vecino tenía un abogado muy bueno.',
    'Cuidaste un perro ajeno. Se comió el aguinaldo del dueño, que no tuvo mejor idea que pasarte la cuenta a vos.',
    'Atendiste una parrilla. Quemaste el chorizo, el delantal y casi el local. Te cobraron todo menos las lágrimas.',
    'Trabajaste de cajero. Faltó plata y la caja estaba bien: contaste mal vos. Tu sueldo llegó en negativo.',
    'Vendiste alfajores en el tren. Un nene te los robó y encima te multaron por vender sin permiso.',
    'Entraste a un call center y le vendiste un seguro al dueño de la empresa. Te echaron y te cobraron la capacitación.',
    'Hiciste de seguridad en un boliche. Dejaste pasar al dueño sin DNI y el dueño no se acuerda de que es el dueño.',
    'Vendiste empanadas de ayer. Intoxicaste a media cuadra y la indemnización no se pagó sola.',
    'Te contrataron de payaso y el cliente le tenía fobia. Te denunció.',
    'Hiciste una changa de albañil. La pared se cayó "sola" encima de un auto.',
    'Fuiste DJ en un casamiento y pasaste la lista equivocada. Tuviste que devolver el adelanto y el cuñado quiere pelea.',
    'Repartiste volantes. Los tiraste a la cloaca y te vieron. Multa por ensuciar la vía pública.',
    'Cuidaste a un nene que resultó más vivo que vos: te vendió tu propio celular.',
    'Trabajaste de cuidacoches sin permiso. Un policía te cobró la "tarifa municipal".',
    'Armaste un puesto de choripán sin habilitación. Pasó la inspección, se llevó todo el stock y te dejó una multa.',
    'Le diste vuelto de más a todos los clientes. Al otro día tu jefe también contaba la caja.',
    'Te contrataron de jardinero. Podaste el bonsái de la señora, que costaba más que tu casa.',
    'De lavacoches, rayaste un Falcon de colección. Valía más que tu casa, tus órganos y tu futuro.',
    'Fuiste tester de colchones. Te dormiste en horario laboral, te echaron y te cobraron la baba.',
    'De mozo, le tiraste la sopa encima al crítico gastronómico. Te cobraron la tintorería y el trauma.',
    'Vendiste tu lugar en la fila por cinco lucas. Te quedaste sin lugar, sin plata y sin dignidad.',
    'Hiciste de niñero y el chico le contó a sus padres hasta lo que no hiciste. Te descontaron todo.',
  ]),
  crime: A(0.60, 30000, 78000, 50000, 120000, 5 * 60e3, 'cometer otro delito', [
    'Le robaste el celular a un estafador. Tenía la billetera llena con lo que les había robado a otros. Ladrón que roba a ladrón.',
    'Asaltaste a otro ladrón. No puede denunciarte y lo sabe.',
    'Vendiste "terrenos en la costa" con fotos de Photoshop. El que compró nunca va a poder demostrar que el mar estaba más lejos.',
    'Te hiciste pasar por inspector municipal. Los kioscos de la cuadra te recibieron con sobre incluido.',
    'Asaltaste un camión de verdura. Rindió más que cualquier trabajo; la ensalada te la regalaste.',
    'Clonaste la tarjeta de un tipo que presumía de rico. Ahora paga tus cafés, tus almuerzos y tu autoestima.',
    'Vendiste entradas para un recital que no existe. La fila llegó hasta la esquina.',
    'Desvalijaste un auto estacionado en doble fila. La justicia poética te pagó los gastos.',
    'Falsificaste una factura para una empresa que ni siquiera tiene empleados. El que la pagó tampoco los tenía.',
    'Cobraste peaje en una calle de tierra que no es tuya. Nadie preguntó, todos pagaron.',
    'Hiciste de "arbolito" y le vendiste dólares truchos a un turista que ya se había ido.',
    'Armaste una timba clandestina en un garaje. La policía llegó tarde porque estaba apostando.',
    'Entraste a una casa vacía. Los dueños se habían ido... a una casa más linda, y te dejaron lo que sobró.',
    'Vendiste "seguros contra mala suerte". Nadie reclamó, porque la mala suerte los alcanzó antes.',
    'Revendiste entradas para un partido que ya se había jugado. El cliente jura que ganó su equipo.',
    'Contrabandeaste alfajores a un país donde no se consiguen. Se agotaron, igual que tu conciencia.',
    'Le robaste el bolso a un pirata de colectivos. Tenía más plata que su recaudación.',
    'Asaltaste una casa de cambio con una pistola de agua. Nadie tuvo ganas de discutir con tu seguridad.',
    'Falsificaste un título universitario. Te lo pagaron mejor que a los que estudiaron.',
    'Armaste una rifa a beneficio de una causa inexistente. La causa sos vos.',
    'Chorreaste combustible de un camión y lo vendiste con el 20 por ciento de descuento. Nunca tan transparente.',
    'Hiciste de "falso policía" en una fiesta. Los asistentes entregaron todo en menos de un minuto.',
    'Robaste una estatua, la vendiste como arte moderno y te felicitaron por el concepto.',
    'Pusiste una "cabina de peaje" en el medio de una ruta de campo. Pasaron cuarenta autos antes de que alguien se diera cuenta.',
    'Hackeaste el Wi-Fi del vecino y le vendiste el acceso. Vos tenés internet gratis; él, un enemigo menos.',
  ], [
    'Entraste a robar un kiosco. La kiosquera resultó ser la madre del comisario. Multa, fianza y un reto de por vida.',
    'Asaltaste a un tipo que parecía asustado. Era policía de civil. Te llevaron y te cobraron el viaje en patrullero.',
    'Quisiste vender entradas truchas, pero el comprador era el dueño del estadio. Perdiste las entradas y la libertad.',
    'Te metiste a robar en una casa. Tenía alarma, perro y suegra. El perro fue el menos agresivo.',
    'Le vendiste un auto robado a un tipo que resultó ser el dueño. Te cobró la indemnización y las lágrimas.',
    'Falsificaste billetes y los pagaste en una cuadra llena de cámaras. Ahora sos famoso en la comisaría.',
    'Quisiste desvalijar un camión de reparto. Estaba vacío y encima te filmaron con la cara descubierta.',
    'Armaste una timba clandestina y el primero en perder todo fuiste vos.',
    'Chorreaste combustible y te fumaste un cigarrillo del susto. Perdiste las cejas, la plata y el prestigio.',
    'Quisiste estafar a un tipo con un cuento. Era profesor de lengua y te corrigió la ortografía hasta que llegó la policía.',
    'Entraste a robar a una mansión. Era una escenografía de televisión y las cámaras estaban encendidas.',
    'Te hiciste pasar por inspector. El kiosquero resultó ser inspector de verdad. Está muy conforme con tu multa.',
    'Robaste un auto con un solo problema: tenía el sistema de GPS de la policía.',
    'Quisiste cobrar peaje en una ruta. Era la ruta de la comitiva del gobernador.',
    'Hackeaste el Wi-Fi del vecino y lo dejaste sin internet. Vino a golpearte la puerta con ganas de usarla de remo.',
    'Vendiste una rifa para una causa falsa. La causa era el juez, que se enteró.',
    'Tomaste un bolso sin mirar. Era del tipo que te estaba esperando. Te cobró el bolso y el susto.',
    'Hiciste de falso policía en una fiesta. Un policía de verdad tuvo que pedirte las cosas "con respeto".',
    'Intentaste robar un banco con un pasamontañas. Era un día de calor y te desmayaste en la puerta.',
    'Falsificaste un título. El cartón tenía tu nombre mal escrito y estaba firmado por "Pedrito".',
    'Quisiste robar un camión de verdura. Eran zapallos, no tenías dónde ponerlos, y encima los dejaron caer en tu pie.',
    'Le vendiste un terreno en la costa a un escribano. Revisó la escritura, se rió y te cobró la consulta.',
    'Fuiste a robar una joyería. Las joyas eran de bijouterie, pero la fianza era de verdad.',
    'Intentaste una estafa piramidal. La pirámide era de dos personas: vos arriba y la policía abajo.',
    'Asaltaste un cajero. El cajero se tragó la tarjeta, la plata y tu dignidad.',
  ]),
  minar: A(0.70, 15000, 60000, 12000, 40000, 10 * 60e3, 'ir a minar', [
    'Bajaste a la mina y encontraste una veta de hierro. Lo vendiste todo en el momento.',
    'Picaste cobre toda la tarde. El comprador te pagó al contado y no hizo preguntas.',
    'Hallaste una piedra rara brillante. No era diamante, pero el que la compró tampoco sabía.',
    'Sacaste carbón hasta quedar negro por dentro y por fuera. Se vendió solo.',
    'Desenterraste un fósil de un bicho raro. El museo lo pagó y ahora tiene tu nombre en una placa que nadie va a leer.',
    'Encontraste oro en la roca madre. Lo vendiste antes de que nadie pudiera inventar una historia.',
    'Un meteorito cayó cerca de tu pozo. Lo pescaste y lo vendiste como "souvenir espacial".',
    'Sacaste litio. Tu mina es oficialmente más cara que tu casa.',
    'Encontraste ámbar con un mosquito adentro. Dijeron que era de hace millones de años. Vos le habías puesto el mosquito.',
    'Hallaste cuarzo en abundancia. Lo vendiste a los que creen que cura la mala suerte.',
    'Abriste una galería vieja y encontraste el tesoro de un pirata de tierra firme. Lo vendiste sin que se enterara su familia.',
    'Sacaste plata del subsuelo. Nunca fuiste tan literal con una metáfora.',
  ], [
    'Te cayó un derrumbe. Sobreviviste, pero la ambulancia cobra por kilómetro.',
    'Una bolsa de gas explotó en tu galería. Perdiste el casco, las cejas y el seguro.',
    'Se inundó el túnel y salió a flote todo lo que habías juntado. Menos vos.',
    'El comprador te pagó con billetes truchos y se fue silbando. Tu mina quedó vacía; su bolsillo, lleno.',
    'Se te rompió el pico. El pico es lo único que te quedaba y era prestado.',
    'Te perdiste en la mina y tuviste que pagarle a un rescatista que te cobró hasta por el eco.',
    'Cavaste justo debajo de la casa de un vecino. La casa se hundió un poco. El vecino, bastante.',
    'Abriste una galería clausurada. El cartel decía "Peligro" y vos leíste "Peligro de que te vaya bien".',
  ]),
  hacking: A(0.55, 10000, 100000, 10000, 75000, 30 * 60e3, 'hackear', [
    'Entraste al sistema de un banco de provincia y redondeaste todos los centavos para vos. Nadie notó la diferencia hasta que vieron tu cuenta.',
    'Hackeaste una intendencia de un pueblo. La clave era "1234". La caja chica era de verdad.',
    'Te metiste en la red de un ente de recaudación y te hiciste un "reembolso" por las dudas. Salió perfecto.',
    'Te metiste en el sistema de multas de tránsito y te borraste las tuyas. Y las de tus amigos, por una comisión.',
    'Encontraste una base de datos olvidada con las contraseñas de todo un ministerio. Eran todas "contraseña".',
    'Hackeaste un cajero y escupió billetes durante tres minutos. Aprendiste a llorar de alegría.',
    'Entraste a la red de una empresa de energía y te cobraste los kilovatios que nunca consumiste.',
    'Descubriste una cuenta olvidada con fondos de hace veinte años. Eran tuyos por derecho de hacker.',
    'Aprovechaste una falla en un sistema de subsidios. Subsidiaste tu propio presente.',
    'Te infiltraste en el sistema de un casino online. La casa siempre gana, salvo que vos seas la casa.',
    'Te hiciste pasar por soporte técnico del gobierno. Todos te dieron sus claves, hasta el de seguridad.',
    'Entraste a una red de una universidad pública y le vendiste los exámenes a quien más pagaba. Ganó la educación.',
  ], [
    'Te rastrearon la IP porque tu usuario era "Pablito123". Fuiste detenido y la fianza no fue barata.',
    'Hackeaste lo que creías un banco. Era el servidor de una escuela primaria. Multa y vergüenza.',
    'Entraste a una red del gobierno, pero olvidaste usar VPN. La policía te tocó el timbre antes de que terminara la descarga.',
    'Te infectaste con tu propio virus. Tuviste que pagarle a un técnico que se rió mientras te cobraba.',
    'El sistema que hackeaste era una trampa para hackers. Estás en su lista de "los más torpes".',
    'Hackeaste el Wi-Fi de una comisaría. Alguien notó que el único dispositivo raro eras vos.',
    'Entraste a un sistema oficial y dejaste tu nombre en el log. Con firma, como los artistas.',
    'Un hacker más experto te robó tu botín de hackeo. Y encima dejó una carita feliz.',
  ]),
};
async function accionEco(m, jid, clave) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const a = ACCIONES[clave];
  const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now();
  const resta = cdRestante(u, clave, a.cd);
  if (resta > 0) return reply(`⏳ Esperá *${fmtTiempo(resta)}* para volver a ${a.verbo}.`);
  cdPoner(u, clave);
  let txt;
  if (Math.random() < a.win) {
    const n = rnd(a.ganMin, a.ganMax); u.cartera += n;
    txt = `${aleat(a.si)}\n> Ganaste: ${din(n)}`;
  } else {
    const n = Math.min(rnd(a.perMin, a.perMax), u.cartera); u.cartera -= n; // no existe la deuda: lo que no tenés en la billetera no se pierde
    txt = `${aleat(a.no)}\n> Perdiste: ${din(n)}${n? '' : ' (no tenías nada afuera del banco, te salvó la pobreza)'}`;
  }
  saveEco();
  await reply(txt);
}

// ----- /rob: solo a quien lleva más de 1 hora sin usar el bot y tiene plata afuera del banco -----
const ROB_SI = [
  v => `${v} estaba distraído y le diste vuelta los bolsillos como si fuera tu hobby.`,
  v => `Le soplaste la billetera a ${v} mientras revisaba el celular. Ni se enteró.`,
  v => `${v} dejó la plata afuera del banco. Vos dejaste la conciencia en casa.`,
  v => `Esperaste a que ${v} se durmiera y le hiciste una "inspección de patrimonio".`,
  v => `${v} confió en que nadie miraba. Todo el mundo miraba, pero vos fuiste el único que actuó.`,
  v => `Lo de ${v} fue limpio, rápido y bastante deshonesto.`,
];
const ROB_NO = [
  v => `Intentaste robarle a ${v}, pero se despertó justo. Te devolvió el golpe y la factura.`,
  v => `${v} te vio venir de lejos. Te tropezaste, se te cayó plata y encima te cobró el escándalo.`,
  v => `Le quisiste sacar la billetera a ${v}. Era una billetera trampa y se te cayó todo.`,
  v => `${v} resultó ser más vivo de lo que parecía. Dejaste plata en el intento.`,
  v => `El plan con ${v} era perfecto, salvo por todo lo que no previste.`,
  v => `Te agarraron con las manos en la masa mientras revisabas los bolsillos de ${v}.`,
];
async function robCmd(m, jid) {
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!jid.endsWith('@g.us')) return reply('Solo se puede robar en grupos');
  const ids = await ecoIds(m, jid);
  const t = await ecoObjetivo(m, jid);
  if (!t) return reply('Uso: /rob @usuario (o respondiendo a su mensaje)');
  const u = ecoGet(jid, ids); u.ult = Date.now();
  if (t.ids.some(x => ids.includes(x))) return reply('No podés robarte a vos mismo 🤨');
  if (t.ids.some(x => botIds().includes(x))) return reply('A mí no, que soy el que cuenta la plata 🙂');
  const resta = cdRestante(u, 'rob', 3600e3);
  if (resta > 0) return reply(`⏳ Esperá *${fmtTiempo(resta)}* para volver a robar.`);
  const v = ecoGet(jid, t.ids, false), tag = `@${num(t.jid)}`;
  if (!v || Math.floor(v.cartera / 2) < 1) return reply(`${tag} no tiene plata afuera del banco para robarle.`, [t.jid]);
  const libre = (v.ult || 0) + 3600e3 - Date.now();
  if (libre > 0) return reply(`${tag} usó el bot hace poco y está atento. Probá en *${fmtTiempo(libre)}*.`, [t.jid]);
  cdPoner(u, 'rob');
  let txt;
  if (Math.random() < 0.8) {
    const n = Math.floor(v.cartera / 2); v.cartera -= n; u.cartera += n;
    txt = `${aleat(ROB_SI)(tag)}\n> Le robaste: ${din(n)}`;
  } else {
    const n = Math.min(Math.floor(v.cartera / 4), u.cartera); u.cartera -= n; // la multa solo se le descuenta al ladrón
    txt = `${aleat(ROB_NO)(tag)}\n> Perdiste: ${din(n)}${n? '' : ' (no tenías nada afuera del banco)'}`;
  }
  saveEco();
  await reply(txt, [t.jid]);
}

// ----- banco: /dep y /with (monto con o sin separadores, o "all") -----
function ecoMonto(txt, max) {
  if (/^(all|todo|todos|todas)$/i.test(txt.trim())) return max;
  const d = txt.replace(/\D/g, '');
  return d? Number(d) : null; // 5.000 / 5,000 / 5000 es lo mismo: solo cuentan los números
}
async function bancoCmd(m, jid, text, retirar) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now();
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const origen = retirar? u.banco : u.cartera;
  const uso = retirar? 'Uso: /retirar <monto|all>' : 'Uso: /dep <monto|all>';
  if (!arg) return reply(`${uso}\n👛 Billetera: ${din(u.cartera)}\n🏦 Banco: ${din(u.banco)}`);
  const n = ecoMonto(arg, origen);
  if (!n || n < 1) return reply(origen < 1? (retirar? '🏦 No tenés nada en el banco para retirar.' : '👛 No tenés nada afuera del banco para depositar.') : uso);
  if (n > origen) return reply(`No tenés tanto ${retirar? 'en el banco' : 'en la billetera'}. Tenés ${din(origen)}.`);
  if (retirar) { u.banco -= n; u.cartera += n; } else { u.cartera -= n; u.banco += n; }
  saveEco();
  await reply(`${retirar? '🏧 Retiraste' : '🏦 Depositaste'} ${din(n)}\n\n👛 Billetera: ${din(u.cartera)}\n🏦 Banco: ${din(u.banco)}`);
}

// ----- /bal -----
async function balCmd(m, jid) {
  const t = await ecoObjetivo(m, jid);
  const ids = t? t.ids : await ecoIds(m, jid);
  const yo = ecoGet(jid, await ecoIds(m, jid)); yo.ult = Date.now();
  const u = ecoGet(jid, ids, false) || { cartera: 0, banco: 0 };
  const quien = t? t.jid : (m.key.participant || (m.key.fromMe? `${num(sock.user?.id)}@s.whatsapp.net` : jid));
  await sock.sendMessage(jid, {
    text: `💳 *Balance de @${num(quien)}*\n\n👛 Afuera del banco: ${din(u.cartera)}\n🏦 En el banco: ${din(u.banco)}\n\n> Total: ${din(u.cartera + u.banco)}`,
    mentions: [quien],
  }, { quoted: m });
}

// ----- apuestas: /rt /cf /bj /maq (se apuesta de la billetera; lo que se pierde no va a nadie) -----
// "5000 rojo" o "rojo 5000": el orden no importa. opcion(t) devuelve la clave de la opción si el texto es una, o undefined.
function apuestaArgs(text, opcion) {
  const toks = text.replace(/^\/\S+\s*/, '').trim().split(/\s+/).filter(Boolean);
  let op = null; const resto = [];
  for (const t of toks) { const k = opcion? opcion(t.toLowerCase()) : null; if (k && !op) op = k; else resto.push(t); }
  return { op, arg: resto.join(' ') };
}
// valida el monto y descuenta la apuesta en el mismo paso (sin awaits en el medio, así no se puede apostar dos veces la misma plata)
async function apuestaInicio(m, jid, arg, uso, bloquea) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now();
  const bloqueo = bloquea?.(u); if (bloqueo) { await reply(bloqueo); return null; }
  if (!arg) { await reply(`${uso}\n👛 Billetera: ${din(u.cartera)}`); return null; }
  if (!/^(\d[\d.,\s]*|all|todo)$/i.test(arg)) { await reply(uso); return null; }
  const n = ecoMonto(arg, u.cartera);
  if (!n || n < 1) { await reply(u.cartera < 1? '👛 No tenés plata afuera del banco para apostar. Sacá del banco con /retirar.' : uso); return null; }
  if (n > u.cartera) { await reply(`No tenés tanto afuera del banco. Tenés ${din(u.cartera)}.`); return null; }
  u.cartera -= n;
  return { u, n, reply };
}
// manda un mensaje de "suspenso" y a los segundos lo edita con el resultado
async function conSuspenso(m, jid, inicial, ms, final) {
  const s = await sock.sendMessage(jid, { text: inicial }, { quoted: m });
  await sleep(ms);
  if (s?.key) await sock.sendMessage(jid, { text: final, edit: s.key }).catch(() => sock.sendMessage(jid, { text: final }, { quoted: m }));
  else await sock.sendMessage(jid, { text: final }, { quoted: m });
}
const pieSaldo = u => `\n👛 Billetera: ${din(u.cartera)}`;

// --- ruleta (europea: 37 casilleros, 18 rojos, 18 negros y 1 verde; rojo/negro paga x2 y verde x5) ---
const RT_ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const RT_COL = { r: ['🔴', 'rojo'], n: ['⚫', 'negro'], v: ['🟢', 'verde'] };
const RT_SI = ['La ruleta te sonrió. Aprovechá, que no pasa seguido.', 'Ganaste. El casino lo anota como "error contable".', 'Suerte de principiante, o de alguien que no tiene nada que perder.', 'La bolita cayó de tu lado. Esta vez.'];
const RT_NO = ['La bolita te vio la cara y eligió otro color.', 'Perdiste. La casa te manda un saludo muy afectuoso.', 'El crupier sonríe. Vos no.', 'Esa plata ahora tiene otro dueño. Uno mejor vestido.'];
async function rtCmd(m, jid, text) {
  const { op, arg } = apuestaArgs(text, t => ({ red: 'r', rojo: 'r', black: 'n', negro: 'n', green: 'v', verde: 'v' })[t]);
  const uso = 'Uso: /rt <monto|all> <rojo|negro|verde>\n> Ejemplo: /rt 5000 rojo (el color puede ir primero)';
  if (!op) { const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now(); return sock.sendMessage(jid, { text: `${uso}\n👛 Billetera: ${din(u.cartera)}` }, { quoted: m }); }
  const a = await apuestaInicio(m, jid, arg, uso); if (!a) return;
  const { u, n } = a;
  const num_ = rnd(0, 36), col = num_ === 0? 'v' : RT_ROJOS.has(num_)? 'r' : 'n';
  const gana = col === op, mult = op === 'v'? 5 : 2;
  if (gana) u.cartera += n * mult;
  saveEco();
  const fin = `🎡 *Ruleta*\nCayó el *${num_}* ${RT_COL[col][0]} ${RT_COL[col][1]}\n> Apostaste ${din(n)} al ${RT_COL[op][0]} ${RT_COL[op][1]}\n\n${aleat(gana? RT_SI : RT_NO)}\n> ${gana? `Ganaste: ${din(n * (mult - 1))} (x${mult})` : `Perdiste: ${din(n)}`}${pieSaldo(u)}`;
  await conSuspenso(m, jid, `🎡 *Ruleta*\nLa bolita está girando...\n> Apostaste ${din(n)} al ${RT_COL[op][0]} ${RT_COL[op][1]}`, 1600, fin);
}

// --- coinflip: 50/50, ganando duplicás ---
const CF_SI = ['Salió lo que querías. Que no se te suba a la cabeza.', 'Ganaste. La moneda hoy está de tu lado.', 'Acertaste. Ahora andá a comprar un pan, que sos un winner.'];
const CF_NO = ['Salió lo contrario. Como todo en tu vida.', 'Perdiste. La moneda ni siquiera se disculpó.', 'Mala suerte. Y mal ojo, también.'];
async function cfCmd(m, jid, text) {
  const { op, arg } = apuestaArgs(text, t => ({ cara: 'cara', heads: 'cara', cruz: 'cruz', tails: 'cruz' })[t]);
  const uso = 'Uso: /cf <monto|all> <cara|cruz>\n> Ejemplo: /cf 5000 cara (el orden no importa)';
  if (!op) { const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now(); return sock.sendMessage(jid, { text: `${uso}\n👛 Billetera: ${din(u.cartera)}` }, { quoted: m }); }
  const a = await apuestaInicio(m, jid, arg, uso); if (!a) return;
  const { u, n } = a;
  const sale = Math.random() < 0.5? 'cara' : 'cruz', gana = sale === op;
  if (gana) u.cartera += n * 2;
  saveEco();
  const fin = `🪙 *Coinflip*\nSalió *${sale}*\n> Apostaste ${din(n)} a ${op}\n\n${aleat(gana? CF_SI : CF_NO)}\n> ${gana? `Ganaste: ${din(n)} (x2)` : `Perdiste: ${din(n)}`}${pieSaldo(u)}`;
  await conSuspenso(m, jid, `🪙 *Coinflip*\nLa moneda está en el aire...\n> Apostaste ${din(n)} a ${op}`, 1200, fin);
}

// --- blackjack: contra el crupier; se responde al mensaje del bot con "get" (otra carta) o "stand" (plantarse) ---
// Reglas: mazo de 52, el crupier saca hasta llegar a 17 y se planta ahí; ganar paga x2, empate devuelve la apuesta, blackjack natural paga 3:2.
const BJ_PALOS = ['♠️', '♥️', '♦️', '♣️'], BJ_RANGOS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const bjMazo = () => {
  const d = []; for (const p of BJ_PALOS) for (const r of BJ_RANGOS) d.push({ r, p });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
const bjVal = c => c.r === 'A'? 11 : ['J', 'Q', 'K'].includes(c.r)? 10 : Number(c.r);
function bjTotal(mano) {
  let t = 0, a = 0;
  for (const c of mano) { t += bjVal(c); if (c.r === 'A') a++; }
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}
const bjCarta = c => c.r === 'A'? `${c.r}${c.p} (1/11)` : ['J', 'Q', 'K'].includes(c.r)? `${c.r}${c.p} (10)` : `${c.r}${c.p}`;
const BJ_ESPERA = 120e3;                       // si no contestás en 2 min, el crupier planta por vos
const bjPorMsg = new Map();                    // id de mensaje del bot -> partida (para saber a qué partida responde alguien)
const bjPorJugador = new Map();                // jugador (su registro de economía) -> partida en curso

function bjTexto(g, revelar, cierre) {
  const tj = bjTotal(g.jug);
  const crup = revelar? `${g.crup.map(bjCarta).join('  ')}  → *${bjTotal(g.crup)}*` : `${bjCarta(g.crup[0])}  🂠  → *${bjTotal([g.crup[0]])}*`;
  return `🃏 *Blackjack*\n> Apuesta: ${din(g.n)}\n\n🧑 Vos: ${g.jug.map(bjCarta).join('  ')}  → *${tj}*\n🎩 Crupier: ${crup}\n\n${cierre || '> Respondé a este mensaje con *get* (pedir carta) o *stand* (plantarte)'}`;
}
async function bjEnviar(g, m, texto, mentions) {
  const s = await sock.sendMessage(g.jid, { text: texto, mentions: mentions || [] }, m? { quoted: m } : {});
  if (s?.key?.id && !g.fin) { g.msgs.push(s.key.id); bjPorMsg.set(s.key.id, g); }
  return s;
}
function bjLimpiar(g) {
  g.fin = true; clearTimeout(g.timer);
  for (const id of g.msgs) bjPorMsg.delete(id);
  if (bjPorJugador.get(g.u) === g) bjPorJugador.delete(g.u);
}
function bjArmarTimer(g) {
  clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    if (g.fin) return;
    als.run(g.bot, () => bjTerminar(g, null, true)).catch(console.error);
  }, BJ_ESPERA);
}
// cierra la partida: juega el crupier (si hace falta), paga y manda el resultado
async function bjTerminar(g, m, porTiempo) {
  if (g.fin) return;
  bjLimpiar(g);
  const tj = bjTotal(g.jug);
  let cierre, vuelve = 0;                       // vuelve = lo que se le devuelve a la billetera (apuesta incluida)
  if (g.natJ || g.natC) {
    if (g.natJ && g.natC) { vuelve = g.n; cierre = '🤝 Blackjack de los dos. Empate: te devuelven tu apuesta.'; }
    else if (g.natJ) { const gan = Math.floor(g.n * 1.5); vuelve = g.n + gan; cierre = `🃏 *¡BLACKJACK!* Pagan 3:2\n> Ganaste: ${din(gan)}`; }
    else cierre = `🎩 El crupier tiene blackjack. Ni te dio chance.\n> Perdiste: ${din(g.n)}`;
  } else if (tj > 21) {
    cierre = `💥 Te pasaste de 21.\n> Perdiste: ${din(g.n)}`;
  } else {
    while (bjTotal(g.crup) < 17) g.crup.push(g.deck.pop());
    const tc = bjTotal(g.crup);
    if (tc > 21) { vuelve = g.n * 2; cierre = `💥 El crupier se pasó de 21.\n> Ganaste: ${din(g.n)}`; }
    else if (tj > tc) { vuelve = g.n * 2; cierre = `🏆 Le ganaste al crupier.\n> Ganaste: ${din(g.n)}`; }
    else if (tj === tc) { vuelve = g.n; cierre = '🤝 Empate: te devuelven tu apuesta.'; }
    else cierre = `🎩 Gana la casa.\n> Perdiste: ${din(g.n)}`;
  }
  g.u.cartera += vuelve; saveEco();
  if (porTiempo) cierre = `⏰ Tardaste demasiado y el crupier plantó por vos.\n${cierre}`;
  await bjEnviar(g, m, bjTexto(g, true, cierre + pieSaldo(g.u)), [g.pjid]);
}
async function bjCmd(m, jid, text) {
  const uso = 'Uso: /bj <monto|all>\n> Ejemplo: /bj 5000';
  const a = await apuestaInicio(m, jid, apuestaArgs(text).arg, uso, u => bjPorJugador.has(u)? 'Ya tenés una partida en curso. Respondé a su mensaje con *get* o *stand*.' : null);
  if (!a) return;
  const { u, n } = a;
  const g = { jid, bot: ctxBot(), u, n, deck: bjMazo(), jug: [], crup: [], msgs: [], fin: false, pjid: m.key.participant || (m.key.fromMe? `${num(sock.user?.id)}@s.whatsapp.net` : jid) };
  g.jug.push(g.deck.pop(), g.deck.pop()); g.crup.push(g.deck.pop(), g.deck.pop());
  g.natJ = bjTotal(g.jug) === 21; g.natC = bjTotal(g.crup) === 21;
  bjPorJugador.set(u, g);
  if (g.natJ || g.natC) return bjTerminar(g, m);
  bjArmarTimer(g);
  await bjEnviar(g, m, bjTexto(g, false), [g.pjid]);
}
// respuesta "get" / "stand" (sin prefijo) citando un mensaje de la partida
async function bjResp(m, jid, g, accion) {
  if (g.fin) return;
  const ids = await ecoIds(m, jid);
  if (ecoGet(jid, ids, false) !== g.u) return sock.sendMessage(jid, { text: 'Esa partida no es tuya 🙄' }, { quoted: m });
  g.u.ult = Date.now();
  if (accion === 'stand') return bjTerminar(g, m);
  g.jug.push(g.deck.pop());
  const t = bjTotal(g.jug);
  if (t >= 21) return bjTerminar(g, m);       // pasarse pierde; llegar a 21 planta solo
  bjArmarTimer(g);
  await bjEnviar(g, m, bjTexto(g, false), [g.pjid]);
}

// --- maquinita: 4 rodillos x 3 filas; cada fila es una línea de pago (se cuenta de izquierda a derecha) ---
const MAQ_SIM = [['🍒', 30], ['🍋', 25], ['🍊', 20], ['🍇', 13], ['🔔', 7], ['💎', 4], ['7️⃣', 1]];
const MAQ_TOT = MAQ_SIM.reduce((a, b) => a + b[1], 0);
const maqSim = () => { let r = Math.random() * MAQ_TOT; for (const [s, w] of MAQ_SIM) if ((r -= w) < 0) return s; return MAQ_SIM[0][0]; };
const maqAzar = () => MAQ_SIM[Math.floor(Math.random() * MAQ_SIM.length)][0];     // para los cuadros de la animación
// multiplicador de la apuesta por fila ganadora: 3 iguales seguidos desde la izquierda, 4 iguales, o 2 cerezas
const MAQ_X3 = { '🍒': 2, '🍋': 3, '🍊': 4, '🍇': 7, '🔔': 12, '💎': 20, '7️⃣': 50 };
const MAQ_X4 = { '🍒': 6, '🍋': 10, '🍊': 14, '🍇': 25, '🔔': 40, '💎': 100, '7️⃣': 500 };
const MAQ_X2_CEREZA = 1;
function maqFila(cols, r) {
  const s = cols[0][r]; let k = 1; while (k < 4 && cols[k][r] === s) k++;
  if (k === 4) return MAQ_X4[s];
  if (k === 3) return MAQ_X3[s];
  if (k === 2 && s === '🍒') return MAQ_X2_CEREZA;
  return 0;
}
function maqPantalla(cols, filas) {
  return [0, 1, 2].map(r => `┃ ${cols.map(c => c[r]).join(' ┃ ')} ┃${filas && filas[r]? ` ◀ x${filas[r]}` : ''}`).join('\n');
}
const MAQ_SI = ['Las frutitas se alinearon. Primera vez que algo se te alinea.', 'Premio. La máquina estaba distraída.', 'Cayó plata. Disfrutala antes de que la devuelvas.'];
const MAQ_NO = ['Nada. La máquina se queda con tu plata y con tus ilusiones.', 'Otra vez será. Y otra. Y otra.', 'La máquina gana, como siempre. Es su único talento.'];
async function maqCmd(m, jid, text) {
  const uso = 'Uso: /maq <monto|all>\n> Ejemplo: /maq 5000';
  const a = await apuestaInicio(m, jid, apuestaArgs(text).arg, uso); if (!a) return;
  const { u, n } = a;
  const cols = [0, 1, 2, 3].map(() => [maqSim(), maqSim(), maqSim()]);          // resultado final: [arriba, medio, abajo] de cada rodillo
  const filas = [0, 1, 2].map(r => maqFila(cols, r)), mult = filas.reduce((x, y) => x + y, 0);
  const pago = Math.floor(n * mult), neto = pago - n;
  u.cartera += pago; saveEco();
  // animación: cada rodillo tiene una tira que baja; los rodillos se frenan de a uno (cuadros 2, 3, 4 y 5)
  const stop = [2, 3, 4, 5];
  const tiras = cols.map((c, i) => [...c, ...Array.from({ length: stop[i] }, maqAzar)]);
  const cuadro = f => tiras.map((t, i) => { const p = Math.max(0, stop[i] - f); return t.slice(p, p + 3); });
  const cab = `🎰 *MAQUINITA* 🎰\n> Apuesta: ${din(n)}\n\n`;
  const s = await sock.sendMessage(jid, { text: `${cab}${maqPantalla(cuadro(0))}\n\n🌀 Girando...` }, { quoted: m });
  for (let f = 1; f <= 4; f++) {
    await sleep(750);
    if (s?.key) await sock.sendMessage(jid, { text: `${cab}${maqPantalla(cuadro(f))}\n\n🌀 Girando...`, edit: s.key }).catch(() => {});
  }
  await sleep(750);
  const res = pago > n? `${mult >= 50? '🎉 *¡JACKPOT!* ' : ''}${aleat(MAQ_SI)}\n> Ganaste: ${din(neto)} (x${mult})`
    : pago === n? `Te devolvió justo lo que apostaste (x${mult}).`
    : `${aleat(MAQ_NO)}\n> Perdiste: ${din(n - pago)}${pago? ` (algo te devolvió: ${din(pago)})` : ''}`;
  const fin = `${cab}${maqPantalla(cuadro(5), filas)}\n\n${res}${pieSaldo(u)}`;
  if (s?.key) await sock.sendMessage(jid, { text: fin, edit: s.key }).catch(() => sock.sendMessage(jid, { text: fin }, { quoted: m }));
  else await sock.sendMessage(jid, { text: fin }, { quoted: m });
}

// ----- /infobot -----
async function infoBotCmd(m, jid) {
  const inst = ctxBot(), id = inst.id, real = instances.get(id);
  const dueno = id === 'main'? OWNER : id;
  let dj = `${dueno}@s.whatsapp.net`;
  if (jid.endsWith('@g.us')) { // dentro de un grupo se etiqueta con el id con el que figura ahí
    const meta = await sock.groupMetadata(jid).catch(() => null);
    const p = meta?.participants.find(p => idsDe(p).includes(dueno));
    if (p) dj = p.id;
  }
  let grupos = '—';
  try { grupos = Object.keys(await sock.groupFetchAllParticipating()).length; } catch {}
  const online = !!real?.online;
  const base = { botName: botName(), system: '', user: '', totalCommands: 0 };
  const cmds = countCmds(buildMenu(base));
  const lineas = [
    `◈ *${botName()}* ◈`, '',
    `• Sistema: ${id === 'main'? 'Main-Bot' : 'Sub-Bot'}`,
    `• Estado: ${online? '🟢 en línea' : '🔴 desconectado'}`,
    `• Uptime: ${online && real.since? fmtTiempo(Date.now() - real.since) : '—'}`,
    `• Prefijo: ${prefijo()}`,
    `• Grupos: ${grupos}`,
    `• Comandos: ${cmds}`,
    `• Dueño: @${num(dj)}`,
  ];
  if (PUBLIC_URL) lineas.push(`• Vincular un bot: ${PUBLIC_URL}`);
  lineas.push(`• Canal: ${WEB_CANAL}`, '', '_Hecho por Vand4lw_');
  await sock.sendMessage(jid, { image: bannerBuf(id), caption: lineas.join('\n'), mentions: [dj] }, { quoted: m });
}

// ---------- mensajes ----------
async function handleUpsert(messages) {
  for (const m of messages) {
      if (!m.message) continue;
      const jid = m.key.remoteJid; if (!jid || jid === 'status@broadcast') continue;
      const enGrupo = jid.endsWith('@g.us');
      if (m.pushName &&!m.key.fromMe) rxGuardarNombre(m, jid);   // para nombrar a la gente en las reacciones
      const elegido =!enGrupo || (await soyElElegido(jid)); // el más viejo del grupo atiende lo general (mutes)
      const elegidoCmd =!enGrupo || (await soyElElegido(jid, null, true)); // comandos sin inicial: el más viejo entre los bots con el mismo prefijo
      if (enGrupo && elegido &&!m.key.fromMe &&!m.message.protocolMessage &&!m.message.reactionMessage && isMuted(jid, m)) {
        await sock.sendMessage(jid, { delete: m.key }).catch(() => {}); continue;
      }
      if (enGrupo && elegido) {   // actividad (mensajes y XP) y antilink: los atiende un solo bot por grupo
        try { actContar(m, jid); } catch (e) { console.error('[act]', e.message); }
        if (grp[jid]?.antilink && !m.key.fromMe) { try { if (await antilinkVer(m, jid)) continue; } catch (e) { console.error('[antilink]', e.message); } }
      }
      // "$ comando": shell del host, solo el dueño. Lo ejecuta un solo bot (el elegido del grupo) y nunca un mensaje viejo o repetido
      {
        const crudo = m.message.conversation || m.message.extendedTextMessage?.text || '';
        if (shEsComando(crudo) && elegido) {
          if (!shHechos.has(m.key.id) && shEdad(m) < SH_VIEJO && await isOwner(m, jid).catch(() => false)) {
            shHechos.add(m.key.id); if (shHechos.size > 300) shHechos.delete(shHechos.values().next().value);
            await shellCmd(m, jid, crudo);
            continue;
          }
        }
      }
      const px = prefijo(); // prefijo de este bot; abajo todo se evalúa con "/"
      const T = normalizar(m.message.conversation || m.message.extendedTextMessage?.text || '', px);
      const C = normalizar(m.message.imageMessage?.caption || '', px);
      const text = T.t, cap = C.t, ini = T.ini || C.ini;
      // álbumes: se guardan las fotos de cada uno para poder convertirlas con /s
      const padre = albumPadre(m);
      if (padre && m.message.imageMessage) {
        guardarAlbum(padre, m, jid);
        if (!/^\/s(\s|$)/i.test(cap) && albumsSticker.has(padre)) { stickerHijo(padre, m, jid); continue; }
      }
      // quién responde: con inicial (ej: J/s) solo el bot cuyo nombre empieza con esa letra; sin inicial, el más viejo entre los que tienen ese mismo prefijo
      if (!m.key.fromMe && esBaneado(m, jid)) continue;   // baneado: el bot lo ignora en todos lados
      const mio = ini? (ini === inicialDe(ctxBot().id) && (!enGrupo || (await soyElElegido(jid, ini, true)))) : elegidoCmd;
      // "get" / "stand" (sin prefijo) citando un mensaje de blackjack: lo atiende el bot que repartió, sin importar la inicial
      {
        const rawT = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim().toLowerCase();
        const qid = m.message.extendedTextMessage?.contextInfo?.stanzaId;
        const mb = /^(get|stand)\W*$/.exec(rawT);
        const ma = /^(\d{1,2})\W*$/.exec(rawT);
        const mr = /^(s[ií]+|acepto|dale|claro|no|nop|nope|rechazo)\W*$/i.exec(rawT);
        if (mr && qid && marryPorMsg.has(qid)) {
          const g = marryPorMsg.get(qid);
          if (g.bot.id === ctxBot().id && g.jid === jid) { try { await marryResp(m, jid, g, qid, /^(s|acepto|dale|claro)/i.test(mr[1])); } catch (e) { console.error(e); } }
          continue;
        }
        if (ma && qid && apkPorMsg.has(qid)) {
          const st = apkPorMsg.get(qid);
          if (st.bot.id === ctxBot().id && st.jid === jid) { try { await apkElegir(m, jid, st, Number(ma[1])); } catch (e) { console.error(e); } }
          continue;
        }
        if (mb && qid && bjPorMsg.has(qid)) {
          const g = bjPorMsg.get(qid);
          if (g.bot.id === ctxBot().id && g.jid === jid) { try { await bjResp(m, jid, g, mb[1]); } catch (e) { console.error(e); } }
          continue;
        }
      }
      if (!mio) continue;
      if (enGrupo && mdr.onlyadmin[jid] && (text.startsWith('/') || cap.startsWith('/')) && !(await modPuede(m, jid))) continue;   // /onlyadmin: solo admins usan el bot
      if (enGrupo && grp[jid]?.noeco && ECO_RE.test(text)) { await sock.sendMessage(jid, { text: '🚫 La economía está desactivada en este grupo.' }, { quoted: m }).catch(() => {}); continue; }
      if (XP_RE.test(text)) { try { xpComando(m, jid); } catch (e) { console.error('[xp]', e.message); } }   // nivel global
      if (enGrupo && text.startsWith('/')) ecoTocar(jid, m); // usar cualquier comando cuenta como "estar activo"
      try {
        if (/^\/say(\s|$)/i.test(text)) {
          let t = text.slice(4).trim();
          if (t && (await isAllowed(m, jid))) {
            const ctx = m.message.extendedTextMessage?.contextInfo;
            const mentions = [...(ctx?.mentionedJid || [])];
            if (/@owner\b/i.test(t)) {
              let oj = `${OWNER}@s.whatsapp.net`;
              if (jid.endsWith('@g.us')) { const meta = await sock.groupMetadata(jid); const p = meta.participants.find(p => idsDe(p).includes(OWNER)); if (p) oj = p.id; }
              t = t.replace(/@owner\b/gi, `@${num(oj)}`); mentions.push(oj);
            }
            const opts = {}; if (ctx?.stanzaId && ctx.quotedMessage) {
              const part = ctx.participant; const mine = botIds().includes(num(part));
              opts.quoted = { key: { remoteJid: jid, id: ctx.stanzaId, fromMe:!!part && mine,...(part? { participant: part } : {}) }, message: ctx.quotedMessage };
            }
            await sock.sendMessage(jid, { text: t, mentions }, opts);
          }
        } else if (/^\/(help|menu|\?|comandos)(\s|$)/i.test(text)) {
          await sendMenu(m, jid);
        } else if (/^\/(code|qr)(\s|$)/i.test(text)) {
          await subCmd(m, jid, text);
        } else if (/^\/setbotname(\s|$)/i.test(text)) {
          await setBotName(m, jid, text);
        } else if (/^\/setbotcurrency(\s|$)/i.test(text)) {
          await setBotCurrency(m, jid, text);
        } else if (/^\/setbanner(\s|$)/i.test(cap || text)) {
          await setBanner(m, jid, cap || text);
        } else if (/^\/s(\s|$)/i.test(cap || text)) {
          await stickerCmd(m, jid);
        } else if (/^\/(lyrics|letra)(\s|$)/i.test(text)) {
          const query = text.replace(/^\/(lyrics|letra)\s*/i, '').trim();
          await handleLyrics(sock, jid, query, m);
        } else if (/^\/(tt|tiktok)(\s|$)/i.test(text)) {
          await descargar(m, jid, 'tt', { text }, () => tiktokCmd(m, jid, text));
        } else if (/^\/search(\s|$)/i.test(text)) {
          await searchCmd(m, jid, text);
        } else if (/^\/(ytaudio|ytmp3|ytvideo|ytmp4)(\s|$)/i.test(text) && YT_INFO_RE.test(text)) {
          await ytInfoCmd(m, jid, text);
        } else if (/^\/(ytaudio|ytmp3)(\s|$)/i.test(text)) {
          if (!await ytSylphyCmd(m, jid, text, true)) await descargar(m, jid, 'yt', { text, audio: true }, () => ytCmd(m, jid, text, true), true);
        } else if (/^\/(ytvideo|ytmp4)(\s|$)/i.test(text)) {
          if (!await ytSylphyCmd(m, jid, text, false)) await descargar(m, jid, 'yt', { text, audio: false }, () => ytCmd(m, jid, text, false), true);
        } else if (MOD_RE.test(text)) {
          await modCmd(m, jid, text);
        } else if (SOC_RE.test(text)) {
          await socCmd(m, jid, text);
        } else if (RX_RE.test(text)) {
          await rxCmd(m, jid, text);
        } else if (NX_RE.test(text)) {
          await nxCmd(m, jid, text);
        } else if (/^\/nsfw(\s|$)/i.test(text)) {
          await nsfwCmd(m, jid, text);
        } else if (/^\/r34(\s|$)/i.test(text)) {
          await r34Cmd(m, jid, text);
        } else if (/^\/spotify(\s|$)/i.test(text)) {
          await spotifyCmd(m, jid, text);
        } else if (/^\/(mf|mediafire)(\s|$)/i.test(text)) {
          await descargar(m, jid, 'mf', { text }, () => mfCmd(m, jid, text));
        } else if (/^\/(getrepo|git)(\s|$)/i.test(text)) {
          await descargar(m, jid, 'git', { text }, () => gitCmd(m, jid, text));
        } else if (/^\/apk(\s|$)/i.test(text)) {
          await apkCmd(m, jid, text);
        } else if (/^\/(fb|facebook)(\s|$)/i.test(text)) {
          await descargar(m, jid, 'red', { text, clave: 'fb' }, () => redCmd(m, jid, text, 'fb'));
        } else if (/^\/(x|twitter)(\s|$)/i.test(text)) {
          await descargar(m, jid, 'red', { text, clave: 'x' }, () => redCmd(m, jid, text, 'x'));
        } else if (/^\/(ig|instagram)(\s|$)/i.test(text)) {
          await descargar(m, jid, 'red', { text, clave: 'ig' }, () => redCmd(m, jid, text, 'ig'));
        } else if (/^\/(pin|pinterest)(\s|$)/i.test(text)) {
          await descargar(m, jid, 'red', { text, clave: 'pin' }, () => redCmd(m, jid, text, 'pin'));
        } else if (/^\/(infobot|bot|botinfo)(\s|$)/i.test(text)) {
          await infoBotCmd(m, jid);
        } else if (/^\/daily(\s|$)/i.test(text)) {
          await dailyCmd(m, jid);
        } else if (/^\/(w|work)(\s|$)/i.test(text)) {
          await accionEco(m, jid, 'w');
        } else if (/^\/(crime|delito)(\s|$)/i.test(text)) {
          await accionEco(m, jid, 'crime');
        } else if (/^\/minar(\s|$)/i.test(text)) {
          await accionEco(m, jid, 'minar');
        } else if (/^\/hacking(\s|$)/i.test(text)) {
          await accionEco(m, jid, 'hacking');
        } else if (/^\/rob(\s|$)/i.test(text)) {
          await robCmd(m, jid);
        } else if (/^\/(dep|d|deposit|depositar)(\s|$)/i.test(text)) {
          await bancoCmd(m, jid, text, false);
        } else if (/^\/(with|retirar|withdraw)(\s|$)/i.test(text)) {
          await bancoCmd(m, jid, text, true);
        } else if (/^\/(bal|balance)(\s|$)/i.test(text)) {
          await balCmd(m, jid);
        } else if (/^\/(rt|roulette|ruleta)(\s|$)/i.test(text)) {
          await rtCmd(m, jid, text);
        } else if (/^\/(cf|coinflip)(\s|$)/i.test(text)) {
          await cfCmd(m, jid, text);
        } else if (/^\/(bj|blackjack)(\s|$)/i.test(text)) {
          await bjCmd(m, jid, text);
        } else if (/^\/(maq|maquinita)(\s|$)/i.test(text)) {
          await maqCmd(m, jid, text);
        } else if (/^\/sub(\s|$)/i.test(text)) {
          await subList(m, jid);
        } else if (/^\/delsub(\s|$)/i.test(text)) {
          await delSub(m, jid, text);
        } else if (/^\/backup(\s|$)/i.test(text)) {
          await backupCmd(m, jid);
        } else if (/^\/setprefix(\s|$)/i.test(text)) {
          await setPrefix(m, jid, text);
        } else if (/^\/gemini(\s|$)/i.test(text)) {
          await geminiCmd(m, jid, text);
        } else if (/^\/p(\s|$)/i.test(text)) {
          const t0 = Date.now(); const sent = await sock.sendMessage(jid, { text: '🏓 Pong...' }, { quoted: m });
          await sock.sendMessage(jid, { text: `*🏓 Pong*\n> ${Date.now() - t0} ms`, edit: sent.key }).catch(() => {});
        } else if (jid.endsWith('@g.us') && /^\/killinactive(\s|$)/i.test(text)) await killInactive(m, jid, text);
        else if (jid.endsWith('@g.us') && /^\/(un)?mute(\s|$)/i.test(text)) await muteCmd(m, jid, text, /^\/unmute/i.test(text));
        else if (jid.endsWith('@g.us') && /^\/(un)?whitelist(\s|$)/i.test(text)) await wlCmd(m, jid, text, /^\/unwhitelist/i.test(text));
        else if (jid.endsWith('@g.us') && /^\/automsj(\s|$)/i.test(text)) await handle(m, jid, text.slice(8).trim());
      } catch (e) { console.error(e); }
  }
}

// ---------- instancias (bot principal + sub-bots) ----------
async function startInstance(id, opts) {
  const { state, saveCreds } = await useMultiFileAuthState(opts.authDir);
  const { version } = await fetchLatestBaileysVersion();
  const s = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false });
  const inst = { id, name: opts.name || BOT_NAME, sock: s, stopped: false, online: false };
  instances.set(id, inst);
  if (id === 'main') mainSock = s;

  if (opts.pairingNumber &&!state.creds.registered) {
    setTimeout(async () => {
      try { opts.onPairing?.(await s.requestPairingCode(opts.pairingNumber)); } catch (e) { console.error(e); }
    }, 3000);
  }
  s.ev.on('creds.update', saveCreds);
  s.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) opts.onQR?.(qr);
    if (connection === 'open') { inst.online = true; inst.since = Date.now(); console.log(`✅ [${id}] Conectado`); opts.onOpen?.(s); }
    if (connection === 'close') {
      inst.online = false;
      if (inst.stopped) return;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (opts.onClose?.(code)) return;
      if (code === DisconnectReason.loggedOut) opts.onLoggedOut?.();
      else if (code!== DisconnectReason.connectionReplaced) setTimeout(() => startInstance(id, opts).catch(console.error), 3000);
    }
  });
  s.ev.on('messages.upsert', ({ messages }) => { als.run(inst, () => handleUpsert(messages)).catch(console.error); });
  s.ev.on('contacts.upsert', cs => { try { rxContactos(cs); } catch {} });
  s.ev.on('group-participants.update', ev => { als.run(inst, () => grupoEvento(ev)).catch(e => console.error('[grupo]', e.message)); });
  s.ev.on('contacts.update', cs => { try { rxContactos(cs); } catch {} });
  return inst;
}

async function start() {
  startWeb();
  const nro = (process.env.NUMERO || '').replace(/\D/g, '');
  if (!fs.existsSync('./auth/creds.json') &&!nro) { console.log('Falta NUMERO'); process.exit(1); }
  await startInstance('main', {
    authDir: './auth',
    name: BOT_NAME,
    pairingNumber: nro || null,
    onPairing: code => console.log('Código:', code),
    onLoggedOut: () => console.log('Borrá./auth'),
  });
  await cargarSubbots();
}
(process.env.WORKER_MODE === '1'? startWorker() : start()).catch(console.error);
