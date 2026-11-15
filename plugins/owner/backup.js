// /backup: manda los datos y el index al dueño
const fs = require('fs');
const { OWNER } = require('../../config');
const { CFG } = require('../../src/db/ajustes');
const { FILE } = require('../../src/db/automsj');
const { ECO_FILE, saveEcoNow } = require('../../src/db/economia');
const { GEM_FILE, saveGemNow } = require('../../src/db/gemini');
const { MOD_FILE } = require('../../src/db/moderacion');
const { MUTES } = require('../../src/db/mutes');
const { NOMBRES_FILE } = require('../../src/db/nombres');
const { NSFW_FILE } = require('../../src/db/nsfw');
const { ACT_FILE, GRP_FILE, PERF_FILE, socGuardarTodo } = require('../../src/db/social');
const { SUB_FILE } = require('../../src/db/subbots');
const { WL } = require('../../src/db/whitelist');
const { ctxBot, getMainSock, isOwner, sleep, sock } = require('../../src/lib/state');

// ---------- /backup (solo el creador, solo desde el bot principal) ----------
async function backupCmd(m, jid) {
  if (ctxBot().id!== 'main' ||!(await isOwner(m, jid))) return;
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const dest = `${OWNER}@s.whatsapp.net`;
  try { saveGemNow(); saveEcoNow(); socGuardarTodo(); } catch {}
  const archivos = [require.main.filename, FILE, MUTES, WL, NSFW_FILE, NOMBRES_FILE, MOD_FILE, ACT_FILE, GRP_FILE, PERF_FILE, CFG, SUB_FILE, GEM_FILE, ECO_FILE].filter(f => fs.existsSync(f));
  try {
    for (const f of archivos) {
      const nombre = f.split('/').pop();
      await getMainSock().sendMessage(dest, { document: fs.readFileSync(f), fileName: nombre, mimetype: nombre.endsWith('.js')? 'text/javascript' : 'application/json' });
      await sleep(400);
    }
    if (jid!== dest) await reply(`📦 Backup enviado a tu privado (${archivos.length} archivos)`);
  } catch (e) { console.error('[backup]', e.message); await reply('❌ No pude mandar el backup: ' + e.message); }
}
const CMD_BACKUP = [{ test: c => /^\/backup(\s|$)/i.test(c.text), run: c => backupCmd(c.m, c.jid) }];

module.exports.commands = [...CMD_BACKUP];
