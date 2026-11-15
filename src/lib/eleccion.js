// Con varios bots en un grupo, decide cuál responde (por inicial del nombre)
const { subReg } = require('../db/subbots');
const { nameOfId } = require('./identidad');
const { prefijo } = require('./prefijo');
const { ctxBot, idsDe, instances, num, sock } = require('./state');

// ---------- en un grupo con varios bots (este proceso), responde solo el más viejo ----------
const edad = inst => inst.id === 'main'? 0 : (subReg[inst.id]?.since?? Infinity);
const eleccion = new Map(); // "instancia|grupo" -> { t, v }
// inicial de un bot: primera letra de su nombre (el que se configura con /setbotname), en minúscula
const inicialDe = id => ((nameOfId(id).match(/\p{L}/u) || [''])[0]).toLowerCase();
async function soyElElegido(jid, ini = null, porPrefijo = false) {
  const yo = ctxBot();
  if (yo.id === 'main') return true; // el principal es el más viejo
  const px = prefijo(yo.id), k = `${yo.id}|${jid}|${ini || ''}|${porPrefijo? px : ''}`, c = eleccion.get(k);
  if (c && Date.now() - c.t < 30e3) return c.v;
  // sin inicial compiten todos los bots del grupo; con inicial, solo los que empiezan con esa letra.
  // Con porPrefijo (comandos), solo compiten los que usan el MISMO prefijo: si el prefijo es distinto, no hace falta la inicial
  const mayores = [...instances.values()].filter(i => i.id!== yo.id && i.online && edad(i) < edad(yo) && (!ini || inicialDe(i.id) === ini) && (!porPrefijo || prefijo(i.id) === px));
  let v = true;
  if (mayores.length) {
    try {
      const miembros = (await sock.groupMetadata(jid)).participants.flatMap(idsDe);
      v =!mayores.some(i => [i.sock.user?.id, i.sock.user?.lid].filter(Boolean).map(num).some(x => miembros.includes(x)));
    } catch { v = true; }
  }
  eleccion.set(k, { t: Date.now(), v });
  return v;
}

module.exports = { eleccion, inicialDe, soyElElegido };
