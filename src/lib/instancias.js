// Crea y conecta una instancia de bot (principal o sub-bot) y le engancha los eventos
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { BOT_NAME } = require('../../config');
const handleUpsert = (...a) => require('../../handler').handleUpsert(...a);   // se carga al usarla (evita un ciclo)
const { grupoEvento } = require('../../plugins/social/eventos');
const { rxContactos } = require('./nombres');
const { als, instances, setMainSock } = require('./state');

// ---------- instancias (bot principal + sub-bots) ----------
async function startInstance(id, opts) {
  const { state, saveCreds } = await useMultiFileAuthState(opts.authDir);
  const { version } = await fetchLatestBaileysVersion();
  const s = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false });
  const inst = { id, name: opts.name || BOT_NAME, sock: s, stopped: false, online: false };
  instances.set(id, inst);
  if (id === 'main') setMainSock(s);

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

module.exports = { startInstance };
