// Datos: nombres de contactos
const fs = require('fs');

// nombres de WhatsApp (pushName) de quienes escriben o aparecen en los contactos; se guardan en nombres.json para no perderlos al reiniciar
const NOMBRES_FILE = './nombres.json';   // { "<numero>": "Nombre" }
const rxNombres = new Map();
try { if (fs.existsSync(NOMBRES_FILE)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(NOMBRES_FILE)))) rxNombres.set(k, String(v)); } catch (e) { console.error('[reaccion] no pude leer nombres.json:', e.message); }
let rxTimerDisco = null;
const rxGuardarDisco = () => {
  if (rxTimerDisco) return;
  rxTimerDisco = setTimeout(() => { rxTimerDisco = null; try { fs.writeFileSync(NOMBRES_FILE, JSON.stringify(Object.fromEntries(rxNombres))); } catch {} }, 15000);
  rxTimerDisco.unref?.();
};

module.exports = { NOMBRES_FILE, rxGuardarDisco, rxNombres };
