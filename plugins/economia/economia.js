// Economía: /daily, /w, /crime, /minar, /hacking, /rob, /dep, /with, /bal
const { saveEco } = require('../../src/db/economia');
const { DAILY_BASE, DAILY_MAX, DAILY_PASO, ayerAR, cdPoner, cdRestante, din, ecoGet, ecoIds, ecoObjetivo, ecoRacha, fmtTiempo, hoyAR, msHastaMedianoche, rnd } = require('../../src/lib/economia');
const { botIds, num, sock } = require('../../src/lib/state');
const { aleat } = require('../../src/lib/util');

async function dailyCmd(m, jid) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const ids = await ecoIds(m, jid);
  const u = ecoGet(jid, ids); u.ult = Date.now();
  const r = ecoRacha(ids);
  const hoy = hoyAR();
  if (u.ultDaily === hoy) {
    return reply(`🗓️ Ya cobraste tu daily de hoy en este grupo.\nVolvé en *${fmtTiempo(msHastaMedianoche())}* (a las 00:00).\n> Días de racha: ${r.dias}`);
  }
  let perdio = 0, nuevoDia = false;
  if (r.ultDaily!== hoy) {                                   // el primer cobro del día (en cualquier grupo) es el que sube la racha
    if (r.ultDaily && r.ultDaily!== ayerAR() && r.dias > 0) { perdio = r.dias; r.dias = 0; }   // se salteó un día → racha a cero
    r.dias++; r.ultDaily = hoy; nuevoDia = true;
  }
  const premio = Math.min(DAILY_MAX, DAILY_BASE + DAILY_PASO * (r.dias - 1));
  u.dias = r.dias; u.ultDaily = hoy; u.cartera += premio; saveEco();
  const sig = Math.min(DAILY_MAX, DAILY_BASE + DAILY_PASO * r.dias);
  await reply(`🎁 *Daily*\nGanaste ${din(premio)}${perdio? `\n💔 Se te pasó un día y perdiste tu racha de ${perdio} día${perdio===1?'':'s'}. Arrancás de nuevo.` : ''}${nuevoDia? '' : '\n🌐 Tu racha ya había sumado hoy en otro grupo: acá cobrás igual, pero no sube de nuevo.'}\n\n> Día #${r.dias} de racha${premio >= DAILY_MAX? ' · ¡tope diario alcanzado!' : ''}\n> Mañana: ${din(sig)}`);
}

// ----- trabajos: /w /crime /minar /hacking -----
const A = (win, ganMin, ganMax, perMin, perMax, cd, verbo, si, no) => ({ win, ganMin, ganMax, perMin, perMax, cd, verbo, si, no });
const ACCIONES = {
  w: A(0.65, 7000, 20000, 11000, 15000, 2 * 60e3, 'trabajar', [
    'La kiosquera te dejó a cargo del local por una semana. Descubriste que el "cambio" siempre se le perdía a todos menos a vos. Te pagó el doble para que te quedes callado.',
    'Cuidaste autos en la puerta de la cancha sin que nadie te lo pidiera. Con la cara que tenés, ninguno se animó a no pagar.',
    'Vendiste pañuelitos descartables en un velorio. Nunca hubo tanta demanda.',
    'Repartiste volantes de un cerrajero que cobra por abrirte tu propia puerta. Esa gente es de otro nivel y vos cobraste comisión.',
    'Hiciste de cadete en una farmacia. Subiste cuatro pisos sin ascensor y el cliente te dio propina por lástima al verte la cara.',
    'Lavaste parabrisas en un semáforo. Los que no pagaron quedaron con el vidrio más sucio que antes. Es el libre mercado.',
    'Fuiste jurado en un concurso de empanadas. Comiste catorce, te dolió todo y cobraste igual.',
    'Trabajaste de extra en una novela de gente que sufre. No necesitaste actuar.',
    'Cuidaste a un viejo millonario con insomnio. Te dejó propina y un único consejo: "no te cases".',
    'Vendiste un curso de cómo hacerse rico. El único que se hizo rico fuiste vos.',
    'Pusiste música en un cumple de 15. Pasaste cumbia, tu tío bailó, la abuela lloró y te pagaron antes de que alguien prendiera las luces.',
    'Ayudaste en una mudanza. Rompiste el espejo y le dijiste al dueño "siete años de mala suerte, pero con mejor plata". Aceptó.',
    'Pintaste una casa. El dueño nunca se dio cuenta de que la segunda mano era agua.',
    'Hiciste de payaso en un cumpleaños. Un nene te pateó la espinilla y su padre te pagó doble para que no lo demandes.',
    'Atendiste el 0800 de reclamos. Dejaste el teléfono descolgado cuatro horas y cobraste igual. Producción récord.',
    'Hiciste de doble de riesgo en una publicidad de seguros. Te cayó un piano encima, pero el seguro lo cubrió, que era el punto.',
    'Fuiste sparring de un boxeador amateur. Te pagaron por cada diente que te sobraba.',
    'Escribiste cartas de amor por encargo. Tres parejas se pelearon, pero cobraste por adelantado.',
    'De estatua viviente, una paloma te usó de baño. La gente aplaudió y pagó por lástima.',
    'Arreglaste una computadora. El cliente nunca supo que lo único que hiciste fue apretar F5.',
    'Cobraste por hacer fila en un banco para alguien. Salió el turno nueve horas después y te pagó igual, porque no tenía alternativa.',
    'Cortaste el pasto del cementerio municipal. El sueldo es bajo, pero los clientes no se quejan.',
    'Fuiste guía turístico en tu propio barrio. Inventaste que ahí murió un prócer. Era un perro. Pagaron igual.',
    'Armaste un puesto de choripán en la puerta del estadio. Se agotó antes del segundo tiempo.',
    'Te colaste en un casamiento al que no te habían invitado. Comiste, bailaste y alguien te dio plata para que te vayas.',
  ], [
    'La kiosquera te contrató por dos días y te echó por robarte los cigarrillos. Encima te cobró los faltantes.',
    'Un tipo te ofreció una changa "fácil". Era una mudanza y la heladera te cayó encima. Los remedios salieron más que el sueldo.',
    'Hiciste de repartidor en bici. Te chocó un colectivo y el pedido era sushi. Todo en el asfalto, y te lo descontaron.',
    'Te hiciste pasar por plomero. Inundaste el departamento de abajo y el vecino tenía un abogado muy bueno.',
    'Cuidaste un perro ajeno. Se comió el aguinaldo del dueño, que no tuvo mejor idea que pasarte la cuenta a vos.',
    'Atendiste una parrilla. Quemaste el chorizo, el delantal y casi el local. Te cobraron todo menos las lágrimas.',
    'Trabajaste de cajero. Faltó plata y la caja estaba bien: contaste mal vos. Tu sueldo llegó en negativo.',
    'Vendiste alfajores en el tren. Un nene te los robó y encima te multaron por vender sin permiso.',
    'Entraste a un call center y le vendiste un seguro al dueño de la empresa. Te echaron y te cobraron la capacitación.',
    'Hiciste de seguridad en un boliche. Dejaste pasar al dueño sin DNI y el dueño no se acuerda de que es el dueño.',
    'Vendiste empanadas de ayer. Intoxicaste a media cuadra y la indemnización no se pagó sola.',
    'Te contrataron de payaso y el cliente le tenía fobia. Te denunció.',
    'Hiciste una changa de albañil. La pared se cayó "sola" encima de un auto.',
    'Fuiste DJ en un casamiento y pasaste la lista equivocada. Tuviste que devolver el adelanto y el cuñado quiere pelea.',
    'Repartiste volantes. Los tiraste a la cloaca y te vieron. Multa por ensuciar la vía pública.',
    'Cuidaste a un nene que resultó más vivo que vos: te vendió tu propio celular.',
    'Trabajaste de cuidacoches sin permiso. Un policía te cobró la "tarifa municipal".',
    'Armaste un puesto de choripán sin habilitación. Pasó la inspección, se llevó todo el stock y te dejó una multa.',
    'Le diste vuelto de más a todos los clientes. Al otro día tu jefe también contaba la caja.',
    'Te contrataron de jardinero. Podaste el bonsái de la señora, que costaba más que tu casa.',
    'De lavacoches, rayaste un Falcon de colección. Valía más que tu casa, tus órganos y tu futuro.',
    'Fuiste tester de colchones. Te dormiste en horario laboral, te echaron y te cobraron la baba.',
    'De mozo, le tiraste la sopa encima al crítico gastronómico. Te cobraron la tintorería y el trauma.',
    'Vendiste tu lugar en la fila por cinco lucas. Te quedaste sin lugar, sin plata y sin dignidad.',
    'Hiciste de niñero y el chico le contó a sus padres hasta lo que no hiciste. Te descontaron todo.',
  ]),
  crime: A(0.60, 30000, 78000, 50000, 120000, 5 * 60e3, 'cometer otro delito', [
    'Le robaste el celular a un estafador. Tenía la billetera llena con lo que les había robado a otros. Ladrón que roba a ladrón.',
    'Asaltaste a otro ladrón. No puede denunciarte y lo sabe.',
    'Vendiste "terrenos en la costa" con fotos de Photoshop. El que compró nunca va a poder demostrar que el mar estaba más lejos.',
    'Te hiciste pasar por inspector municipal. Los kioscos de la cuadra te recibieron con sobre incluido.',
    'Asaltaste un camión de verdura. Rindió más que cualquier trabajo; la ensalada te la regalaste.',
    'Clonaste la tarjeta de un tipo que presumía de rico. Ahora paga tus cafés, tus almuerzos y tu autoestima.',
    'Vendiste entradas para un recital que no existe. La fila llegó hasta la esquina.',
    'Desvalijaste un auto estacionado en doble fila. La justicia poética te pagó los gastos.',
    'Falsificaste una factura para una empresa que ni siquiera tiene empleados. El que la pagó tampoco los tenía.',
    'Cobraste peaje en una calle de tierra que no es tuya. Nadie preguntó, todos pagaron.',
    'Hiciste de "arbolito" y le vendiste dólares truchos a un turista que ya se había ido.',
    'Armaste una timba clandestina en un garaje. La policía llegó tarde porque estaba apostando.',
    'Entraste a una casa vacía. Los dueños se habían ido... a una casa más linda, y te dejaron lo que sobró.',
    'Vendiste "seguros contra mala suerte". Nadie reclamó, porque la mala suerte los alcanzó antes.',
    'Revendiste entradas para un partido que ya se había jugado. El cliente jura que ganó su equipo.',
    'Contrabandeaste alfajores a un país donde no se consiguen. Se agotaron, igual que tu conciencia.',
    'Le robaste el bolso a un pirata de colectivos. Tenía más plata que su recaudación.',
    'Asaltaste una casa de cambio con una pistola de agua. Nadie tuvo ganas de discutir con tu seguridad.',
    'Falsificaste un título universitario. Te lo pagaron mejor que a los que estudiaron.',
    'Armaste una rifa a beneficio de una causa inexistente. La causa sos vos.',
    'Chorreaste combustible de un camión y lo vendiste con el 20 por ciento de descuento. Nunca tan transparente.',
    'Hiciste de "falso policía" en una fiesta. Los asistentes entregaron todo en menos de un minuto.',
    'Robaste una estatua, la vendiste como arte moderno y te felicitaron por el concepto.',
    'Pusiste una "cabina de peaje" en el medio de una ruta de campo. Pasaron cuarenta autos antes de que alguien se diera cuenta.',
    'Hackeaste el Wi-Fi del vecino y le vendiste el acceso. Vos tenés internet gratis; él, un enemigo menos.',
  ], [
    'Entraste a robar un kiosco. La kiosquera resultó ser la madre del comisario. Multa, fianza y un reto de por vida.',
    'Asaltaste a un tipo que parecía asustado. Era policía de civil. Te llevaron y te cobraron el viaje en patrullero.',
    'Quisiste vender entradas truchas, pero el comprador era el dueño del estadio. Perdiste las entradas y la libertad.',
    'Te metiste a robar en una casa. Tenía alarma, perro y suegra. El perro fue el menos agresivo.',
    'Le vendiste un auto robado a un tipo que resultó ser el dueño. Te cobró la indemnización y las lágrimas.',
    'Falsificaste billetes y los pagaste en una cuadra llena de cámaras. Ahora sos famoso en la comisaría.',
    'Quisiste desvalijar un camión de reparto. Estaba vacío y encima te filmaron con la cara descubierta.',
    'Armaste una timba clandestina y el primero en perder todo fuiste vos.',
    'Chorreaste combustible y te fumaste un cigarrillo del susto. Perdiste las cejas, la plata y el prestigio.',
    'Quisiste estafar a un tipo con un cuento. Era profesor de lengua y te corrigió la ortografía hasta que llegó la policía.',
    'Entraste a robar a una mansión. Era una escenografía de televisión y las cámaras estaban encendidas.',
    'Te hiciste pasar por inspector. El kiosquero resultó ser inspector de verdad. Está muy conforme con tu multa.',
    'Robaste un auto con un solo problema: tenía el sistema de GPS de la policía.',
    'Quisiste cobrar peaje en una ruta. Era la ruta de la comitiva del gobernador.',
    'Hackeaste el Wi-Fi del vecino y lo dejaste sin internet. Vino a golpearte la puerta con ganas de usarla de remo.',
    'Vendiste una rifa para una causa falsa. La causa era el juez, que se enteró.',
    'Tomaste un bolso sin mirar. Era del tipo que te estaba esperando. Te cobró el bolso y el susto.',
    'Hiciste de falso policía en una fiesta. Un policía de verdad tuvo que pedirte las cosas "con respeto".',
    'Intentaste robar un banco con un pasamontañas. Era un día de calor y te desmayaste en la puerta.',
    'Falsificaste un título. El cartón tenía tu nombre mal escrito y estaba firmado por "Pedrito".',
    'Quisiste robar un camión de verdura. Eran zapallos, no tenías dónde ponerlos, y encima los dejaron caer en tu pie.',
    'Le vendiste un terreno en la costa a un escribano. Revisó la escritura, se rió y te cobró la consulta.',
    'Fuiste a robar una joyería. Las joyas eran de bijouterie, pero la fianza era de verdad.',
    'Intentaste una estafa piramidal. La pirámide era de dos personas: vos arriba y la policía abajo.',
    'Asaltaste un cajero. El cajero se tragó la tarjeta, la plata y tu dignidad.',
  ]),
  minar: A(0.70, 15000, 60000, 12000, 40000, 10 * 60e3, 'ir a minar', [
    'Bajaste a la mina y encontraste una veta de hierro. Lo vendiste todo en el momento.',
    'Picaste cobre toda la tarde. El comprador te pagó al contado y no hizo preguntas.',
    'Hallaste una piedra rara brillante. No era diamante, pero el que la compró tampoco sabía.',
    'Sacaste carbón hasta quedar negro por dentro y por fuera. Se vendió solo.',
    'Desenterraste un fósil de un bicho raro. El museo lo pagó y ahora tiene tu nombre en una placa que nadie va a leer.',
    'Encontraste oro en la roca madre. Lo vendiste antes de que nadie pudiera inventar una historia.',
    'Un meteorito cayó cerca de tu pozo. Lo pescaste y lo vendiste como "souvenir espacial".',
    'Sacaste litio. Tu mina es oficialmente más cara que tu casa.',
    'Encontraste ámbar con un mosquito adentro. Dijeron que era de hace millones de años. Vos le habías puesto el mosquito.',
    'Hallaste cuarzo en abundancia. Lo vendiste a los que creen que cura la mala suerte.',
    'Abriste una galería vieja y encontraste el tesoro de un pirata de tierra firme. Lo vendiste sin que se enterara su familia.',
    'Sacaste plata del subsuelo. Nunca fuiste tan literal con una metáfora.',
  ], [
    'Te cayó un derrumbe. Sobreviviste, pero la ambulancia cobra por kilómetro.',
    'Una bolsa de gas explotó en tu galería. Perdiste el casco, las cejas y el seguro.',
    'Se inundó el túnel y salió a flote todo lo que habías juntado. Menos vos.',
    'El comprador te pagó con billetes truchos y se fue silbando. Tu mina quedó vacía; su bolsillo, lleno.',
    'Se te rompió el pico. El pico es lo único que te quedaba y era prestado.',
    'Te perdiste en la mina y tuviste que pagarle a un rescatista que te cobró hasta por el eco.',
    'Cavaste justo debajo de la casa de un vecino. La casa se hundió un poco. El vecino, bastante.',
    'Abriste una galería clausurada. El cartel decía "Peligro" y vos leíste "Peligro de que te vaya bien".',
  ]),
  hacking: A(0.55, 10000, 100000, 10000, 75000, 30 * 60e3, 'hackear', [
    'Entraste al sistema de un banco de provincia y redondeaste todos los centavos para vos. Nadie notó la diferencia hasta que vieron tu cuenta.',
    'Hackeaste una intendencia de un pueblo. La clave era "1234". La caja chica era de verdad.',
    'Te metiste en la red de un ente de recaudación y te hiciste un "reembolso" por las dudas. Salió perfecto.',
    'Te metiste en el sistema de multas de tránsito y te borraste las tuyas. Y las de tus amigos, por una comisión.',
    'Encontraste una base de datos olvidada con las contraseñas de todo un ministerio. Eran todas "contraseña".',
    'Hackeaste un cajero y escupió billetes durante tres minutos. Aprendiste a llorar de alegría.',
    'Entraste a la red de una empresa de energía y te cobraste los kilovatios que nunca consumiste.',
    'Descubriste una cuenta olvidada con fondos de hace veinte años. Eran tuyos por derecho de hacker.',
    'Aprovechaste una falla en un sistema de subsidios. Subsidiaste tu propio presente.',
    'Te infiltraste en el sistema de un casino online. La casa siempre gana, salvo que vos seas la casa.',
    'Te hiciste pasar por soporte técnico del gobierno. Todos te dieron sus claves, hasta el de seguridad.',
    'Entraste a una red de una universidad pública y le vendiste los exámenes a quien más pagaba. Ganó la educación.',
  ], [
    'Te rastrearon la IP porque tu usuario era "Pablito123". Fuiste detenido y la fianza no fue barata.',
    'Hackeaste lo que creías un banco. Era el servidor de una escuela primaria. Multa y vergüenza.',
    'Entraste a una red del gobierno, pero olvidaste usar VPN. La policía te tocó el timbre antes de que terminara la descarga.',
    'Te infectaste con tu propio virus. Tuviste que pagarle a un técnico que se rió mientras te cobraba.',
    'El sistema que hackeaste era una trampa para hackers. Estás en su lista de "los más torpes".',
    'Hackeaste el Wi-Fi de una comisaría. Alguien notó que el único dispositivo raro eras vos.',
    'Entraste a un sistema oficial y dejaste tu nombre en el log. Con firma, como los artistas.',
    'Un hacker más experto te robó tu botín de hackeo. Y encima dejó una carita feliz.',
  ]),
};
async function accionEco(m, jid, clave) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const a = ACCIONES[clave];
  const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now();
  const resta = cdRestante(u, clave, a.cd);
  if (resta > 0) return reply(`⏳ Esperá *${fmtTiempo(resta)}* para volver a ${a.verbo}.`);
  cdPoner(u, clave);
  let txt;
  if (Math.random() < a.win) {
    const n = rnd(a.ganMin, a.ganMax); u.cartera += n;
    txt = `${aleat(a.si)}\n> Ganaste: ${din(n)}`;
  } else {
    const n = Math.min(rnd(a.perMin, a.perMax), u.cartera); u.cartera -= n; // no existe la deuda: lo que no tenés en la billetera no se pierde
    txt = `${aleat(a.no)}\n> Perdiste: ${din(n)}${n? '' : ' (no tenías nada afuera del banco, te salvó la pobreza)'}`;
  }
  saveEco();
  await reply(txt);
}

// ----- /rob: solo a quien lleva más de 1 hora sin usar el bot y tiene plata afuera del banco -----
const ROB_SI = [
  v => `${v} estaba distraído y le diste vuelta los bolsillos como si fuera tu hobby.`,
  v => `Le soplaste la billetera a ${v} mientras revisaba el celular. Ni se enteró.`,
  v => `${v} dejó la plata afuera del banco. Vos dejaste la conciencia en casa.`,
  v => `Esperaste a que ${v} se durmiera y le hiciste una "inspección de patrimonio".`,
  v => `${v} confió en que nadie miraba. Todo el mundo miraba, pero vos fuiste el único que actuó.`,
  v => `Lo de ${v} fue limpio, rápido y bastante deshonesto.`,
];
const ROB_NO = [
  v => `Intentaste robarle a ${v}, pero se despertó justo. Te devolvió el golpe y la factura.`,
  v => `${v} te vio venir de lejos. Te tropezaste, se te cayó plata y encima te cobró el escándalo.`,
  v => `Le quisiste sacar la billetera a ${v}. Era una billetera trampa y se te cayó todo.`,
  v => `${v} resultó ser más vivo de lo que parecía. Dejaste plata en el intento.`,
  v => `El plan con ${v} era perfecto, salvo por todo lo que no previste.`,
  v => `Te agarraron con las manos en la masa mientras revisabas los bolsillos de ${v}.`,
];
async function robCmd(m, jid) {
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!jid.endsWith('@g.us')) return reply('Solo se puede robar en grupos');
  const ids = await ecoIds(m, jid);
  const t = await ecoObjetivo(m, jid);
  if (!t) return reply('Uso: /rob @usuario (o respondiendo a su mensaje)');
  const u = ecoGet(jid, ids); u.ult = Date.now();
  if (t.ids.some(x => ids.includes(x))) return reply('No podés robarte a vos mismo 🤨');
  if (t.ids.some(x => botIds().includes(x))) return reply('A mí no, que soy el que cuenta la plata 🙂');
  const resta = cdRestante(u, 'rob', 3600e3);
  if (resta > 0) return reply(`⏳ Esperá *${fmtTiempo(resta)}* para volver a robar.`);
  const v = ecoGet(jid, t.ids, false), tag = `@${num(t.jid)}`;
  if (!v || Math.floor(v.cartera / 2) < 1) return reply(`${tag} no tiene plata afuera del banco para robarle.`, [t.jid]);
  const libre = (v.ult || 0) + 3600e3 - Date.now();
  if (libre > 0) return reply(`${tag} usó el bot hace poco y está atento. Probá en *${fmtTiempo(libre)}*.`, [t.jid]);
  cdPoner(u, 'rob');
  let txt;
  if (Math.random() < 0.8) {
    const n = Math.floor(v.cartera / 2); v.cartera -= n; u.cartera += n;
    txt = `${aleat(ROB_SI)(tag)}\n> Le robaste: ${din(n)}`;
  } else {
    const n = Math.min(Math.floor(v.cartera / 4), u.cartera); u.cartera -= n; // la multa solo se le descuenta al ladrón
    txt = `${aleat(ROB_NO)(tag)}\n> Perdiste: ${din(n)}${n? '' : ' (no tenías nada afuera del banco)'}`;
  }
  saveEco();
  await reply(txt, [t.jid]);
}

// ----- banco: /dep y /with (monto con o sin separadores, o "all") -----
function ecoMonto(txt, max) {
  if (/^(all|todo|todos|todas)$/i.test(txt.trim())) return max;
  const d = txt.replace(/\D/g, '');
  return d? Number(d) : null; // 5.000 / 5,000 / 5000 es lo mismo: solo cuentan los números
}
async function bancoCmd(m, jid, text, retirar) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now();
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const origen = retirar? u.banco : u.cartera;
  const uso = retirar? 'Uso: /retirar <monto|all>' : 'Uso: /dep <monto|all>';
  if (!arg) return reply(`${uso}\n👛 Billetera: ${din(u.cartera)}\n🏦 Banco: ${din(u.banco)}`);
  const n = ecoMonto(arg, origen);
  if (!n || n < 1) return reply(origen < 1? (retirar? '🏦 No tenés nada en el banco para retirar.' : '👛 No tenés nada afuera del banco para depositar.') : uso);
  if (n > origen) return reply(`No tenés tanto ${retirar? 'en el banco' : 'en la billetera'}. Tenés ${din(origen)}.`);
  if (retirar) { u.banco -= n; u.cartera += n; } else { u.cartera -= n; u.banco += n; }
  saveEco();
  await reply(`${retirar? '🏧 Retiraste' : '🏦 Depositaste'} ${din(n)}\n\n👛 Billetera: ${din(u.cartera)}\n🏦 Banco: ${din(u.banco)}`);
}

// ----- /bal -----
async function balCmd(m, jid) {
  const t = await ecoObjetivo(m, jid);
  const ids = t? t.ids : await ecoIds(m, jid);
  const yo = ecoGet(jid, await ecoIds(m, jid)); yo.ult = Date.now();
  const u = ecoGet(jid, ids, false) || { cartera: 0, banco: 0 };
  const quien = t? t.jid : (m.key.participant || (m.key.fromMe? `${num(sock.user?.id)}@s.whatsapp.net` : jid));
  await sock.sendMessage(jid, {
    text: `💳 *Balance de @${num(quien)}*\n\n👛 Afuera del banco: ${din(u.cartera)}\n🏦 En el banco: ${din(u.banco)}\n\n> Total: ${din(u.cartera + u.banco)}`,
    mentions: [quien],
  }, { quoted: m });
}
const CMD_ECONOMIA = [
  { test: c => /^\/daily(\s|$)/i.test(c.text), run: c => dailyCmd(c.m, c.jid) },
  { test: c => /^\/(w|work)(\s|$)/i.test(c.text), run: c => accionEco(c.m, c.jid, 'w') },
  { test: c => /^\/(crime|delito)(\s|$)/i.test(c.text), run: c => accionEco(c.m, c.jid, 'crime') },
  { test: c => /^\/minar(\s|$)/i.test(c.text), run: c => accionEco(c.m, c.jid, 'minar') },
  { test: c => /^\/hacking(\s|$)/i.test(c.text), run: c => accionEco(c.m, c.jid, 'hacking') },
  { test: c => /^\/rob(\s|$)/i.test(c.text), run: c => robCmd(c.m, c.jid) },
  { test: c => /^\/(dep|d|deposit|depositar)(\s|$)/i.test(c.text), run: c => bancoCmd(c.m, c.jid, c.text, false) },
  { test: c => /^\/(with|retirar|withdraw)(\s|$)/i.test(c.text), run: c => bancoCmd(c.m, c.jid, c.text, true) },
  { test: c => /^\/(bal|balance)(\s|$)/i.test(c.text), run: c => balCmd(c.m, c.jid) },
];

module.exports = { ACCIONES, ecoMonto };
module.exports.commands = [...CMD_ECONOMIA];
