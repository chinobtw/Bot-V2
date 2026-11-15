// /infobot
const { OWNER, PUBLIC_URL, WEB_CANAL } = require('../../config');
const { bannerBuf } = require('../../src/lib/banner');
const { fmtTiempo } = require('../../src/lib/economia');
const { botName } = require('../../src/lib/identidad');
const { prefijo } = require('../../src/lib/prefijo');
const { ctxBot, idsDe, instances, num, sock } = require('../../src/lib/state');
const { buildMenu, countCmds } = require('../../src/menu');

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
  const base = { botName: botName(), system: '', user: '', totalCommands: 0, owner: true };
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
const CMD_INFOBOT = [{ test: c => /^\/(infobot|bot|botinfo)(\s|$)/i.test(c.text), run: c => infoBotCmd(c.m, c.jid) }];

module.exports.commands = [...CMD_INFOBOT];
