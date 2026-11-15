// Motor de YouTube: yt-dlp, cookies, respaldo por API, cola de descargas
const axios = require('axios');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { TT_MAX } = require('../../config');
const { ytBuscarLista } = require('../../plugins/descargas/search');
const { TT_DIR, ttBajar } = require('./descarga');

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
const ytColaLarga = () => ytEnCola;
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

module.exports = { execP, ytBinario, ytBuscarId, ytCalentar, ytColaLarga, ytDlp, ytEntrada, ytRespaldo, ytTieneFfmpeg, ytTurno };
