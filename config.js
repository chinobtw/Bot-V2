// Configuración global: dueño, nombre, puertos, URLs y topes (leídos del .env)
require('./src/lib/env');   // el .env se lee antes que nada

const OWNER = '5493329679781';
const BOT_NAME = process.env.BOT_NAME || 'Bot'; // nombre por defecto (cada instancia puede tener el suyo)

// ---------- portada de página (la tarjeta del menú apunta a una página pública con la foto del banner) ----------
const PUBLIC_URL = (process.env.BANNER_PUBLIC_URL || '').replace(/\/+$/, ''); // ej: https://bot.vand4licc.dpdns.org
const HTTP_PORT = Number(process.env.WEB_PORT || process.env.SERVER_PORT || process.env.PORT || 0);

// ---------- página web: vincular y administrar bots (se sirve en la raíz del dominio) ----------
const WEB_NOMBRE = process.env.WEB_NOMBRE || "Vandal's bot service"; // nombre que muestra la página (título, barra lateral y vista previa)
const WEB_CANAL = process.env.WEB_CANAL || 'https://whatsapp.com/channel/0029VbDFJ3kDZ4LjAMBSz92O';

// ---------- /tt /tiktok: video sin marca de agua o slides (tikwm primero, ssstik.io de respaldo) ----------
const TT_MAX = (Number(process.env.MAX_MB) || 200) * 1024 * 1024;   // tope de tamaño de TODAS las descargas (por defecto 200 MiB; se cambia con MAX_MB en el .env)

// ---------- worker de descargas ----------
// Idea: el bot (bot-hosting) no baja nada pesado. Le manda el pedido a un worker (este mismo index.js corriendo en otro hosting con
// WORKER_MODE=1). El worker ejecuta el MISMO comando de siempre con un "sock" falso que solo anota lo que el comando querría enviar
// (texto, reacciones, videos, audios, documentos). El bot va leyendo esa lista, baja los archivos y los envía por WhatsApp.
// Todos los pedidos van firmados con HMAC (la clave WORKER_KEY nunca viaja por la red).
const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/+$/, '');
const WORKER_KEY = process.env.WORKER_KEY || '';

module.exports = { BOT_NAME, HTTP_PORT, OWNER, PUBLIC_URL, TT_MAX, WEB_CANAL, WEB_NOMBRE, WORKER_KEY, WORKER_URL };
