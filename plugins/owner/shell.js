// $ <comando>: shell del host (solo dueño)
const { execFile, spawn } = require('child_process');
const { sock } = require('../../src/lib/state');

// ---------- $ <comando>: ejecuta un comando en la shell del host (SOLO el dueño, en privado o en grupos) ----------
// Ejemplos: $ npm i   |   $ ls -la   |   $ pm2 restart all. Cada comando corre en una shell nueva dentro de la carpeta del bot (un cd no se arrastra al siguiente).
// Tope de tiempo: SHELL_TIMEOUT segundos en el .env (120 por defecto); pasado el tiempo, se corta. Un solo comando a la vez.
// La salida se manda COMPLETA: si no entra en un mensaje de WhatsApp (~65.000 caracteres), se parte en varios (por renglones).
const SH_TIMEOUT = (Number(process.env.SHELL_TIMEOUT) || 120) * 1000;
const SH_CHUNK = Math.min(Number(process.env.SHELL_CHUNK) || 65000, 68000);   // caracteres por mensaje (WhatsApp aguanta ~65.536 por mensaje de texto)
const SH_TOPE = Number(process.env.SHELL_MAX_CHARS) || 1000000;               // tope de seguridad de toda la salida (RAM y no mandar cientos de mensajes); si se pasa, se manda el final
const SH_VIEJO = 120;                     // segundos: un mensaje más viejo que esto no se ejecuta (evita repetir comandos al reconectar)
const shHechos = new Set();               // ids de mensajes ya ejecutados
let shEnCurso = false;
const shEsComando = t => /^\$\s+\S/.test(String(t || '').trim());
const shAnsi = s => String(s).replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\r(?!\n)/g, '\n');
function shEdad(m) {
  const t = m.messageTimestamp, n = t && typeof t === 'object'? (t.toNumber? t.toNumber() : Number(t.low)) : Number(t);
  return n? Date.now() / 1000 - n : 0;
}
// parte el texto en trozos de hasta `max` caracteres, cortando en saltos de línea (y, si un renglón es más largo que el tope, en el medio)
function shPartir(t, max) {
  const partes = []; let cur = '';
  for (let l of t.split('\n')) {
    while (l.length > max) {
      if (cur) { partes.push(cur); cur = ''; }
      partes.push(l.slice(0, max)); l = l.slice(max);
    }
    if (cur.length + l.length + 1 > max) { partes.push(cur); cur = l; }
    else cur = cur? cur + '\n' + l : l;
  }
  if (cur || !partes.length) partes.push(cur);
  return partes;
}
async function shellCmd(m, jid, texto) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const cmd = String(texto).trim().replace(/^\$\s+/, '');
  if (shEnCurso) return reply('⏳ Ya hay un comando corriendo. Esperá a que termine');
  shEnCurso = true;
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  reaccion('⏳');
  const t0 = Date.now();
  let salida = '', cortado = false, vencio = false;
  try {
    const codigo = await new Promise(ok => {
      const hijo = spawn('exec 2>&1\n' + cmd, { shell: true,   // el error va por la misma salida: queda todo en orden
         cwd: process.cwd(), env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const junta = d => { salida += d; if (salida.length > SH_TOPE * 2) { salida = salida.slice(-SH_TOPE); cortado = true; } };
      hijo.stdout.on('data', junta); hijo.stderr.on('data', junta);
      const reloj = setTimeout(() => { vencio = true; try { process.kill(-hijo.pid, 'SIGKILL'); } catch { try { hijo.kill('SIGKILL'); } catch {} } }, SH_TIMEOUT);
      hijo.on('error', e => { clearTimeout(reloj); salida += String(e.message); ok(-1); });
      hijo.on('close', (c, sig) => { clearTimeout(reloj); ok(c === null? (sig || -1) : c); });
    });
    let out = shAnsi(salida).trim().replace(/```/g, '`\u200b``');   // que la salida no rompa el bloque de código
    if (out.length > SH_TOPE) { out = out.slice(-SH_TOPE); cortado = true; }
    const seg = ((Date.now() - t0) / 1000).toFixed(1);
    const estado = vencio? `⏱️ cortado a los ${SH_TIMEOUT / 1000} s` : codigo === 0? `✅ código 0 · ${seg} s` : `❌ código ${codigo} · ${seg} s`;
    const partes = shPartir(out || '(sin salida)', SH_CHUNK - 300);
    for (let i = 0; i < partes.length; i++) {
      const cab = `🖥️ *Shell* · ${i === 0? estado : 'seguimos'}${partes.length > 1? ` · parte ${i + 1}/${partes.length}` : ''}`;
      const txt = `${cab}\n\`\`\`${cortado && i === 0? '…(solo el final)\n' : ''}${partes[i]}\`\`\``;
      await sock.sendMessage(jid, { text: txt }, i === 0? { quoted: m } : undefined);
      if (i < partes.length - 1) await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {
    console.error('[shell]', e.message);
    await reply('❌ No pude ejecutarlo: ' + String(e.message).slice(0, 200));
  } finally { shEnCurso = false; reaccion(''); }
}

module.exports = { SH_VIEJO, shEdad, shEsComando, shHechos, shellCmd };
