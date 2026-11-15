// npm test           -> corre el bot con WhatsApp simulado y compara con golden.log / golden-worker.log
// npm run test:update -> reescribe los golden con lo que hace el bot ahora (solo si el cambio de comportamiento es a propósito)
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const update = process.argv.includes('--update');
const norm = t => t.split('\n').filter(Boolean).map(l => l.replace(/"fileName":"[A-Za-z0-9_.-]*\.js"/, '"fileName":"X.js"')).sort().join('\n') + '\n';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-'));
let fallas = 0;
for (const [nombre, script, golden, extra] of [['bot (todos los comandos)', 'run.js', 'golden.log', []], ['worker de descargas', 'wrun.js', 'golden-worker.log', [String(18200 + Math.floor(Math.random() * 500))]]]) {
  const out = path.join(tmp, golden);
  const r = spawnSync(process.execPath, [path.join(__dirname, script), path.join(__dirname, '../../index.js'), out, ...extra], { stdio: 'inherit', timeout: 180000 });
  if (!fs.existsSync(out)) { console.log(`✗ ${nombre}: el bot no arrancó`); fallas++; continue; }
  const actual = norm(fs.readFileSync(out, 'utf8')), gp = path.join(__dirname, golden);
  if (update) { fs.writeFileSync(gp, actual); console.log(`↻ ${nombre}: golden actualizado (${actual.split('\n').length - 1} líneas)`); continue; }
  const esperado = fs.readFileSync(gp, 'utf8');
  if (actual === esperado) { console.log(`✓ ${nombre}: igual al golden (${actual.split('\n').length - 1} líneas)`); continue; }
  fallas++; const a = new Set(actual.split('\n')), e = new Set(esperado.split('\n'));
  console.log(`✗ ${nombre}: distinto al golden`);
  for (const l of [...e].filter(x => !a.has(x)).slice(0, 5)) console.log('  falta:   ' + l.slice(0, 220));
  for (const l of [...a].filter(x => !e.has(x)).slice(0, 5)) console.log('  sobra:   ' + l.slice(0, 220));
}
process.exit(fallas ? 1 : 0);
