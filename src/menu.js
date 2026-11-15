// Texto del menú y conteo de comandos

// ---------- menú ----------
function buildMenu({ botName, system, user, totalCommands, owner }) {
  return `◈ ━━━━━━ ◈ ${botName} ◈ ━━━━━━ ◈

⟐  SYSTEM :: ${system}‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‌‌‍‌‌‌‍‌‌‌‌‍‌‌‌‌‌‌‍‌‌
⊳  USER :: @${user}

╭─[ ⟡ CORE ]
│ • /code - Ser sub-bot por código
│
│ • /qr - Ser sub-bot por QR
│
│ • /sub - Ver sub-bots
│
│ • /p - Latencia
│
│ • /infobot | /bot | /botinfo - Información del bot
│
│ • /menu | /? | /help | /comandos - Este listado
╰───────────

╭─[ ✧ MEDIA DOWNLOADER ]
│ $ /tt | /tiktok - Descargar TikTok sin marca de agua (los slides salen como video con la música)
> Uso: /tt <link> | respondiendo a un mensaje con el link | /tt <búsqueda>
│
│ $ /ytaudio | /ytmp3 - Audio de YouTube (link o título)
> Uso: /ytaudio <link> | /ytaudio <título>
> Con -info recibís solo la ficha del video (sin audio): /ytmp3 -info <link>
│
│ $ /ytvideo | /ytmp4 - Video de YouTube (link o título)
> Uso: /ytvideo <link> | /ytvideo <título>
> Con -info recibís solo la ficha del video (sin descargarlo): /ytmp4 -info <link>
│
│ $ /search - Buscar en YouTube (20 resultados)
> Uso: /search <búsqueda> | título, duración y link de cada uno
│
│ $ /spotify - Audio de Spotify (link o título)
> Uso: /spotify <link de la canción> | /spotify <título y artista>
│
│ $ /r34 - Descarga imágenes en el sitio de Rule34
> Uso: /r34 <query>
│
│ $ /mf | /mediafire - Descargar un archivo de MediaFire
> Uso: /mf <link> | respondiendo a un mensaje con el link
│
│ $ /getrepo | /git - Bajar la rama main de un repositorio de GitHub (.zip)
> Uso: /git usuario/repo | /git -list usuario (lista sus repos)
│
│ $ /apk - Buscar y descargar un APK (Aptoide y F-Droid, hasta 20 resultados)
> Uso: /apk <app> y después respondé a la lista con el número (1 a 20)
│
│ $ /fb | /facebook - Descargar video/foto de Facebook
> Uso: /fb <link>
│
│ $ /x | /twitter - Descargar fotos/videos de un tweet
> Uso: /x <link>
│
│ $ /ig | /instagram - Descargar de Instagram
> Uso: /ig <link>
│
│ $ /pin | /pinterest - Descargar de Pinterest o buscar una imagen
> Uso: /pin <link> | /pin <búsqueda>
╰───────────

╭─[ ✧ STICKERS ]
│ $ /s - Imagen a sticker
> Uso: respondé a una imagen (o a un álbum) con /s, o mandá la imagen con /s
│
│ $ /toimg | /toimage - Sticker o foto (también de "ver una vez") a imagen
> Uso: respondé al sticker o a la foto con /toimg
│
│ $ /setmeta pack | autor - Pack y autor de tus stickers
> Uso: /setmeta Memes del grupo | Vand4lw
│
│ $ /delmeta - Quitar el pack y autor de tus stickers
│
│ $ /pfp | /getpic @usuario - Ver la foto de perfil de alguien
╰───────────

╭─[ ✧ PERFIL Y NIVEL ]
│ $ /profile | /perfil @usuario - Ver tu perfil (o el de otro)
│
│ $ /setdesc texto - Tu descripción (/setdesc reset para borrarla)
│
│ $ /setbirth 15/03 - Tu cumpleaños (con año: 15/03/1999). El bot te saluda ese día
│
│ $ /delbirth - Borrar tu cumpleaños
│
│ $ /birthdays | /births - Próximos cumpleaños del grupo
│
│ $ /marry @usuario - Proponerle casamiento (responde con sí o no)
│
│ $ /divorce - Divorciarte
│
│ $ /marryhistory @usuario - Historial de matrimonios
│
│ $ /level | /lvl @usuario - Nivel y XP global (sube con los comandos de economía y apuestas)
│
│ $ /top | /leaderboard | /lboard <página> - Ranking global de nivel
│
│ $ /msgcount | /count @usuario <días> - Cuántos mensajes mandó alguien
│
│ $ /topcount | /topmessages <días> - Top de mensajes del grupo
╰───────────

╭─[ ✧ GROUP ADMIN ]
│ $ /mute @usuario - mutear usuario
> Uso: /mute @usuario 1S 1M 1H 1D
> Uso: /mute (@usuario opcional) status
│
│ $ /unmute @usuario - desmutear usuario
│
│ $ /killinactive - Expulsar inactivos de la lista de #topinactive
> Uso: respondé a la lista con /killinactive all | 5 | 1-8
│
│ $ /nsfw - Activar o desactivar los comandos NSFW del grupo
> Uso: /nsfw on | /nsfw off | /nsfw (ver el estado)
│
│ $ /close - Cerrar el chat (solo hablan los admins)
│
│ $ /open - Abrir el chat
│
│ $ /tag | /hidetag | /todos | /everyone | /all mensaje - Mencionar a todos sin mostrar los @
> Uso: /tag mensaje, o respondé a un mensaje con /tag para mandarlo mencionando a todos
│
│ $ /onlyadmin on | off - Solo los admins pueden usar el bot
> Uso: /onlyadmin on | /onlyadmin off | /onlyadmin (ver el estado)
│
│ $ /kick @usuario - Expulsar del grupo (o respondé a su mensaje)
│
│ $ /promote @usuario - Dar admin (o respondé a su mensaje)
│
│ $ /demote @usuario - Sacar admin (o respondé a su mensaje)
│
│ $ /warn razón - Advertir a alguien (con @usuario o respondiendo a su mensaje)
> Al llegar al límite de advertencias, se lo expulsa
│
│ $ /setwarnlimit número - Límite de advertencias (por defecto 3)
│
│ $ /warnstotal - Ver las advertencias del grupo (o de un @usuario)
│
│ $ /delwarn número | all - Borrar advertencias de un @usuario
> Uso: /delwarn @usuario 2 | /delwarn @usuario 1-3 | /delwarn @usuario all
│
│ $ /antilink on | off - Borra y expulsa a quien mande links de grupos de WhatsApp
│
│ $ /welcome on | off - Mensaje de bienvenida
│
│ $ /goodbye on | off - Mensaje de despedida
│
│ $ /setwelcome texto - Texto de bienvenida (usá @user, {grupo} y {miembros})
│
│ $ /setgoodbye texto - Texto de despedida (usá @user, {grupo} y {miembros})
│
│ $ /del - Borrar el mensaje al que respondas
│
│ $ /economy on | off - Prender o apagar la economía del grupo
│
│ $ /topinactive página días - Lista de inactivos (se usa con /killinactive)
> Uso: /topinactive 1 30 (página 1, 30 días sin escribir). Sin días son 7
│
│ $ /automsj "mensaje" | hora (formato 24HS) | días
> Uso: /automsj "Hello everynyan" | 13:00 | todos
> Uso: /automsj "Feliz jueves" | 01:00 | J
╰───────────

╭─[ ✧ ECONOMÍA ]
│ $ /daily - Recompensa diaria (racha global, se cobra una vez por grupo)
│
│ $ /w | /work - Trabajar (cada 2 min)
│
│ $ /crime | /delito - Cometer un delito (cada 5 min)
│
│ $ /minar - Ir a minar (cada 10 min)
│
│ $ /hacking - Hackear (cada 30 min)
│
│ $ /rob @usuario - Robarle a alguien distraído (cada 1 h)
│
│ $ /dep | /d | /deposit | /depositar <monto|all> - Guardar en el banco
│
│ $ /with | /retirar <monto|all> - Sacar del banco
│
│ $ /bal | /balance - Ver saldo (tuyo o de otro)
│
│ $ /pay | /givecoins @usuario <monto|all> - Pasarle plata a alguien
│
│ $ /baltop | /economyboard | /eboard <página> - Ranking de plata del grupo
│
│ $ /economyinfo | /einfo - Tu plata, puesto, racha y tiempos de espera
╰───────────

╭─[ ✧ APUESTAS ]
│ $ /rt | /roulette | /ruleta <monto|all> <color> - Ruleta
> Rojo o negro: x2 · Verde: x5. Ej: /rt 5000 rojo
│
│ $ /cf | /coinflip <monto|all> <cara|cruz> - Cara o cruz (x2)
│
│ $ /bj | /blackjack <monto|all> - Blackjack contra el bot
> Respondé al mensaje con get (carta) o stand (plantarte)
│
│ $ /maq | /maquinita <monto|all> - La maquinita
╰───────────

╭─[ ✧ AI / TOOLS ]
│ $ /gemini pregunta - Preguntarle a Gemini
> Uso: /gemini on | off | reset (respondiendo a un mensaje lo usa de contexto)
│
│ $ /lyrics | /letra - Buscar letra
> Uso: /lyrics The Weeknd - Blinding Lights
╰───────────

╭─[ ✧ PERSONALIZACIÓN ]
│ $ /setbotname nombre - Nombre del bot (define su inicial)
│
│ $ /setbotcurrency símbolo - Moneda de economía
│
│ $ /setbanner - Foto del menú (enviá o respondé a una imagen)
│
│ $ /setprefix símbolo - Prefijo del bot (uno solo)
│
│ $ /setstatus texto - Estado (info) del bot
│
│ $ /setpfp - Foto de perfil del bot (enviá o respondé a una imagen)
> Uso: /setprefix $ | /setprefix reset
╰───────────

╭─[ ✧ REACCIONES ]
│ ❖ Cariño y amistad
│ $ /hug - Abrazar
│ $ /cuddle - Acurrucarse
│ $ /kiss - Dar un beso
│ $ /peck - Dar un piquito
│ $ /blowkiss - Tirar un beso
│ $ /pat - Hacer cariñitos en la cabeza
│ $ /handhold - Agarrar de la mano
│ $ /lappillow - Usar las piernas de almohada
│ $ /carry - Cargar en brazos
│ $ /feed - Dar de comer
│ $ /handshake - Dar la mano
│ $ /highfive - Chocar los cinco
│
│ ❖ Travesuras
│ $ /slap - Dar una cachetada
│ $ /punch - Dar un puñetazo
│ $ /patada - Patear
│ $ /bite - Morder
│ $ /bonk - Dar un bonk
│ $ /poke - Molestar con el dedo
│ $ /tickle - Hacer cosquillas
│ $ /shoot - Disparar
│ $ /yeet - Lanzar por los aires
│ $ /baka - Decir baka (tonto)
│ $ /kabedon - Acorralar contra la pared
│ $ /tableflip - Dar vuelta la mesa
│
│ ❖ Emociones
│ $ /happy - Estar feliz
│ $ /smile - Sonreír
│ $ /laugh - Reírse
│ $ /teehee - Reírse con picardía
│ $ /cry - Llorar
│ $ /angry - Enojarse
│ $ /pout - Hacer pucheros
│ $ /blush - Sonrojarse
│ $ /bored - Aburrirse
│ $ /yawn - Bostezar
│ $ /sleep - Dormir
│ $ /shocked - Quedarse en shock
│ $ /confused - Estar confundido
│ $ /think - Pensar
│ $ /smug - Poner cara de canchero
│
│ ❖ Gestos y acciones
│ $ /wave - Saludar
│ $ /wink - Guiñar el ojo
│ $ /nod - Asentir
│ $ /nope - Negar
│ $ /shrug - Encogerse de hombros
│ $ /thumbsup - Pulgar arriba
│ $ /clap - Aplaudir
│ $ /salute - Hacer la venia
│ $ /facepalm - Facepalm
│ $ /stare - Mirar fijo
│ $ /lurk - Espiar
│ $ /run - Salir corriendo
│ $ /dance - Bailar
│ $ /spin - Dar vueltas
│ $ /sip - Tomar un sorbo
│ $ /nom - Comer algo rico
│ $ /nya - Hacer nya
│ $ /wag - Mover la cola
│ $ /bleh - Sacar la lengua
│ $ /shake - Sacudirse
> Uso: /hug @usuario (o respondé a su mensaje). Sin etiqueta, la reacción es solo tuya
╰───────────

╭─[ ✧ NSFW ]
│ ❖ En grupos: activar con /nsfw on.
│
│ ❖ Sugerente
│ $ /nsfwneko - Neko
│ $ /nsfwwaifu - Waifu
│ $ /nsfwtrap - Trap
│ $ /nsfwecchi - Ecchi
│ $ /nsfwero - Ero
│ $ /nsfwsolo - Solo
│ $ /nsfwboobs - Boobs
│ $ /nsfwhboobs - Hboobs
│ $ /nsfwoppai - Oppai
│ $ /nsfwass - Culo
│ $ /nsfwhips - Caderas
│ $ /nsfwhmidriff - Rollitos
│ $ /nsfwfoxgirl - Foxgirl
│ $ /nsfwuniform - Uniforme
│ $ /nsfwschool - Escuela
│ $ /nsfwmaid - Maid
│ $ /nsfwnurse - Enfermera
│ $ /nsfwglasses - Anteojos
│ $ /nsfwstockings - Medias
│ $ /nsfwtights - Tights
│ $ /nsfwzettai - Zettai ryouiki
│ $ /nsfwpanties - Pants
│ $ /nsfwfeet - Pies
│ $ /nsfwkemonomimi - Kemonomimi
│ $ /nsfwhanalia - Hanalia
│ $ /nsfwhasshaku - Hasshaku
│ $ /nsfwhneko - Hneko
│ $ /nsfwhololewd - Holo
│ $ /nsfwlewdk - Lewdk
│ $ /nsfwlewdkemo - Lewdkemo
│ $ /nsfwngif - GIF
│ $ /nsfw4k - 4K
│
│ ❖ Explícito
│ $ /nsfwhentai - Hentai
│ $ /nsfwahegao - Ahegao
│ $ /nsfwpaizuri - Paizuri
│ $ /nsfwblowjob - Blowjob
│ $ /nsfworalsex - Oral
│ $ /nsfwpussy - Vagina
│ $ /nsfwpussywank - Paja
│ $ /nsfwanal - Anal
│ $ /nsfwcreampie - Creampie
│ $ /nsfwcum - Acabada
│ $ /nsfwdick - Pene
│ $ /nsfworgasm - Orgasmo
│ $ /nsfwmasturbation - Masturbación
│ $ /nsfwthreesome - Trío
│ $ /nsfwyaoi - Yaoi
│ $ /nsfwsolomale - Solo (hombre)
│
│ ❖ Fetiches
│ $ /nsfwtentacles - Tentáculos
│ $ /nsfwbdsm - BDSM
│ $ /nsfwfemdom - Femdom
│ $ /nsfwfootjob - Footjob
│ $ /nsfwgangbang - Gangbang
│ $ /nsfworgy - Orgía
│ $ /nsfwyuri - Yuri
│ $ /nsfwundress - Desnudarse
│ $ /nsfwstrip - Strip
│ $ /nsfwharem - Harén
│ $ /nsfwsuccubus - Súcubo
│ $ /nsfwincest - Incesto
│ $ /nsfwpee - Pee
│ $ /nsfwcuckold - Cuckold
│ $ /nsfwhgame - Hgame
│ $ /nsfwclassic - Clásico
│ $ /nsfwrandom - Al azar
> Uso: /nsfwhentai (o /nsfwhentai @usuario). Sin etiqueta, la imagen es solo tuya
╰───────────${owner? `

╭─[ ✧ OWNER ]
│ $ /say texto - El bot envía el texto
│
│ $ /whitelist @usuario - Dar permisos de owner
│
│ $ /unwhitelist @usuario - Quitarlos
│
│ $ /join link - Meter al bot en un grupo (dueño y whitelist)
│
│ $ $ <comando> - Ejecutar un comando en la shell del host (ej: $ npm i). Solo el dueño
│
│ $ /ban @usuario | número - Banear: no puede usar el bot (dueño y whitelist)
│
│ $ /pardon @usuario | número - Desbanear
│
│ $ /delsub número - Eliminar un sub-bot
│
│ $ /backup - Backup a tu privado
╰───────────` : ''}

⚠  Powered by Vand4lw | ${totalCommands} cmds
─── ✦ ─── ✦ ─── ✦ ───`;
}
// cuenta los comandos de las líneas "│ ..." del menú: los alias ("| /help") cuentan como uno y /NA no cuenta
const countCmds = txt => txt.split('\n').filter(l => l.startsWith('│'))
  .reduce((n, l) => {
    const cmd = l.split(' - ')[0].split('|')[0]; // antes de la descripción y de los alias
    const toks = cmd.match(/(?:^|\s)\/[\p{L}?]+/gu) || [];
    return n + toks.filter(t => t.trim().toLowerCase() !== '/na').length;
  }, 0);

module.exports = { buildMenu, countCmds };
