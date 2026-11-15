// Aviso automático de cumpleaños
const { grp, grpDisco, perf } = require('../../src/db/social');
const { cumpleHoy, edadDe } = require('../../src/lib/cumple');
const { soyElElegido } = require('../../src/lib/eleccion');
const { SOC_AR, socMapa, socMiembro } = require('../../src/lib/social');
const { als, instances, num, sleep, sock } = require('../../src/lib/state');

// cumpleaños: cada día, a partir de las 9 (hora argentina), el bot elegido de cada grupo saluda a los que cumplen
async function cumpleTick(ahora = Date.now()) {
  if (new Date(ahora - SOC_AR).getUTCHours() < 9) return;
  const hoy = new Date(ahora - SOC_AR).toISOString().slice(0, 10);
  if (!Object.values(perf.u).some(u => u.cumple && cumpleHoy(u.cumple, hoy))) return;
  for (const inst of instances.values()) {
    if (!inst.online || inst.cumpleDia === hoy) continue;
    await als.run(inst, async () => {
      let gs; try { gs = await sock.groupFetchAllParticipating(); } catch { return; }
      inst.cumpleDia = hoy;
      for (const [gid, meta] of Object.entries(gs)) {
        if (grp[gid]?.cumple === hoy) continue;                       // otro bot ya avisó hoy en este grupo
        const mp = socMapa(meta), fest = [];
        for (const u of Object.values(perf.u)) { if (!u.cumple || !cumpleHoy(u.cumple, hoy)) continue; const p = socMiembro(mp, u.ids); if (p) fest.push({ u, p }); }
        if (!fest.length || !(await soyElElegido(gid))) continue;
        (grp[gid] ||= {}).cumple = hoy; grpDisco.luego();
        const ms = fest.map(f => f.p.id);
        const txt = `🎂 *¡Hoy cumple${fest.length > 1? 'n' : ''}!*\n` + fest.map(f => { const e = edadDe(f.u.cumple, hoy); return `• @${num(f.p.id)}${e? ` (${e} años)` : ''}`; }).join('\n') + '\n\n🎉 ¡Feliz cumpleaños!';
        await sock.sendMessage(gid, { text: txt, mentions: ms }).catch(() => {});
        await sleep(1500);
      }
    });
  }
}
setInterval(() => { cumpleTick().catch(e => console.error('[cumple]', e.message)); }, 15 * 60e3).unref();

