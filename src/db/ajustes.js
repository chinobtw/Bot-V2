// Datos: personalización de cada bot (nombre, moneda, banner, prefijo)
const fs = require('fs');

// ---------- personalización (por instancia: el principal y cada sub-bot tienen la suya) ----------
const CFG = './settings.json';          // { "main": { name, currency }, "<numero>": {...} }
let settings = fs.existsSync(CFG)? JSON.parse(fs.readFileSync(CFG)) : {};
const saveCfg = () => fs.writeFileSync(CFG, JSON.stringify(settings, null, 2));
const cfgOf = id => settings[id] || {};
function setCfg(id, patch) {
  const c = { ...(settings[id] || {}), ...patch };
  for (const k of Object.keys(c)) if (c[k] == null) delete c[k];
  if (Object.keys(c).length) settings[id] = c; else delete settings[id];
  saveCfg();
}

module.exports = { CFG, cfgOf, saveCfg, setCfg, settings };
