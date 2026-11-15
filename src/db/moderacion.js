// Datos: moderación (warns, bans, ajustes por grupo)
const fs = require('fs');

// ---------- MODERACIÓN: /close /open /tag /onlyadmin /kick /warn /setwarnlimit /warnstotal /delwarn /ban /pardon ----------
// Los de grupo los usan admins, dueño y whitelist. /ban y /pardon solo dueño y whitelist (en silencio para los demás).
const MOD_FILE = './moderacion.json';   // { onlyadmin: { "<grupo>": true }, warnlimit: { "<grupo>": n }, warns: { "<grupo>": { "<id>": { ids, jid, lista: [{ t, por, porNombre, razon }] } } }, bans: [{ ids, jid, t, por }] }
let mdr = { onlyadmin: {}, warnlimit: {}, warns: {}, bans: [] };
try { if (fs.existsSync(MOD_FILE)) mdr = { ...mdr, ...JSON.parse(fs.readFileSync(MOD_FILE)) }; } catch (e) { console.error('[mod] no pude leer moderacion.json:', e.message); }
const saveMdr = () => { try { fs.writeFileSync(MOD_FILE, JSON.stringify(mdr, null, 2)); } catch (e) { console.error('[mod]', e.message); } };

module.exports = { MOD_FILE, mdr, saveMdr };
