// Pedidos HTTP para redes sociales
const axios = require('axios');
const { TT_UA } = require('./descarga');

// ---------- /fb /x /ig /pin: descargas de otras redes (cada una prueba sus fuentes en orden) ----------
const dec = t => String(t || '').replace(/&amp;/g, '&').replace(/&#x2F;/g, '/').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\u0026/g, '&').replace(/\\\//g, '/');
const redGet = (url, extra = {}) => axios.get(url, { timeout: 15000, maxRedirects: 5, headers: { 'User-Agent': TT_UA, 'Accept-Language': 'en-US,en;q=0.9' },...extra });

module.exports = { dec, redGet };
