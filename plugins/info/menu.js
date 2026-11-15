// /menu: envía el menú
const { HTTP_PORT, PUBLIC_URL } = require('../../config');
const { BANNER_BODY, BANNER_URL, bannerCard, bannerVer } = require('../../src/lib/banner');
const { botName, slugOf } = require('../../src/lib/identidad');
const { prefijo } = require('../../src/lib/prefijo');
const { ctxBot, isOwner, num, sock } = require('../../src/lib/state');
const { buildMenu, countCmds } = require('../../src/menu');

async function sendMenu(m, jid) {
  const sender = m.key.participant || (m.key.fromMe? `${num(sock.user?.id)}@s.whatsapp.net` : jid);
  const base = { botName: botName(), system: ctxBot().id === 'main'? 'Main-Bot' : 'Sub-Bot', user: num(sender), totalCommands: 0, owner: await isOwner(m, jid) };
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
const CMD_MENU = [{ test: c => /^\/(help|menu|\?|comandos)(\s|$)/i.test(c.text), run: c => sendMenu(c.m, c.jid) }];

module.exports.commands = [...CMD_MENU];
