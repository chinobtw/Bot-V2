# Bot-V2

Bot de WhatsApp en un solo archivo (`index.js`), hecho con Node y [Baileys](https://github.com/WhiskeySockets/Baileys) `7.0.0-rc14`. Corre el bot principal y sub-bots vinculables, con economía, apuestas, nivel global, moderación, descargas y reacciones.

> Repo privado. El número del dueño (`OWNER`) está escrito en el código (línea 27 de `index.js`).

## Requisitos

- Node.js (se recomienda 20 o más)
- Dependencias: `@whiskeysockets/baileys`, `axios`, `nano`, `pino`, `qrcode`, `sharp`
- `ffmpeg` instalado (reacciones en GIF, `/toimg`, slides de `/tt` como video)
- Opcional: `yt-dlp` (se descarga solo), un worker de descargas aparte

## Instalar y correr

```bash
npm i @whiskeysockets/baileys@7.0.0-rc14 axios nano pino qrcode sharp
node index.js
```

La primera vez hace falta `NUMERO` en el `.env`: el bot muestra en la consola un código de emparejamiento para vincular ese número desde WhatsApp. La sesión queda en `auth/` y los sub-bots en `subbots/`.

## Variables (.env o panel del hosting)

Las del panel tienen prioridad sobre el `.env`.

| Variable | Para qué sirve |
| --- | --- |
| `NUMERO` | Número del bot principal (solo dígitos) |
| `BOT_NAME`, `CURRENCY` | Nombre y moneda por defecto |
| `SYLPHY_KEY`, `SYLPHY_URL` | API de Sylphy (YouTube, Spotify, F-Droid, `/nuevo`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `/gemini` |
| `YT_COOKIES`, `YTDLP_PATH`, `YT_PROXY` | YouTube con yt-dlp |
| `COBALT_API`, `COBALT_KEY` | Respaldo de YouTube |
| `WORKER_URL`, `WORKER_KEY`, `WORKER_MODE` | Descargas en un worker aparte |
| `MAX_MB` | Tope de peso de las descargas (200 por defecto) |
| `MAX_SUBBOTS` | Cantidad máxima de sub-bots |
| `SERVER_PORT`, `WEB_PORT`, `PORT` | Puerto de la página web |
| `BANNER_PUBLIC_URL`, `BANNER_URL`, `BANNER_BODY` | Banner del menú |
| `WEB_NOMBRE`, `WEB_CANAL` | Textos de la página y canal oficial |
| `SHELL_TIMEOUT`, `SHELL_MAX_CHARS`, `SHELL_CHUNK` | Comando `$ <comando>` del dueño |

## Archivos que genera el bot

`automsj.json`, `mutes.json`, `whitelist.json`, `nsfw.json`, `nombres.json`, `moderacion.json`, `actividad.json`, `grupos.json`, `perfiles.json` (perfiles y nivel global), `settings.json`, `subbots.json`, `gemini.json`, `economia.json`. El comando `/backup` los manda al privado del creador.

## Comandos principales

- **Descargas:** `/tt`, `/ytaudio`, `/ytvideo`, `/search`, `/spotify`, `/apk`, `/mf`, `/git`, `/fb`, `/x`, `/ig`, `/pin`
- **Stickers y utilidades:** `/s`, `/toimg`, `/setmeta`, `/pfp`
- **Perfil y nivel:** `/profile`, `/level`, `/top`, `/marry`, `/msgcount`
- **Economía y apuestas:** `/daily`, `/w`, `/crime`, `/rob`, `/dep`, `/with`, `/pay`, `/rt`, `/cf`, `/bj`, `/maq`
- **Administración de grupo:** `/mute`, `/warn`, `/kick`, `/antilink`, `/welcome`, `/onlyadmin`, `/automsj`
- **Reacciones:** `/hug`, `/pat`, `/slap` y más (los NSFW van aparte y se activan con `/nsfw on`)

El menú completo sale con `/menu` dentro de WhatsApp.
