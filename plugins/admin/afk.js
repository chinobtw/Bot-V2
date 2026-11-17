// /afk <motivo>: avisa que no estás; si alguien te menciona o te responde, el bot contesta por vos. Cuando volvés a escribir, se saca solo
const { afk } = require('../../src/db/extras');
const { ecoIds, fmtTiempo } = require('../../src/lib/economia');
const { comando, argsDe, ctxDe, responder } = require('../../src/lib/medios');
const { num, senderIds } = require('../../src/lib/state');
const { sock } = require('../../src/lib/state');

const AVISO_CADA = 60e3;            // el bot avisa por la misma persona como mucho una vez por minuto en cada grupo
const avisados = new Map();         // "grupo|id" -> última vez que se avisó

async function afkCmd(c) {
  const reply = responder(c), ids = await ecoIds(c.m, c.jid), yo = c.m.key.participant || c.jid;
  const motivo = argsDe(c).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  const g = (afk.datos[c.jid] ||= {});
  for (const k of Object.keys(g)) if (g[k].ids.some(x => ids.includes(x))) delete g[k];
  g[ids[0]] = { ids, jid: yo, motivo, desde: Date.now() }; afk.guardar();
  await reply(`💤 @${num(yo)} ahora está AFK${motivo? `: ${motivo}` : ''}\n> Cuando vuelvas a escribir se saca solo`, [yo]);
}

// se llama con cada mensaje del grupo (lo atiende un solo bot por grupo)
async function afkVer(m, jid) {
  const g = afk.datos[jid]; if (!g || !Object.keys(g).length) return;
  const crudo = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '').trim();
  const ids = senderIds(m, jid);
  // el que vuelve: cualquier mensaje suyo (menos el propio /afk) lo saca de la lista
  if (!/^\S?afk(\s|$)/i.test(crudo)) {
    const k = Object.keys(g).find(k => g[k].ids.some(x => ids.includes(x)));
    if (k) {
      const e = g[k]; delete g[k]; afk.guardar();
      await sock.sendMessage(jid, { text: `👋 @${num(e.jid)} volvió (estuvo AFK ${fmtTiempo(Date.now() - e.desde)})`, mentions: [e.jid] }, { quoted: m });
    }
  }
  // los que mencionan o responden a alguien AFK
  const ctx = ctxDe(m), citados = [...(ctx?.mentionedJid || []), ...(ctx?.participant? [ctx.participant] : [])].map(num);
  const vistos = new Set();
  for (const e of Object.values(g)) {
    if (!e.ids.some(x => citados.includes(x)) || e.ids.some(x => ids.includes(x))) continue;
    const clave = `${jid}|${e.ids[0]}`;
    if (vistos.has(clave) || Date.now() - (avisados.get(clave) || 0) < AVISO_CADA) continue;
    vistos.add(clave); avisados.set(clave, Date.now());
    await sock.sendMessage(jid, { text: `💤 @${num(e.jid)} está AFK${e.motivo? `: ${e.motivo}` : ''}\n> Desde hace ${fmtTiempo(Date.now() - e.desde)}`, mentions: [e.jid] }, { quoted: m });
  }
}

module.exports = { afkVer };
module.exports.commands = [{ test: c => c.enGrupo && comando('afk')(c), run: afkCmd }];
