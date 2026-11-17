// /backup: zip con el código y los datos, enviado al dueño
const fs = require('fs');
const path = require('path');
const { OWNER } = require('../../config');
const { CFG } = require('../../src/db/ajustes');
const { FILE } = require('../../src/db/automsj');
const { ECO_FILE, saveEcoNow } = require('../../src/db/economia');
const { afk, loteria, prestamos } = require('../../src/db/extras');
const { GEM_FILE, saveGemNow } = require('../../src/db/gemini');
const { MOD_FILE } = require('../../src/db/moderacion');
const { MUTES } = require('../../src/db/mutes');
const { NOMBRES_FILE } = require('../../src/db/nombres');
const { NSFW_FILE } = require('../../src/db/nsfw');
const { ACT_FILE, GRP_FILE, PERF_FILE, socGuardarTodo } = require('../../src/db/social');
const { SUB_FILE } = require('../../src/db/subbots');
const { WL } = require('../../src/db/whitelist');
const { crearZip, listar } = require('../../src/lib/zip');
const { ctxBot, getMainSock, isOwner, sock } = require('../../src/lib/state');

// ---------- /backup (solo el creador, solo desde el bot principal) ----------
// Un solo zip con el código y los .json. No lleva auth/, subbots/, banners/, node_modules, .env ni cookies (comprimir tantos archivos tumbaba el host).
async function backupCmd(m, jid) {
  if (ctxBot().id!== 'main' ||!(await isOwner(m, jid))) return;
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const dest = `${OWNER}@s.whatsapp.net`;
  try { saveGemNow(); saveEcoNow(); socGuardarTodo(); for (const x of [afk, loteria, prestamos]) x.guardarYa(); } catch {}
  const raiz = path.join(__dirname, '../..');
  const fecha = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  const nombre = `Bot-backup-${fecha}.zip`, tmp = path.join(raiz, 'tmp_backup.zip');
  const datos = [FILE, MUTES, WL, NSFW_FILE, NOMBRES_FILE, MOD_FILE, ACT_FILE, GRP_FILE, PERF_FILE, CFG, SUB_FILE, GEM_FILE, ECO_FILE, afk.ruta, loteria.ruta, prestamos.ruta].filter(f => fs.existsSync(f)).map(f => ({ nombre: path.basename(f), archivo: f }));
  const entradas = [
    ...['index.js', 'main.js', 'handler.js', 'config.js'].filter(f => fs.existsSync(path.join(raiz, f))).map(f => ({ nombre: f, archivo: path.join(raiz, f) })),
    ...listar(path.join(raiz, 'plugins'), raiz), ...listar(path.join(raiz, 'src'), raiz), ...listar(path.join(raiz, 'assets'), raiz),
    ...datos,
  ];
  try {
    const r = crearZip(tmp, entradas);
    await getMainSock().sendMessage(dest, { document: { url: tmp }, fileName: nombre, mimetype: 'application/zip' });
    if (jid!== dest) await reply(`📦 Backup enviado a tu privado (${r.archivos} archivos, ${(r.bytes / 1048576).toFixed(1)} MB)`);
  } catch (e) { console.error('[backup]', e.message); await reply('❌ No pude armar el backup: ' + e.message); }
  finally { fs.rmSync(tmp, { force: true }); }
}
const CMD_BACKUP = [{ test: c => /^\/backup(\s|$)/i.test(c.text), run: c => backupCmd(c.m, c.jid) }];

module.exports.commands = [...CMD_BACKUP];
