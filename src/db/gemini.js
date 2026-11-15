// Datos: memoria de conversaciones de Gemini
const fs = require('fs');

// ---------- /gemini (key en la variable GEMINI_API_KEY; modelo en GEMINI_MODEL) ----------
const GEM_FILE = './gemini.json';                                        // { off: { "inst|chat": true }, mem: { "inst|chat|usuario": { t, h: [...] } } }
let gem = { off: {}, mem: {} };
try { if (fs.existsSync(GEM_FILE)) gem = { off: {}, mem: {},...JSON.parse(fs.readFileSync(GEM_FILE)) }; } catch {}
const saveGemNow = () => fs.writeFileSync(GEM_FILE, JSON.stringify(gem));
let gemTimer; const saveGem = () => { clearTimeout(gemTimer); gemTimer = setTimeout(() => { try { saveGemNow(); } catch {} }, 1000); };

module.exports = { GEM_FILE, gem, saveGem, saveGemNow };
