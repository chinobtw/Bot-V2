// Juegos y pasatiempos de grupo: /ppt, /adivina, /verdad, /reto, /pregunta, /ship, /quien, tops, /rr (ruleta rusa), /consejo
const { OWNER } = require('../../config');
const { mutes, saveMutes } = require('../../src/db/mutes');
const { ecoIds } = require('../../src/lib/economia');
const { argsDe, comando, ctxDe, responder } = require('../../src/lib/medios');
const { botIds, ctxBot, idsDe, isAdmin, isOwner, num, sock } = require('../../src/lib/state');
const { aleat } = require('../../src/lib/util');

const mezclar = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const soloGrupo = f => c => c.enGrupo && f(c);
// miembros del grupo (sin los bots)
async function miembros(jid) {
  const meta = await sock.groupMetadata(jid).catch(() => null);
  return (meta?.participants || []).filter(p => !idsDe(p).some(x => botIds().includes(x)));
}
const nombreDe = p => `@${num(p.id)}`;

// ----- /ppt: piedra, papel o tijera contra el bot -----
const PPT = { piedra: '🪨', papel: '📄', tijera: '✂️' }, GANA = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' };
const PPT_ALIAS = { piedra: 'piedra', '🪨': 'piedra', papel: 'papel', '📄': 'papel', tijera: 'tijera', tijeras: 'tijera', '✂️': 'tijera', '✂': 'tijera' };
async function pptCmd(c) {
  const reply = responder(c), eleg = PPT_ALIAS[argsDe(c).toLowerCase()];
  if (!eleg) return reply('Uso: /ppt <piedra|papel|tijera>\n> Ejemplo: /ppt tijera');
  const bot = aleat(Object.keys(PPT));
  const res = eleg === bot? '🤝 *Empate*' : GANA[eleg] === bot? '🎉 *¡Ganaste!*' : '😈 *Gané yo*';
  await reply(`✊ *Piedra, papel o tijera*\n\nVos: ${PPT[eleg]} ${eleg}\nYo: ${PPT[bot]} ${bot}\n\n${res}`);
}

// ----- /adivina: número del 1 al 100; se responde al mensaje del juego -----
const adivinaPorMsg = new Map(), adivinaPorChat = new Map();   // id de mensaje -> partida; chat -> partida
const ADIVINA_ESPERA = 10 * 60e3;
function adivinaFin(st) { clearTimeout(st.timer); for (const id of st.ids) adivinaPorMsg.delete(id); if (adivinaPorChat.get(st.jid) === st) adivinaPorChat.delete(st.jid); }
function adivinaVigila(st) { clearTimeout(st.timer); st.timer = setTimeout(() => adivinaFin(st), ADIVINA_ESPERA); st.timer.unref?.(); }
function adivinaEnviado(st, s) { if (s?.key?.id) { st.ids.push(s.key.id); adivinaPorMsg.set(s.key.id, st); } }
async function adivinaCmd(c) {
  const reply = responder(c);
  if (adivinaPorChat.has(c.jid)) return reply('🎲 Ya hay un juego en curso. Respondé a mi mensaje del juego con un número del 1 al 100.');
  const st = { bot: ctxBot(), jid: c.jid, n: 1 + Math.floor(Math.random() * 100), intentos: 0, ids: [] };
  adivinaPorChat.set(c.jid, st); adivinaVigila(st);
  adivinaEnviado(st, await sock.sendMessage(c.jid, { text: '🎲 *Adiviná el número*\nPensé un número del *1 al 100*.\n> Respondé a este mensaje con tu número. ¡El primero que acierta gana!' }, { quoted: c.m }));
}
async function adivinaElegir(m, jid, st, qid, mt) {
  const n = Number(mt[1]);
  if (n < 1 || n > 100) return void await sock.sendMessage(jid, { text: '🎲 Es un número del 1 al 100' }, { quoted: m });
  st.intentos++; adivinaVigila(st);
  const p = m.key.participant || jid;
  if (n === st.n) {
    adivinaFin(st);
    return void await sock.sendMessage(jid, { text: `🎉 *¡@${num(p)} adivinó!* Era el *${st.n}*\n> Lo sacó con ${st.intentos} intento(s) entre todos`, mentions: [p] }, { quoted: m });
  }
  adivinaEnviado(st, await sock.sendMessage(jid, { text: n < st.n? `📈 El ${n} es *más bajo*. Probá con uno mayor` : `📉 El ${n} es *más alto*. Probá con uno menor` }, { quoted: m }));
}

// ----- /verdad, /reto, /pregunta (¿qué preferís?), /consejo -----
const VERDADES = ['¿Cuál fue tu mayor papelón en público?', '¿Qué es lo más raro que googleaste este mes?', '¿A quién de este grupo le bloquearías el estado?', '¿Cuál es tu peor hábito del que no te hacés cargo?', '¿Qué mentira repetís más seguido?', '¿Cuál fue tu peor cita o salida?', '¿Qué es lo más caro que rompiste y no contaste?', '¿Qué canción escuchás a escondidas porque te da vergüenza?', '¿A quién del grupo le tenés más envidia (de buena)?', '¿Qué es lo más loco que hiciste por plata?', '¿Cuál es tu mayor miedo irracional?', '¿Qué chat de WhatsApp silenciaste y nunca se lo dijiste a nadie?', '¿Cuál fue la última vez que lloraste y por qué?', '¿Qué es lo que más te cuesta perdonar?', '¿Qué harías si fueras invisible por un día?', '¿A quién del grupo le contarías un secreto?', '¿Cuál es tu mayor red flag?', '¿Qué es lo más vergonzoso que tenés en la galería?', '¿Cuál fue tu peor mensaje enviado al chat equivocado?', '¿Qué cosa cambiarías de tu personalidad?', '¿Cuál es la excusa más mala que diste para no ir a un lado?', '¿Qué apodo odiás que te digan?', '¿Quién fue tu primer crush famoso?', '¿Qué es lo más raro que comiste?', '¿Qué hacés cuando nadie te ve que te daría vergüenza contar?'];
const RETOS = ['Mandá un audio cantando el estribillo de tu canción favorita.', 'Cambiá tu foto de perfil por una cosa random durante una hora.', 'Escribí un poema de 4 versos sobre alguien del grupo.', 'Mandá un audio diciendo un trabalenguas 3 veces seguidas.', 'Contá un chiste. Si nadie se ríe, tenés que mandar otro.', 'Mandá una selfie ahora mismo, sin filtros.', 'Imitá a alguien del grupo en un audio y que adivinen quién es.', 'Poné de estado "Soy fan del bot" por una hora.', 'Mandá el último meme que guardaste.', 'Hablá solo en palabras que empiecen con M durante los próximos 5 mensajes.', 'Mandá un audio relatando lo que tenés adelante como si fuera un partido de fútbol.', 'Escribile "te extraño" a la última persona con la que hablaste (y no es del grupo).', 'Mandá un sticker raro cada vez que alguien hable durante 5 minutos.', 'Hacé 10 sentadillas y mandá un audio contando.', 'Describí tu día usando solo emojis.', 'Mandá un audio con la voz más aguda que puedas diciendo "hola a todos".', 'Contá tu anécdota más vergonzosa.', 'Dejá que el grupo elija tu próximo estado de WhatsApp.', 'Mandá una captura de tu pantalla de inicio.', 'Escribí tu nombre con los pies o con la mano que no usás y mandá la foto.'];
const PREFERIS = ['¿Qué preferís: nunca más comer asado o nunca más comer pizza?', '¿Qué preferís: viajar al pasado o al futuro?', '¿Qué preferís: perder el celular o perder la billetera?', '¿Qué preferís: saber cuándo te vas a morir o cómo?', '¿Qué preferís: un millón de pesos hoy o un peso que se duplica cada día por un mes?', '¿Qué preferís: hablar todos los idiomas o tocar todos los instrumentos?', '¿Qué preferís: vivir sin música o sin series?', '¿Qué preferís: ser el más inteligente o el más carismático del grupo?', '¿Qué preferís: dormir 3 horas y rendir al máximo o dormir 12 y andar lento?', '¿Qué preferís: que te lean la mente o leer la de los demás?', '¿Qué preferís: vivir en la playa o en la montaña?', '¿Qué preferís: nunca más tener frío o nunca más tener calor?', '¿Qué preferís: no usar redes por un año o no comer carne por un año?', '¿Qué preferís: viajar gratis para siempre o comer gratis para siempre?', '¿Qué preferís: ganar la lotería y perderla en un año o ganar un sueldo bueno toda la vida?', '¿Qué preferís: que todos sepan tus secretos o no poder contar nunca uno?', '¿Qué preferís: volar o ser invisible?', '¿Qué preferís: perder todos tus chats o todas tus fotos?', '¿Qué preferís: un perro que habla o un gato que cocina?', '¿Qué preferís: estar siempre 10 minutos tarde o siempre 20 minutos temprano?', '¿Qué preferís: que se te trabe el WiFi siempre o que se te descargue el celular siempre?', '¿Qué preferís: ser famoso y odiado o desconocido y feliz?', '¿Qué preferís: vivir sin café/mate o sin dulce?', '¿Qué preferís: repetir la secundaria o repetir la mudanza más pesada que tuviste?', '¿Qué preferís: tener siempre hambre o nunca tener sueño?'];
const CONSEJOS = ['Tomá agua. En serio, ahora. 💧', 'No le prestes plata a nadie que no estés dispuesto a no ver más.', 'Si dudás en mandar el mensaje, esperá 10 minutos. Si seguís queriendo, mandalo.', 'Dormí bien: el 80% de los problemas se ven distintos a la mañana.', 'Ahorrá aunque sea poquito, pero ahorrá todos los meses.', 'Cargá el celular antes de salir. Siempre.', 'No discutas con alguien que tiene hambre o sueño (incluido vos).', 'Hacé backup de lo importante. Hoy, no mañana.', 'Respondé los audios largos con otro audio largo. Es ley.', 'Si tenés que explicar un chiste, ya no sirve. Dejalo ir.', 'Caminá 20 minutos al día; te cambia la cabeza.', 'No compres nada con hambre ni con bronca.', 'Pedí perdón rápido y sin "pero".', 'Dejá de scrollear a las 3 de la mañana. Nada bueno hay a esa hora.', 'Un "gracias" a tiempo cuesta poco y vale mucho.', 'Hacé primero la tarea que más pereza te da.', 'No guardes rencor: pesa más que cualquier mochila.', 'Si nadie te lo dijo hoy: lo estás haciendo mejor de lo que pensás.', 'Cuando dudes entre dos, elegí la que te da más tranquilidad.', 'Tené siempre un cargador en la mochila y un plan B en la cabeza.', 'Las contraseñas no se comparten ni se reusan. Usá un gestor.', 'Si te duele la espalda, levantate de la silla. Ya.', 'Escuchá más de lo que hablás; te enterás de todo.', 'Lo que no se mide no se mejora; lo que no se anota se olvida.', 'Nunca confirmes un asado sin saber quién trae el carbón.'];
const elegirLista = (lista, titulo) => c => responder(c)(`${titulo}\n\n${aleat(lista)}`);

// ----- /ship: compatibilidad (siempre da lo mismo para la misma pareja) -----
const hash = s => { let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return h; };
async function shipCmd(c) {
  const reply = responder(c), ctx = ctxDe(c.m);
  const objetivos = [...new Set([...(ctx?.mentionedJid || []), ...(ctx?.participant && !(ctx.mentionedJid || []).length? [ctx.participant] : [])])];
  const yo = c.m.key.participant || c.jid;
  const [a, b] = objetivos.length >= 2? objetivos : objetivos.length === 1? [yo, objetivos[0]] : [];
  if (!a) return reply('Uso: /ship @persona (conmigo) o /ship @uno @otro\n> También podés responder a un mensaje');
  if (num(a) === num(b)) return reply('💔 No se puede shippear a alguien consigo mismo');
  const pct = hash([num(a), num(b)].sort().join('|')) % 101;
  const frase = pct >= 90? '💞 Almas gemelas. Que alguien organice la boda.' : pct >= 70? '😍 Hay mucha química, no lo dejen pasar.' : pct >= 50? '🙂 Tiene futuro si le ponen onda.' : pct >= 30? '😬 Mmm... hace falta mucho esfuerzo.' : '🧊 Mejor amigos. Pero amigos de lejos.';
  const barra = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
  await reply(`💘 *Ship*\n@${num(a)} ❤️ @${num(b)}\n\n[${barra}] *${pct}%*\n${frase}`, [a, b]);
}

// ----- /quien <algo>: ¿quién es más probable que...? -----
async function quienCmd(c) {
  const reply = responder(c), t = argsDe(c).replace(/^(es\s+)?(más\s+)?(probable\s+)?que\s+/i, '').replace(/[?¿]+/g, '').trim();
  if (!t) return reply('Uso: /quien <algo>\n> Ejemplo: /quien se queda dormido en una videollamada');
  const p = aleat(await miembros(c.jid));
  if (!p) return reply('❌ No pude ver los miembros del grupo');
  await reply(`🔮 *¿Quién es más probable que ${t.slice(0, 150)}?*\n\nLa bola de cristal dice: ${nombreDe(p)}`, [p.id]);
}

// ----- tops de joda -----
const TOPS = { topgay: ['🏳️‍🌈', 'más gay'], toplindos: ['😍', 'más lindos'], toptrolls: ['🤡', 'más trolls'], topvagos: ['🛋️', 'más vagos'], topcracks: ['🏆', 'más cracks'], topchamuyeros: ['🗣️', 'más chamuyeros'] };
async function topCmd(c, clave) {
  const reply = responder(c), [emo, nombre] = TOPS[clave], gente = mezclar(await miembros(c.jid)).slice(0, 5);
  if (!gente.length) return reply('❌ No pude ver los miembros del grupo');
  const pcts = gente.map(() => 30 + Math.floor(Math.random() * 71)).sort((a, b) => b - a);
  const medallas = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  await reply(`${emo} *Top ${gente.length} ${nombre} del grupo*\n\n${gente.map((p, i) => `${medallas[i]} ${nombreDe(p)} — ${pcts[i]}%`).join('\n')}\n\n_Es todo joda, no te enojes_ 😜`, gente.map(p => p.id));
}

// ----- /rr: ruleta rusa. El tambor es del grupo: cada disparo avanza una recámara y una de las 6 tiene la bala. Si te toca, mute de 10 minutos -----
const RR_MUTE = 10 * 60e3;
const tambores = new Map();   // grupo -> { bala, tiro }
async function rrCmd(c) {
  const reply = responder(c), jid = c.jid, yo = c.m.key.participant || jid;
  let t = tambores.get(jid); if (!t) tambores.set(jid, t = { bala: 1 + Math.floor(Math.random() * 6), tiro: 0 });
  t.tiro++;
  if (t.tiro < t.bala) return void await reply(`🔫 *Ruleta rusa*\n@${num(yo)} aprieta el gatillo...\n\n*¡Click!* 😮‍💨 Te salvaste\n> Recámara ${t.tiro} de 6. Sigue el que sigue`, [yo]);
  tambores.delete(jid);   // sale la bala: se vuelve a cargar
  const ids = await ecoIds(c.m, jid), meta = await sock.groupMetadata(jid).catch(() => null);
  const botAdmin = meta?.participants.some(p => p.admin && idsDe(p).some(x => botIds().includes(x)));
  const protegido = ids.includes(OWNER) || await isOwner(c.m, jid) || await isAdmin(jid, c.m).catch(() => false);
  let extra;
  if (protegido) extra = '🛡️ Pero sos admin, así que zafás esta vez.';
  else if (!botAdmin) extra = '⚠️ Te hubiera muteado, pero necesito ser admin.';
  else {
    const g = (mutes[jid] ||= {});
    for (const k of Object.keys(g)) if (g[k].ids.some(x => ids.includes(x))) delete g[k];
    g[ids[0]] = { ids, until: Date.now() + RR_MUTE, jid: yo }; saveMutes();
    extra = '🔇 Quedás muteado por 10 minutos.';
  }
  await reply(`🔫 *Ruleta rusa*\n@${num(yo)} aprieta el gatillo...\n\n💥 *¡BANG!* 💀\n${extra}\n> Se recargó el tambor`, [yo]);
}

module.exports.commands = [
  { test: comando('ppt', 'piedra'), run: pptCmd },
  { test: soloGrupo(comando('adivina')), run: adivinaCmd },
  { test: comando('verdad'), run: elegirLista(VERDADES, '🤫 *Verdad*') },
  { test: comando('reto'), run: elegirLista(RETOS, '😈 *Reto*') },
  { test: comando('pregunta', 'preferis', 'preferís'), run: elegirLista(PREFERIS, '🤔 *¿Qué preferís?*') },
  { test: comando('consejo'), run: elegirLista(CONSEJOS, '💡 *Consejo del día*') },
  { test: soloGrupo(comando('ship')), run: shipCmd },
  { test: soloGrupo(comando('quien', 'quién', 'probable')), run: quienCmd },
  { test: soloGrupo(c => /^\/(topgay|toplindos|toptrolls|topvagos|topcracks|topchamuyeros)(\s|$)/i.test(c.text)), run: c => topCmd(c, c.text.slice(1).split(/\s/)[0].toLowerCase()) },
  { test: soloGrupo(c => /^\/(rr|ruletarusa|ruleta\s+rusa)(\s|$)/i.test(c.text)), run: rrCmd },
];
module.exports.respuestas = [{ re: /^(\d{1,3})\W*$/, mapa: adivinaPorMsg, run: adivinaElegir }];
