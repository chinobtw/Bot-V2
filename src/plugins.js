// Registro de plugins. Cada plugin (carpeta plugins/) exporta:
//   commands   - lista de { test(c), run(c) }: cuándo le toca el mensaje y qué hace
//   respuestas - respuestas sin prefijo a un mensaje del bot (sí/no de /marry, número de /apk, get/stand de /bj)
//   worker     - trabajos de descarga que puede ejecutar el worker de Wispbyte
// El orden de esta lista es el orden en que se prueban los comandos. Para sumar un plugin: crear el archivo y agregarlo acá.
const archivos = [
  '../plugins/owner/say',
  '../plugins/info/menu',
  '../plugins/subbots/index',
  '../plugins/personalizar/index',
  '../plugins/utilidades/sticker',
  '../plugins/utilidades/lyrics',
  '../plugins/descargas/tiktok',
  '../plugins/descargas/search',
  '../plugins/descargas/youtube',
  '../plugins/admin/moderacion',
  '../plugins/social/index',
  '../plugins/reacciones/reacciones',
  '../plugins/nsfw/reacciones',
  '../plugins/nsfw/toggle',
  '../plugins/nsfw/r34',
  '../plugins/descargas/spotify',
  '../plugins/descargas/mediafire',
  '../plugins/descargas/github',
  '../plugins/social/marry',
  '../plugins/descargas/apk',
  '../plugins/descargas/redes',
  '../plugins/info/infobot',
  '../plugins/economia/economia',
  '../plugins/apuestas/ruleta',
  '../plugins/apuestas/coinflip',
  '../plugins/apuestas/blackjack',
  '../plugins/apuestas/maquinita',
  '../plugins/owner/backup',
  '../plugins/personalizar/prefijo',
  '../plugins/ia/gemini',
  '../plugins/info/ping',
  '../plugins/admin/killinactive',
  '../plugins/admin/mute',
  '../plugins/owner/whitelist',
  '../plugins/admin/automsj',
];
const plugins = archivos.map(f => require(f));

const COMANDOS = plugins.flatMap(p => p.commands || []);
const RESPUESTAS = plugins.flatMap(p => p.respuestas || []);
const workerTipos = () => Object.assign({}, ...plugins.map(p => p.worker || {}));

module.exports = { COMANDOS, RESPUESTAS, workerTipos };
