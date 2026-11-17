// Manejador de mensajes: filtros previos (mute, ban, antilink, nivel) y despacho a los plugins
const { esBaneado, modPuede } = require('./plugins/admin/moderacion');
const { isMuted } = require('./plugins/admin/mute');
const { SH_VIEJO, shEdad, shEsComando, shHechos, shellCmd } = require('./plugins/owner/shell');
const { afkVer } = require('./plugins/admin/afk');
const { antilinkVer } = require('./plugins/social/antilink');
const { albumPadre, albumsSticker, guardarAlbum, stickerHijo } = require('./plugins/utilidades/sticker');
const { mdr } = require('./src/db/moderacion');
const { grp } = require('./src/db/social');
const { XP_RE, actContar, xpComando } = require('./src/lib/actividad');
const { ECO_RE, ecoTocar } = require('./src/lib/economia');
const { inicialDe, soyElElegido } = require('./src/lib/eleccion');
const { rxGuardarNombre } = require('./src/lib/nombres');
const { normalizar, prefijo } = require('./src/lib/prefijo');
const { prestamoEmbargo } = require('./src/lib/prestamos');
const { ctxBot, isOwner, sock } = require('./src/lib/state');
const { COMANDOS, RESPUESTAS } = require('./src/plugins');

async function handleUpsert(messages) {
  for (const m of messages) {
      if (!m.message) continue;
      const jid = m.key.remoteJid; if (!jid || jid === 'status@broadcast') continue;
      const enGrupo = jid.endsWith('@g.us');
      if (m.pushName &&!m.key.fromMe) rxGuardarNombre(m, jid);   // para nombrar a la gente en las reacciones
      const elegido =!enGrupo || (await soyElElegido(jid)); // el más viejo del grupo atiende lo general (mutes)
      const elegidoCmd =!enGrupo || (await soyElElegido(jid, null, true)); // comandos sin inicial: el más viejo entre los bots con el mismo prefijo
      if (enGrupo && elegido &&!m.key.fromMe &&!m.message.protocolMessage &&!m.message.reactionMessage && isMuted(jid, m)) {
        await sock.sendMessage(jid, { delete: m.key }).catch(() => {}); continue;
      }
      if (enGrupo && elegido) {   // actividad (mensajes y XP) y antilink: los atiende un solo bot por grupo
        try { actContar(m, jid); } catch (e) { console.error('[act]', e.message); }
        if (!m.key.fromMe) { try { await afkVer(m, jid); } catch (e) { console.error('[afk]', e.message); } }
        if (grp[jid]?.antilink && !m.key.fromMe) { try { if (await antilinkVer(m, jid)) continue; } catch (e) { console.error('[antilink]', e.message); } }
      }
      // "$ comando": shell del host, solo el dueño. Lo ejecuta un solo bot (el elegido del grupo) y nunca un mensaje viejo o repetido
      {
        const crudo = m.message.conversation || m.message.extendedTextMessage?.text || '';
        if (shEsComando(crudo) && elegido) {
          if (!shHechos.has(m.key.id) && shEdad(m) < SH_VIEJO && await isOwner(m, jid).catch(() => false)) {
            shHechos.add(m.key.id); if (shHechos.size > 300) shHechos.delete(shHechos.values().next().value);
            await shellCmd(m, jid, crudo);
            continue;
          }
        }
      }
      const px = prefijo(); // prefijo de este bot; abajo todo se evalúa con "/"
      const T = normalizar(m.message.conversation || m.message.extendedTextMessage?.text || '', px);
      const C = normalizar(m.message.imageMessage?.caption || '', px);
      const text = T.t, cap = C.t, ini = T.ini || C.ini;
      // álbumes: se guardan las fotos de cada uno para poder convertirlas con /s
      const padre = albumPadre(m);
      if (padre && m.message.imageMessage) {
        guardarAlbum(padre, m, jid);
        if (!/^\/(s|spack|stickerpack)(\s|$)/i.test(cap) && albumsSticker.has(padre)) { stickerHijo(padre, m, jid); continue; }
      }
      // quién responde: con inicial (ej: J/s) solo el bot cuyo nombre empieza con esa letra; sin inicial, el más viejo entre los que tienen ese mismo prefijo
      if (!m.key.fromMe && esBaneado(m, jid)) continue;   // baneado: el bot lo ignora en todos lados
      const mio = ini? (ini === inicialDe(ctxBot().id) && (!enGrupo || (await soyElElegido(jid, ini, true)))) : elegidoCmd;
      // "get" / "stand" (sin prefijo) citando un mensaje de blackjack: lo atiende el bot que repartió, sin importar la inicial
      {
        const rawT = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim().toLowerCase();
        const qid = m.message.extendedTextMessage?.contextInfo?.stanzaId;
        let atendido = false;
        for (const h of RESPUESTAS) {
          const mt = h.re.exec(rawT);
          if (!(mt && qid && h.mapa.has(qid))) continue;
          const st = h.mapa.get(qid);
          if (st.bot.id === ctxBot().id && st.jid === jid) { try { await h.run(m, jid, st, qid, mt); } catch (e) { console.error(e); } }
          atendido = true; break;
        }
        if (atendido) continue;
      }
      if (!mio) continue;
      if (enGrupo && mdr.onlyadmin[jid] && (text.startsWith('/') || cap.startsWith('/')) && !(await modPuede(m, jid))) continue;   // /onlyadmin: solo admins usan el bot
      if (enGrupo && grp[jid]?.noeco && ECO_RE.test(text)) { await sock.sendMessage(jid, { text: '🚫 La economía está desactivada en este grupo.' }, { quoted: m }).catch(() => {}); continue; }
      if (XP_RE.test(text)) { try { xpComando(m, jid); } catch (e) { console.error('[xp]', e.message); } }   // nivel global
      if (enGrupo && text.startsWith('/')) { ecoTocar(jid, m); try { prestamoEmbargo(jid, m); } catch (e) { console.error('[prestamo]', e.message); } } // usar cualquier comando cuenta como "estar activo"
      try {
        const c = { m, jid, text, cap, enGrupo, px };
        for (const cmd of COMANDOS) { if (cmd.test(c)) { await cmd.run(c); break; } }
      } catch (e) { console.error(e); }
  }
}

module.exports = { handleUpsert };
