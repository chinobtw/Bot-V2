// Datos: grupos con NSFW activado
const fs = require('fs');

const NSFW_FILE = './nsfw.json';   // { "<grupo>": true }: solo están los grupos donde un admin lo activó (por defecto apagado)
let nsfw = fs.existsSync(NSFW_FILE)? JSON.parse(fs.readFileSync(NSFW_FILE)) : {};
const saveNsfw = () => fs.writeFileSync(NSFW_FILE, JSON.stringify(nsfw, null, 2));
const nsfwOn = jid => !jid.endsWith('@g.us') || !!nsfw[jid];   // en el privado siempre; en grupos, solo si un admin lo activó

module.exports = { NSFW_FILE, nsfw, nsfwOn, saveNsfw };
