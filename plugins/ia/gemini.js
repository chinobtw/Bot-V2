// /gemini: IA con memoria por grupo y usuario
const axios = require('axios');
const { puedePersonalizar } = require('../personalizar/index');
const { gem, saveGem } = require('../../src/db/gemini');
const { GEM_MODEL, geminiKey } = require('../../src/lib/ia');
const { ctxBot, isAdmin, senderIds, sock } = require('../../src/lib/state');

const GEM_TURNOS = 10;      // pares pregunta/respuesta que recuerda por grupo y usuario
const GEM_MAX_MEM = 300;    // máximo de conversaciones guardadas (se borran las más viejas)
const GEM_SISTEMA = 'Sos un asistente dentro de WhatsApp. Respondé en el idioma de quien escribe (por defecto español rioplatense), claro y breve (máximo ~1500 caracteres). Usá el formato de WhatsApp: *negrita*, _cursiva_ y listas con "-". Sin títulos con # ni tablas.';
const aWhatsapp = t => t.replace(/^\s*\*\s+/gm, '- ').replace(/^#{1,6}\s+(.+)$/gm, '*$1*').replace(/\*\*(.+?)\*\*/g, '*$1*');

async function geminiCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const id = ctxBot().id, kc = `${id}|${jid}`;
  const arg = text.replace(/^\/gemini\s*/i, '').trim();
  const sub = arg.toLowerCase();

  if (sub === 'on' || sub === 'off') {
    const ok = !jid.endsWith('@g.us') || (await puedePersonalizar(m, jid)) || (await isAdmin(jid, m).catch(() => false));
    if (!ok) return reply('Solo los admins pueden activar o desactivar Gemini');
    if (sub === 'off') gem.off[kc] = true; else delete gem.off[kc];
    saveGem();
    return reply(sub === 'off'? '😴 Gemini desactivado en este chat' : '✅ Gemini activado en este chat');
  }
  if (gem.off[kc]) return reply('😴 Gemini está desactivado en este chat (/gemini on para activarlo)');

  const key = geminiKey();
  if (!key) { console.error('[gemini] falta GEMINI_API_KEY (o GOOGLE_API_KEY)'); return reply('❌ La IA no está disponible ahora. Probá más tarde'); }

  const km = `${kc}|${senderIds(m, jid)[0]}`;
  if (/^(reset|olvidar)$/.test(sub)) { delete gem.mem[km]; saveGem(); return reply('🧹 Listo, me olvidé de lo que hablamos'); }

  const ctx = m.message.extendedTextMessage?.contextInfo, q = ctx?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '').trim() : '';
  if (!arg &&!qt) return reply('Uso: /gemini <pregunta>\nSi respondés a un mensaje, lo uso de contexto.\n/gemini on | off | reset');
  const pregunta = (qt? `[Mensaje citado]: "${qt.slice(0, 2000)}"\n\n` : '') + (arg || 'Comentá o respondé sobre ese mensaje.');

  const hist = gem.mem[km]?.h || [];
  sock.sendPresenceUpdate('composing', jid).catch(() => {});
  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEM_MODEL)}:generateContent`,
      { systemInstruction: { parts: [{ text: GEM_SISTEMA }] }, contents: [...hist, { role: 'user', parts: [{ text: pregunta }] }], generationConfig: { maxOutputTokens: 2048 } },
      { headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const out = (r.data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!out) return reply(r.data?.promptFeedback?.blockReason? '🚫 Gemini bloqueó ese mensaje' : '🤷 Gemini no devolvió respuesta, probá de nuevo');
    gem.mem[km] = { t: Date.now(), h: [...hist, { role: 'user', parts: [{ text: pregunta.slice(0, 2000) }] }, { role: 'model', parts: [{ text: out.slice(0, 2000) }] }].slice(-GEM_TURNOS * 2) };
    const claves = Object.keys(gem.mem);
    if (claves.length > GEM_MAX_MEM) claves.sort((a, b) => gem.mem[a].t - gem.mem[b].t).slice(0, claves.length - GEM_MAX_MEM).forEach(k => delete gem.mem[k]);
    saveGem();
    await reply(aWhatsapp(out).slice(0, 4000));
  } catch (e) {
    const st = e.response?.status, msg = e.response?.data?.error?.message || e.message;
    console.error('[gemini]', st, msg);
    if (st === 429) return reply('⏳ Se alcanzó el límite gratuito de Gemini (por minuto o por día). Probá en un rato');
    await reply('❌ La IA no está disponible ahora. Probá de nuevo en un rato');
  }
}
const CMD_GEMINI = [{ test: c => /^\/gemini(\s|$)/i.test(c.text), run: c => geminiCmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_GEMINI];
