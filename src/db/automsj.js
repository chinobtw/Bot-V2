// Datos: mensajes automáticos (automsj.json)
const fs = require('fs');

const FILE = './automsj.json';

let data = fs.existsSync(FILE)? JSON.parse(fs.readFileSync(FILE)) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

module.exports = { FILE, data, save };
