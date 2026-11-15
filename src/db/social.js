// Datos: actividad, grupos y perfiles
const fs = require('fs');

// ---------- SOCIAL: actividad y nivel, grupos (antilink / bienvenida), perfil, economía extra y utilidades ----------
// Archivos (entran en el /backup): actividad.json (mensajes y XP por grupo), grupos.json (config por grupo), perfiles.json (perfil, pareja y stickers de cada persona)
const ACT_FILE = './actividad.json';   // { "<grupo>": { desde, u: { "<id>": { ids, jid, n, t, p, xp, xt, d: { "<día>": n } } } } }
const GRP_FILE = './grupos.json';      // { "<grupo>": { antilink, welcome, goodbye, welcomeMsg, goodbyeMsg, noeco, cumple } }
const PERF_FILE = './perfiles.json';   // { u: { "<id>": { ids, jid, nombre, desc, cumple: { d, m, a }, meta: { pack, autor }, pareja, hist: [] } } }
const socLeer = (f, def) => { try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f)); } catch (e) { console.error('[social] no pude leer ' + f + ':', e.message); } return def; };
const act = socLeer(ACT_FILE, {}), grp = socLeer(GRP_FILE, {}), perf = socLeer(PERF_FILE, { u: {} });
if (!perf.u) perf.u = {};
const socGuardador = (f, get, ms) => {
  let t = null;
  const ya = () => { clearTimeout(t); t = null; try { fs.writeFileSync(f, JSON.stringify(get())); } catch (e) { console.error('[social]', f, e.message); } };
  const luego = () => { if (t) return; t = setTimeout(ya, ms); t.unref?.(); };
  return { luego, ya };
};
const actDisco = socGuardador(ACT_FILE, () => act, 20000);
const grpDisco = socGuardador(GRP_FILE, () => grp, 1500);
const perfDisco = socGuardador(PERF_FILE, () => perf, 1500);
const socGuardarTodo = () => { actDisco.ya(); grpDisco.ya(); perfDisco.ya(); };
for (const sg of ['SIGTERM', 'SIGINT']) process.once(sg, () => { socGuardarTodo(); process.exit(0); });   // no perder lo contado al reiniciar

module.exports = { ACT_FILE, GRP_FILE, PERF_FILE, act, actDisco, grp, grpDisco, perf, perfDisco, socGuardarTodo };
