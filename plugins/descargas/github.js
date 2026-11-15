// /git: repositorios de GitHub (zip de la rama main, listado de repos)
const axios = require('axios');
const fs = require('fs');
const { TT_MAX } = require('../../config');
const { fmtMB } = require('./apk');
const { TT_DIR, TT_UA, ttBajar } = require('../../src/lib/descarga');
const { sock } = require('../../src/lib/state');
const { ytColaLarga, ytTurno } = require('../../src/lib/youtube');
const { descargar } = require('../../src/worker');

// ---------- /getrepo /git: baja la rama main de un repositorio público de GitHub como .zip ----------
const GIT_NOMBRE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
function gitParse(arg) {   // "usuario/repo", "github.com/usuario/repo", "https://github.com/usuario/repo(.git)(/tree/...)" -> "usuario/repo" o null
  let s = String(arg || '').trim().split(/\s+/)[0].replace(/[)\].,;!?]+$/, '');
  s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/^github\.com\//i, '').replace(/^\/+/, '');
  const p = s.split(/[/?#]/).filter(Boolean); if (p.length < 2) return null;
  const nombre = `${p[0]}/${p[1].replace(/\.git$/i, '')}`;
  return GIT_NOMBRE.test(nombre) &&!/^\.+$/.test(nombre.split('/')[1])? nombre : null;
}
const GIT_USER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, GIT_POR_PAG = 15;
const gitHace = ms => { const h = ms / 3600e3, d = h / 24; return h < 1? 'hace menos de 1 h' : h < 24? `hace ${Math.floor(h)} h` : d < 30? `hace ${Math.floor(d)} d` : d < 365? `hace ${Math.floor(d / 30)} mes${Math.floor(d / 30) === 1? '' : 'es'}` : `hace ${Math.floor(d / 365)} año${Math.floor(d / 365) === 1? '' : 's'}`; };
// /git -list usuario [página]: repos públicos del usuario (los 100 más recientes), 15 por página
async function gitLista(m, jid, args) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const p = args.trim().split(/\s+/).filter(Boolean);
  let usuario = (p[0] || '').replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/^github\.com\//i, '').split(/[/?#]/)[0];
  const pagina = Math.max(1, parseInt(p[1]) || 1);
  if (!GIT_USER.test(usuario)) return reply('Uso:\n/git -list usuario\n/git -list usuario 2 (página)');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  try {
    const r = await axios.get(`https://api.github.com/users/${usuario}/repos`, { timeout: 15000, params: { per_page: 100, sort: 'pushed', type: 'owner' },
      headers: { 'User-Agent': TT_UA, Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
    const repos = Array.isArray(r.data)? r.data : [];
    if (!repos.length) return reply(`📭 *${usuario}* no tiene repositorios públicos.`);
    const total = Math.ceil(repos.length / GIT_POR_PAG), pg = Math.min(pagina, total), ini = (pg - 1) * GIT_POR_PAG;
    const lineas = repos.slice(ini, ini + GIT_POR_PAG).map((x, i) => {
      const desc = String(x.description || '').replace(/\s+/g, ' ').trim(), meta = [x.language, x.stargazers_count? `⭐ ${x.stargazers_count}` : '', x.pushed_at? gitHace(Date.now() - Date.parse(x.pushed_at)) : '', x.fork? 'fork' : '', x.archived? 'archivado' : ''].filter(Boolean).join(' · ');
      return `*${ini + i + 1}.* ${x.full_name}${meta? `\n> ${meta}` : ''}${desc? `\n> ${desc.length > 90? desc.slice(0, 89) + '…' : desc}` : ''}`;
    });
    return reply(`📚 *Repos de ${repos[0].owner?.login || usuario}* (${repos.length}${repos.length >= 100? '+' : ''} públicos, del más reciente al más viejo)\n\n${lineas.join('\n\n')}\n\n> Página ${pg}/${total}${pg < total? ` · /git -list ${usuario} ${pg + 1} para la siguiente` : ''}\n> Para bajar uno: /git usuario/repo`);
  } catch (e) {
    const st = e.response?.status; console.error('[git] lista ERROR', st || '', e.message);
    return reply(st === 404? `❌ No existe el usuario *${usuario}* en GitHub.` : st === 403 || st === 429? '⏳ GitHub limitó los pedidos. Probá de nuevo en un rato.' : '❌ No pude traer los repositorios. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}
async function gitCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const lista = /^-(?:list|lista)(?:\s+([\s\S]*))?$/i.exec(arg);
  if (lista) return gitLista(m, jid, lista[1] || '');
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || '') : '';
  const repo = gitParse(arg) || (!arg && gitParse((qt.match(/github\.com\/[^\s<>"']+/i) || [])[0]));
  if (!repo) return reply('Uso:\n/git usuario/repo (baja la rama main)\n/git -list usuario (lista sus repos)\n(también sirve el link del repositorio)');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  fs.mkdirSync(TT_DIR, { recursive: true });
  const f = `${TT_DIR}/git_${Date.now()}_${Math.random().toString(36).slice(2)}.zip`;
  try {
    const bajar = rama => ttBajar(`https://codeload.github.com/${repo}/zip/refs/heads/${rama}`, f, 'https://github.com/');
    let rama = 'main';
    if (ytColaLarga()) await reply('⏳ Hay otra descarga en curso. Te toca en un rato.');
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
const CMD_GIT = [{ test: c => /^\/(getrepo|git)(\s|$)/i.test(c.text), run: c => descargar(c.m, c.jid, 'git', { text: c.text }, () => gitCmd(c.m, c.jid, c.text)) }];
const WORKER_GIT = { git: { clase: 'pesado', run: (m, jid, text) => gitCmd(m, jid, text) } };

module.exports.commands = [...CMD_GIT];
module.exports.worker = Object.assign({}, WORKER_GIT);
