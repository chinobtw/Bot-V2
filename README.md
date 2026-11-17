# Bot-V2

Bot de WhatsApp modular (plugins por categoría), hecho con Node y [Baileys](https://github.com/WhiskeySockets/Baileys) `7.0.0-rc14`. Corre el bot principal y sub-bots vinculables, con economía, apuestas, nivel global, moderación, descargas y reacciones.

> Repo privado. El número del dueño (`OWNER`) está escrito en `config.js`.

## Requisitos

- Node.js (se recomienda 20 o más)
- Dependencias: `@whiskeysockets/baileys`, `axios`, `pino`, `qrcode`, `sharp`, `jsqr` (`npm i` las instala desde `package.json`)
- `ffmpeg` instalado (reacciones en GIF, `/toimg`, slides de `/tt` como video)
- Opcional: `yt-dlp` (se descarga solo), un worker de descargas aparte

## Instalar y correr

```bash
npm i
node index.js
```

La primera vez hace falta `NUMERO` en el `.env`: el bot muestra en la consola un código de emparejamiento para vincular ese número desde WhatsApp. La sesión queda en `auth/` y los sub-bots en `subbots/`.

## Estructura

```
index.js            # entrada (node index.js)
main.js             # arranque: web, bot principal, sub-bots o worker de descargas
handler.js          # manejador de mensajes: filtros previos y despacho a los plugins
config.js           # configuración global: dueño, nombre, puertos, URLs, topes
plugins/            # los comandos, agrupados por categoría
  admin/            #   /automsj, /mute, /killinactive, /afk, moderación (close, tag, kick, warns, ban...)
  apuestas/         #   /rt, /cf, /bj, /maq
  descargas/        #   /tt, /ytaudio, /ytvideo, /search, /spotify, /apk, /mf, /git, /fb /x /ig /pin
  economia/         #   /daily, /w, /crime, /minar, /hacking, /rob, /dep, /with, /bal, /loteria, /prestamo
  ia/               #   /gemini, /resumir
  juegos/           #   /ppt, /tateti, /adivina, /verdad, /reto, /ship, /quien, tops, /rr
  info/             #   /menu, /infobot, /p
  nsfw/             #   /nsfw, reacciones NSFW, /r34
  owner/            #   /say, /whitelist, /backup, $ <comando>
  personalizar/     #   /setbotname, /setbotcurrency, /setbanner, /setprefix
  reacciones/       #   /hug, /pat, /slap...
  social/           #   nivel, perfil, grupo (antilink, welcome), utilidades (toimg, pfp), marry, cumpleaños
  subbots/          #   /code, /qr, /sub, /delsub
  utilidades/       #   /s, /spack, /qc (stickers), /lyrics, /tr, /tts, /ocr, /removebg, /tomp3, /tovn, /short, /qrgen, /readqr
assets/fonts/        # DejaVu Sans (para /qc: no depende de las fuentes del host)
src/
  plugins.js        # registro: qué plugins se cargan y en qué orden
  menu.js           # texto del menú
  worker.js         # worker de descargas (cliente y servidor)
  db/               # datos: un archivo por .json (cargar y guardar); lo único que toca el disco
  lib/              # piezas compartidas: estado, economía, nivel, YouTube, banner, prefijo...
  web/              # página web para vincular sub-bots
tests/e2e/          # prueba de punta a punta (npm test)
```

### Cómo es un plugin

Cada archivo de `plugins/` exporta lo que necesite de esto:

- `commands`: lista de `{ test(c), run(c) }`. `c` trae `{ m, jid, text, cap, enGrupo, px }`: `test` dice cuándo le toca el mensaje y `run` lo que hace.
- `respuestas`: respuestas sin prefijo a un mensaje del bot (sí/no de `/marry`, número de `/apk`, get/stand de `/bj`).
- `worker`: trabajos de descarga que puede ejecutar el worker de Wispbyte.

Para sumar un plugin: crear el archivo en la categoría que corresponda y agregarlo a la lista de `src/plugins.js`. El orden de esa lista es el orden en que se prueban los comandos. El texto del menú está en `src/menu.js`.

### Datos

Los `.json` se siguen guardando en la carpeta donde corre el bot, igual que antes. Todo lo que lee y escribe esos archivos está en `src/db/`: si algún día se pasa a SQLite, se cambia solo esa carpeta.

### Tests

`npm test` arranca el bot con WhatsApp simulado, le manda unos 800 mensajes (todos los comandos del menú, en grupo y en privado) y compara todo lo que respondió contra `tests/e2e/golden.log`; también prueba los 12 tipos de pedido al worker. Si cambiás un comportamiento a propósito, `npm run test:update` regenera esos archivos.

## Variables (.env o panel del hosting)

Las del panel tienen prioridad sobre el `.env`.

| Variable | Para qué sirve |
| --- | --- |
| `NUMERO` | Número del bot principal (solo dígitos) |
| `BOT_NAME`, `CURRENCY` | Nombre y moneda por defecto |
| `SYLPHY_KEY`, `SYLPHY_URL` | API de Sylphy (YouTube, Spotify, F-Droid, `/nuevo`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `/gemini`, `/ocr`, `/resumir` |
| `REMOVEBG_KEY` | `/removebg` (remove.bg, plan gratis) |
| `YT_COOKIES`, `YTDLP_PATH`, `YT_PROXY` | YouTube con yt-dlp |
| `COBALT_API`, `COBALT_KEY` | Respaldo de YouTube |
| `WORKER_URL`, `WORKER_KEY`, `WORKER_MODE` | Descargas en un worker aparte |
| `PIN_COOKIES` | Ruta del archivo de cookies de Pinterest (por defecto `./pin_cookies.txt`). Opcional: `/pin` anda sin cookies y las usa si están |
| `PIN_APP_VERSION` | Versión de la web de Pinterest que manda `/pin` (por defecto `a89153f`); cambiarla si Pinterest empieza a rechazar los pedidos |
| `GITHUB_TOKEN` | Opcional: sube el límite de `/git -list` de 60 a 5.000 pedidos por hora |
| `MAX_MB` | Tope de peso de las descargas (200 por defecto) |
| `MAX_SUBBOTS` | Cantidad máxima de sub-bots |
| `SERVER_PORT`, `WEB_PORT`, `PORT` | Puerto de la página web |
| `BANNER_PUBLIC_URL`, `BANNER_URL`, `BANNER_BODY` | Banner del menú |
| `WEB_NOMBRE`, `WEB_CANAL` | Textos de la página y canal oficial |
| `SHELL_TIMEOUT`, `SHELL_MAX_CHARS`, `SHELL_CHUNK` | Comando `$ <comando>` del dueño |

## Cookies de Pinterest (`/pin`, opcionales)

`/pin` anda sin cookies. Si querés usar tu sesión, guardá las cookies en `pin_cookies.txt`, al lado de `index.js` (en la raíz del bot), en cualquiera de estos formatos: `cookies.txt` (Netscape), JSON exportado del navegador, o el encabezado `Cookie: a=b; c=d`. El bot vuelve a leer el archivo solo cuando cambia, y si Pinterest rechaza las cookies sigue sin ellas. **No subas ese archivo al repo** (está en `.gitignore`).

## Archivos que genera el bot

`automsj.json`, `mutes.json`, `whitelist.json`, `nsfw.json`, `nombres.json`, `moderacion.json`, `actividad.json`, `grupos.json`, `perfiles.json` (perfiles y nivel global), `settings.json`, `subbots.json`, `gemini.json`, `economia.json`, `loteria.json`, `prestamos.json`, `afk.json`. El comando `/backup` los manda al privado del creador.

## Comandos principales

- **Descargas:** `/tt`, `/ytaudio`, `/ytvideo`, `/search`, `/spotify`, `/apk`, `/mf`, `/git` (`/git usuario/repo` baja la rama main; `/git -list usuario` lista sus repos), `/fb`, `/x`, `/ig`, `/pin`
- **Stickers y utilidades:** `/s`, `/spack`, `/qc`, `/toimg`, `/setmeta`, `/pfp`, `/tr`, `/tts`, `/ocr`, `/removebg`, `/tomp3`, `/tovn`, `/short`, `/qrgen`, `/readqr`, `/afk`
- **Juegos:** `/ppt`, `/tateti`, `/adivina`, `/verdad`, `/reto`, `/pregunta`, `/ship`, `/quien`, `/topgay` y otros tops, `/rr`, `/consejo`
- **Perfil y nivel:** `/profile`, `/level`, `/top`, `/marry`, `/msgcount`
- **Economía y apuestas:** `/daily`, `/w`, `/crime`, `/rob`, `/dep`, `/with`, `/pay`, `/loteria`, `/prestamo`, `/rt`, `/cf`, `/bj`, `/maq`, `/dados`
- **Administración de grupo:** `/mute`, `/warn`, `/kick`, `/antilink`, `/welcome`, `/onlyadmin`, `/automsj`
- **Reacciones:** `/hug`, `/pat`, `/slap` y más (los NSFW van aparte y se activan con `/nsfw on`)

El menú completo sale con `/menu` dentro de WhatsApp.
