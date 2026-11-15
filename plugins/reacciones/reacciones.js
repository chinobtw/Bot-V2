// Reacciones (NekosBest): /hug, /cry, etc.
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { rxAprender, rxLimpio, rxNombreDe } = require('../../src/lib/nombres');
const { idsDe, num, senderIds, sleep, sock } = require('../../src/lib/state');
const { execP, ytTieneFfmpeg } = require('../../src/lib/youtube');

// ---------- REACCIONES (API de NekosBest): /hug @usuario, /cry, etc. ----------
// Baja un GIF de nekos.best, lo pasa a mp4 con ffmpeg (así WhatsApp lo muestra como GIF) y lo manda con una frase.
// NekosBest exige un User-Agent con formato "NOMBRE (CONTACTO)" y bloquea los genéricos; se puede cambiar con NEKOS_UA en el .env
const NEKOS_API = 'https://nekos.best/api/v2/';
const NEKOS_UA = process.env.NEKOS_UA || 'Vand4lwBot (https://bot.vand4licc.dpdns.org)';
// Cada reacción: [emoji, tipo, frases principales (10), frases secundarias (3)]
//   tipo 'con':  las principales son para cuando hay a quién dirigirla ({a} le hace algo a {b}); las secundarias, sin nadie
//   tipo 'solo': las principales son para cuando no hay a quién ({a} hace algo); las secundarias, con alguien
// {a} = nombre de quien usa el comando, {b} = nombre de la otra persona (nombres de WhatsApp, sin @)
const L = s => s.split(' | ');
const RX = {
  // ---- cariño y amistad ----
  hug: ['🤗', 'con', L('{a} le dio un abrazo enorme a {b} | {a} abrazó fuerte a {b} | {a} no soltó a {b} en un buen rato | {a} le regaló un abrazo a {b} | {b} recibió un abrazo de oso de parte de {a} | {a} corrió a abrazar a {b} | {a} abrazó a {b} sin avisar | {a} y {b} se fundieron en un abrazo | {a} le dio a {b} el abrazo que necesitaba | {a} apretó a {b} en un abrazo de los buenos'), L('{a} anda buscando a quién abrazar | {a} abraza al aire a ver si alguien se suma | {a} necesita un abrazo urgente')],
  cuddle: ['🫂', 'con', L('{a} se acurrucó con {b} | {a} y {b} se acurrucaron bajo la manta | {a} mimó a {b} toda la tarde | {a} se pegó a {b} para darle calor | {a} arropó a {b} y se acurrucó al lado | {a} se hizo un ovillo junto a {b} | {a} se apoyó en el hombro de {b} para los mimos | {a} acurrucó a {b} con cariño | {a} le hizo mimos a {b} sin parar | {a} se quedó abrazando a {b} un buen rato'), L('{a} se acurruca con una manta | {a} busca a alguien para acurrucarse | {a} pide mimos y una manta')],
  kiss: ['😘', 'con', L('{a} le dio un beso a {b} | {a} besó a {b} de sorpresa | {a} le plantó un beso a {b} | {b} se llevó un beso de parte de {a} | {a} y {b} se dieron un beso | {a} le dejó un beso en la mejilla a {b} | {a} besó a {b} y salió corriendo | {a} le regaló un beso a {b} | {a} no se aguantó y besó a {b} | {a} le dio un beso larguísimo a {b}'), L('{a} le tira besos al aire | {a} busca a quién besar | {a} manda un beso para todos')],
  peck: ['💋', 'con', L('{a} le dio un piquito a {b} | {a} le dio un besito rápido a {b} | {a} le robó un piquito a {b} | {a} le dejó un besito en la mejilla a {b} | {b} recibió un piquito de parte de {a} | {a} le estampó un besito a {b} | {a} le dio un beso fugaz a {b} | {a} le dio un besito a {b} y se escapó | {a} le plantó un piquito a {b} | {a} le dio un besito en la frente a {b}'), L('{a} anda repartiendo besitos | {a} manda un besito al aire | {a} busca a quién darle un piquito')],
  blowkiss: ['😚', 'con', L('{a} le tiró un beso a {b} | {a} le mandó un beso volador a {b} | {a} le sopló un beso a {b} | {b} recibió un beso volador de {a} | {a} le lanzó un besito a {b} | {a} le mandó un beso a {b} desde lejos | {a} le tiró un beso a {b} con una sonrisa | {a} le dedicó un beso a {b} | {a} le sopló un beso a {b} con cariño | {a} le envió un beso por el aire a {b}'), L('{a} tira besos al aire | {a} manda un beso a quien lo quiera | {a} sopla un beso')],
  pat: ['🫳', 'con', L('{a} le hizo cariñitos en la cabeza a {b} | {a} acarició a {b} | {a} le dio palmaditas en la cabeza a {b} | {b} recibió caricias de parte de {a} | {a} despeinó a {b} con cariño | {a} consintió a {b} con unos mimos | {a} le dio un par de caricias a {b} | {a} le acarició la cabeza a {b} | {a} le hizo patpat a {b} | {a} mimó a {b} un ratito'), L('{a} pide caricias | {a} anda necesitando mimos | {a} busca a quién acariciar')],
  handhold: ['🫶', 'con', L('{a} le agarró la mano a {b} | {a} y {b} van de la mano | {a} tomó de la mano a {b} | {a} le dio la mano a {b} y no la soltó | {a} entrelazó los dedos con {b} | {a} caminó de la mano con {b} | {a} le ofreció la mano a {b} | {a} le agarró la mano a {b} con ternura | {a} le apretó la mano a {b} | {a} y {b} se agarraron de la mano'), L('{a} extiende la mano a ver quién la agarra | {a} busca una mano para agarrar | {a} se queda con la mano estirada')],
  lappillow: ['😌', 'con', L('{a} apoyó la cabeza en el regazo de {b} | {a} se acostó en las piernas de {b} | {a} usó de almohada a {b} | {a} descansó en el regazo de {b} | {b} le prestó las piernas de almohada a {a} | {a} se acomodó en las piernas de {b} | {a} se echó una siesta en el regazo de {b} | {a} se recostó en el regazo de {b} y suspiró | {a} le pidió el regazo prestado a {b} | {a} se relajó en el regazo de {b}'), L('{a} busca un regazo para descansar | {a} se acomoda en una almohada | {a} pide un regazo de almohada')],
  carry: ['💪', 'con', L('{a} cargó a {b} en brazos | {a} llevó a {b} a upa | {a} levantó a {b} como si nada | {a} cargó a {b} en la espalda | {a} se llevó a {b} en brazos | {a} alzó a {b} sin esfuerzo | {a} lleva a {b} a caballito | {a} cargó a {b} todo el camino | {a} levantó a {b} y salió caminando | {a} cargó con {b} hasta la meta'), L('{a} carga con todo | {a} lleva el peso de todos | {a} levanta pesas con una mano')],
  feed: ['🍽️', 'con', L('{a} le dio de comer a {b} | {a} le dio la comida en la boca a {b} | {a} alimentó a {b} con cariño | {a} le convidó un bocado a {b} | {b} recibió comida de parte de {a} | {a} le sirvió un plato a {b} | {a} le dio un bocadito a {b} | {a} le preparó algo rico a {b} | {a} le dio de comer a {b} y no quedó nada | {a} le dio una cucharada a {b}'), L('{a} se prepara algo para comer | {a} ofrece comida a quien quiera | {a} cocina para todos')],
  handshake: ['🤝', 'con', L('{a} le dio la mano a {b} | {a} y {b} cerraron el trato con un apretón | {a} le estrechó la mano a {b} | {a} y {b} se dieron un apretón de manos | {a} le sacudió la mano a {b} | {b} aceptó el apretón de {a} | {a} cerró un acuerdo con {b} | {a} saludó a {b} con un apretón de manos | {a} y {b} sellaron la paz con un apretón | {a} le extendió la mano a {b} con respeto'), L('{a} extiende la mano en busca de un trato | {a} practica su apretón de manos | {a} anda cerrando negocios')],
  highfive: ['🙌', 'con', L('{a} chocó los cinco con {b} | {a} y {b} se chocaron los cinco | {a} le chocó la mano a {b} | {a} le dio los cinco a {b} | {a} le pegó un chócala a {b} | {b} recibió un chócala de {a} | {a} festejó con {b} chocando los cinco | {a} y {b} festejaron con un buen choque de manos | {a} le dio los cinco a {b} sin dudar | {a} le chocó los cinco a {b} con fuerza'), L('{a} levanta la mano esperando un chócala | {a} busca a alguien para chocar los cinco | {a} deja la mano arriba y nadie responde')],
  // ---- travesuras ----
  slap: ['👋', 'con', L('{a} le dio una cachetada a {b} | {a} le estampó un sopapo a {b} | {b} se comió una cachetada de {a} | {a} le pegó un bofetón a {b} | {a} le cruzó la cara a {b} | {a} abofeteó a {b} sin piedad | {a} le dejó la cara roja a {b} | {a} le metió un sopapo a {b} | {a} le sacudió una cachetada a {b} | {a} le dio un chirlo a {b}'), L('{a} se da una cachetada para despertar | {a} anda con ganas de dar un sopapo | {a} le pega a la nada')],
  punch: ['👊', 'con', L('{a} le dio una piña a {b} | {a} le metió una trompada a {b} | {b} se comió una piña de {a} | {a} le estampó el puño a {b} | {a} le pegó un puñetazo a {b} | {a} le soltó un derechazo a {b} | {a} noqueó a {b} de un golpe | {a} le dio un golpe directo a {b} | {a} le acomodó una piña a {b} | {a} sacudió a {b} con un puñetazo'), L('{a} golpea el aire | {a} entrena su derecha contra la nada | {a} le pega a una almohada')],
  patada: ['🦵', 'con', L('{a} le dio una patada a {b} | {a} le metió un puntapié a {b} | {b} se comió una patada de {a} | {a} mandó a volar a {b} de una patada | {a} le pegó una patada voladora a {b} | {a} pateó a {b} sin avisar | {a} le encajó una patada a {b} | {a} le dio una patadita a {b} | {a} sacó a {b} a patadas | {a} le acertó una patada a {b}'), L('{a} patea el aire | {a} patea una piedra | {a} anda con ganas de patear algo')],
  bite: ['😬', 'con', L('{a} mordió a {b} | {a} le pegó un mordisco a {b} | {b} recibió un mordisco de {a} | {a} le clavó los dientes a {b} | {a} le dio un mordisquito a {b} | {a} le mordió el brazo a {b} | {a} le dio un mordiscón a {b} | {a} mordisqueó a {b} sin motivo | {a} le dejó los dientes marcados a {b} | {a} atacó a {b} a mordiscones'), L('{a} muerde el aire | {a} anda con ganas de morder a alguien | {a} muerde una almohada')],
  bonk: ['🔨', 'con', L('{a} le dio un bonk a {b} | {a} mandó a {b} a la cárcel del bonk | {a} le pegó un bonk en la cabeza a {b} | {b} se ganó un bonk de {a} | {a} le dio con el martillito a {b} | {a} le hizo bonk a {b} por portarse mal | {a} le dio un golpecito en la cabeza a {b} | {a} bonkeó a {b} sin piedad | {a} le dio un bonk a {b} para que aprenda | {a} bonkeó a {b} y siguió como si nada'), L('{a} bonkea al aire | {a} anda repartiendo bonks | {a} se da un bonk para despertarse')],
  poke: ['👉', 'con', L('{a} le dio un toquecito a {b} | {a} le pinchó la mejilla a {b} | {a} molestó a {b} con un toque | {a} le tocó el hombro a {b} | {a} le hizo cosquillitas con el dedo a {b} | {a} le tocó la cara a {b} para molestar | {a} insiste en tocar a {b} | {a} tocó a {b} una y otra vez | {a} le dio un golpecito a {b} | {a} le tocó la espalda a {b} para llamar su atención'), L('{a} toca el aire | {a} pincha el vacío | {a} anda buscando a quién molestar')],
  tickle: ['🤭', 'con', L('{a} le hizo cosquillas a {b} | {a} atacó a {b} con cosquillas | {b} no puede parar de reír por las cosquillas de {a} | {a} le hizo cosquillas en las costillas a {b} | {a} le hizo cosquillas a {b} sin piedad | {a} le dio un ataque de cosquillas a {b} | {a} hizo reír a {b} con cosquillas | {a} le buscó el punto débil a {b} con cosquillas | {a} le hizo cosquillas a {b} hasta que se rindió | {a} no dejó de hacerle cosquillas a {b}'), L('{a} se ríe de las cosquillas | {a} busca a quién hacerle cosquillas | {a} mueve los dedos con malas intenciones')],
  shoot: ['🔫', 'con', L('{a} le hizo piu piu a {b} | {a} le disparó a {b} con una pistola de agua | {a} le apuntó a {b} con el dedo y gritó bang | {a} le disparó a {b} con una pistolita de juguete | {a} jugó a los vaqueros con {b} | {a} le acertó a {b} con un disparo de mentira | {a} desafió a {b} a un duelo de vaqueros | {a} le tiró un tiro de espuma a {b} | {a} le hizo bang bang a {b} | {a} sacó la pistola de juguete frente a {b}'), L('{a} practica su puntería | {a} juega a los vaqueros | {a} apunta con el dedo a la nada')],
  yeet: ['🚀', 'con', L('{a} lanzó a {b} por los aires | {a} mandó a volar a {b} | {a} revoleó a {b} bien lejos | {a} tiró a {b} a la estratósfera | {b} salió volando por culpa de {a} | {a} despachó a {b} a otra dimensión | {a} yeeteó a {b} | {a} lanzó a {b} como si nada | {a} arrojó a {b} sin culpa | {a} le dio un buen envión a {b} hacia el espacio'), L('{a} lanza algo bien lejos | {a} yeetea lo primero que encuentra | {a} revolea todo por los aires')],
  baka: ['💢', 'con', L('{a} le dijo baka a {b} | {a} le gritó baka a {b} | {b} se ganó un baka de {a} | {a} le dijo tonto a {b} | {a} trató de baka a {b} | {a} le dijo baka a {b} con cariño | {a} le tiró un baka a {b} en la cara | {a} no aguantó y le dijo baka a {b} | {a} le dijo baka baka baka a {b} | {a} le sacó un baka a {b}'), L('{a} grita baka al aire | {a} anda con ganas de decir baka | {a} se enoja y murmura baka')],
  kabedon: ['🧱', 'con', L('{a} arrinconó a {b} contra la pared | {a} acorraló a {b} contra la pared | {a} le hizo un kabedon a {b} | {a} apoyó la mano en la pared junto a {b} | {b} quedó contra la pared por culpa de {a} | {a} le cerró el paso a {b} contra la pared | {a} puso a {b} contra la pared con una mirada | {a} se acercó a {b} y no le dejó salida | {a} le dio un kabedon a {b} con mucha seguridad | {a} le hizo un kabedon a {b} en medio de todos'), L('{a} apoya la mano en la pared con estilo | {a} practica su kabedon | {a} arrincona a la nada contra la pared')],
  tableflip: ['🪑', 'solo', L('{a} dio vuelta la mesa | {a} volcó la mesa con furia | {a} revoleó la mesa | {a} explotó y tiró la mesa | {a} no aguantó más y dio vuelta la mesa | {a} hizo volar la mesa | {a} se enojó tanto que dio vuelta la mesa | {a} patea el tablero | {a} tiró la mesa y se fue | {a} dio vuelta todo, mesa incluida'), L('{a} dio vuelta la mesa por culpa de {b} | {a} volcó la mesa frente a {b} | {a} le revoleó la mesa a {b}')],
  // ---- emociones ----
  happy: ['😄', 'solo', L('{a} está feliz | {a} está desbordante de alegría | {a} sonríe de oreja a oreja | {a} salta de alegría | {a} anda con una sonrisa enorme | {a} está de mil maravillas | {a} está en las nubes de felicidad | {a} está radiante de alegría | {a} no puede contener la felicidad | {a} está de buen humor hoy'), L('{a} está feliz con {b} | {a} se alegra de ver a {b} | {b} puso feliz a {a}')],
  smile: ['😊', 'solo', L('{a} sonríe | {a} sonrió con ternura | {a} tiene una sonrisa enorme | {a} sonríe de oreja a oreja | {a} sonrió para la foto | {a} sonríe sin motivo | {a} no puede dejar de sonreír | {a} sonríe con ganas | {a} regala una sonrisa | {a} le pone buena cara al día'), L('{a} le sonrió a {b} | {a} le regaló una sonrisa a {b} | {a} no puede dejar de sonreírle a {b}')],
  laugh: ['😂', 'solo', L('{a} se ríe a carcajadas | {a} no puede parar de reír | {a} se muere de risa | {a} se desternilla de risa | {a} lloró de la risa | {a} soltó una carcajada | {a} se rió fuerte | {a} tiene un ataque de risa | {a} se agarra la panza de tanto reír | {a} se ríe hasta que le duele'), L('{a} se ríe de {b} | {a} se rió a carcajadas con {b} | {b} hizo reír a {a}')],
  teehee: ['🤭', 'solo', L('{a} se ríe por lo bajo | {a} suelta una risita pícara | {a} se tapa la boca para reír | {a} se ríe con picardía | {a} hizo una travesura y se ríe | {a} suelta una risita traviesa | {a} se ríe como quien hizo algo | {a} contiene la risa y no puede | {a} se ríe con cara de travesura | {a} hace teehee'), L('{a} se ríe con picardía frente a {b} | {a} le hizo una travesura a {b} y se ríe | {a} suelta una risita por culpa de {b}')],
  cry: ['😭', 'solo', L('{a} se largó a llorar | {a} llora a mares | {a} lloró sin consuelo | {a} sollozó en silencio | {a} se secó las lágrimas | {a} lloró como una Magdalena | {a} no puede parar de llorar | {a} tiene los ojos llenos de lágrimas | {a} se puso a llorar de repente | {a} se quebró y lloró'), L('{a} lloró en el hombro de {b} | {a} se largó a llorar por {b} | {b} hizo llorar a {a}')],
  angry: ['😠', 'solo', L('{a} está que arde de furia | {a} se enojó en serio | {a} explotó de bronca | {a} puso cara de pocos amigos | {a} anda con un humor de perros | {a} tiene la sangre en ebullición | {a} se enfureció | {a} refunfuña y nadie se le acerca | {a} está echando humo | {a} no está para bromas hoy'), L('{a} se enojó con {b} | {a} le puso mala cara a {b} | {a} explotó de bronca con {b}')],
  pout: ['😒', 'solo', L('{a} hace pucheros | {a} infla los cachetes | {a} se ofendió y se cruzó de brazos | {a} puso cara de enojo | {a} está de mal humor | {a} frunce el ceño y hace puchero | {a} se quedó con la cara larga | {a} protesta con un puchero | {a} se fue con la cara larga | {a} se enojó y no habla'), L('{a} le hace pucheros a {b} | {a} se ofendió con {b} | {a} no le habla a {b}')],
  blush: ['😳', 'solo', L('{a} se sonrojó | {a} no puede ocultar su sonrojo | {a} tiene las mejillas coloradas | {a} se ruborizó | {a} se tapó la cara de vergüenza | {a} se derritió de la vergüenza | {a} no sabe dónde meterse | {a} hace como que no pasa nada, pero se le nota | {a} sonríe con las mejillas rojas | {a} quedó con la cara como un tomate'), L('{a} se sonrojó por {b} | {a} se ruborizó al ver a {b} | {a} no puede mirar a {b} sin sonrojarse')],
  bored: ['🥱', 'solo', L('{a} se aburre | {a} se aburre como una ostra | {a} bosteza del aburrimiento | {a} mira el techo sin nada que hacer | {a} cuenta las moscas | {a} no tiene nada para hacer | {a} se muere del aburrimiento | {a} busca algo para hacer y no encuentra | {a} pone cara de aburrimiento total | {a} necesita un poco de acción'), L('{a} se aburre con {b} | {a} mira a {b} con cara de aburrimiento | {a} bosteza mientras habla {b}')],
  yawn: ['🥱', 'solo', L('{a} bostezó | {a} soltó un bostezo | {a} bosteza sin parar | {a} tiene sueño | {a} bosteza de cansancio | {a} bosteza con la boca bien abierta | {a} se estira y bosteza | {a} no aguanta el sueño | {a} bosteza y se frota los ojos | {a} se está durmiendo en el chat'), L('{a} bostezó frente a {b} | {a} bosteza mientras habla {b} | {a} se contagió el bostezo de {b}')],
  sleep: ['😴', 'solo', L('{a} se durmió | {a} duerme profundamente | {a} cayó en la cama y se durmió | {a} ronca como un angelito | {a} se fue a dormir | {a} se durmió en el acto | {a} duerme a pata suelta | {a} cerró los ojos y se durmió | {a} se echa una siestita | {a} descansa plácidamente'), L('{a} se durmió sobre {b} | {a} duerme al lado de {b} | {a} se durmió escuchando a {b}')],
  shocked: ['😱', 'solo', L('{a} quedó en shock | {a} no lo puede creer | {a} abrió los ojos como platos | {a} se quedó con la boca abierta | {a} no sabe qué decir | {a} se llevó las manos a la cara del susto | {a} se quedó sin palabras | {a} casi se cae de espaldas | {a} no da crédito a lo que ve | {a} se asustó muchísimo'), L('{a} quedó en shock por lo que hizo {b} | {a} no puede creer lo que dijo {b} | {b} dejó a {a} sin palabras')],
  confused: ['😕', 'solo', L('{a} no entiende nada | {a} no se ubica | {a} se rasca la cabeza sin entender | {a} puso cara de signo de pregunta | {a} no sabe qué está pasando | {a} se quedó pensando qué pasó | {a} frunce el ceño sin entender | {a} dice: ¿qué? | {a} pide que le expliquen de nuevo | {a} mira a todos lados sin entender'), L('{a} no entiende a {b} | {a} se confundió con lo que dijo {b} | {b} dejó a {a} con cara de signo de pregunta')],
  think: ['🤔', 'solo', L('{a} está pensando | {a} piensa a full | {a} se puso a pensar | {a} se rasca la cabeza pensando | {a} analiza la situación | {a} medita la respuesta | {a} le da vueltas al asunto | {a} tiene la cabeza a mil | {a} se concentra para pensar | {a} piensa algo pero no dice qué'), L('{a} piensa en {b} | {a} analiza lo que dijo {b} | {a} no sabe qué pensar de {b}')],
  smug: ['😏', 'solo', L('{a} puso cara de suficiencia | {a} sonríe con aire de superioridad | {a} se la cree | {a} presume con una sonrisa | {a} mira desde arriba | {a} se siente en la cima del mundo | {a} tiene cara de que ganó | {a} sonríe con picardía | {a} tiene aires de grandeza | {a} levantó una ceja con arrogancia'), L('{a} le puso cara de superioridad a {b} | {a} presume frente a {b} | {a} le sonríe con soberbia a {b}')],
  // ---- gestos y acciones ----
  wave: ['👋', 'solo', L('{a} saluda | {a} saluda con la mano | {a} se despide con la mano | {a} levanta la mano para saludar | {a} saluda a todos | {a} dice hola con la mano | {a} agita la mano | {a} saluda desde lejos | {a} manda un saludo | {a} dice chau con la mano'), L('{a} saludó a {b} | {a} le hizo adiós a {b} | {a} le manda un saludo a {b}')],
  wink: ['😉', 'solo', L('{a} guiña el ojo | {a} hizo un guiño | {a} guiñó con picardía | {a} tira un guiño | {a} guiñó el ojo y sonrió | {a} le guiña el ojo a la cámara | {a} hace un guiño cómplice | {a} soltó un guiño pícaro | {a} guiñó con gracia | {a} mandó un guiño'), L('{a} le guiñó el ojo a {b} | {a} le hizo un guiño a {b} | {a} le tiró un guiño a {b}')],
  nod: ['👍', 'solo', L('{a} asiente con la cabeza | {a} dice que sí moviendo la cabeza | {a} asiente sin decir nada | {a} asintió con firmeza | {a} da el visto bueno | {a} afirma con la cabeza | {a} está de acuerdo | {a} aprueba con un gesto | {a} mueve la cabeza en señal de acuerdo | {a} acepta con un movimiento de cabeza'), L('{a} asiente a lo que dice {b} | {a} está de acuerdo con {b} | {a} le da la razón a {b}')],
  nope: ['🙅', 'solo', L('{a} dijo que no | {a} se negó rotundamente | {a} niega con la cabeza | {a} huye de la idea | {a} ni lo piensa | {a} dijo nop | {a} rechazó la idea | {a} dice que ni loco | {a} se baja de la conversación | {a} se va diciendo nope'), L('{a} le dijo que no a {b} | {a} rechazó a {b} | {a} le hizo un nope a {b}')],
  shrug: ['🤷', 'solo', L('{a} se encogió de hombros | {a} no sabe ni le importa | {a} levanta los hombros | {a} dice: qué sé yo | {a} se encoge de hombros con indiferencia | {a} hace un gesto de ni idea | {a} no tiene ni idea | {a} mira para otro lado | {a} no se mete | {a} no opina'), L('{a} se encogió de hombros ante {b} | {a} no sabe qué decirle a {b} | {a} ignora a {b} encogiéndose de hombros')],
  thumbsup: ['👍', 'solo', L('{a} levantó el pulgar | {a} aprueba con el pulgar | {a} da el visto bueno con el pulgar | {a} dice que está todo bien | {a} hace like | {a} da un pulgar arriba | {a} lo aprueba | {a} muestra el pulgar | {a} da su aprobación | {a} dice todo en orden'), L('{a} le dio un pulgar arriba a {b} | {a} aprueba lo de {b} | {a} le dio el visto bueno a {b}')],
  clap: ['👏', 'solo', L('{a} aplaude | {a} aplaudió con ganas | {a} se levantó a aplaudir | {a} aplaude de pie | {a} da una ovación | {a} aplaude a todos | {a} aplaude fuerte | {a} no para de aplaudir | {a} aplaude con emoción | {a} festeja con aplausos'), L('{a} aplaude a {b} | {a} le dio un aplauso a {b} | {a} ovaciona a {b}')],
  salute: ['🫡', 'solo', L('{a} hace la venia | {a} saluda como militar | {a} se cuadra y saluda | {a} saluda con respeto | {a} se pone firme | {a} hace un saludo militar | {a} saluda con la mano en la frente | {a} se cuadra con seriedad | {a} da el saludo de honor | {a} presenta sus respetos'), L('{a} le hizo la venia a {b} | {a} saluda a {b} con respeto | {a} se cuadró frente a {b}')],
  facepalm: ['🤦', 'solo', L('{a} se tapó la cara con la mano | {a} se pegó una palmada en la frente | {a} no puede creer lo que lee | {a} se agarró la cabeza | {a} suspiró y se tapó la cara | {a} hizo facepalm | {a} sufre vergüenza ajena | {a} se tapó la cara de la vergüenza ajena | {a} se agarró la frente con resignación | {a} escondió la cara entre las manos'), L('{a} se hizo un facepalm por culpa de {b} | {a} no puede creer lo que hizo {b} | {a} sufre vergüenza ajena por {b}')],
  stare: ['👁️', 'solo', L('{a} mira fijo | {a} clava la mirada | {a} mira sin parpadear | {a} se queda mirando | {a} observa fijamente | {a} mira en silencio | {a} no despega la vista | {a} se queda con la vista perdida | {a} mira con cara de nada | {a} tiene la mirada clavada'), L('{a} miró fijo a {b} | {a} le clavó la mirada a {b} | {a} no le saca los ojos de encima a {b}')],
  lurk: ['👀', 'solo', L('{a} anda espiando | {a} mira desde las sombras | {a} se asoma sin decir nada | {a} observa en silencio | {a} está al acecho | {a} espía el chat | {a} lee todo y no dice nada | {a} se esconde y mira | {a} vigila desde lejos | {a} aparece de la nada y mira'), L('{a} espía a {b} | {a} mira a {b} desde las sombras | {a} sigue a {b} sin que se dé cuenta')],
  run: ['🏃', 'solo', L('{a} salió corriendo | {a} corre por su vida | {a} se fue a toda velocidad | {a} escapa como si lo persiguieran | {a} corrió sin mirar atrás | {a} se fue volando | {a} salió disparando | {a} huye a toda velocidad | {a} corre lo más rápido que puede | {a} desapareció a las corridas'), L('{a} corre de {b} | {a} huye de {b} | {a} sale corriendo detrás de {b}')],
  dance: ['💃', 'solo', L('{a} se puso a bailar | {a} mueve el esqueleto | {a} baila como si nadie mirara | {a} se mandó un pasito de baile | {a} armó la pista de baile | {a} baila con todo | {a} saca sus mejores pasos | {a} no puede dejar de bailar | {a} se lució en la pista | {a} baila al ritmo de la música'), L('{a} bailó con {b} | {a} sacó a bailar a {b} | {a} y {b} se pusieron a bailar')],
  spin: ['🌀', 'solo', L('{a} da vueltas | {a} gira como un trompo | {a} se pone a girar | {a} da una vuelta completa | {a} gira sin parar | {a} hace un giro con estilo | {a} se marea de tanto girar | {a} da vueltas y vueltas | {a} gira y gira | {a} se lució con un giro'), L('{a} giró junto a {b} | {a} hizo girar a {b} | {a} y {b} dan vueltas juntos')],
  sip: ['☕', 'solo', L('{a} toma un sorbo | {a} se toma un tecito | {a} toma un traguito | {a} se toma un cafecito tranquilo | {a} sorbe en silencio | {a} se sirve algo calentito | {a} bebe con calma | {a} toma su bebida y mira | {a} disfruta de un sorbo | {a} toma un sorbito mientras mira el chat'), L('{a} toma algo con {b} | {a} tomó un sorbo mirando a {b} | {a} invita a {b} a tomar algo')],
  nom: ['😋', 'solo', L('{a} come feliz | {a} se manda un bocado | {a} come sin parar | {a} devora todo lo que ve | {a} se zampa algo rico | {a} hace nom nom | {a} muerde con ganas | {a} se atraganta de tanto comer | {a} disfruta de su comida | {a} no deja nada en el plato'), L('{a} le robó un bocado a {b} | {a} comió del plato de {b} | {a} no le dejó nada a {b}')],
  nya: ['🐱', 'solo', L('{a} hace nya | {a} maúlla nya | {a} se pone modo gatito | {a} dice nya con ternura | {a} hizo nya con las manitos | {a} se transformó en gatito | {a} ronronea nya | {a} suelta un nya adorable | {a} hace garritas y dice nya | {a} anda con ganas de maullar'), L('{a} le hizo nya a {b} | {a} le maulló a {b} | {a} se acurrucó como gatito junto a {b}')],
  wag: ['🐶', 'solo', L('{a} mueve la colita | {a} mueve la cola de la emoción | {a} está tan feliz que mueve la cola | {a} menea la colita | {a} mueve la cola sin parar | {a} se emociona y mueve la cola | {a} mueve la cola con alegría | {a} anda moviendo la colita | {a} no puede parar de mover la cola | {a} menea la cola como un perrito'), L('{a} le mueve la cola a {b} | {a} menea la colita al ver a {b} | {a} mueve la cola de la emoción por {b}')],
  bleh: ['😛', 'solo', L('{a} sacó la lengua | {a} hace bleh | {a} saca la lengua con picardía | {a} le saca la lengua al mundo | {a} hizo una mueca graciosa | {a} saca la lengua y se ríe | {a} dice bleh | {a} hace una mueca de disgusto | {a} saca la lengua sin vergüenza | {a} hizo bleh con la lengua afuera'), L('{a} le sacó la lengua a {b} | {a} le hizo bleh a {b} | {a} le hizo una mueca a {b}')],
  shake: ['🫨', 'solo', L('{a} se sacude | {a} tiembla | {a} se sacude de arriba abajo | {a} se estremece | {a} sacude todo | {a} se sacude el polvo | {a} no para de moverse | {a} se sacude de los nervios | {a} tiembla de pies a cabeza | {a} se menea sin parar'), L('{a} sacudió a {b} | {a} sacude a {b} para que reaccione | {a} le dio una sacudida a {b}')],
};
const RX_CAT = { patada: 'kick' };   // /patada usa la categoría kick de NekosBest (/kick ahora expulsa del grupo)
const RX_RE = new RegExp('^\\/(' + Object.keys(RX).join('|') + ')(\\s|$)', 'i');
// a quién va dirigida la reacción (mención o mensaje citado). Si ya conocemos el nombre NO consulta el grupo (más rápido)
async function rxObjetivo(m, jid) {
  const ctx = Object.values(m.message || {}).map(v => v?.contextInfo).find(Boolean);
  const t = ctx?.mentionedJid?.[0] || ctx?.participant;
  if (!t) return null;
  let ids = [num(t)], mj = t, nombre = rxNombreDe(ids);
  if (!nombre && jid.endsWith('@g.us')) {
    const meta = await Promise.race([sock.groupMetadata(jid), sleep(4000).then(() => null)]).catch(() => null);
    const p = meta?.participants?.find(p => idsDe(p).includes(num(t)));
    if (p) {
      ids = [...new Set([...ids, ...idsDe(p)])]; mj = p.id || t;
      if (p.notify) rxAprender(ids, p.notify);
      nombre = rxNombreDe(ids);
    }
  }
  return { ids, jid: mj, nombre };
}
// una conversión por vez (el hosting tiene poca RAM)
let rxCola = Promise.resolve(), rxEnCurso = 0;
const rxTurno = fn => { const p = rxCola.then(fn); rxCola = p.catch(() => {}); return p; };
async function rxMp4(gif) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rx-'));
  try {
    const i = path.join(dir, 'in.gif'), o = path.join(dir, 'out.mp4');
    fs.writeFileSync(i, gif);
    await execP('ffmpeg', ['-y', '-v', 'error', '-i', i, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-threads', '1', '-an', o], { timeout: 60000 });
    return fs.readFileSync(o);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
async function rxBajarGif(nombre) {
  const r = await axios.get(NEKOS_API + (RX_CAT[nombre] || nombre), { headers: { 'User-Agent': NEKOS_UA }, timeout: 15000 });
  const url = r.data?.results?.[0]?.url;
  if (!/^https:\/\//.test(url || '')) throw new Error('la API no devolvió un GIF');
  return Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 20 * 1024 * 1024, headers: { 'User-Agent': NEKOS_UA } })).data);
}
async function rxCmd(m, jid, text) {
  const nombre = ((text.match(/^\/(\w+)/) || [])[1] || '').toLowerCase();
  const def = RX[nombre]; if (!def) return;
  const [emoji, tipo, prim, sec] = def;
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!(await ytTieneFfmpeg())) { console.error('[reaccion] el host no tiene ffmpeg'); return reply('❌ No pude mandar la reacción ahora. Probá más tarde'); }
  if (rxEnCurso >= 5) return reply('⏳ Hay muchas reacciones en cola, probá de nuevo en un momento');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  rxEnCurso++;
  reaccion('⏳');                                  // sin esperar: no frena el resto
  try {
    const gifP = rxBajarGif(nombre); gifP.catch(() => {});   // el GIF se baja mientras se resuelve a quién va
    const obj = await rxObjetivo(m, jid).catch(() => null);
    const yo = senderIds(m, jid);
    const conObj = !!obj &&!obj.ids.some(x => yo.includes(x));   // si sos vos mismo, cuenta como sin nadie
    const menciones = [];
    // si no se conoce el nombre, se arroba (mención real)
    let a = rxLimpio(m.pushName) || rxNombreDe(yo);
    if (!a) { const sj = m.key.participant || m.key.remoteJid || jid; a = '@' + num(sj); menciones.push(sj); }
    let b = '';
    if (conObj) {
      b = obj.nombre;
      if (!b) { b = '@' + num(obj.jid); menciones.push(obj.jid); }
    }
    const lista = conObj? (tipo === 'con'? prim : sec) : (tipo === 'con'? sec : prim);
    const frase = lista[Math.floor(Math.random() * lista.length)].replaceAll('{a}', a).replaceAll('{b}', b);
    const gif = await gifP;
    const mp4 = await rxTurno(() => rxMp4(gif));
    const msg = { video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption: `${frase} ${emoji}` };
    if (menciones.length) msg.mentions = [...new Set(menciones)];
    await sock.sendMessage(jid, msg, { quoted: m });
  } catch (e) {
    console.error('[reaccion]', nombre, e.message);
    const st = e.response?.status;
    await reply(st === 429? '⏳ Hay muchas consultas ahora. Probá en un rato'
      : st === 404? '❌ Esa reacción no está disponible ahora'
      : /ffmpeg/i.test(e.message + (e.stderr || ''))? '❌ No pude mandar la reacción. Probá de nuevo en un rato'
      : '❌ No pude mandar la reacción. Probá de nuevo en un rato');
  } finally { rxEnCurso--; reaccion(''); }
}
const CMD_RX = [{ test: c => RX_RE.test(c.text), run: c => rxCmd(c.m, c.jid, c.text) }];

module.exports = { NEKOS_UA, rxMp4, rxObjetivo, rxTurno };
module.exports.commands = [...CMD_RX];
