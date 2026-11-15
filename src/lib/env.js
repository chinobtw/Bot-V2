// Carga el .env (si existe) sin pisar variables ya definidas

// carga el archivo .env (CLAVE=valor, con o sin espacios alrededor del =); las variables del panel tienen prioridad
try {
  for (const l of require('fs').readFileSync('./.env', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || l.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch {}

