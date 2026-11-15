// /fb, /x, /ig, /pin
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const { TT_MAX } = require('../../config');
const { YT_UA_PC } = require('./search');
const { TT_DIR, TT_UA, ttBajar } = require('../../src/lib/descarga');
const { dec, redGet } = require('../../src/lib/redes');
const { sleep, sock } = require('../../src/lib/state');
const { aleat } = require('../../src/lib/util');
const { descargar } = require('../../src/worker');

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

// --- Pinterest (link o búsqueda), con tus cookies ---
// La API web de Pinterest rechaza ("Invalid Resource Request") los pedidos que no traen los encabezados de su propia página (X-APP-VERSION, PWS-Handler, Sec-Fetch-*).
// Con eso anda hasta sin sesión; las cookies son opcionales (./pin_cookies.txt o PIN_COOKIES=ruta en el .env) y se usan si están. Si Pinterest las rechaza, se reintenta sin ellas.
// Sirve el cookies.txt de siempre (formato Netscape), un JSON exportado del navegador o el encabezado "Cookie: a=b; c=d" pegado tal cual. El archivo se vuelve a leer solo cuando cambia.
// X-APP-VERSION es el número de versión de la web de Pinterest (cambia con sus actualizaciones): se puede cambiar con PIN_APP_VERSION en el .env.
const pinDominio = d => /(^|\.)pinterest\.[a-z.]+$/i.test(String(d || '').replace(/^\./, ''));
function pinCookiesParse(raw) {
  const v = new Map(), ahora = Date.now() / 1000;
  raw = String(raw || '').replace(/^﻿/, '').trim();
  if (raw.startsWith('[') || raw.startsWith('{')) {   // JSON del navegador (EditThisCookie, Cookie-Editor...)
    try {
      const j = JSON.parse(raw);
      for (const c of Array.isArray(j)? j : (j.cookies || [])) if (c?.name && pinDominio(c.domain) &&!(c.expirationDate && c.expirationDate < ahora) &&!(c.expires > 0 && c.expires < ahora)) v.set(c.name, String(c.value));
    } catch {}
  } else if (raw.includes('\t')) {   // Netscape
    for (let l of raw.split(/\r?\n/)) {
      if (l.startsWith('#HttpOnly_')) l = l.slice(10); else if (!l.trim() || l.startsWith('#')) continue;
      const c = l.split('\t'); if (c.length < 7 ||!pinDominio(c[0])) continue;
      if (Number(c[4]) > 0 && Number(c[4]) < ahora) continue;   // vencida
      v.set(c[5], c.slice(6).join('\t').trim());
    }
  } else {   // encabezado Cookie crudo
    for (const p of raw.replace(/^cookie:\s*/i, '').split(/;\s*/)) { const i = p.indexOf('='); if (i > 0) v.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); }
  }
  return v;
}
let pinCk = { f: '', mt: -1, h: '', csrf: '', n: 0, sesion: false };
function pinCookies() {
  const f = process.env.PIN_COOKIES || './pin_cookies.txt';
  let st; try { st = fs.statSync(f); } catch { return pinCk = { f, mt: -1, h: '', csrf: '', n: 0, sesion: false }; }
  if (pinCk.f === f && pinCk.mt === st.mtimeMs) return pinCk;
  let v = new Map(); try { v = pinCookiesParse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error('[pin] no pude leer', f, e.message); }
  pinCk = { f, mt: st.mtimeMs, h: [...v].map(([k, x]) => `${k}=${x}`).join('; '), csrf: v.get('csrftoken') || '', n: v.size, sesion: v.has('_pinterest_sess') };
  console.log(`[pin] cookies de ${f}: ${pinCk.n}${pinCk.sesion? ' (con sesión)' : ' (SIN _pinterest_sess: no alcanza para iniciar sesión)'}`);
  return pinCk;
}
function pinHeaders(api, anonimo) {
  const ck = anonimo? { h: 'csrftoken=' + crypto.randomBytes(16).toString('hex'), csrf: '' } : pinCookies();
  return { 'User-Agent': YT_UA_PC, 'Accept-Language': 'en-US,en;q=0.9', Referer: 'https://www.pinterest.com/',
    ...(api? {
      Accept: 'application/json, text/javascript, */*, q=0.01', 'X-Requested-With': 'XMLHttpRequest', 'X-APP-VERSION': process.env.PIN_APP_VERSION || 'a89153f',
      'X-Pinterest-AppState': 'active', 'X-Pinterest-PWS-Handler': 'www/[username].js', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin',
      ...(ck.csrf? { 'X-CSRFToken': ck.csrf } : {}),
    } : { Accept: 'text/html,application/xhtml+xml' }),
    ...(ck.h? { Cookie: ck.h } : {}) };
}
// pide con las cookies (si hay); si Pinterest las rechaza, reintenta una vez sin sesión antes de rendirse
let pinAvisoCk = false;
async function pinReq(url, api) {
  const ck = pinCookies();
  try { return await redGet(url, { headers: pinHeaders(api, !ck.h) }); }
  catch (e) {
    const st = e.response?.status;
    if (ck.h && (st === 401 || st === 403)) {
      try { const r = await redGet(url, { headers: pinHeaders(api, true) }); if (!pinAvisoCk) { pinAvisoCk = true; console.error('[pin] Pinterest rechazó tus cookies: sigo sin sesión (revisá pin_cookies.txt)'); } return r; } catch {}
    }
    throw e;
  }
}
// Pinterest rechazó el pedido (también sin sesión): se distingue "no hay cookies" de "las cookies no sirven"
const pinAuth = e => { const st = e.response?.status; if (st !== 401 && st !== 403) return null; return new Error(pinCookies().sesion? 'PIN_COOKIES' : 'PIN_LOGIN'); };
const pinApi = async (recurso, opciones) => {
  const r = await pinReq(`https://www.pinterest.com/resource/${recurso}/get/?source_url=&data=${encodeURIComponent(JSON.stringify({ options: opciones }))}`, true);
  return r.data?.resource_response?.data;
};
const pinHtml = async url => String((await pinReq(url, false)).data).replace(/\\\//g, '/');
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
  let auth = null;   // si Pinterest pide sesión, se avisa en vez de decir "no encontré"
  if (q) { // búsqueda: una sola imagen, al azar entre las primeras
    let urls = [];
    try {
      const d = await pinApi('BaseSearchResource', { query: q, scope: 'pins', rs: 'typed' });
      urls = (d?.results || []).filter(x => x?.images?.orig?.url &&!x.is_promoted &&!x.promoter).map(x => [x.images.orig.url, x.images['736x']?.url].filter(Boolean));
    } catch (e) { auth = pinAuth(e) || auth; console.error('[pin] búsqueda API falló:', e.response?.status || '', e.message); }
    if (!urls.length) {
      try {
        const h = await pinHtml('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(q));
        urls = [...new Set([...h.matchAll(/"orig":\{"url":"(https:[^"]+)"/g)].map(x => x[1]))].map(u => [u]);
      } catch (e) { auth = pinAuth(e) || auth; console.error('[pin] búsqueda HTML falló:', e.response?.status || '', e.message); }
    }
    if (!urls.length) throw auth || new Error('SIN_RESULTADOS');
    return { items: [{ type: 'image', urls: aleat(urls.slice(0, 5)) }], caption: `📌 ${q}` };
  }
  let url = link;
  if (/pin\.it\//i.test(link)) { const r = await pinReq(link, false); url = r.request?.res?.responseUrl || link; }
  const id = (url.match(/\/pin\/(?:[^\/?#]*--)?(\d+)/) || [])[1];
  if (!id) throw new Error('LINK_INVALIDO');
  try {
    const d = await pinApi('PinResource', { id, field_set_key: 'detailed' });
    const items = d? pinMedia(d) : [];
    if (items.length) return { items, caption: `📌 ${(d.title || d.grid_title || d.description || '').trim()}`.slice(0, 300).trim() };
    throw new Error('sin datos en la API');
  } catch (e) {
    auth = pinAuth(e) || auth;
    console.error('[pin] API falló, pruebo la página:', e.response?.status || '', e.message);
    let h = '';
    try { h = await pinHtml(`https://www.pinterest.com/pin/${id}/`); } catch (x) { throw pinAuth(x) || auth || x; }
    const v = [...new Set([...h.matchAll(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\\\s]+?\.mp4/g)].map(x => x[0]))];
    if (v.length) return { items: [{ type: 'video', urls: v }], caption: '📌' };
    const o = [...new Set([...h.matchAll(/"orig":\{"url":"(https:[^"]+)"/g)].map(x => x[1]))];
    const og = (h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1];
    const urls = [o[0], og && dec(og).replace('/736x/', '/originals/'), og && dec(og)].filter(Boolean);
    if (!urls.length) throw auth || new Error('SIN_MEDIA');
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
      (e.message === 'PIN_LOGIN' || e.message === 'PIN_COOKIES')? (console.error('[pin] Pinterest rechazó el pedido: cargá/renová pin_cookies.txt (o PIN_COOKIES) o actualizá PIN_APP_VERSION'), '🔒 Pinterest no me dejó acceder ahora. Probá de nuevo en un rato') :
      `❌ No pude descargarlo. Revisá que el link sea público y probá de nuevo`);
  } finally { reaccion(''); }
}
const CMD_RED = [
  { test: c => /^\/(fb|facebook)(\s|$)/i.test(c.text), run: c => descargar(c.m, c.jid, 'red', { text: c.text, clave: 'fb' }, () => redCmd(c.m, c.jid, c.text, 'fb')) },
  { test: c => /^\/(x|twitter)(\s|$)/i.test(c.text), run: c => descargar(c.m, c.jid, 'red', { text: c.text, clave: 'x' }, () => redCmd(c.m, c.jid, c.text, 'x')) },
  { test: c => /^\/(ig|instagram)(\s|$)/i.test(c.text), run: c => descargar(c.m, c.jid, 'red', { text: c.text, clave: 'ig' }, () => redCmd(c.m, c.jid, c.text, 'ig')) },
  { test: c => /^\/(pin|pinterest)(\s|$)/i.test(c.text), run: c => descargar(c.m, c.jid, 'red', { text: c.text, clave: 'pin' }, () => redCmd(c.m, c.jid, c.text, 'pin')) },
];
const WORKER_RED = { red: { clase: 'liviano', run: (m, jid, text, b) => RED[b.clave] && redCmd(m, jid, text, b.clave) } };

module.exports.commands = [...CMD_RED];
module.exports.worker = Object.assign({}, WORKER_RED);
