// /setbotname, /setbotcurrency, /setbanner
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const pino = require('pino');
const { isAllowed } = require('../owner/whitelist');
const { setCfg } = require('../../src/db/ajustes');
const { BANNER_DIR, bannerPath } = require('../../src/lib/banner');
const { botName, currency } = require('../../src/lib/identidad');
const { ctxBot, senderIds, sock } = require('../../src/lib/state');

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
const CMD_PERSONALIZAR = [
  { test: c => /^\/setbotname(\s|$)/i.test(c.text), run: c => setBotName(c.m, c.jid, c.text) },
  { test: c => /^\/setbotcurrency(\s|$)/i.test(c.text), run: c => setBotCurrency(c.m, c.jid, c.text) },
  { test: c => /^\/setbanner(\s|$)/i.test(c.cap || c.text), run: c => setBanner(c.m, c.jid, c.cap || c.text) },
];

module.exports = { limpiar, puedePersonalizar };
module.exports.commands = [...CMD_PERSONALIZAR];
