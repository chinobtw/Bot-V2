// Estado compartido: sockets (principal y sub-bots), identificación de usuarios, admin y dueño
const { AsyncLocalStorage } = require('async_hooks');
const { BOT_NAME, OWNER } = require('../../config');

const als = new AsyncLocalStorage();
let mainSock;                  // socket del bot principal
const setMainSock = x => { mainSock = x; };
const getMainSock = () => mainSock;
const instances = new Map();   // id ('main' o número) -> { id, name, sock }
// "sock" apunta siempre al socket de la instancia que está procesando el mensaje
const sock = new Proxy({}, {
  get(_, p) {
    const s = als.getStore()?.sock || mainSock;
    const v = s?.[p];
    return typeof v === 'function'? v.bind(s) : v;
  },
});
const ctxBot = () => als.getStore() || { id: 'main', name: BOT_NAME };

const num = j => (j || '').split('@')[0].split(':')[0];
const botIds = () => [sock.user?.id, sock.user?.lid].filter(Boolean).map(num);
const idsDe = p => [p.id, p.phoneNumber, p.lid].filter(Boolean).map(num);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function senderIds(m, jid) {
  const g = jid.endsWith('@g.us');
  const ids = g? [m.key.participant, m.key.participantAlt, m.participant] : [jid, m.key.remoteJidAlt];
  if (m.key.fromMe) ids.push(sock.user?.id, sock.user?.lid);
  return ids.filter(Boolean).map(num);
}
async function isAdmin(jid, m) {
  const meta = await sock.groupMetadata(jid);
  const ids = senderIds(m, jid);
  return meta.participants.some(p => p.admin && idsDe(p).some(x => ids.includes(x)));
}
async function isOwner(m, jid) {
  const ids = senderIds(m, jid);
  if (ids.includes(OWNER)) return true;
  if (!jid.endsWith('@g.us')) return false;
  const meta = await sock.groupMetadata(jid);
  const p = meta.participants.find(p => idsDe(p).some(x => ids.includes(x)));
  return!!p && idsDe(p).includes(OWNER);
}

module.exports = { als, botIds, ctxBot, getMainSock, idsDe, instances, isAdmin, isOwner, num, senderIds, setMainSock, sleep, sock };
