// Datos: mutes (mutes.json)
const fs = require('fs');

const MUTES = './mutes.json';
let mutes = fs.existsSync(MUTES)? JSON.parse(fs.readFileSync(MUTES)) : {};
const saveMutes = () => fs.writeFileSync(MUTES, JSON.stringify(mutes, null, 2));

module.exports = { MUTES, mutes, saveMutes };
