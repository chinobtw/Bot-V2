// /lyrics: letras de canciones
const axios = require('axios');
const { sock } = require('../../src/lib/state');

// === LYRICS QUE SI FUNCIONA EN bot-hosting.net ===
const ax = axios.create({ timeout: 7000, headers: { 'User-Agent': 'Mozilla/5.0' } });

async function handleLyrics(sock, chatId, query, msg) {
    if (!query) return sock.sendMessage(chatId, { text: 'Uso: /lyrics artista - titulo\nEj: /lyrics The Weeknd - Blinding Lights' }, { quoted: msg });
    await sock.sendMessage(chatId, { text: `🔍 Buscando *${query}*...` }, { quoted: msg });

    let result = null;
    let qArtist = '', qTitle = query;
    if (query.includes('-')) {
        const s = query.split('-');
        qArtist = s[0].trim();
        qTitle = s.slice(1).join('-').trim();
    }

    // 1) LRCLIB SEARCH - mejor de todas
    try {
        const { data } = await ax.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
        if (data && data.length) {
            const best = data[0];
            if (best.plainLyrics) result = { artist: best.artistName, title: best.trackName, lyrics: best.plainLyrics, src: 'lrclib.net' };
        }
    } catch(e) { console.log('[lyrics] lrclib search fail:', e.message) }

    // 2) LRCLIB GET exacto si tenemos artista y titulo
    if (!result && qArtist && qTitle) {
        try {
            const { data } = await ax.get(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(qArtist)}&track_name=${encodeURIComponent(qTitle)}`);
            if (data?.plainLyrics) result = { artist: data.artistName, title: data.trackName, lyrics: data.plainLyrics, src: 'lrclib.net' };
        } catch {}
    }

    // 3) lyrics.ovh SUGGEST + V1 (cadena real)
    if (!result) {
        try {
            const sug = await ax.get(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`).catch(()=>null);
            const first = sug?.data?.data?.[0];
            if (first) {
                const art = first.artist.name;
                const tit = first.title;
                const lyr = await ax.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(art)}/${encodeURIComponent(tit)}`);
                if (lyr.data?.lyrics) result = { artist: art, title: tit, lyrics: lyr.data.lyrics, src: 'lyrics.ovh' };
            }
        } catch(e) { console.log('[lyrics] ovh suggest fail:', e.message) }
    }

    // 4) lyrics.ovh directo con lo que puso el usuario
    if (!result && qArtist && qTitle) {
        try {
            const lyr = await ax.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(qArtist)}/${encodeURIComponent(qTitle)}`);
            if (lyr.data?.lyrics) result = { artist: qArtist, title: qTitle, lyrics: lyr.data.lyrics, src: 'lyrics.ovh' };
        } catch {}
    }

    if (!result) return sock.sendMessage(chatId, { text: `❌ No encontré "${query}"\nProbá con: /lyrics artista - titulo` }, { quoted: msg });

    let txt = result.lyrics.trim();
    if (txt.length > 3800) txt = txt.slice(0, 3800) + '\n\n...[recortado]';

    await sock.sendMessage(chatId, {
        text: `🎵 *${result.title}* — ${result.artist}\n_Fuente: ${result.src}_\n\n${txt}`
    }, { quoted: msg });
}
const CMD_LYRICS = [{ test: c => /^\/(lyrics|letra)(\s|$)/i.test(c.text), run: c => handleLyrics(sock, c.jid, c.text.replace(/^\/(lyrics|letra)\s*/i, '').trim(), c.m) }];

module.exports.commands = [...CMD_LYRICS];
