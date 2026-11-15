// Escritura de metadatos (pack y autor) en stickers webp
const crypto = require('crypto');

// ===== stickers con pack y autor propios (/setmeta): se escribe el bloque EXIF dentro del WebP =====
function webpConMeta(buf, pack, autor, w = 512, h = 512) {
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return buf;
  const json = Buffer.from(JSON.stringify({ 'sticker-pack-id': crypto.randomBytes(16).toString('hex'), 'sticker-pack-name': pack, 'sticker-pack-publisher': autor, emojis: [''] }), 'utf8');
  const cab = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const exif = Buffer.concat([cab, json]); exif.writeUInt32LE(json.length, 14);
  let chunks = [], off = 12;
  while (off + 8 <= buf.length) {
    const tag = buf.toString('ascii', off, off + 4), sz = buf.readUInt32LE(off + 4);
    chunks.push({ tag, data: buf.subarray(off + 8, off + 8 + sz) }); off += 8 + sz + (sz & 1);
  }
  chunks = chunks.filter(c => c.tag !== 'EXIF');
  let vp = chunks.find(c => c.tag === 'VP8X');
  if (vp) { vp = { tag: 'VP8X', data: Buffer.from(vp.data) }; vp.data[0] |= 0x08; chunks = [vp,...chunks.filter(c => c.tag !== 'VP8X')]; }
  else {
    const d = Buffer.alloc(10);
    d[0] = 0x08 | (chunks.some(c => c.tag === 'ALPH' || c.tag === 'VP8L')? 0x10 : 0);
    d.writeUIntLE(w - 1, 4, 3); d.writeUIntLE(h - 1, 7, 3);
    chunks.unshift({ tag: 'VP8X', data: d });
  }
  chunks.push({ tag: 'EXIF', data: exif });
  const partes = [Buffer.from('WEBP')];
  for (const c of chunks) {
    const cb = Buffer.alloc(8); cb.write(c.tag, 0, 'ascii'); cb.writeUInt32LE(c.data.length, 4);
    partes.push(cb, c.data); if (c.data.length & 1) partes.push(Buffer.alloc(1));
  }
  const cuerpo = Buffer.concat(partes), cab2 = Buffer.alloc(8); cab2.write('RIFF', 0, 'ascii'); cab2.writeUInt32LE(cuerpo.length, 4);
  return Buffer.concat([cab2, cuerpo]);
}

module.exports = { webpConMeta };
