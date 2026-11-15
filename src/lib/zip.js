// Zip mínimo sin dependencias: escribe en disco archivo por archivo (no junta todo en memoria)
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = zlib.crc32 || (buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; });

const dosFecha = d => ({
  hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  fecha: (Math.max(d.getFullYear(), 1980) - 1980 << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

// entradas: [{ nombre: 'ruta/dentro/del.zip', archivo: 'ruta/en/disco' }]. Devuelve { archivos, bytes }
function crearZip(destino, entradas) {
  const fd = fs.openSync(destino, 'w');
  const central = []; let pos = 0, n = 0;
  const escribir = b => { fs.writeSync(fd, b); pos += b.length; };
  try {
    for (const e of entradas) {
      let datos, mtime;
      try { datos = fs.readFileSync(e.archivo); mtime = fs.statSync(e.archivo).mtime; } catch { continue; }   // si desapareció, se saltea
      const nombre = Buffer.from(e.nombre.replace(/\\/g, '/'), 'utf8');
      const comp = zlib.deflateRawSync(datos), usar = comp.length < datos.length;
      const cuerpo = usar ? comp : datos, crc = crc32(datos), { hora, fecha } = dosFecha(mtime);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(usar ? 8 : 0, 8);
      lh.writeUInt16LE(hora, 10); lh.writeUInt16LE(fecha, 12); lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(cuerpo.length, 18); lh.writeUInt32LE(datos.length, 22); lh.writeUInt16LE(nombre.length, 26); lh.writeUInt16LE(0, 28);
      const offset = pos; escribir(lh); escribir(nombre); escribir(cuerpo);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(usar ? 8 : 0, 10);
      ch.writeUInt16LE(hora, 12); ch.writeUInt16LE(fecha, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(cuerpo.length, 20); ch.writeUInt32LE(datos.length, 24);
      ch.writeUInt16LE(nombre.length, 28); ch.writeUInt32LE(0o100644 << 16 >>> 0, 38); ch.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([ch, nombre])); n++;
    }
    const inicio = pos, dir = Buffer.concat(central);
    if (n > 65535 || pos + dir.length > 0xFFFFFFFF) throw new Error('el backup es demasiado grande para un zip');
    escribir(dir);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(n, 8); fin.writeUInt16LE(n, 10); fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(inicio, 16);
    escribir(fin);
  } finally { fs.closeSync(fd); }
  return { archivos: n, bytes: pos };
}

// lista recursiva de archivos de una carpeta: [{ nombre, archivo }] con nombre relativo a `base`
function listar(dir, base, saltear = []) {
  const out = [];
  let items = []; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    if (saltear.includes(it.name)) continue;
    const p = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...listar(p, base, saltear));
    else if (it.isFile()) out.push({ nombre: path.relative(base, p), archivo: p });
  }
  return out;
}

module.exports = { crearZip, listar, crc32 };
