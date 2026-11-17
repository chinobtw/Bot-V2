// Gemini: la key y un pedido simple (texto, con o sin imagen) para los comandos que lo usan
const axios = require('axios');
const fs = require('fs');

const GEM_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
// la key puede estar como GEMINI_API_KEY o GOOGLE_API_KEY, en las variables del panel o en un archivo .env
function geminiKey() {
  const e = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (e) return e.trim();
  try {
    const m = fs.readFileSync('./.env', 'utf8').match(/^\s*(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.+?)\s*$/m);
    return m? m[1].replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}
// un pedido suelto (sin memoria). imagen: { mime, buf }. Devuelve el texto; si falla tira un Error con .motivo ('sin_key' | 'limite' | 'bloqueado' | 'vacio' | 'error')
async function geminiPedir({ sistema, texto, imagen, tokens = 1024 }) {
  const key = geminiKey();
  if (!key) throw Object.assign(new Error('falta GEMINI_API_KEY'), { motivo: 'sin_key' });
  const partes = [{ text: texto }];
  if (imagen) partes.push({ inlineData: { mimeType: imagen.mime, data: imagen.buf.toString('base64') } });
  try {
    const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEM_MODEL)}:generateContent`,
      { ...(sistema? { systemInstruction: { parts: [{ text: sistema }] } } : {}), contents: [{ role: 'user', parts: partes }], generationConfig: { maxOutputTokens: tokens } },
      { headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, timeout: 45000 });
    const out = (r.data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!out) throw Object.assign(new Error('respuesta vacía'), { motivo: r.data?.promptFeedback?.blockReason? 'bloqueado' : 'vacio' });
    return out;
  } catch (e) {
    if (e.motivo) throw e;
    throw Object.assign(new Error(e.response?.data?.error?.message || e.message), { motivo: e.response?.status === 429? 'limite' : 'error' });
  }
}
// mensaje para el usuario según el motivo del error
const geminiError = e => ({ sin_key: '❌ La IA no está disponible ahora. Probá más tarde', limite: '⏳ Se alcanzó el límite gratuito de la IA (por minuto o por día). Probá en un rato', bloqueado: '🚫 La IA bloqueó ese contenido', vacio: '🤷 La IA no devolvió respuesta, probá de nuevo' })[e.motivo] || '❌ La IA no está disponible ahora. Probá de nuevo en un rato';

module.exports = { GEM_MODEL, geminiError, geminiKey, geminiPedir };
