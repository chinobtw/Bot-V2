// Nombres de WhatsApp aprendidos de los contactos
const { rxGuardarDisco, rxNombres } = require('../db/nombres');
const { num, senderIds } = require('./state');

const rxLimpio = s => String(s || '').replace(/[*_~`‎‏]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
function rxAprender(ids, nombre) {
  const n = rxLimpio(nombre); if (!n) return;
  let cambio = false;
  for (const id of ids) {
    if (!id) continue;
    if (rxNombres.get(id) !== n) cambio = true;
    rxNombres.delete(id); rxNombres.set(id, n);
  }
  while (rxNombres.size > 5000) rxNombres.delete(rxNombres.keys().next().value);
  if (cambio) rxGuardarDisco();
}
const rxGuardarNombre = (m, jid) => rxAprender(senderIds(m, jid), m.pushName);
// contactos que WhatsApp le informa al bot (solo el nombre público "notify")
const rxContactos = cs => { for (const c of cs || []) if (c?.notify) rxAprender([c.id, c.lid, c.phoneNumber].filter(Boolean).map(num), c.notify); };
const rxNombreDe = ids => { for (const id of ids) { const n = rxNombres.get(id); if (n) return n; } return ''; };

module.exports = { rxAprender, rxContactos, rxGuardarNombre, rxLimpio, rxNombreDe };
