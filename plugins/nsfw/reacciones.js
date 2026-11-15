// Reacciones NSFW
const axios = require('axios');
const { NEKOS_UA, rxMp4, rxObjetivo, rxTurno } = require('../reacciones/reacciones');
const { nsfwOn } = require('../../src/db/nsfw');
const { rxLimpio, rxNombreDe } = require('../../src/lib/nombres');
const { num, senderIds, sock } = require('../../src/lib/state');
const { ytTieneFfmpeg } = require('../../src/lib/youtube');

// ---------- REACCIONES NSFW (PurrBot, NekoBot, NekosAPI y Nekosia): /nsfwneko, /nsfwhentai, etc. ----------
// Cada comando prueba sus fuentes en orden: si una API está caída, no tiene el tag o ratea, se saltea y sigue con la siguiente.
// La última fuente de cada comando está verificada, así que nunca queda en banda. Los GIF se pasan a mp4 con ffmpeg.
// Solo responden si los NSFW están activados en el chat (en el privado siempre; en grupos con /nsfw on).
const NSFW_UA = process.env.NSFW_UA || NEKOS_UA;
const NSFW_REF = process.env.NSFW_REF || '';   // si algún CDN exige otro Referer, se fuerza acá
// las bases se pueden cambiar por .env si algún día cambian de dominio
const NX_BASES = {
  purr:    { url: process.env.PURRBOT_URL || 'https://api.purrbot.site/v2/img/nsfw/', campo: 'link' },
  neko:    { url: process.env.NEKOBOT_URL || 'https://nekobot.xyz/api/image?type=', campo: 'message' },
  nekoapi: { url: process.env.NEKOSAPI_URL || 'https://api.nekosapi.com/v4/images/random?limit=1&rating=explicit&tags=', campo: '[0].url' },
  nekosia: { url: process.env.NEKOSIA_URL || 'https://api.nekosia.cat/api/v1/images/', campo: 'image.original.url', sufijo: '?rating=suggestive' },
};
const NL = s => s.split(' | ');
// [emoji, frases con alguien, frases sin nadie, fuentes en orden]
const NX = {
  // ---- sugerente ----
  nsfwneko: ['🐱', NL('{a} le muestra un neko bien puesto a {b} | {a} le pasó un neko a {b} para que se ponga mal'), NL('{a} se puso en modo pervertido con un neko | {a} encontró un neko que no deja nada a la imaginación | {a} y su debilidad por los nekos'), ['neko:neko', 'purr:neko', 'nekosia:catgirl']],
  nsfwwaifu: ['🌸', NL('{a} le dedicó una waifu a {b} | {a} le mostró a {b} la waifu que le gustaría tener'), NL('{a} está mirando waifus | {a} se quedó babeando con una waifu | {a} dice que esta waifu es la número uno'), ['nekosia:girl', 'nekoapi:exposed_girl_breasts']],
  nsfwtrap: ['🍭', NL('{a} le mostró un trap a {b} | {a} le presentó un trap a {b} y le movió el piso'), NL('{a} cayó en la trampa otra vez | {a} dice que los traps son un camino de ida | {a} anda confundido con este trap'), ['nekoapi:futanari', 'nekoapi:kemonomimi', 'nekosia:girl']],
  nsfwecchi: ['😳', NL('{a} le mandó una ecchi a {b} | {a} le tiró una imagen sugerente a {b}'), NL('{a} se puso a ver ecchi | {a} anda con la cara colorada | {a} dice que esto es arte, pero se le nota la mentira'), ['nekosia:w-sitting', 'nekoapi:exposed_girl_breasts']],
  nsfwero: ['🔥', NL('{a} le mandó una ero a {b} | {a} le dejó una ero a {b} para que se entretenga'), NL('{a} entró en modo ero | {a} está que arde con esta imagen | {a} dice que mirar esto cuenta como hacer ejercicio'), ['nekoapi:exposed_girl_breasts', 'nekosia:girl']],
  nsfwsolo: ['💃', NL('{a} le dedicó una pose a {b} | {a} le mandó a {b} una imagen de esas que no se miran en público'), NL('{a} se quedó en bolas, metafóricamente | {a} está posando para la cámara | {a} se puso en modo solo y sin testigos'), ['purr:solo', 'purr:neko']],
  nsfwboobs: ['🍈', NL('{a} le muestra unas boobs a {b} | {a} le tira las boobs en la cara a {b}'), NL('{a} se quedó mirando fijo | {a} dice que esto es lo mejor que le pasó hoy | {a} necesita un momento a solas'), ['neko:hboobs', 'nekoapi:large_breasts', 'nekosia:girl']],
  nsfwhboobs: ['🍒', NL('{a} le pasó unas hboobs a {b} | {a} le mostró a {b} de qué se está perdiendo'), NL('{a} anda mirando hboobs | {a} no puede con su alma | {a} dice que ya está, que se rinde'), ['neko:hboobs', 'nekoapi:large_breasts']],
  nsfwoppai: ['🍼', NL('{a} le mandó unos oppai a {b} | {a} le dedicó a {b} un par de oppai'), NL('{a} entró a la sección oppai y no salió más | {a} se quedó sin palabras | {a} dice que los oppai son su religión'), ['nekoapi:large_breasts', 'neko:hboobs']],
  nsfwass: ['🍑', NL('{a} le muestra el culo a {b} | {a} le tiró un culo a la cara a {b}'), NL('{a} se dio vuelta para mostrar el culo | {a} dice que el culo es lo primero | {a} se quedó mirando culos'), ['neko:ass', 'nekoapi:ass', 'nekosia:girl']],
  nsfwthighs: ['🦵', NL('{a} le muestra los muslos a {b} | {a} le dedica sus muslos a {b}'), NL('{a} anda mirando muslos | {a} dice que los muslos son lo más subestimado | {a} se derritió con estos muslos'), ['neko:hthigh', 'nekosia:thigh-high-socks']],
  nsfwhthigh: ['🍗', NL('{a} le pasa unos hthigh a {b} | {a} le muestra a {b} unos muslos de otro nivel'), NL('{a} anda en la sección de muslos | {a} dice que así sí vale la pena | {a} se quedó con la boca abierta'), ['neko:hthigh', 'nekosia:thigh-high-socks']],
  nsfwhips: ['🍑', NL('{a} le muestra las caderas a {b} | {a} le dedica a {b} unas caderas peligrosas'), NL('{a} anda mirando caderas | {a} se quedó trabado en esta imagen | {a} dice que las caderas no fallan'), ['neko:hmidriff', 'nekoapi:exposed_girl_breasts']],
  nsfwhmidriff: ['👗', NL('{a} le mostró la panza a {b} | {a} le dedicó a {b} una foto con la panza al aire'), NL('{a} anda mostrando la panza | {a} dice que la panza es lo más lindo | {a} se quedó mirando ombligos'), ['neko:hmidriff', 'nekosia:girl']],
  nsfwfoxgirl: ['🦊', NL('{a} le presentó una foxgirl a {b} | {a} le pasó una foxgirl a {b} y le movió el piso'), NL('{a} entró al bosque de las foxgirls | {a} dice que las foxgirls son otro nivel | {a} se quedó con la cola entre las patas'), ['nekosia:foxgirl', 'nekosia:animal-ears', 'neko:kemonomimi']],
  nsfwuniform: ['🎽', NL('{a} le mostró a {b} un uniforme bien puesto | {a} le dedicó un uniforme a {b}'), NL('{a} anda mirando uniformes | {a} dice que el uniforme hace la diferencia | {a} se quedó mirando'), ['nekosia:uniform', 'nekosia:sailor-uniform']],
  nsfwschool: ['🎒', NL('{a} le mostró a {b} una de la escuela | {a} le pasó a {b} una del colegio'), NL('{a} se quedó en la escuela | {a} dice que ahí sí aprendía | {a} anda con ganas de repetir año'), ['nekosia:sailor-uniform', 'nekosia:uniform']],
  nsfwmaid: ['🧹', NL('{a} le presentó una maid a {b} | {a} le mandó a {b} una maid para que le ordene la vida'), NL('{a} se consiguió una maid | {a} dice que así da gusto que limpien | {a} se quedó mirando la escoba'), ['nekosia:maid', 'nekoapi:maid']],
  nsfwnurse: ['💉', NL('{a} le mandó una enfermera a {b} | {a} le presentó a {b} la enfermera de sus sueños'), NL('{a} dice que le duele todo y necesita una enfermera | {a} anda mirando enfermeras | {a} se quedó esperando el turno'), ['nekoapi:nurse', 'nekosia:uniform']],
  nsfwglasses: ['🤓', NL('{a} le mostró a {b} una con anteojos | {a} le dedicó a {b} una de lentes'), NL('{a} dice que los anteojos son su debilidad | {a} anda mirando gente con lentes | {a} se quedó embobado'), ['nekoapi:glasses', 'nekosia:girl']],
  nsfwstockings: ['🧦', NL('{a} le mostró unas medias a {b} | {a} le dedicó a {b} unas medias de esas'), NL('{a} anda mirando medias | {a} dice que las medias lo matan | {a} se quedó mirando piernas'), ['nekosia:thigh-high-socks', 'nekosia:black-tights']],
  nsfwtights: ['🧵', NL('{a} le mostró unas tights a {b} | {a} le dedicó a {b} unas de esas ajustadas'), NL('{a} anda mirando tights | {a} dice que las tights no perdonan | {a} se quedó mirando piernas'), ['nekosia:white-tights', 'nekosia:black-tights']],
  nsfwzettai: ['🎀', NL('{a} le mostró a {b} un zettai ryouiki | {a} le dedicó a {b} ese espacio entre la falda y la media'), NL('{a} dice que ese espacio es sagrado | {a} anda mirando zettai ryouiki | {a} se quedó sin aire'), ['nekosia:thigh-high-socks', 'nekosia:knee-high-socks']],
  nsfwpanties: ['🩲', NL('{a} le mostró la bombacha a {b} | {a} le dedicó a {b} una foto de esas'), NL('{a} anda mostrando la ropa interior | {a} dice que esto ya es de más | {a} se quedó mirando'), ['nekoapi:panties', 'nekosia:white-tights', 'nekosia:girl']],
  nsfwfeet: ['🦶', NL('{a} le mostró los pies a {b} | {a} le dedicó a {b} una foto de pies'), NL('{a} anda mirando pies | {a} dice que los pies son lo más | {a} se quedó en la sección de pies'), ['neko:feet', 'nekosia:girl']],
  nsfwkemonomimi: ['🐾', NL('{a} le mostró a {b} una kemonomimi | {a} le presentó a {b} una de orejitas'), NL('{a} se quedó con las orejitas | {a} dice que las kemonomimi son lo más tierno | {a} anda mirando orejas'), ['neko:kemonomimi', 'nekosia:animal-ears']],
  nsfwhanalia: ['🌺', NL('{a} le mostró a {b} una hanalia | {a} le pasó a {b} una hanalia y la dejó pensando'), NL('{a} entró en la sección hanalia | {a} se quedó mirando | {a} dice que así sí vale la pena'), ['nekoapi:exposed_girl_breasts', 'nekosia:girl']],
  nsfwhasshaku: ['🐰', NL('{a} le mandó una hasshaku a {b} | {a} le mostró a {b} a la conejita'), NL('{a} se quedó con la conejita | {a} dice que los conejos no son tan inocentes | {a} anda mirando conejitas'), ['nekosia:animal-ears', 'neko:kemonomimi']],
  nsfwhneko: ['😻', NL('{a} le mostró un hneko a {b} | {a} le pasó a {b} un hneko y la dejó sin palabras'), NL('{a} entró en modo hneko | {a} se quedó mirando | {a} dice que los nekos son su perdición'), ['neko:hneko', 'neko:neko']],
  nsfwhololewd: ['🌟', NL('{a} le mostró a {b} una de Holo | {a} le dedicó a {b} una hololewd'), NL('{a} anda mirando a Holo | {a} dice que la loba no se discute | {a} se quedó babeando'), ['nekosia:wolfgirl', 'nekoapi:exposed_girl_breasts']],
  nsfwlewdk: ['🐈', NL('{a} le mostró a {b} una lewdk | {a} le pasó a {b} una de gatita'), NL('{a} anda mirando gatitas | {a} se quedó con la colita | {a} dice que los gatos son otro nivel'), ['neko:neko', 'nekoapi:catgirl']],
  nsfwlewdkemo: ['🐾', NL('{a} le mostró a {b} una lewdkemo | {a} le dedicó a {b} una de orejitas'), NL('{a} anda mirando kemono | {a} se quedó mirando orejitas | {a} dice que esto es demasiado tierno'), ['neko:kemonomimi', 'nekosia:animal-ears']],
  nsfwngif: ['🎞️', NL('{a} le mandó un gif a {b} | {a} le tiró un gif a {b} para que se entretenga'), NL('{a} se puso a mirar gifs | {a} no puede parar de mirar | {a} se quedó en loop'), ['purr:neko', 'purr:fuck']],
  nsfw4k: ['📺', NL('{a} le mostró a {b} una en 4K | {a} le dedicó a {b} una de altísima calidad'), NL('{a} dice que en 4K se ve todo | {a} se quedó mirando la calidad | {a} anda en la sección 4K'), ['neko:4k', 'nekosia:girl']],
  // ---- explícito ----
  nsfwhentai: ['📖', NL('{a} le mandó un hentai a {b} | {a} le dedicó a {b} una página de hentai'), NL('{a} entró en modo hentai | {a} se quedó leyendo | {a} dice que el hentai es cultura'), ['purr:neko', 'nekoapi:exposed_girl_breasts']],
  nsfwahegao: ['🤤', NL('{a} le mostró una cara de ahegao a {b} | {a} le mandó a {b} un ahegao'), NL('{a} se quedó con la boca abierta | {a} anda mirando ahegaos | {a} dice que esa cara no se olvida'), ['nekoapi:ahegao', 'nekoapi:exposed_girl_breasts']],
  nsfwpaizuri: ['🍈', NL('{a} le mostró un paizuri a {b} | {a} le dedicó a {b} un paizuri'), NL('{a} anda mirando paizuri | {a} dice que así se ve todo mejor | {a} se quedó sin palabras'), ['neko:paizuri', 'nekoapi:paizuri', 'nekoapi:large_breasts']],
  nsfwblowjob: ['💦', NL('{a} le mostró un blowjob a {b} | {a} le dedicó a {b} un oral de esos'), NL('{a} anda mirando orales | {a} se quedó con la boca abierta | {a} dice que esto ya es demasiado'), ['purr:blowjob', 'purr:neko']],
  nsfworalsex: ['👄', NL('{a} le mandó un oral a {b} | {a} le dedicó a {b} una buena mamada'), NL('{a} se quedó mirando | {a} anda con ganas | {a} dice que esto es su debilidad'), ['purr:blowjob', 'purr:pussylick']],
  nsfwpussy: ['🐚', NL('{a} le mostró la concha a {b} | {a} le dedicó a {b} una foto de esas'), NL('{a} se quedó mirando | {a} anda en la sección concha | {a} dice que esto no deja nada a la imaginación'), ['nekoapi:pussy', 'purr:neko']],
  nsfwpussywank: ['✊', NL('{a} le mostró a {b} una paja | {a} le dedicó a {b} un gif de esos'), NL('{a} se puso a mirar gifs de pajas | {a} se quedó en loop | {a} anda necesitando una mano'), ['purr:pussylick', 'purr:solo']],
  nsfwanal: ['🍩', NL('{a} le mostró un anal a {b} | {a} le dedicó a {b} uno por atrás'), NL('{a} anda mirando anales | {a} se quedó mirando | {a} dice que por atrás también se siente'), ['purr:anal', 'nekoapi:anal']],
  nsfwcreampie: ['🥧', NL('{a} le mostró un creampie a {b} | {a} le dedicó a {b} un final feliz'), NL('{a} anda mirando creampies | {a} se quedó mirando | {a} dice que así termina todo'), ['nekoapi:creampie', 'purr:cum']],
  nsfwcum: ['💧', NL('{a} le mostró a {b} una de acabadas | {a} le dedicó a {b} un cum'), NL('{a} anda mirando acabadas | {a} se quedó mirando | {a} dice que ya está, que terminó'), ['purr:cum', 'nekoapi:cum']],
  nsfwdick: ['🍆', NL('{a} le mostró una pija a {b} | {a} le dedicó a {b} una de esas'), NL('{a} anda mirando pijas | {a} dice que el tamaño no importa, pero se fija | {a} se quedó mirando'), ['nekoapi:dick', 'purr:neko']],
  nsfworgasm: ['😵', NL('{a} le mostró un orgasmo a {b} | {a} le dedicó a {b} la cara del final'), NL('{a} se quedó con la cara de orgasmo | {a} anda mirando caras | {a} dice que esa cara no se actúa'), ['nekoapi:orgasm', 'purr:solo']],
  nsfwmasturbation: ['🖐️', NL('{a} le mostró a {b} una paja | {a} le dedicó a {b} una de masturbación'), NL('{a} se está tocando | {a} anda a mano | {a} dice que a mano también se disfruta'), ['purr:solo', 'purr:solo_male']],
  nsfwthreesome: ['🔺', NL('{a} le mostró un trío a {b} | {a} le dedicó a {b} una de tres'), NL('{a} se metió en un trío | {a} dice que tres es mejor que dos | {a} anda mirando tríos'), ['purr:threesome_ffm', 'purr:threesome_mmf']],
  nsfwyaoi: ['👬', NL('{a} le mostró un yaoi a {b} | {a} le dedicó a {b} una de dos tipos'), NL('{a} anda mirando yaoi | {a} dice que entre ellos se entienden | {a} se quedó mirando'), ['purr:yaoi', 'nekoapi:yuri']],
  nsfwsolomale: ['🍌', NL('{a} le mostró a {b} una de un tipo solo | {a} le dedicó a {b} una de esas'), NL('{a} anda mirando tipos solos | {a} dice que también cuenta | {a} se quedó mirando'), ['purr:solo_male', 'purr:solo']],
  // ---- fetiches ----
  nsfwtentacles: ['🐙', NL('{a} le mostró unos tentáculos a {b} | {a} le dedicó a {b} una de tentáculos'), NL('{a} se quedó con los tentáculos | {a} anda mirando pulpos | {a} dice que los tentáculos tienen ventaja'), ['nekoapi:tentacle', 'nekoapi:pussy']],
  nsfwbdsm: ['⛓️', NL('{a} le mostró a {b} una de ataduras | {a} le dedicó a {b} una de BDSM'), NL('{a} anda mirando ataduras | {a} se quedó atado | {a} dice que le gusta que manden'), ['nekoapi:restrained', 'nekoapi:bdsm', 'nekoapi:pussy']],
  nsfwfemdom: ['👠', NL('{a} le mostró a {b} una de dominantes | {a} le dedicó a {b} una que manda'), NL('{a} anda mirando dominantes | {a} se quedó sumiso | {a} dice que acá manda ella'), ['nekoapi:femdom', 'nekoapi:pussy']],
  nsfwfootjob: ['🦶', NL('{a} le mostró un footjob a {b} | {a} le dedicó a {b} una de pies'), NL('{a} anda mirando footjobs | {a} se quedó mirando pies | {a} dice que con los pies también se hace'), ['neko:feet', 'purr:neko']],
  nsfwgangbang: ['👥', NL('{a} le mostró a {b} una de varios | {a} le dedicó a {b} una gangbang'), NL('{a} se quedó mirando | {a} dice que cuantos más, mejor | {a} anda mirando de a varios'), ['purr:threesome_ffm', 'purr:threesome_mmf']],
  nsfworgy: ['🎉', NL('{a} le mostró una orgía a {b} | {a} le dedicó a {b} una de esas fiestas'), NL('{a} se metió en una orgía | {a} dice que ahí no sobra nadie | {a} anda mirando fiestas'), ['purr:threesome_fff', 'purr:threesome_ffm']],
  nsfwyuri: ['👭', NL('{a} le mostró un yuri a {b} | {a} le dedicó a {b} una de dos minas'), NL('{a} anda mirando yuri | {a} dice que dos mejor que una | {a} se quedó mirando'), ['purr:yuri', 'nekoapi:yuri']],
  nsfwundress: ['👚', NL('{a} le mostró a {b} cómo se desviste | {a} le dedicó a {b} una de desnudarse'), NL('{a} se está desvistiendo | {a} anda sacándose la ropa | {a} dice que después no se la pone más'), ['nekoapi:undress', 'nekoapi:exposed_girl_breasts']],
  nsfwstrip: ['🎭', NL('{a} le hizo un strip a {b} | {a} le dedicó a {b} un baile'), NL('{a} se mandó un strip | {a} anda bailando | {a} dice que cobra por esto'), ['nekoapi:strip', 'nekosia:lying-down']],
  nsfwharem: ['💞', NL('{a} le mostró un harén a {b} | {a} le dedicó a {b} una de muchas'), NL('{a} anda mirando harenes | {a} dice que no puede elegir una | {a} se quedó con todas'), ['purr:threesome_fff', 'nekosia:girl']],
  nsfwsuccubus: ['😈', NL('{a} le presentó una súcubo a {b} | {a} le mandó a {b} una que se lleva el alma'), NL('{a} se topó con una súcubo | {a} dice que le robó el alma y no le importa | {a} se quedó sin energía'), ['nekoapi:succubus', 'nekoapi:pussy']],
  nsfwincest: ['👪', NL('{a} le mostró una de familia a {b} | {a} le dedicó a {b} una incestuosa'), NL('{a} anda mirando de familia | {a} dice que la familia también cuenta | {a} se quedó mirando'), ['nekoapi:incest', 'nekoapi:pussy']],
  nsfwpee: ['🚽', NL('{a} le mostró una de meadas a {b} | {a} le dedicó a {b} una de esas'), NL('{a} anda mirando meadas | {a} dice que no le hace asco a nada | {a} se quedó mirando'), ['nekoapi:pee', 'purr:neko']],
  nsfwcuckold: ['🐂', NL('{a} le mostró a {b} una de cornudos | {a} le dedicó a {b} una cuckold'), NL('{a} anda mirando cornudos | {a} dice que mirar también gusta | {a} se quedó de espectador'), ['nekoapi:cuckold', 'purr:fuck']],
  nsfwhgame: ['🎮', NL('{a} le mostró a {b} una de videojuegos | {a} le dedicó a {b} una de esas del juego'), NL('{a} se quedó con el videojuego | {a} dice que ahí sí juega | {a} anda mirando personajes'), ['nekoapi:video_game', 'nekosia:vtuber']],
  nsfwclassic: ['🖼️', NL('{a} le mostró a {b} una clásica | {a} le dedicó a {b} una de las de antes'), NL('{a} anda mirando clásicos | {a} dice que lo clásico no falla | {a} se quedó mirando'), ['nekoapi:exposed_girl_breasts', 'nekosia:girl']],
  nsfwrandom: ['🎲', NL('{a} le mandó algo al azar a {b} | {a} le dedicó a {b} una sorpresa'), NL('{a} tiró los dados | {a} no sabe qué le va a salir | {a} se la jugó al azar'), ['purr:neko', 'nekoapi:exposed_girl_breasts']],
};
const NX_RE = new RegExp('^\\/(' + Object.keys(NX).sort((a, b) => b.length - a.length).join('|') + ')(\\s|$)', 'i');
let nxEnCurso = 0;

// lee un campo anidado: 'url', 'message', 'image.original.url' o '[0].url'
function nxCampo(dato, ruta) {
  return ruta.split('.').reduce((o, k) => {
    if (o == null) return undefined;
    return k.startsWith('[') ? o[Number(k.slice(1, -1))] : o[k];
  }, dato);
}
// pide la URL a la primera fuente que devuelva algo válido (las caídas o sin resultados se saltean)
async function nxUrl(fuente) {
  const [api, ruta] = fuente.split(':');
  const base = NX_BASES[api];
  if (!base) throw new Error(api + ': api desconocida');
  const r = await axios.get(base.url + ruta + (base.sufijo || ''), { timeout: 12000, headers: { 'User-Agent': NSFW_UA, Accept: 'application/json' } });
  const u = nxCampo(r.data, base.campo);
  if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
  throw new Error(`${api}:${ruta} sin resultado`);
}
// baja el archivo a memoria y dice si es un GIF (los CDN piden Referer del sitio de origen)
async function nxBajar(url) {
  const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
  const ref = NSFW_REF || (/purrbot/i.test(host) ? 'https://purrbot.site/' : /nekobot/i.test(host) ? 'https://nekobot.xyz/'
    : /nekosapi/i.test(host) ? 'https://nekosapi.com/' : /nekosia/i.test(host) ? 'https://nekosia.cat/' : '');
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 30 * 1024 * 1024,
    headers: { 'User-Agent': NSFW_UA, ...(ref ? { Referer: ref } : {}) } });
  const buf = Buffer.from(r.data);
  if (buf.length < 200) throw new Error('archivo vacío');
  const ct = String(r.headers['content-type'] || '');
  const gif = /gif/i.test(ct) || (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46);
  return { buf, gif, ct };
}
// NekosAPI entrega webp y WhatsApp no siempre lo muestra: se pasa el primer frame a jpg
function nxWebpAJpg(buf) {
  return new Promise((ok, mal) => {
    const { spawn } = require('child_process');
    let p;
    try { p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-q:v', '3', '-f', 'mjpeg', 'pipe:1']); }
    catch (e) { return mal(e); }
    const salida = [], error = [];
    p.stdout.on('data', d => salida.push(d));
    p.stderr.on('data', d => error.push(d));
    p.on('error', mal);
    p.stdin.on('error', () => {});
    p.on('close', c => (c === 0 && Buffer.concat(salida).length > 200)
      ? ok(Buffer.concat(salida))
      : mal(new Error('ffmpeg ' + c + ' ' + Buffer.concat(error).toString().slice(0, 200))));
    p.stdin.end(buf);
  });
}
async function nxCmd(m, jid, text) {
  const nombre = ((text.match(/^\/(\w+)/) || [])[1] || '').toLowerCase();
  const def = NX[nombre]; if (!def) return;
  const [emoji, con, solo, fuentes] = def;
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!nsfwOn(jid)) return reply('🔞 Los comandos NSFW están desactivados en este grupo. Un admin puede activarlos con /nsfw on');
  if (nxEnCurso >= 4) return reply('⏳ Hay muchas imágenes en cola, probá de nuevo en un momento');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  nxEnCurso++; reaccion('⏳');                    // sin esperar: no frena el resto
  try {
    const obj = await rxObjetivo(m, jid).catch(() => null);
    const yo = senderIds(m, jid);
    const conObj = !!obj && !obj.ids.some(x => yo.includes(x));   // si sos vos mismo, cuenta como sin nadie
    const menciones = [];
    let a = rxLimpio(m.pushName) || rxNombreDe(yo);
    if (!a) { const sj = m.key.participant || m.key.remoteJid || jid; a = '@' + num(sj); menciones.push(sj); }
    let b = '';
    if (conObj) { b = obj.nombre; if (!b) { b = '@' + num(obj.jid); menciones.push(obj.jid); } }
    const lista = conObj ? con : solo;
    const frase = lista[Math.floor(Math.random() * lista.length)].replaceAll('{a}', a).replaceAll('{b}', b);
    let archivo = null, ultimo;
    for (const f of fuentes) {                    // las fuentes se prueban en orden hasta que una devuelva algo
      try { archivo = await nxBajar(await nxUrl(f)); break; }
      catch (e) { ultimo = e; console.error('[nsfw]', nombre, f, e.message); }
    }
    if (!archivo) throw ultimo || new Error('sin archivo');
    const extra = menciones.length ? { mentions: [...new Set(menciones)] } : {};
    const caption = `${frase} ${emoji}`;
    if (archivo.gif && await ytTieneFfmpeg()) {
      const mp4 = await rxTurno(() => rxMp4(archivo.buf));
      await sock.sendMessage(jid, { video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption, ...extra }, { quoted: m });
    } else {
      let img = archivo.buf, mime = archivo.ct || 'image/jpeg';
      if (/webp/i.test(mime)) {                   // webp a jpg, si no algunos clientes no lo abren
        try { img = await rxTurno(() => nxWebpAJpg(archivo.buf)); mime = 'image/jpeg'; }
        catch (e) { console.error('[nsfw] webp', e.message); }
      }
      await sock.sendMessage(jid, { image: img, mimetype: mime, caption, ...extra }, { quoted: m });
    }
  } catch (e) {
    console.error('[nsfw]', nombre, e.message);
    await reply('❌ No pude traer la imagen (las APIs están fallando). Probá de nuevo en un rato');
  } finally { nxEnCurso--; reaccion(''); }
}
const CMD_NX = [{ test: c => NX_RE.test(c.text), run: c => nxCmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_NX];
