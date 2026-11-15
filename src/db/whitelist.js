// Datos: whitelist (whitelist.json)
const fs = require('fs');

const WL = './whitelist.json';
let wl = fs.existsSync(WL)? JSON.parse(fs.readFileSync(WL)) : [];
const saveWl = () => fs.writeFileSync(WL, JSON.stringify(wl, null, 2));

module.exports = { WL, saveWl, wl };
