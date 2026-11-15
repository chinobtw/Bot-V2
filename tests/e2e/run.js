// Prueba de punta a punta: arranca el bot con Baileys/axios simulados, le manda una tanda de mensajes (corpus.json)
// y guarda todo lo que el bot haría (mensajes, ediciones, etc.). tests/e2e/check.js compara ese registro con golden.log.
const Module = require('module'), path = require('path'), os = require('os'), fs = require('fs');
const entry = path.resolve(process.argv[2] || path.join(__dirname, '../../index.js')), outFile = path.resolve(process.argv[3]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-')); process.chdir(tmp);
// --- determinismo ---
let seed = 12345; Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const T0 = Date.UTC(2026, 10, 14, 15, 0, 0); let tick = 0; const RealDate = Date;
class FDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(T0 + (tick += 1)); } static now() { return T0 + (tick += 1); } }
global.Date = FDate;
process.env.NUMERO = '5493329679781'; process.env.BOT_NAME = 'TestBot'; process.env.PIN_COOKIES = '/nonexistent'; process.env.SYLPHY_KEY = process.env.SYLPHY_KEY || '';
delete process.env.WORKER_URL; delete process.env.GITHUB_TOKEN; delete process.env.HTTP_PORT; delete process.env.PUBLIC_URL;
const LOG = []; const rec = (k, v) => LOG.push([k, JSON.parse(JSON.stringify(v, (kk, x) => typeof x === 'bigint' ? String(x) : (x && x.type === 'Buffer' ? '<buf>' : (Buffer.isBuffer(x) ? '<buf>' : x))))]);
const handlers = {};
const OWN = '5493329679781@s.whatsapp.net', BOTJ = '5493329679000@s.whatsapp.net';
const PART = [{ id: OWN, admin: 'superadmin' }, { id: '549111@s.whatsapp.net', admin: 'admin' }, { id: '549333@s.whatsapp.net' }, { id: '549444@s.whatsapp.net' }, { id: BOTJ, admin: 'admin' }];
const mkSock = () => {
  const base = {
    ev: { on: (e, f) => { handlers[e] = f; } }, user: { id: BOTJ, lid: '99@lid' },
    requestPairingCode: async () => 'ABCD1234', ws: { close() {} }, end() {}, logout: async () => {},
    groupMetadata: async j => ({ id: j, subject: 'Grupo', participants: PART, size: PART.length }),
    groupFetchAllParticipating: async () => ({ 'g1@g.us': { id: 'g1@g.us', subject: 'Grupo', participants: PART } }),
    sendMessage: async (jid, content, opts) => { rec('send', { jid, content, q: opts && opts.quoted ? opts.quoted.key : undefined, edit: content && content.edit }); return { key: { id: 'S' + LOG.length, remoteJid: jid, fromMe: true }, message: content }; },
  };
  return new Proxy(base, { get: (t, p) => p in t ? t[p] : (typeof p === 'string' && !['then', 'toJSON', 'inspect'].includes(p) ? async (...a) => { rec('call:' + p, a.map(x => typeof x === 'function' ? '<fn>' : x)); return { key: { id: 'X' }, status: 200 }; } : undefined) });
};
const bailStub = { default: () => mkSock(), makeWASocket: () => mkSock(), useMultiFileAuthState: async () => ({ state: { creds: { registered: true } }, saveCreds: () => {} }), DisconnectReason: { loggedOut: 401, connectionReplaced: 440 }, fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }), downloadMediaMessage: async () => Buffer.from('x'), generateWAMessageFromContent: (jid, c) => ({ key: { id: 'GEN' }, message: c }) };
const axStub = () => { const f = async (...a) => { rec('axios', [typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url)]); const e = new Error('stub-offline'); e.code = 'ECONNRESET'; throw e; }; const ax = Object.assign(f, { get: f, post: f, put: f, head: f, request: f, create: () => ax, defaults: { headers: {} } }); ax.default = ax; return ax; };
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === '@whiskeysockets/baileys') return bailStub;
  if (req === 'axios') return axStub();
  if (req === 'pino') return () => ({});
  if (req === 'qrcode') return { toDataURL: async () => 'data:image/png;base64,QQ==', toBuffer: async () => Buffer.from('qr') };
  try { return origLoad.apply(this, arguments); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') { try { return origLoad.call(this, require.resolve(req, { paths: [path.dirname(entry)] }), parent, isMain); } catch {} } throw e; }
};
// cortar procesos hijos y red real
const cp = require('child_process'); for (const k of ['exec', 'execFile', 'spawn']) { const o = cp[k]; cp[k] = function (...a) { rec('proc:' + k, [String(a[0]).slice(0, 80), Array.isArray(a[1]) ? a[1].slice(0, 3) : undefined]); const err = new Error('stub-proc'); err.code = 'ENOENT'; const cb = a.find(x => typeof x === 'function'); if (cb) { process.nextTick(() => cb(err, '', '')); } const ee = new (require('events'))(); ee.stdout = new (require('events'))(); ee.stderr = new (require('events'))(); ee.stdin = { end() {}, write() {} }; ee.kill = () => {}; process.nextTick(() => ee.emit('error', err)); return ee; }; };
for (const m of ['http', 'https']) { const o = require(m); o.request = function () { const ee = new (require('events'))(); ee.end = () => process.nextTick(() => ee.emit('error', new Error('stub-net'))); ee.write = () => {}; ee.setTimeout = () => {}; ee.destroy = () => {}; return ee; }; o.get = o.request; }
console.log = console.error = () => {};   // el bot es ruidoso
process.on('unhandledRejection', e => { if (process.env.E2E_DEBUG) process.stderr.write('UNH ' + (e && e.stack) + '\n'); }); process.on('uncaughtException', e => rec('uncaught', String(e && e.message)));
try { require(entry); } catch (e) { rec('REQUIRE-ERROR', e.stack.split('\n').slice(0, 8).join(' | ')); }
const MSGS = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus.json'), 'utf8'));
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 100 && !handlers['messages.upsert']; i++) await wait(50);
  if (!handlers['messages.upsert']) { fs.writeFileSync(outFile, 'NO-HANDLER\n' + LOG.map(x => JSON.stringify(x)).join('\n')); process.exit(2); }
  let n = 0;
  for (const c of MSGS) {
    const { chat, from, text, cap, quote, push } = c;
    const jid = chat === 'g' ? 'g1@g.us' : (from === 'owner' ? OWN : '549333@s.whatsapp.net');
    const sender = from === 'owner' ? OWN : from === 'admin' ? '549111@s.whatsapp.net' : '549333@s.whatsapp.net';
    const id = 'MSG' + (++n);
    const message = cap !== undefined ? { imageMessage: { caption: cap, mimetype: 'image/jpeg' } } : (quote ? { extendedTextMessage: { text, contextInfo: { stanzaId: quote, participant: BOTJ, quotedMessage: { conversation: 'q' } } } } : { conversation: text });
    rec('IN', { n, chat, from, text: text ?? cap });
    handlers['messages.upsert']({ messages: [{ key: { id, remoteJid: jid, participant: chat === 'g' ? sender : undefined, fromMe: false }, pushName: push || 'Pepe', message, messageTimestamp: Math.floor(T0 / 1000) }], type: 'notify' });
    await wait(40);
  }
  await wait(1500);
  fs.writeFileSync(outFile, LOG.map(x => JSON.stringify(x)).join('\n'));
  process.exit(0);
})();
