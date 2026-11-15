// Arranque del bot: levanta la web, el bot principal, los sub-bots o el worker de descargas
const fs = require('fs');
const { BOT_NAME } = require('./config');
const { cargarSubbots } = require('./plugins/subbots/index');
const { startInstance } = require('./src/lib/instancias');
const { startWeb } = require('./src/web/server');
const { startWorker } = require('./src/worker');

async function start() {
  startWeb();
  const nro = (process.env.NUMERO || '').replace(/\D/g, '');
  if (!fs.existsSync('./auth/creds.json') &&!nro) { console.log('Falta NUMERO'); process.exit(1); }
  await startInstance('main', {
    authDir: './auth',
    name: BOT_NAME,
    pairingNumber: nro || null,
    onPairing: code => console.log('Código:', code),
    onLoggedOut: () => console.log('Borrá./auth'),
  });
  await cargarSubbots();
}
(process.env.WORKER_MODE === '1'? startWorker() : start()).catch(console.error);

