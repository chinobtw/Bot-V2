// Datos: registro de sub-bots
const fs = require('fs');

const SUB_FILE = './subbots.json';   // registro: { "<numero>": { name, chat, since } }
let subReg = fs.existsSync(SUB_FILE)? JSON.parse(fs.readFileSync(SUB_FILE)) : {};
const saveSubs = () => fs.writeFileSync(SUB_FILE, JSON.stringify(subReg, null, 2));

module.exports = { SUB_FILE, saveSubs, subReg };
