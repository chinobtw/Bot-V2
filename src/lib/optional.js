// Paquetes opcionales (sharp, qrcode): el bot anda aunque falten

let QRCode; try { QRCode = require('qrcode'); } catch {}

// ---------- stickers (/s) ----------
let sharp; try { sharp = require('sharp'); } catch {}

module.exports = { QRCode, sharp };
