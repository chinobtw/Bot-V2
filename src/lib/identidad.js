// Nombre, moneda y slug de cada bot
const crypto = require('crypto');
const { BOT_NAME } = require('../../config');
const { cfgOf } = require('../db/ajustes');
const { subReg } = require('../db/subbots');
const { DEFAULT_CURRENCY } = require('./banner');
const { ctxBot } = require('./state');

const botName = () => cfgOf(ctxBot().id).name || ctxBot().name || BOT_NAME;
const currency = () => cfgOf(ctxBot().id).currency || DEFAULT_CURRENCY; // para los comandos de economía
// identificador opaco para las URLs (así no se ve el número de los sub-bots)
const slugOf = id => crypto.createHash('sha256').update('banner:' + id).digest('hex').slice(0, 12);
function idBySlug(slug) { // cualquier bot (tenga o no banner propio) para poder mostrar el de fábrica
  return ['main',...Object.keys(subReg)].find(id => slugOf(id) === slug) || null;
}
const nameOfId = id => cfgOf(id).name || subReg[id]?.name || BOT_NAME;

module.exports = { botName, currency, idBySlug, nameOfId, slugOf };
