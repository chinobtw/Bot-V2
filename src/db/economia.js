// Datos: economía (billeteras, bancos, rachas)
const fs = require('fs');

// ---------- economía (por grupo y por persona; se guarda en economia.json) ----------
const ECO_FILE = './economia.json';   // { "<chat>": { "<id>": { ids, cartera, banco, dias, ultDaily, cd: {}, ult } }, "@racha": { "<id>": { ids, dias, ultDaily } } }
let eco = {};
try { if (fs.existsSync(ECO_FILE)) eco = JSON.parse(fs.readFileSync(ECO_FILE)); } catch (e) { console.error('[eco] no pude leer economia.json:', e.message); }
const saveEcoNow = () => fs.writeFileSync(ECO_FILE, JSON.stringify(eco));
let ecoTimer; const saveEco = () => { clearTimeout(ecoTimer); ecoTimer = setTimeout(() => { try { saveEcoNow(); } catch (e) { console.error('[eco]', e.message); } }, 800); };

module.exports = { ECO_FILE, eco, saveEco, saveEcoNow };
