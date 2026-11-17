// Paquetes opcionales (sharp, qrcode, jsqr): el bot anda aunque falten

let QRCode; try { QRCode = require('qrcode'); } catch {}
let jsQR; try { jsQR = require('jsqr'); } catch {}

// ---------- stickers (/s) ----------
let sharp; try { sharp = require('sharp'); } catch {}

module.exports = { QRCode, jsQR, sharp };
