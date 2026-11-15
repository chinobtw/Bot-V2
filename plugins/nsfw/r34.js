// /r34
const axios = require('axios');
const { spUrl } = require('../descargas/spotify');
const { nsfwOn } = require('../../src/db/nsfw');
const { TT_UA } = require('../../src/lib/descarga');
const { sock } = require('../../src/lib/state');
const { sylphyGet, sylphyOn } = require('../../src/lib/sylphy');

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
  if (!sylphyOn()) { console.error('[sylphy] falta SYLPHY_KEY'); return reply('❌ Este comando no está disponible ahora'); }
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
      : /-> (401|403)/.test(e.message) ? '❌ Este comando no está disponible ahora'
      : /certificate|altnames|-> 5\d\d|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timeout/i.test(e.message) ? '❌ El servicio no responde ahora. Probá en un rato'
      : e.message === 'no pude bajar ninguna imagen' ? '❌ No pude bajar las imágenes (el sitio las bloquea o no responden). Probá en un rato'
      : '❌ No pude procesarlo. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}
const CMD_R34 = [{ test: c => /^\/r34(\s|$)/i.test(c.text), run: c => r34Cmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_R34];
