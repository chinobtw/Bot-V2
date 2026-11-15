// /ytaudio, /ytvideo
const fs = require('fs');
const { TT_MAX } = require('../../config');
const { YT_INFO_RE, ytInfo, ytInfoCmd, ytMandarFicha } = require('./youtube-info');
const { sock } = require('../../src/lib/state');
const { sylphyOn, sylphyYT } = require('../../src/lib/sylphy');
const { ytBuscarId, ytColaLarga, ytDlp, ytEntrada, ytRespaldo, ytTurno } = require('../../src/lib/youtube');
const { descargar } = require('../../src/worker');

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

async function ytCmd(m, jid, text, audio) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const { arg, link } = ytEntrada(m, text);
  const cmd = audio? '/ytaudio' : '/ytvideo';
  if (!link &&!arg) return reply(`Uso:\n${cmd} <link de YouTube>\n${cmd} <título o búsqueda>\n${cmd} (respondiendo a un mensaje con el link)`);
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  if (ytColaLarga()) await reply('⏳ Hay otra descarga de YouTube en curso. Te toca en un rato.');
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
      /Sign in to confirm|not a bot/i.test(raw)? '❌ YouTube no me dejó descargarlo ahora. Probá de nuevo en un rato' :
      /Private video|members-only|Sign in to confirm your age|age-restricted/i.test(raw)? '❌ Ese video es privado o tiene restricción de edad.' :
      /ENOENT|EACCES|ENOEXEC|spawn/i.test(raw)? '❌ No pude descargarlo ahora. Probá de nuevo en un rato' :
      '❌ No pude descargarlo. Revisá que el link sea público y probá de nuevo');
  } finally {
    if (it?.archivo) fs.rmSync(it.archivo, { force: true });
    reaccion('');
  }
}
const CMD_YT = [
  { test: c => /^\/(ytaudio|ytmp3|ytvideo|ytmp4)(\s|$)/i.test(c.text) && YT_INFO_RE.test(c.text), run: c => ytInfoCmd(c.m, c.jid, c.text) },
  { test: c => /^\/(ytaudio|ytmp3)(\s|$)/i.test(c.text), run: async c => { if (!await ytSylphyCmd(c.m, c.jid, c.text, true)) await descargar(c.m, c.jid, 'yt', { text: c.text, audio: true }, () => ytCmd(c.m, c.jid, c.text, true), true); } },
  { test: c => /^\/(ytvideo|ytmp4)(\s|$)/i.test(c.text), run: async c => { if (!await ytSylphyCmd(c.m, c.jid, c.text, false)) await descargar(c.m, c.jid, 'yt', { text: c.text, audio: false }, () => ytCmd(c.m, c.jid, c.text, false), true); } },
];
const WORKER_YT = { yt: { clase: 'pesado', run: (m, jid, text, b) => ytCmd(m, jid, text, !!b.audio) } };

module.exports = { ytEnviar };
module.exports.commands = [...CMD_YT];
module.exports.worker = Object.assign({}, WORKER_YT);
