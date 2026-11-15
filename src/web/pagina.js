// HTML de la página web

const WEB_PAGE = String.raw`<!doctype html>
<html lang="es" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>__NOMBRE__ · Vincular bot</title>
<meta name="description" content="Vinculá tu número y tené tu propio bot de WhatsApp en un minuto. Hecho por Vand4lw.">
<meta name="theme-color" content="#08050a">
<meta property="og:title" content="__NOMBRE__ · Tu propio bot de WhatsApp">
<meta property="og:description" content="Vinculá tu número con código o QR, sin registro. Hecho por Vand4lw.">
<meta property="og:image" content="__IMG__">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%2310060c'/%3E%3Ccircle cx='16' cy='16' r='5' fill='%23ff5fa8'/%3E%3Cellipse cx='16' cy='16' rx='12' ry='5' fill='none' stroke='%23ff9ccb' stroke-width='1.6' transform='rotate(-28 16 16)'/%3E%3Ccircle cx='26' cy='11' r='2' fill='%23ffd2e8'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root{--h:338;--disp:"Sora","Avenir Next","Segoe UI",system-ui,-apple-system,sans-serif;--body:"Instrument Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
:root,:root[data-theme=dark]{color-scheme:dark;
 --bg:hsl(calc(var(--h) - 30) 34% 3.6%);--g1:hsl(0 0% 100% / .075);--g2:hsl(0 0% 100% / .022);
 --rim:hsl(0 0% 100% / .17);--rim2:hsl(0 0% 100% / .05);--line:hsl(0 0% 100% / .1);
 --text:hsl(var(--h) 30% 97%);--mut:hsl(var(--h) 10% 72%);
 --acc:hsl(var(--h) 96% 68%);--acc2:hsl(calc(var(--h) - 72) 92% 74%);--acc3:hsl(calc(var(--h) + 38) 100% 76%);
 --on:hsl(calc(var(--h) - 30) 60% 6%);--soft:hsl(var(--h) 96% 68% / .14);--glow:hsl(var(--h) 96% 68% / .5);
 --ok:#5dffb0;--bad:#ff6b8b;--shadow:0 30px 60px -32px #000d;--inp:hsl(0 0% 0% / .3);--dock:hsl(calc(var(--h) - 30) 30% 7% / .9);
 --a1:.2;--a2:.14;--a3:.12;--star:.55}
:root[data-theme=light]{color-scheme:light;
 --bg:hsl(calc(var(--h) - 30) 40% 96.5%);--g1:hsl(0 0% 100% / .7);--g2:hsl(0 0% 100% / .36);
 --rim:hsl(0 0% 100% / .95);--rim2:hsl(calc(var(--h) - 30) 30% 40% / .13);--line:hsl(calc(var(--h) - 30) 25% 30% / .14);
 --text:hsl(calc(var(--h) - 30) 45% 9%);--mut:hsl(calc(var(--h) - 30) 14% 36%);
 --acc:hsl(var(--h) 85% 46%);--acc2:hsl(calc(var(--h) - 72) 70% 48%);--acc3:hsl(calc(var(--h) + 38) 90% 46%);
 --on:#fff;--soft:hsl(var(--h) 85% 46% / .1);--glow:hsl(var(--h) 85% 46% / .32);
 --ok:#0a8a4a;--bad:#c4183f;--shadow:0 24px 50px -30px hsl(var(--h) 40% 30% / .45);--inp:hsl(0 0% 100% / .72);--dock:hsl(0 0% 100% / .92);
 --a1:.15;--a2:.11;--a3:.1;--star:0}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{scroll-padding-top:96px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 var(--body);overflow-x:hidden;min-height:100vh;-webkit-font-smoothing:antialiased;transition:background .3s,color .3s}
a{color:inherit;text-decoration:none}
button,input{font:inherit;color:inherit}
h1,h2,h3,h4,p,ol,ul{margin:0}
:focus-visible{outline:2px solid var(--acc);outline-offset:3px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
code{font-family:var(--mono);font-size:.78em;padding:2px 7px;border-radius:7px;background:var(--soft);color:var(--acc);box-shadow:inset 0 0 0 1px var(--rim2)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* ---------- fondo ---------- */
.bgfx{position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden}
.bgfx::before{content:"";position:absolute;inset:-10%;background:
 radial-gradient(46% 40% at 78% 6%,hsl(var(--h) 96% 62% / var(--a1)),transparent 70%),
 radial-gradient(40% 42% at 4% 58%,hsl(calc(var(--h) - 72) 90% 60% / var(--a2)),transparent 72%),
 radial-gradient(60% 40% at 50% 112%,hsl(calc(var(--h) + 38) 100% 60% / var(--a3)),transparent 70%)}
.bgfx::after{content:"";position:absolute;inset:0;opacity:var(--star);background-image:
 radial-gradient(1px 1px at 8% 14%,hsl(0 0% 100% / .7),transparent),radial-gradient(1px 1px at 22% 52%,hsl(0 0% 100% / .5),transparent),
 radial-gradient(1.5px 1.5px at 31% 8%,hsl(0 0% 100% / .6),transparent),radial-gradient(1px 1px at 47% 31%,hsl(0 0% 100% / .45),transparent),
 radial-gradient(1px 1px at 58% 72%,hsl(0 0% 100% / .55),transparent),radial-gradient(1.5px 1.5px at 66% 18%,hsl(0 0% 100% / .5),transparent),
 radial-gradient(1px 1px at 74% 44%,hsl(0 0% 100% / .5),transparent),radial-gradient(1px 1px at 86% 66%,hsl(0 0% 100% / .6),transparent),
 radial-gradient(1.5px 1.5px at 93% 28%,hsl(0 0% 100% / .5),transparent),radial-gradient(1px 1px at 14% 84%,hsl(0 0% 100% / .5),transparent),
 radial-gradient(1px 1px at 39% 90%,hsl(0 0% 100% / .45),transparent),radial-gradient(1px 1px at 81% 92%,hsl(0 0% 100% / .5),transparent)}
.grain{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.05;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
:root[data-theme=light] .grain{display:none}
.spot{position:fixed;left:0;top:0;width:560px;height:560px;margin:-280px 0 0 -280px;border-radius:50%;pointer-events:none;z-index:0;background:radial-gradient(circle,hsl(var(--h) 96% 68% / .13),transparent 62%);opacity:0;transition:opacity .45s;will-change:transform}
.spot.on{opacity:1}
:root[data-theme=light] .spot{background:radial-gradient(circle,hsl(var(--h) 90% 55% / .1),transparent 62%)}
.rxwrap{position:fixed;left:0;top:0;z-index:0;pointer-events:none;transform-origin:0 0;will-change:transform}
.rxwrap[hidden]{display:none}
.rxwrap canvas{display:block;position:relative;z-index:1;width:100%;height:100%;-webkit-mask-image:radial-gradient(closest-side,#000 80%,transparent 100%);mask-image:radial-gradient(closest-side,#000 80%,transparent 100%)}
.rxwrap i{position:absolute;z-index:0;display:block;pointer-events:none;border-radius:50%}
.rxhalo{left:0;top:0;width:100%;height:100%;background:radial-gradient(closest-side,hsl(var(--h) 96% 68% / .62) 8%,hsl(var(--h) 96% 68% / .2) 42%,transparent 100%);animation:hin 1.4s ease-out both,breathe 5.5s ease-in-out 1.4s infinite;will-change:transform,opacity}
.rxhalo::after{content:"";position:absolute;left:23%;top:23%;width:54%;height:54%;border-radius:50%;background:radial-gradient(closest-side,hsl(calc(var(--h) + 38) 100% 80% / .72) 12%,hsl(calc(var(--h) + 38) 100% 78% / .22) 45%,transparent 100%)}
.rxplat{left:-6%;top:71%;width:112%;height:39%;background:radial-gradient(closest-side,hsl(var(--h) 96% 68% / .7) 10%,hsl(var(--h) 96% 68% / .22) 42%,transparent 100%);animation:hin 1.4s ease-out both;will-change:transform}
:root[data-theme=dark]:not([data-fx=lite]) .rxwrap canvas{mix-blend-mode:screen}
.rxwrap.flash .rxhalo{filter:brightness(1.9) saturate(1.3);transition:filter .12s}
:root[data-theme=light] .rxhalo{background:radial-gradient(closest-side,hsl(var(--h) 90% 55% / .26) 8%,hsl(var(--h) 90% 55% / .09) 42%,transparent 100%)}
:root[data-theme=light] .rxhalo::after{background:radial-gradient(closest-side,hsl(calc(var(--h) + 38) 95% 55% / .3) 12%,hsl(calc(var(--h) + 38) 95% 55% / .09) 45%,transparent 100%)}
:root[data-theme=light] .rxplat{background:radial-gradient(closest-side,hsl(var(--h) 90% 55% / .3) 10%,hsl(var(--h) 90% 55% / .1) 42%,transparent 100%)}
@keyframes hin{from{opacity:0}to{opacity:1}}
@keyframes breathe{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.07);opacity:.8}}

/* ---------- vidrio ---------- */
.glass{--r:24px;position:relative;isolation:isolate;border-radius:var(--r);background:linear-gradient(150deg,var(--g1),var(--g2) 55%,var(--g1));box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2),var(--shadow)}
.glass::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;background:radial-gradient(340px circle at var(--mx,50%) var(--my,-40%),hsl(0 0% 100% / .14),transparent 62%);opacity:0;transition:opacity .35s}
.glass.lit::before{opacity:1}
:root[data-theme=light] .glass::before{background:radial-gradient(340px circle at var(--mx,50%) var(--my,-40%),hsl(var(--h) 90% 60% / .1),transparent 62%)}
.glass::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(140deg,hsl(0 0% 100% / .42),transparent 26%,transparent 64%,var(--soft) 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);mask-composite:exclude}
:root[data-theme=light] .glass::after{background:linear-gradient(140deg,hsl(0 0% 100% / 1),transparent 30%,transparent 66%,var(--soft) 100%)}
.glass.blur{-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5)}
.pad{padding:clamp(20px,3vw,32px)}
.tilt{transform:perspective(1100px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .18s ease-out}
.tilt.lit{will-change:transform}

/* ---------- cabecera ---------- */
.top{--r:999px;position:fixed;top:14px;left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100% - 24px);z-index:40;display:flex;align-items:center;gap:6px;padding:7px 8px 7px 18px;background:linear-gradient(150deg,var(--dock),var(--dock))}
.brand{display:flex;align-items:center;gap:10px;font:600 14px/1 var(--disp);letter-spacing:-.01em;min-width:0;margin-right:10px}
.brand b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;font-weight:600}
.svc{display:none;font-size:13px;color:var(--mut);white-space:nowrap;margin:0 8px}
.menu{display:flex;gap:2px}
.menu a{display:flex;align-items:center;gap:8px;padding:9px 15px;color:var(--mut);font-weight:500;font-size:15px;white-space:nowrap;border-radius:999px;transition:color .2s,background .2s}
.menu a i{display:none;width:22px;height:22px}
.menu a svg{width:100%;height:100%}
.menu a:hover{color:var(--text)}
.menu a.on{color:var(--text);background:var(--soft);box-shadow:inset 0 0 0 1px hsl(var(--h) 96% 68% / .28)}
.tone{width:40px;height:40px;border-radius:50%;border:0;background:var(--g1);box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2);display:grid;place-items:center;cursor:pointer;flex:none;margin-left:6px;transition:box-shadow .2s}
.tone:hover{box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--acc),0 0 20px -6px var(--glow)}
.tone svg{width:18px;height:18px}
.led{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px hsl(150 100% 60% / .16),0 0 12px var(--ok);flex:none}
.led.off{background:var(--bad);box-shadow:0 0 0 3px hsl(350 100% 70% / .16),0 0 12px var(--bad)}
.page{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:96px clamp(16px,4vw,40px) 80px}

/* ---------- piezas ---------- */
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:46px;padding:11px 22px;border:0;border-radius:14px;cursor:pointer;font:600 15px/1.1 var(--body);color:var(--text);background:linear-gradient(180deg,var(--g1),var(--g2));box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2);white-space:nowrap;overflow:hidden;transition:transform .15s,box-shadow .25s,filter .2s}
.btn::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,hsl(0 0% 100% / .24) 50%,transparent 65%);transform:translateX(-120%);transition:transform .7s}
.btn:hover::after{transform:translateX(120%)}
.btn:hover{box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px hsl(var(--h) 96% 68% / .55),0 12px 30px -14px var(--glow)}
.btn:active{transform:scale(.97)}
.btn svg{width:17px;height:17px;flex:none}
.btn.pri{color:var(--on);background:linear-gradient(115deg,var(--acc),var(--acc2));box-shadow:inset 0 1px 0 hsl(0 0% 100% / .55),0 14px 34px -12px var(--glow)}
.btn.pri:hover{filter:brightness(1.08);box-shadow:inset 0 1px 0 hsl(0 0% 100% / .55),0 16px 40px -10px var(--glow)}
.btn[disabled]{opacity:.45;pointer-events:none}
.title{font:600 clamp(26px,3.8vw,40px)/1.15 var(--disp);letter-spacing:-.03em}
.sub{color:var(--mut);margin-top:10px;max-width:56ch}
.sh{margin:clamp(64px,10vw,112px) 0 24px}
.sh h2{font:600 clamp(21px,2.7vw,30px)/1.2 var(--disp);letter-spacing:-.025em}
.sh p{color:var(--mut);margin-top:8px;max-width:56ch}
h3{font:600 16px/1.3 var(--disp);letter-spacing:-.01em;margin-bottom:14px}
label,.lbl{display:block;font-size:14px;color:var(--mut);margin:0 0 7px}
.inp{width:100%;padding:12px 14px;border:0;border-radius:12px;background:var(--inp);outline:none;color:var(--text);font:500 15px var(--body);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .2s}
.inp:focus{box-shadow:inset 0 0 0 1.5px var(--acc),0 0 0 4px var(--soft)}
.field{display:flex;align-items:stretch;border-radius:14px;background:var(--inp);box-shadow:inset 0 0 0 1px var(--line),inset 0 2px 10px hsl(0 0% 0% / .22);transition:box-shadow .25s}
.field:focus-within{box-shadow:inset 0 0 0 1.5px var(--acc),0 0 0 4px var(--soft),0 0 32px -8px var(--glow)}
.field .pr{display:grid;place-items:center;padding:0 14px;color:var(--acc);font:600 15px var(--mono)}
.field .inp{border-radius:0 14px 14px 0;box-shadow:none;background:none;font:500 16px var(--mono);letter-spacing:.02em;padding-left:0}
.hint{font-size:13.5px;color:var(--mut);margin-top:10px;min-height:22px}
.hint.ok{color:var(--ok)}.hint.bad{color:var(--bad)}
.err{margin-top:16px;padding:12px 15px;border-radius:12px;background:hsl(350 100% 65% / .12);box-shadow:inset 3px 0 0 var(--bad);font-size:14.5px}
.empty{padding:38px 20px;text-align:center;color:var(--mut);border-radius:20px;box-shadow:inset 0 0 0 1px var(--line)}
.skel{height:78px;border-radius:20px;background:linear-gradient(90deg,var(--g2),var(--g1),var(--g2));background-size:200% 100%;animation:sh 1.4s infinite;margin-bottom:12px}
@keyframes sh{to{background-position:-200% 0}}
.acts{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px}
.center{text-align:center}
.foot{margin-top:clamp(64px,10vw,112px);padding-top:22px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;color:var(--mut);font-size:14px}
.foot a{color:var(--text);font-weight:600}
.foot a:hover{color:var(--acc)}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
.slot{position:relative;aspect-ratio:1;pointer-events:none}

/* ---------- inicio ---------- */
.hero{position:relative;display:grid;grid-template-columns:minmax(0,520px) minmax(0,1fr);align-items:center;min-height:clamp(560px,calc(100vh - 150px),840px);min-height:clamp(560px,calc(100svh - 150px),840px)}
.hero .copy{position:relative;z-index:3;grid-column:1;grid-row:1;padding:24px 0}
.hero .slot{position:absolute;right:calc(-1 * clamp(0px,4vw,60px));top:50%;width:min(92vw,900px);transform:translateY(-50%)}
.hero h1{font:600 clamp(30px,4.3vw,54px)/1.1 var(--disp);letter-spacing:-.035em;text-shadow:0 2px 40px var(--bg)}
.hero h1 .w{display:inline-block;white-space:nowrap}
.hero h1.boot .c{display:inline-block;animation:cin .6s both;animation-delay:calc(var(--n) * 24ms + 150ms)}
@keyframes cin{0%{opacity:0;color:var(--acc);text-shadow:0 0 24px var(--acc);transform:translateY(.18em)}55%{opacity:1;color:var(--acc);text-shadow:0 0 18px var(--glow)}100%{opacity:1;text-shadow:0 2px 40px var(--bg)}}
.lede{margin:22px 0 30px;color:var(--mut);font-size:18px;max-width:38ch;text-shadow:0 1px 24px var(--bg)}
.console{max-width:470px;padding:22px}
.console.boot{animation:rise .8s .55s cubic-bezier(.2,.8,.2,1) backwards}
.quickbtns{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.quickbtns .btn{flex:1 1 150px}
.readout{position:absolute;z-index:3;right:clamp(0px,2vw,24px);bottom:clamp(18px,6vh,64px);padding:16px 22px 16px 20px;display:flex;align-items:center;gap:16px;border-radius:22px}
.readout b{font:600 clamp(34px,4.6vw,52px)/1 var(--disp);letter-spacing:-.04em}
.readout span{color:var(--mut);font-size:14px;line-height:1.35}
.readout .tip{display:block;font-size:12.5px;opacity:.85;margin-top:3px}

.tele{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:clamp(28px,4vw,48px);--r:26px}
.tele>div{padding:22px 24px;min-width:0;position:relative}
.tele>div+div::before{content:"";position:absolute;left:0;top:22px;bottom:22px;width:1px;background:var(--line)}
.tele .k{display:block;color:var(--mut);font-size:13.5px}
.tele b{display:block;font:600 clamp(20px,2.3vw,28px)/1.25 var(--mono);margin-top:5px;white-space:nowrap;font-weight:600}
.seg{display:flex;gap:3px;margin-top:12px}
.seg i{flex:1;height:6px;border-radius:3px;background:var(--line)}
.seg i.on{background:linear-gradient(90deg,var(--acc),var(--acc2));box-shadow:0 0 10px var(--glow)}

.split{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(16px,4vw,48px);align-items:center}
.split .slot{width:min(100%,430px);justify-self:center}
.lines{list-style:none;padding:0;--r:26px;overflow:hidden}
.lines li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px 24px;transition:background .25s;cursor:default}
.lines li+li{box-shadow:inset 0 1px 0 var(--line)}
.lines li.hot{background:var(--soft)}
.lines b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lines small{display:block;color:var(--mut);font-size:13px}
.lines .up{font-size:13px;color:var(--acc)}
.lines .none{display:block;color:var(--mut);padding:26px 24px}

/* funciones: carrusel con profundidad */
.car{display:flex;gap:22px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;width:100vw;margin-left:calc(50% - 50vw);padding:34px max(clamp(16px,4vw,40px),calc((100vw - 1120px) / 2 + clamp(16px,4vw,40px))) 46px;scroll-padding:0 max(clamp(16px,4vw,40px),calc((100vw - 1120px) / 2 + clamp(16px,4vw,40px)))}
.car::-webkit-scrollbar{display:none}
.card{flex:0 0 min(340px,80vw);scroll-snap-align:start;min-height:380px;padding:26px;display:flex;flex-direction:column;transform:perspective(1000px) rotateX(var(--rx,0deg)) rotateY(calc(var(--d,0) * -22deg + var(--ry,0deg))) scale(calc(1 - var(--a,0) * .08));transform-origin:50% 50%;opacity:calc(1 - var(--a,0) * .28);outline-offset:4px}
.card.back{transition:transform .3s ease-out}
.card h3{font-size:17px;margin:20px 0 9px}
.card p{color:var(--mut);font-size:15px}
.card .cmds{margin-top:auto;padding-top:18px}
.cmds{display:flex;flex-wrap:wrap;gap:7px}
.car:not(.vis) .viz *{animation-play-state:paused!important}
.carnav{display:flex;gap:10px;justify-content:flex-end;margin-top:-8px}
.carnav .btn{min-height:42px;padding:9px 16px}
.viz{height:128px;border-radius:18px;padding:16px;display:flex;flex-direction:column;justify-content:center;gap:10px;background:var(--inp);box-shadow:inset 0 0 0 1px var(--line),inset 0 2px 14px hsl(0 0% 0% / .22);overflow:hidden;position:relative;font-size:13px}
.v-dl .file{display:flex;justify-content:space-between;font:500 12.5px var(--mono)}
.v-dl .file span{color:var(--mut)}
.v-dl .bar{height:7px;border-radius:4px;background:var(--line);overflow:hidden}
.v-dl .bar i{display:block;height:100%;width:4%;border-radius:4px;background:linear-gradient(90deg,var(--acc),var(--acc3));animation:fill 3.6s ease-in-out infinite}
@keyframes fill{0%{width:4%}68%{width:100%}100%{width:100%}}
.v-dl .src{display:flex;gap:6px;flex-wrap:wrap}
.v-dl .src span{padding:2px 9px;border-radius:20px;font-size:11.5px;color:var(--mut);box-shadow:inset 0 0 0 1px var(--line)}
.v-st{flex-direction:row;align-items:center;justify-content:center;gap:22px}
.v-st .ph{width:58px;height:58px;border-radius:9px;background:linear-gradient(135deg,var(--acc3),var(--acc) 55%,var(--acc2))}
.v-st .ar{color:var(--mut);font-family:var(--mono)}
.v-st .sk{width:62px;height:62px;border-radius:44%;background:linear-gradient(135deg,var(--acc3),var(--acc) 55%,var(--acc2));box-shadow:0 0 0 4px hsl(0 0% 100% / .92),0 10px 24px -8px #000a;animation:wig 3.2s ease-in-out infinite}
@keyframes wig{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg) scale(1.04)}}
.v-eco p{display:flex;justify-content:space-between;font:500 12.5px var(--mono);color:var(--mut)}
.v-eco b{font-weight:600}
.v-eco .up{color:var(--ok)}.v-eco .dn{color:var(--bad)}
.v-ai{gap:8px}
.v-ai span{align-self:flex-start;padding:7px 12px;border-radius:14px 14px 14px 4px;background:var(--soft);font-size:12.5px}
.v-ai .me{align-self:flex-end;border-radius:14px 14px 4px 14px;background:var(--g1);box-shadow:inset 0 0 0 1px var(--line)}
.v-ai .bot{display:inline-flex;gap:4px;padding:10px 13px}
.v-ai .bot em{width:6px;height:6px;border-radius:50%;background:var(--acc);animation:dots 1.2s infinite}
.v-ai .bot em:nth-child(2){animation-delay:.2s}.v-ai .bot em:nth-child(3){animation-delay:.4s}
@keyframes dots{0%,60%,100%{opacity:.25;transform:none}30%{opacity:1;transform:translateY(-3px)}}
.v-gr{flex-direction:row;align-items:center;justify-content:space-between}
.v-gr .av3{display:flex}
.v-gr .av3 i{width:34px;height:34px;border-radius:50%;margin-left:-9px;box-shadow:0 0 0 3px var(--bg)}
.v-gr .av3 i:first-child{margin-left:0}
.v-gr .av3 i:nth-child(1){background:linear-gradient(135deg,var(--acc),var(--acc2))}
.v-gr .av3 i:nth-child(2){background:linear-gradient(135deg,var(--acc3),var(--acc))}
.v-gr .av3 i:nth-child(3){background:linear-gradient(135deg,var(--acc2),var(--acc3))}
.v-gr .av3 i:nth-child(4){background:var(--g1);box-shadow:0 0 0 3px var(--bg),inset 0 0 0 1px var(--line)}

/* ruta: tres pasos */
.path{list-style:none;padding:0;position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:26px}
.path::before{content:"";position:absolute;left:26px;right:26px;top:25px;height:2px;background:repeating-linear-gradient(90deg,var(--line) 0 8px,transparent 8px 14px)}
.path .pulse{position:absolute;top:23px;left:26px;width:80px;height:6px;border-radius:3px;background:linear-gradient(90deg,transparent,var(--acc));box-shadow:0 0 16px var(--glow);opacity:0}
.path.go .pulse{animation:travx 3s ease-in-out forwards}
@keyframes travx{0%{left:26px;opacity:1}85%{opacity:1}100%{left:calc(100% - 106px);opacity:0}}
.path li{position:relative;padding-top:70px}
.path .node{position:absolute;top:0;left:0;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--g1);box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2);font:600 17px var(--disp);color:var(--mut);transition:all .4s}
.path.go .node{animation:lit .5s forwards;animation-delay:calc(var(--i) * 1.1s + .1s)}
@keyframes lit{to{background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--on);box-shadow:0 0 28px -4px var(--glow)}}
.path b{display:block;font:600 16px/1.3 var(--disp);margin-bottom:8px}
.path p{color:var(--mut);max-width:34ch}

/* ---------- vincular ---------- */
.phead{position:relative;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;padding-top:clamp(8px,3vw,28px)}
.phead .slot{position:absolute;right:clamp(170px,19vw,250px);top:60%;width:190px;transform:translateY(-50%)}
.vgrid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:20px;margin-top:30px;align-items:start}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px}
.opt{position:relative;text-align:left;padding:16px;border:0;border-radius:18px;background:var(--inp);cursor:pointer;display:grid;gap:4px;box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .25s,background .25s}
.opt .oi{width:26px;height:26px;color:var(--acc);margin-bottom:6px}
.opt .oi svg{width:100%;height:100%}
.opt b{font-weight:600}
.opt span.d{font-size:13.5px;color:var(--mut);line-height:1.4}
.opt:hover{box-shadow:inset 0 0 0 1px hsl(var(--h) 96% 68% / .5)}
.opt.on{background:var(--soft);box-shadow:inset 0 0 0 1.5px var(--acc),0 0 30px -10px var(--glow)}
.vside .slot{width:min(100%,300px);margin:-6px auto 4px}
.rail{list-style:none;padding:0}
.rail li{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);gap:14px;padding-bottom:22px;color:var(--mut);font-size:15px}
.rail li:last-child{padding-bottom:0}
.rail li::before{content:"";position:absolute;left:16px;top:38px;bottom:2px;width:2px;background:var(--line)}
.rail li:last-child::before{display:none}
.rail .k{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--g1);box-shadow:inset 0 0 0 1px var(--line);font:600 13px var(--disp);color:var(--mut);transition:all .3s}
.rail li>div{padding-top:5px}
.rail b{color:var(--text);font-weight:600}
.rail li.on .k{background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--on);box-shadow:0 0 22px -4px var(--glow)}
.rail li.on>div{color:var(--text)}
.rail li.done .k{background:var(--soft);color:var(--acc);box-shadow:inset 0 0 0 1px hsl(var(--h) 96% 68% / .4)}
.note{display:flex;gap:10px;margin-top:22px;padding-top:16px;border-top:1px solid var(--line);font-size:14px;color:var(--mut)}
.note svg{width:18px;height:18px;flex:none;color:var(--acc);margin-top:2px}
.wait{display:flex;align-items:center;gap:14px;margin:6px 0 4px}
.wait i{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--line);border-top-color:var(--acc);animation:spin .8s linear infinite;flex:none}
.bigcode{display:flex;justify-content:center;gap:6px;margin:24px 0 20px}
.bigcode span{flex:0 1 46px;min-width:0;padding:14px 0;text-align:center;font:600 clamp(20px,6vw,28px)/1 var(--mono);border-radius:12px;background:linear-gradient(180deg,var(--g1),var(--g2));box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2),0 8px 16px -8px #000a,0 2px 0 hsl(var(--h) 96% 68% / .5);animation:pop .45s cubic-bezier(.22,.8,.3,1) backwards}
.bigcode span.sep{flex:0 0 12px;box-shadow:none;background:none;color:var(--mut);padding:14px 0}
.cdrow{display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap}
.ring{position:relative;width:78px;height:78px;flex:none}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:3;stroke-linecap:round}
.ring .rt{stroke:var(--line)}
.ring .rp{stroke:var(--acc);stroke-dasharray:100;transition:stroke-dashoffset .5s linear,stroke .3s;filter:drop-shadow(0 0 4px var(--glow))}
.ring.low .rp{stroke:var(--bad)}
.ring b{position:absolute;inset:0;display:grid;place-items:center;font:600 20px var(--mono)}
.qrbox{position:relative;width:min(270px,100%);aspect-ratio:1;margin:22px auto;padding:14px;background:#fff;border-radius:18px;box-shadow:0 20px 50px -20px var(--glow)}
.qrbox img{width:100%;height:100%;display:block;image-rendering:pixelated}
.qrbox::before{content:"";position:absolute;inset:-7px;pointer-events:none;border-radius:22px;background:
 linear-gradient(var(--acc),var(--acc)) 0 0/24px 2px no-repeat,linear-gradient(var(--acc),var(--acc)) 0 0/2px 24px no-repeat,
 linear-gradient(var(--acc),var(--acc)) 100% 0/24px 2px no-repeat,linear-gradient(var(--acc),var(--acc)) 100% 0/2px 24px no-repeat,
 linear-gradient(var(--acc),var(--acc)) 0 100%/24px 2px no-repeat,linear-gradient(var(--acc),var(--acc)) 0 100%/2px 24px no-repeat,
 linear-gradient(var(--acc),var(--acc)) 100% 100%/24px 2px no-repeat,linear-gradient(var(--acc),var(--acc)) 100% 100%/2px 24px no-repeat}
.qrbox .scan{position:absolute;left:14px;right:14px;top:14px;height:3px;border-radius:2px;background:var(--acc);box-shadow:0 0 16px 3px var(--glow);animation:scan 2.4s ease-in-out infinite alternate}
@keyframes scan{to{top:calc(100% - 17px)}}
.okm{width:64px;height:64px;margin:6px auto 16px;border-radius:50%;display:grid;place-items:center;background:var(--ok);color:var(--on);box-shadow:0 0 40px -4px var(--ok);animation:pop .5s cubic-bezier(.22,.8,.3,1)}
.okm svg{width:30px;height:30px}

/* ---------- bots ---------- */
.tabs{display:inline-flex;margin:28px 0 22px;padding:4px;border-radius:16px;background:var(--inp);box-shadow:inset 0 0 0 1px var(--line)}
.tabs button{padding:10px 22px;border:0;border-radius:12px;background:none;cursor:pointer;color:var(--mut);font-weight:600;transition:color .2s,background .2s}
.tabs button:hover{color:var(--text)}
.tabs button.on{background:linear-gradient(115deg,var(--acc),var(--acc2));color:var(--on)}
.bot{margin-bottom:14px;--r:26px}
.bhead{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:6px 18px;padding:18px 24px}
.avs{position:relative;display:block;width:52px;height:52px}
.avw{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 200deg,var(--acc),var(--acc2),var(--acc3),var(--acc))}
.av{position:absolute;inset:2.5px;display:grid;place-items:center;border-radius:50%;background:var(--bg) center/cover;font:600 18px/1 var(--disp);color:var(--acc)}
.avs .led{position:absolute;right:-2px;bottom:0;border:2px solid var(--bg)}
.avs.off .avw{background:var(--line)}
.bname b{display:block;font-weight:600;overflow-wrap:anywhere}
.num{display:block;color:var(--mut);font-size:12.5px}
.chipst{display:inline-flex;align-items:center;gap:8px;font-size:14px}
.chipst.main{color:var(--acc);font-weight:600}
.chipst.off{color:var(--mut)}
.bmeta{display:flex;gap:18px;color:var(--mut);font-size:14px;align-items:center}
.bmeta .mono{font-size:13px;color:var(--text)}
.edit{padding:22px 24px 24px;box-shadow:inset 0 1px 0 var(--line);display:grid;gap:16px}
.edit .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.prev{display:block;width:100%;max-height:150px;object-fit:cover;border-radius:14px;box-shadow:0 0 0 1px var(--line)}
.up-btn{width:100%;margin:0;color:var(--text)}

/* ---------- estado ---------- */
.eh{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:clamp(12px,3vw,36px);margin-top:30px;padding:clamp(18px,3vw,30px);--r:30px}
.eh .slot{width:clamp(170px,25vw,300px);margin:-18px 0}
.eh .mini{display:grid;gap:22px;margin:0;padding-left:clamp(16px,3.5vw,44px);border-left:1px solid var(--line)}
.eh .mini dt{color:var(--mut);font-size:14px}
.eh .mini dd{margin:3px 0 0;font:600 clamp(22px,2.6vw,32px)/1.15 var(--mono)}
.eh .k{color:var(--mut);font-size:14px}
.big{font:600 clamp(26px,4vw,44px)/1.15 var(--mono);display:block;margin:4px 0 12px;font-weight:600}
.chipst .led{margin-right:0}
.gauges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
.g{display:flex;align-items:center;gap:20px;padding:22px 24px;--r:26px}
.gv{position:relative;width:112px;height:112px;flex:none}
.gv svg{width:100%;height:100%;transform:rotate(135deg)}
.gv circle{fill:none;stroke-width:8;stroke-linecap:round}
.gv .gt{stroke:var(--line);stroke-dasharray:75 100}
.gv .gp{stroke-dasharray:0 100;transition:stroke-dasharray 1.1s cubic-bezier(.3,.8,.2,1);filter:drop-shadow(0 0 5px var(--glow))}
.gv b{position:absolute;inset:0;display:grid;place-items:center;font:600 18px var(--mono)}
.g .gl b{display:block;font-weight:600}
.g .gl span{color:var(--mut);font-size:14px}
.lat{margin-top:16px;padding:24px;--r:26px}
.lat h3{margin-bottom:4px}
.lat .st{display:flex;flex-wrap:wrap;gap:6px 26px;margin:6px 0 14px;color:var(--mut);font-size:14px}
.lat .st b{color:var(--text);font-family:var(--mono);font-weight:600}
.spark{display:block;width:100%;height:96px}
.spark .sl{fill:none;stroke:var(--acc);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round;filter:drop-shadow(0 0 4px var(--glow))}
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
.tiles>div{padding:22px 24px;--r:26px}
.tiles span{color:var(--mut);font-size:14px}
.tiles .big{font-size:clamp(22px,2.6vw,30px);margin:6px 0 0}

/* ---------- colores y efectos ---------- */
.themep{--r:24px;position:fixed;right:clamp(12px,3vw,32px);top:78px;z-index:60;width:min(300px,calc(100vw - 24px));padding:22px;animation:pop .2s ease;background:linear-gradient(150deg,var(--dock),var(--dock))}
.themep[hidden]{display:none}
.themep{-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4)}
:root[data-fx=lite] .themep{-webkit-backdrop-filter:none;backdrop-filter:none;background:linear-gradient(var(--bg),var(--bg))}
.themep h4{margin:0 0 14px;font:600 15px/1 var(--disp)}
.seg2{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:14px;background:var(--inp);box-shadow:inset 0 0 0 1px var(--line)}
.seg2 button{padding:9px;border:0;border-radius:11px;background:none;cursor:pointer;color:var(--mut);font-weight:600;font-size:14px}
.seg2 button.on{background:linear-gradient(115deg,var(--acc),var(--acc2));color:var(--on)}
.sw{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
.sw button{width:30px;height:30px;border-radius:50%;border:0;cursor:pointer;position:relative;box-shadow:inset 0 1px 0 hsl(0 0% 100% / .5)}
.sw button.on{box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--text)}
.themep .row{margin-top:16px}
input[type=range]{width:100%;height:8px;appearance:none;-webkit-appearance:none;border-radius:8px;background:linear-gradient(90deg,hsl(0 90% 60%),hsl(60 90% 55%),hsl(120 80% 50%),hsl(180 85% 50%),hsl(240 90% 62%),hsl(300 85% 60%),hsl(360 90% 60%));outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid var(--acc);cursor:pointer}
input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--acc);cursor:pointer}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;padding:12px 20px;border-radius:16px;background:var(--dock);box-shadow:inset 0 0 0 1px hsl(var(--h) 96% 68% / .5),0 0 34px -8px var(--glow);animation:pop .3s ease;font-size:15px;max-width:90vw}

/* ---------- modo ligero ---------- */
:root[data-fx=lite] .glass.blur,:root[data-fx=lite] .top,:root[data-fx=lite] .menu{-webkit-backdrop-filter:none;backdrop-filter:none}
:root[data-fx=lite] .spot{display:none}
:root[data-fx=lite] .btn::after{display:none}
:root[data-fx=lite] .glass.blur,:root[data-fx=lite] .readout{background:linear-gradient(150deg,var(--dock),var(--dock))}
:root[data-fx=lite] .grain{display:none}

/* ---------- responsive ---------- */
@media(min-width:1100px){.svc{display:block}}
@media(max-width:960px){
 .phead .slot{display:none}
 .hero{display:flex;flex-direction:column;min-height:0;padding-top:6px}
 .hero .slot{position:relative;order:-1;right:auto;top:auto;transform:none;width:min(100%,440px);width:min(100%,440px,50svh);margin:0 auto -34px}
 .hero .copy{padding:0}
 .readout{position:relative;right:auto;bottom:auto;align-self:center;margin-top:22px}
 .split{grid-template-columns:1fr}
 .split .slot{order:-1;width:min(100%,320px)}
 .vgrid{grid-template-columns:1fr}
 .tele{grid-template-columns:1fr 1fr}
 .tele>div:nth-child(3)::before{display:none}
 .tele>div:nth-child(n+3){box-shadow:inset 0 1px 0 var(--line)}
 .path{grid-template-columns:1fr;gap:30px}
 .path::before{left:25px;right:auto;top:26px;bottom:26px;width:2px;height:auto;background:repeating-linear-gradient(180deg,var(--line) 0 8px,transparent 8px 14px)}
 .path .pulse{left:23px;top:26px;width:6px;height:80px;background:linear-gradient(180deg,transparent,var(--acc))}
 .path.go .pulse{animation-name:travy}
 @keyframes travy{0%{top:26px;opacity:1}85%{opacity:1}100%{top:calc(100% - 106px);opacity:0}}
 .path li{padding:6px 0 0 72px;min-height:52px}
 .gauges{grid-template-columns:1fr}
}
@media(max-width:760px){
 html{scroll-padding-top:72px}
 .top{top:0;width:auto;max-width:none;margin:0;border-radius:0;justify-content:space-between;padding:10px 14px;-webkit-backdrop-filter:none;backdrop-filter:none}
 .top.glass.blur{-webkit-backdrop-filter:none;backdrop-filter:none}
 .top{background:linear-gradient(var(--bg),var(--bg))}
 .top::after{border-radius:0}
 .brand{margin-right:0}
 .brand b{max-width:56vw}
 .tone{margin-left:0}
 .menu{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:45;display:grid;grid-template-columns:repeat(5,1fr);gap:0;padding:5px;border-radius:22px;background:var(--dock);box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--rim2),0 -10px 40px -10px #000a;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
 :root[data-fx=lite] .menu{background:var(--bg)}
 .menu a{flex-direction:column;gap:3px;padding:8px 2px 7px;font-size:11.5px;text-align:center;justify-content:center;border-radius:17px}
 .menu a i{display:block}
 .page{padding-top:76px;padding-bottom:112px}
 .themep{top:62px}
 .bhead{grid-template-columns:auto minmax(0,1fr) auto}
 .bmeta{grid-column:2 / -1}
 .gv{width:96px;height:96px}
 .eh{grid-template-columns:1fr;justify-items:center;text-align:center}
 .eh .slot{margin:-10px 0 -6px}
 .eh .mini{grid-template-columns:1fr 1fr;border-left:0;border-top:1px solid var(--line);padding:18px 0 0;width:100%;text-align:center}
}
@media(max-width:560px){
 .opts,.edit .two,.tiles{grid-template-columns:1fr}
 .hero h1{font-size:clamp(27px,8.2vw,36px)}
 .tele>div{padding:18px 18px}
 .readout{padding:14px 18px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.path .node{background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--on)}.path .pulse{display:none}}

</style>
</head>
<body>
<div class="bgfx" aria-hidden="true"></div>
<div class="grain" aria-hidden="true"></div>
<div class="spot" id="spot" aria-hidden="true"></div>
<div class="rxwrap" id="rxwrap" hidden><i class="rxhalo"></i><i class="rxplat" id="rxplat"></i><canvas id="rxc" role="img" aria-label="Núcleo con bots orbitando"></canvas></div>
<header class="top glass blur">
 <a class="brand" href="#/inicio"><span class="led" id="dot"></span><b id="bn">__NOMBRE__</b></a>
 <span class="svc" id="pst" role="status">Conectando…</span>
 <nav class="menu" aria-label="Secciones">
  <a data-r="inicio" href="#/inicio"><i data-i="home"></i>Inicio</a>
  <a data-r="vincular" href="#/vincular"><i data-i="link"></i>Vincular</a>
  <a data-r="bots" href="#/bots"><i data-i="bot"></i>Bots</a>
  <a data-r="estado" href="#/estado"><i data-i="pulse"></i>Estado</a>
  <a href="__CANAL__" target="_blank" rel="noopener"><i data-i="ext"></i>Canal</a>
 </nav>
 <button class="tone" id="tbtn" type="button" aria-label="Cambiar colores y efectos" aria-expanded="false"><span data-i="palette" style="display:contents"></span></button>
</header>
<div class="themep glass" id="themep" hidden>
 <h4>Colores y efectos</h4>
 <div class="seg2" id="mode"><button type="button" data-m="dark">Oscuro</button><button type="button" data-m="light">Claro</button></div>
 <div class="sw" id="sw"></div>
 <label for="hue">Tono</label>
 <input type="range" min="0" max="360" id="hue">
 <div class="row"><span class="lbl">Efectos</span><div class="seg2" id="fx"><button type="button" data-v="full">Completos</button><button type="button" data-v="lite">Ligeros</button></div></div>
 <button class="btn" type="button" style="width:100%;margin-top:18px" id="treset">Restablecer</button>
</div>
<main class="page" id="page"></main>
<script>
/* ================= Reactor 3D (canvas 2D, proyección propia) ================= */
var Reactor=(function(){
var TAU=Math.PI*2,sin=Math.sin,cos=Math.cos,pow=Math.pow,sqrt=Math.sqrt,floor=Math.floor,abs=Math.abs;
function clamp(v,a,b){return v<a?a:(v>b?b:v)}
function ease(t){t=clamp(t,0,1);return 1-pow(1-t,3)}
function eob(t){t=clamp(t,0,1);return 1+2.4*pow(t-1,3)+1.4*pow(t-1,2)}
function hash(n){var x=sin(n*127.1+311.7)*43758.5453;return x-floor(x)}
function hyp(a,b){return sqrt(a*a+b*b)}
function pc(c,a,dl){return 'hsla('+c[0]+','+c[1]+'%,'+clamp(c[2]+(dl||0),0,100)+'%,'+clamp(a,0,1).toFixed(3)+')'}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}

/* icosaedro subdividido una vez: 42 vértices, 120 aristas */
var ICO=(function(){
 var t=(1+sqrt(5))/2,v=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
 var f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 function nrm(p){var l=sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2]);return [p[0]/l,p[1]/l,p[2]/l]}
 v=v.map(nrm);var cache={};
 function mid(a,b){var k=a<b?a+'_'+b:b+'_'+a;if(cache[k]!=null)return cache[k];v.push(nrm([(v[a][0]+v[b][0])/2,(v[a][1]+v[b][1])/2,(v[a][2]+v[b][2])/2]));return (cache[k]=v.length-1)}
 var f2=[];f.forEach(function(q){var a=mid(q[0],q[1]),b=mid(q[1],q[2]),c=mid(q[2],q[0]);f2.push([q[0],a,c],[q[1],b,a],[q[2],c,b],[a,b,c])});
 var seen={},e=[];
 f2.forEach(function(q){[[q[0],q[1]],[q[1],q[2]],[q[2],q[0]]].forEach(function(p){var k=p[0]<p[1]?p[0]+'_'+p[1]:p[1]+'_'+p[0];if(!seen[k]){seen[k]=1;e.push(p)}})});
 return {v:v,e:e,f:f2};
})();

/* matriz de Euler Rz(c)·Rx(a)·Ry(b) */
function eul(a,b,c,m){
 var ca=cos(a),sa=sin(a),cb=cos(b),sb=sin(b),cc=cos(c),sc=sin(c);
 m[0]=cc*cb-sc*sa*sb;m[1]=-sc*ca;m[2]=cc*sb+sc*sa*cb;
 m[3]=sc*cb+cc*sa*sb;m[4]=cc*ca;m[5]=sc*sb-cc*sa*cb;
 m[6]=-ca*sb;m[7]=sa;m[8]=ca*cb;
}

var RINGS=[
 {r:1.0,w:2.3,c:'acc',a:function(t){return 1.15+0.14*sin(t*0.21)},b:function(t){return t*0.16},z:function(){return 0.35}},
 {r:0.8,w:1.9,c:'acc2',a:function(t){return 0.55+0.1*sin(t*0.17)},b:function(t){return 1.1-t*0.23},z:function(t){return t*0.09}},
 {r:0.6,w:1.6,c:'acc3',a:function(t){return -0.95+0.2*sin(t*0.3)},b:function(t){return t*0.37},z:function(t){return -t*0.12}}
];
var BA=[0.16,0.32,0.62,0.95],BW=[0.8,1,1.35,1.8];
var CFG=[
 {ring:40,orb:0,trail:8,dust:24,glow:0,light:0,plat:0,fac:0,oall:0,fps:20,slow:70},
 {ring:64,orb:36,trail:14,dust:70,glow:0,light:1,plat:1,fac:1,oall:0,fps:30,slow:48},
 {ring:96,orb:64,trail:20,dust:150,glow:1,light:1,plat:1,fac:1,oall:1,fps:60,slow:27}
];
var MAXS=16;

function create(canvas,opt){
 opt=opt||{};
 var cx=canvas.getContext('2d');
 var W=0,DPR=1,S=1,CC=0,U=1,VS=1;
 var Q=opt.quality==null?2:opt.quality,cfg=CFG[Q],dark=true,hue=338,dirty=true,still=false;
 var P={},SP={};
 var t=0,tr=0,age=0,spd=1,spdT=1,mode='idle',modeT=3;
 var yaw=0.55,pitch=0.36,pyaw=0,ppitch=0,vyaw=0,vpitch=0,tx=0,ty=0,gx=0,gy=0;
 var lx=0.5,ly=0.4,lxT=0.5,lyT=0.4,lOn=0,lOnT=0;
 var hover=-1,focus=-1,pin=-1,pinT=0,drag=false;
 var bots=[],sats=[],waves=[],flash=0;
 var raf=0,running=false,lastT=0,ema=16.7,slow=0,frames=0,vis=true,paused=false,minDt=1000/cfg.fps;
 var cyw=1,syw=0,cpw=1,spw=0,FOC=3.4,PX=0,PY=0,PZ=0,platN=0.9,platS=0.35;
 var RP=[new Float32Array(96*3),new Float32Array(96*3),new Float32Array(96*3)];
 var M=new Float32Array(9),CV=new Float32Array(ICO.v.length*3),NV=new Float32Array(ICO.v.length*3),LV=[0.3,0.5,0.8];
 var DUST=(function(n){var d=new Float32Array(n*4);for(var i=0;i<n;i++){var u=hash(i+1)*TAU,v=hash(i+77)*2-1,r=1.2+hash(i+31)*0.85,s=sqrt(1-v*v);d[i*4]=r*s*cos(u);d[i*4+1]=r*v*0.85;d[i*4+2]=r*s*sin(u);d[i*4+3]=0.6+hash(i+9)*1.4}return d})(150);
 var DP=new Float32Array(150*3),TK=new Float32Array(72*5),OP=new Float32Array(MAXS*64*3);

 function pj(x,y,z){
  var x1=x*cyw+z*syw,z1=z*cyw-x*syw,y1=y*cpw-z1*spw,z2=y*spw+z1*cpw,k=FOC/(FOC-z2);
  PX=CC+x1*k*S;PY=CC-y1*k*S;PZ=z2;
 }
 function calcU(){U=DPR*clamp(pow(1/VS,0.72),1,2.6)}

 /* ---------- tema y sprites ---------- */
 function glow(c){
  var n=96,cv=document.createElement('canvas');cv.width=cv.height=n;
  var g=cv.getContext('2d'),r=n/2,gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,dark?pc([c[0],c[1],97],1):pc(c,0.9));gr.addColorStop(0.14,pc(c,dark?0.95:0.7));
  gr.addColorStop(0.42,pc(c,dark?0.28:0.16));gr.addColorStop(1,pc(c,0));
  g.fillStyle=gr;g.fillRect(0,0,n,n);return cv;
 }
 function setTheme(h,d){
  hue=h;dark=!!d;
  P.acc=[h,96,dark?68:50];P.acc2=[(h+288)%360,92,dark?74:52];P.acc3=[(h+38)%360,100,dark?78:52];P.hot=[(h+14)%360,100,dark?94:58];P.ok=[158,100,dark?70:34];P.mut=[h,14,dark?70:40];
  SP.hot=glow(P.hot);SP.ok=glow(P.ok);
  dirty=true;
 }
 function setQuality(q){Q=clamp(q,0,2);cfg=CFG[Q];minDt=1000/cfg.fps;dirty=true;if(opt.onQuality)opt.onQuality(Q)}

 /* ---------- tamaño ---------- */
 function resize(css,cap){
  DPR=Math.min(window.devicePixelRatio||1,cap||2);
  var px=Math.max(64,Math.round(css*DPR));
  if(px!==W){W=px;canvas.width=W;canvas.height=W}
  canvas.style.width=css+'px';canvas.style.height=css+'px';
  S=W*0.33;CC=W/2;calcU();dirty=true;
 }
 function setViewScale(s){var v=clamp(s,0.1,1.6);if(abs(v-VS)>0.004){VS=v;calcU()}}

 /* ---------- satélites ---------- */
 function setBots(list){
  var old={};sats.forEach(function(s){old[s.key]=s});
  bots=(list||[]).slice(0,MAXS);
  var first=sats.length===0&&age<2;
  sats=bots.map(function(b,i){
   var key=b.slug||b.nombre||String(i),o=old[key];
   var h1=hash(i*3.7+(b.nombre||'').length*1.3),h2=hash(i*5.1+2),h3=hash(i*7.9+4);
   var inc=(h2-0.5)*1.5+(i%2?0.3:-0.3),node=i*2.39996;
   var s={key:key,b:b,i:i,r:[0.62,0.86,1.12,1.34][i%4]+(h1-0.5)*0.08,inc:inc,ci:cos(inc),si:sin(inc),node:node,cn:cos(node),sn:sin(node),
    w:(0.24+h3*0.2)*(i%2?1:-1)*(b.online?1:0.35),ph:h1*TAU,on:!!b.online,pr:!!b.principal,size:3.4+Math.min(b.grupos||0,24)*0.14,
    birth:o?o.birth:(still?0:(first?0.75+i*0.13:age+0.1)),rs:1,sp:1,hx:0,hy:0,hz:0,vis:false,tr:new Float32Array(25*3),pk:1+hash(i+5)*4,pt:-1,la:o?o.la:1};
   return s;
  });
  if(hover>=sats.length)hover=-1;if(focus>=sats.length)focus=-1;if(pin>=sats.length)pin=-1;
  dirty=true;
 }
 function satPos(s,th,rs){
  var r=s.r*rs,x=r*cos(th),z=r*sin(th),y1=-z*s.si,z1=z*s.ci;
  pj(x*s.cn+z1*s.sn,y1,z1*s.cn-x*s.sn);
 }
 function prepSats(){
  var L=cfg.trail,step=0.06,i,j,k;
  for(i=0;i<sats.length;i++){
   var s=sats[i],a=age-s.birth;
   s.sp=ease(a/0.8);s.rs=0.35+0.65*eob(a/1.1);
   if(s.sp<=0.001){s.vis=false;continue}
   var th=s.ph+s.w*tr;
   satPos(s,th,s.rs);s.hx=PX;s.hy=PY;s.hz=PZ;s.vis=true;
   var dir=s.w>=0?1:-1;
   for(k=0;k<=L;k++){satPos(s,th-dir*k*step,s.rs);s.tr[k*3]=PX;s.tr[k*3+1]=PY;s.tr[k*3+2]=PZ}
  }
  /* órbitas */
  var n=cfg.orb;
  if(n){for(i=0;i<sats.length;i++){var q=sats[i];if(!q.vis)continue;if(!cfg.oall&&!(i===hover||i===focus||i===pin))continue;for(j=0;j<=n;j++){satPos(q,j/n*TAU,q.rs);var o=(i*64+j)*3;OP[o]=PX;OP[o+1]=PY;OP[o+2]=PZ}}}
 }

 /* ---------- actualización ---------- */
 function pulse(){waves.push({a:t,k:1})}
 function setMode(m){
  mode=m;modeT=0.05;
  spdT=m==='wait'?2.6:(m==='code'||m==='qr')?1.7:m==='ok'?1.5:1;
  if(m==='ok')burst();
  dirty=true;
 }
 function burst(){flash=1;waves.push({a:t,k:2},{a:t+0.16,k:2},{a:t+0.34,k:2})}
 function update(dt){
  t+=dt;age+=dt;
  var kk=Math.min(1,dt*4);
  spd+=(spdT-spd)*Math.min(1,dt*2.5);tr+=dt*spd;
  pyaw+=(tx*0.55+gx*0.5-pyaw)*kk;ppitch+=(-ty*0.2+gy*0.3-ppitch)*kk;
  if(!drag){yaw+=vyaw*dt;pitch+=vpitch*dt;vyaw*=pow(0.06,dt);vpitch*=pow(0.06,dt);yaw+=dt*0.1*spd}
  pitch=clamp(pitch,-0.15,1.05);
  lx+=(lxT-lx)*kk;ly+=(lyT-ly)*kk;lOn+=(lOnT-lOn)*Math.min(1,dt*3);
  flash*=pow(0.03,dt);
  modeT-=dt;
  if(modeT<=0){if(mode==='wait'){pulse();modeT=1.05}else if(mode==='code'||mode==='qr'){pulse();modeT=2.4}else if(mode==='idle'){pulse();modeT=6}else modeT=6}
  for(var i=waves.length-1;i>=0;i--)if(t-waves[i].a>2.2)waves.splice(i,1);
  if(pin>=0){pinT-=dt;if(pinT<=0)pin=-1}
  for(i=0;i<sats.length;i++){var s=sats[i];
   if(s.on&&s.vis){s.pk-=dt;if(s.pk<=0&&s.pt<0){s.pt=0;s.pk=2.2+hash(i+t)*4}}
   if(s.pt>=0){s.pt+=dt/0.9;if(s.pt>=1)s.pt=-1}
  }
 }

 /* ---------- dibujo ---------- */
 function prepRing(i,rm){
  var R=RINGS[i],n=cfg.ring,r=R.r*rm,out=RP[i];
  eul(R.a(tr),R.b(tr),R.z(tr),M);
  for(var j=0;j<n;j++){var a=j/n*TAU,x=r*cos(a),y=r*sin(a);
   pj(M[0]*x+M[1]*y,M[3]*x+M[4]*y,M[6]*x+M[7]*y);
   out[j*3]=PX;out[j*3+1]=PY;out[j*3+2]=PZ/r;
  }
 }
 function ringBands(c,i,b0,b1,am){
  var out=RP[i],n=cfg.ring,R=RINGS[i],col=P[R.c];
  for(var b=b0;b<b1;b++){
   c.beginPath();var any=false,open=false;
   for(var j=0;j<n;j++){
    var j2=j+1===n?0:j+1,z=(out[j*3+2]+out[j2*3+2])*0.5,bb=z<-0.5?0:z<0?1:z<0.5?2:3;
    if(bb!==b){open=false;continue}
    if(!open){c.moveTo(out[j*3],out[j*3+1]);open=true}
    c.lineTo(out[j2*3],out[j2*3+1]);any=true;
   }
   if(!any)continue;
   c.strokeStyle=pc(col,BA[b]*am*(dark?1:1.3));c.lineWidth=BW[b]*R.w*U*(dark?0.9:1.05);c.stroke();
   if(cfg.glow&&b>=2){c.strokeStyle=pc(col,BA[b]*am*0.16);c.lineWidth=BW[b]*R.w*U*4.4;c.stroke()}
  }
 }
 function prepTicks(rm){
  eul(1.22,-tr*0.06,0.1,M);
  for(var k=0;k<72;k++){
   var a=k/72*TAU,ca=cos(a),sa=sin(a),r0=1.17*rm,r1=(k%6===0?1.28:1.23)*rm,o=k*5;
   var x=r0*ca,y=r0*sa;pj(M[0]*x+M[1]*y,M[3]*x+M[4]*y,M[6]*x+M[7]*y);TK[o]=PX;TK[o+1]=PY;var z0=PZ;
   x=r1*ca;y=r1*sa;pj(M[0]*x+M[1]*y,M[3]*x+M[4]*y,M[6]*x+M[7]*y);TK[o+2]=PX;TK[o+3]=PY;TK[o+4]=(z0+PZ)*0.5;
  }
 }
 function ticks(c,front,am){
  c.beginPath();
  for(var k=0;k<72;k++){var o=k*5,f=TK[o+4]>=0;if(f!==front)continue;c.moveTo(TK[o],TK[o+1]);c.lineTo(TK[o+2],TK[o+3])}
  c.strokeStyle=pc(P.acc,(front?0.55:0.2)*am);c.lineWidth=U*(front?1.1:0.8);c.stroke();
 }
 function scanner(c,am,idx,spd,col,ln){
  var n=cfg.ring,out=RP[idx],len=Math.max(6,floor((n>>3)*ln)),j0=((floor(tr*(n/6)*spd)%n)+n)%n;
  c.beginPath();var open=false;
  for(var d=0;d<len;d++){var j=(j0+d)%n,j2=(j+1)%n;if(out[j*3+2]<-0.15){open=false;continue}
   if(!open){c.moveTo(out[j*3],out[j*3+1]);open=true}c.lineTo(out[j2*3],out[j2*3+1])}
  c.strokeStyle=pc(col,0.9*am);c.lineWidth=U*2.8;c.lineCap='round';c.stroke();
  if(cfg.glow){c.strokeStyle=pc(col,0.25*am);c.lineWidth=U*9;c.stroke()}
 }
 function platform(c,am){
  var y=-1.34,i,j,a;
  var R=[0.9,1.35,1.82],A=[0.2,0.12,0.07];
  for(i=0;i<3;i++){c.beginPath();for(j=0;j<=56;j++){a=j/56*TAU;pj(R[i]*cos(a),y,R[i]*sin(a));if(j)c.lineTo(PX,PY);else c.moveTo(PX,PY)}c.strokeStyle=pc(P.acc,A[i]*am);c.lineWidth=U;c.stroke()}
  /* marcas y barrido */
  c.beginPath();for(j=0;j<24;j++){a=j/24*TAU+tr*0.05;pj(1.35*cos(a),y,1.35*sin(a));c.moveTo(PX,PY);pj(1.45*cos(a),y,1.45*sin(a));c.lineTo(PX,PY)}
  c.strokeStyle=pc(P.acc,0.3*am);c.lineWidth=U;c.stroke();
  a=tr*0.9;
  for(var q=0;q<3;q++){var wd=[0.75,0.42,0.16][q];c.beginPath();pj(0,y,0);c.moveTo(PX,PY);for(j=0;j<=8;j++){var aa=a-wd*j/8;pj(1.82*cos(aa),y,1.82*sin(aa));c.lineTo(PX,PY)}c.closePath();c.fillStyle=pc(P.acc,0.045*am);c.fill()}
  c.beginPath();pj(0,y,0);c.moveTo(PX,PY);pj(1.82*cos(a),y,1.82*sin(a));c.lineTo(PX,PY);c.strokeStyle=pc(P.acc,0.22*am);c.lineWidth=U*1.2;c.stroke();
 }
 function dust(c,front,am){
  var n=cfg.dust,rot=tr*0.03,cr=cos(rot),sr=sin(rot),i;
  c.fillStyle=pc(P.hot,1);
  for(i=0;i<n;i++){
   var x=DUST[i*4],y=DUST[i*4+1],z=DUST[i*4+2];
   pj(x*cr+z*sr,y,z*cr-x*sr);
   if((PZ>=0)!==front)continue;
   var d=hyp(PX-CC,PY-CC)/CC,af=clamp((1-d)*3.2,0,1);if(af<=0)continue;
   var za=clamp((PZ+1.9)/3.8,0,1),sz=DUST[i*4+3]*U*(0.7+0.6*za);
   c.globalAlpha=(0.12+0.6*za)*am*af;c.fillRect(PX-sz/2,PY-sz/2,sz,sz);
  }
  c.globalAlpha=1;
 }
 function lightVec(){
  /* luz en espacio de vista: sigue al puntero; sin puntero deriva sola */
  var dx=0.5*cos(tr*0.4),dy=0.55+0.1*sin(tr*0.3),dz=0.75;
  var px=(lx-0.5)*2.4,py=-(ly-0.5)*2.4,pz=0.9,k=lOn;
  var x=dx+(px-dx)*k,y=dy+(py-dy)*k,z=dz+(pz-dz)*k,l=sqrt(x*x+y*y+z*z)||1;
  LV[0]=x/l;LV[1]=y/l;LV[2]=z/l;
 }
 function facets(c,am){
  var F=ICO.f,n=F.length,i,a,b,d,nx,ny,nz,x1,y1,z1,z2,l,dif,rim,al,L0=LV[0],L1=LV[1],L2=LV[2];
  for(i=0;i<n;i++){
   a=F[i][0];b=F[i][1];d=F[i][2];
   if(CV[a*3+2]+CV[b*3+2]+CV[d*3+2]<0)continue;
   nx=NV[a*3]+NV[b*3]+NV[d*3];ny=NV[a*3+1]+NV[b*3+1]+NV[d*3+1];nz=NV[a*3+2]+NV[b*3+2]+NV[d*3+2];
   x1=nx*cyw+nz*syw;z1=nz*cyw-nx*syw;y1=ny*cpw-z1*spw;z2=ny*spw+z1*cpw;
   l=sqrt(x1*x1+y1*y1+z2*z2)||1;x1/=l;y1/=l;z2/=l;
   dif=x1*L0+y1*L1+z2*L2;if(dif<0)dif=0;
   rim=1-(z2>0?z2:0);rim*=rim;
   al=(0.035+0.34*dif*dif+0.16*rim)*am;
   c.beginPath();c.moveTo(CV[a*3],CV[a*3+1]);c.lineTo(CV[b*3],CV[b*3+1]);c.lineTo(CV[d*3],CV[d*3+1]);c.closePath();
   c.fillStyle=pc(i%3===0?P.acc2:P.acc,al);c.fill();
   if(dif>0.72){c.fillStyle=pc(P.hot,(dif-0.72)*1.5*am);c.fill()}
  }
 }
 function core(c,am,front){
  var br=1+0.05*sin(tr*2.2)+flash*0.3,i,e;
  if(!front){
   /* vértices: se rotan una vez por cuadro y se guardan también sin proyectar (para las normales) */
   var ry=tr*0.33,rx=tr*0.21,cy=cos(ry),sy=sin(ry),cxx=cos(rx),sx=sin(rx),r0=0.27*br*Math.min(1,0.4+age*0.9);
   for(i=0;i<ICO.v.length;i++){var v=ICO.v[i],x=v[0]*cy+v[2]*sy,z=v[2]*cy-v[0]*sy,y=v[1]*cxx-z*sx,z2=v[1]*sx+z*cxx;
    NV[i*3]=x;NV[i*3+1]=y;NV[i*3+2]=z2;
    pj(x*r0,y*r0,z2*r0);CV[i*3]=PX;CV[i*3+1]=PY;CV[i*3+2]=PZ}
  }
  c.beginPath();
  for(e=0;e<ICO.e.length;e++){var a=ICO.e[e][0],b=ICO.e[e][1],f=(CV[a*3+2]+CV[b*3+2])>=0;if(f!==front)continue;c.moveTo(CV[a*3],CV[a*3+1]);c.lineTo(CV[b*3],CV[b*3+1])}
  c.strokeStyle=pc(P.hot,(front?0.85:0.3)*am);c.lineWidth=U*(front?1.2:0.8);c.stroke();
  if(!front){
   lightVec();if(cfg.fac)facets(c,am);
   var ns=S*1.12*(0.95+0.1*sin(tr*2.6))*(1+flash*0.9);c.globalAlpha=(dark?0.9:0.42)*am;c.drawImage(SP.hot,CC-ns/2,CC-ns/2,ns,ns);c.globalAlpha=1;
  }
 }
 function satDraw(c,s,front,am){
  if(!s.vis||(s.hz>=0)!==front)return;
  var L=cfg.trail,hv=(s.i===hover||s.i===focus||s.i===pin),al=s.sp*am,col=s.on?P.ok:P.mut,k,ch;
  if(s.on){
   var chunks=Q>=1?3:1,per=L/chunks;
   for(ch=0;ch<chunks;ch++){
    c.beginPath();var k0=floor(ch*per),k1=floor((ch+1)*per);
    c.moveTo(s.tr[k0*3],s.tr[k0*3+1]);for(k=k0+1;k<=k1;k++)c.lineTo(s.tr[k*3],s.tr[k*3+1]);
    c.strokeStyle=pc(col,(0.55-ch*0.19)*al*(hv?1.3:1));c.lineWidth=U*(1.9-ch*0.45)*(hv?1.4:1);c.lineCap='round';c.stroke();
   }
  }
  var rad=s.size*U*(hv?1.4:1)*(0.85+0.15*s.sp);
  if(s.on){
   var g=rad*6.5;c.globalAlpha=al*(hv?1:0.85);c.drawImage(SP.ok,s.hx-g/2,s.hy-g/2,g,g);c.globalAlpha=1;
   c.beginPath();c.arc(s.hx,s.hy,rad*0.5,0,TAU);c.fillStyle=pc([col[0],40,dark?97:92],al);c.fill();
  }else{
   c.beginPath();c.arc(s.hx,s.hy,rad*0.6,0,TAU);c.strokeStyle=pc(col,0.5*al);c.lineWidth=U*1.3;c.stroke();
  }
  if(s.pr||hv){c.beginPath();c.arc(s.hx,s.hy,rad*(hv?1.5:1.3),0,TAU);c.strokeStyle=pc(P.acc3,(hv?0.9:0.55)*al);c.lineWidth=U*1.2;c.stroke()}
 }
 function orbits(c,front,am){
  var n=cfg.orb;if(!n)return;
  c.beginPath();var hl=-1;
  for(var i=0;i<sats.length;i++){var s=sats[i];if(!s.vis)continue;
   if(s.i===hover||s.i===focus||s.i===pin){hl=i;continue}
   if(!cfg.oall)continue;
   var open=false;
   for(var j=0;j<n;j++){var o=(i*64+j)*3,o2=o+3,f=(OP[o+2]+OP[o2+2])>=0;if(f!==front){open=false;continue}
    if(!open){c.moveTo(OP[o],OP[o+1]);open=true}c.lineTo(OP[o2],OP[o2+1])}
  }
  c.strokeStyle=pc(P.acc,0.09*am);c.lineWidth=U;c.stroke();
  if(hl>=0){c.beginPath();var op=false;for(var q=0;q<n;q++){var u=(hl*64+q)*3,u2=u+3,ff=(OP[u+2]+OP[u2+2])>=0;if(ff!==front){op=false;continue}if(!op){c.moveTo(OP[u],OP[u+1]);op=true}c.lineTo(OP[u2],OP[u2+1])}c.strokeStyle=pc(P.acc3,0.5*am);c.lineWidth=U*1.4;c.stroke()}
 }
 function links(c,am){
  c.beginPath();var i,s;
  for(i=0;i<sats.length;i++){s=sats[i];if(!s.vis||!s.on||s.i===hover||s.i===focus||s.i===pin)continue;c.moveTo(CC,CC);c.lineTo(s.hx,s.hy)}
  c.strokeStyle=pc(P.acc,0.07*am*1);c.lineWidth=U;c.stroke();
  for(i=0;i<sats.length;i++){s=sats[i];if(!s.vis||!s.on)continue;
   if(s.i===hover||s.i===focus||s.i===pin){c.beginPath();c.moveTo(CC,CC);c.lineTo(s.hx,s.hy);c.strokeStyle=pc(P.acc3,0.55*am);c.lineWidth=U*1.3;c.stroke()}
   if(s.pt>=0){var p=ease(s.pt),px=CC+(s.hx-CC)*p,py=CC+(s.hy-CC)*p,g=U*14;c.globalAlpha=am*(1-Math.abs(s.pt-0.5)*0.8);c.drawImage(SP.hot,px-g/2,py-g/2,g,g);c.globalAlpha=1}
  }
 }
 function waveDraw(c,am){
  for(var i=0;i<waves.length;i++){var w=waves[i],a=t-w.a;if(a<0)continue;
   var p=a/(w.k===2?1.7:2.1),r=0.2+p*(w.k===2?2.1:1.6),al=(1-p)*(w.k===2?0.7:0.32)*am;if(al<=0.01)continue;
   c.beginPath();for(var j=0;j<=64;j++){var th=j/64*TAU;pj(r*cos(th),-0.04,r*sin(th));if(j)c.lineTo(PX,PY);else c.moveTo(PX,PY)}
   c.strokeStyle=pc(w.k===2?P.ok:P.acc3,al);c.lineWidth=U*(w.k===2?2.4:1.6)*(1-p*0.5);c.stroke();
  }
 }
 function labels(c,am){
  var fs=clamp(12.5/VS,12,34)*DPR,showAll=sats.length<=4&&VS>0.42,i,s;
  for(i=0;i<sats.length;i++){
   s=sats[i];if(!s.vis||s.sp<0.9)continue;
   var hv=(s.i===hover||s.i===focus||s.i===pin);
   if(!hv&&!(showAll&&s.on&&s.hz>-0.15))continue;
   var name=String(s.b.nombre||'Bot'),sub=opt.sub?opt.sub(s.b):'';
   c.textBaseline='middle';
   if(hv){
    c.font='600 '+fs+'px "Instrument Sans",system-ui,sans-serif';var w1=c.measureText(name).width;
    c.font='500 '+(fs*0.84)+'px "JetBrains Mono",ui-monospace,monospace';var w2=sub?c.measureText(sub).width:0;
    var pw=Math.max(w1,w2)+fs*1.5,ph=fs*(sub?2.9:1.9),bx=s.hx+fs*1.1,by=s.hy-ph-fs*0.4;
    if(bx+pw>W*0.93)bx=s.hx-pw-fs*1.1;if(by<W*0.06)by=s.hy+fs*0.8;var m0=W*0.07;bx=clamp(bx,m0,Math.max(m0,W-m0-pw));
    rr(c,bx,by,pw,ph,fs*0.7);c.fillStyle=dark?'rgba(12,7,18,0.82)':'rgba(255,255,255,0.9)';c.fill();
    c.strokeStyle=dark?'rgba(255,255,255,0.2)':'rgba(30,20,40,0.16)';c.lineWidth=DPR;c.stroke();
    c.fillStyle=dark?'#fff':'#1c1226';c.font='600 '+fs+'px "Instrument Sans",system-ui,sans-serif';c.fillText(name,bx+fs*0.75,by+ph*(sub?0.33:0.5));
    if(sub){c.fillStyle=dark?'rgba(255,255,255,0.68)':'rgba(30,20,40,0.65)';c.font='500 '+(fs*0.84)+'px "JetBrains Mono",ui-monospace,monospace';c.fillText(sub,bx+fs*0.75,by+ph*0.7)}
   }else{
    var av=opt.avoid?opt.avoid(s.hx/DPR,s.hy/DPR):1;s.la+=(av-s.la)*0.2;
    if(s.la>0.04){
     c.font='600 '+(fs*0.92)+'px "Instrument Sans",system-ui,sans-serif';
     var a=clamp((s.hz+0.15)*1.2,0.35,1)*am*0.9*s.la;
     c.lineWidth=fs*0.28;c.lineJoin='round';c.strokeStyle=dark?'rgba(8,4,14,'+(0.7*a).toFixed(2)+')':'rgba(255,255,255,'+(0.8*a).toFixed(2)+')';
     var tw=c.measureText(name).width,tx0=s.hx+fs*0.9;if(tx0+tw>W-6)tx0=s.hx-fs*0.9-tw;if(tx0<6)tx0=6;
     c.strokeText(name,tx0,s.hy-fs*0.9);c.fillStyle=dark?'rgba(255,255,255,'+a.toFixed(2)+')':'rgba(28,18,38,'+a.toFixed(2)+')';c.fillText(name,tx0,s.hy-fs*0.9);
    }
   }
  }
 }
 function lightPass(c){
  if(!cfg.light||!dark||lOn<0.03)return;
  var px=lx*W,py=ly*W,r=W*0.26,g=c.createRadialGradient(px,py,0,px,py,r);
  g.addColorStop(0,'hsla('+hue+',100%,92%,'+(0.42*lOn).toFixed(3)+')');g.addColorStop(1,'hsla('+hue+',100%,92%,0)');
  c.globalCompositeOperation='source-atop';c.fillStyle=g;c.fillRect(px-r,py-r,r*2,r*2);c.globalCompositeOperation='source-over';
 }
 function draw(){
  if(!W)return;
  var c=cx,i;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,W,W);c.lineCap='round';c.lineJoin='round';
  cyw=cos(yaw+pyaw);syw=sin(yaw+pyaw);cpw=cos(pitch+ppitch);spw=sin(pitch+ppitch);
  var am=ease(age/0.8),rm=0.45+0.55*eob(age/1.5);
  pj(0,-1.34,0);platN=PY/W;platS=Math.max(0.14,abs(spw));
  prepSats();for(i=0;i<3;i++)prepRing(i,rm);prepTicks(rm);
  c.globalCompositeOperation=dark?'lighter':'source-over';
  if(cfg.plat)platform(c,am);
  dust(c,false,am);
  for(i=0;i<3;i++)ringBands(c,i,0,2,am);
  ticks(c,false,am);
  orbits(c,false,am);
  links(c,am);
  for(i=0;i<sats.length;i++)satDraw(c,sats[i],false,am);
  core(c,am,false);
  core(c,am,true);
  for(i=0;i<3;i++)ringBands(c,i,2,4,am);
  scanner(c,am,0,1,P.hot,1);if(cfg.glow){scanner(c,am,1,-0.7,P.acc2,0.7);scanner(c,am,2,1.3,P.acc3,0.55)}
  ticks(c,true,am);
  orbits(c,true,am);
  for(i=0;i<sats.length;i++)satDraw(c,sats[i],true,am);
  waveDraw(c,am);
  dust(c,true,am);
  c.globalCompositeOperation='source-over';
  lightPass(c);
  labels(c,am);
 }

 /* ---------- bucle ---------- */
 function loop(ts){
  raf=requestAnimationFrame(loop);
  var dtm=ts-lastT;if(dtm<minDt-2)return;
  lastT=ts;var dt=Math.min(0.05,dtm/1000);
  if(opt.tick)opt.tick(dt);
  if(!vis){paused=true;return}
  if(still&&!dirty)return;
  if(!still)update(dt);
  draw();dirty=false;
  if(paused){paused=false;return}
  if(!still&&++frames>40){ema+=(dtm-ema)*0.08;if(ema>cfg.slow){if(++slow>45){if(Q>0)setQuality(Q-1);else if(!still){setStill(true);if(opt.onQuality)opt.onQuality(-1)}slow=0;ema=16.7}}else slow=Math.max(0,slow-2)}
 }
 function start(){if(running)return;running=true;lastT=performance.now();raf=requestAnimationFrame(loop)}
 function stop(){running=false;cancelAnimationFrame(raf)}
 function setStill(v){still=!!v;if(still){age=3;tr=2.5;t=2.5;spdT=spd=1}dirty=true}
 function setVisible(v){vis=!!v}

 /* ---------- entradas ---------- */
 function pointer(nx,ny,on){tx=clamp(nx,-1.3,1.3);ty=clamp(ny,-1.3,1.3);lxT=0.5+nx*0.5;lyT=0.5+ny*0.5;lOnT=on?1:0;idleT=0;if(still)dirty=true}
 var idleT=0;
 function pick(nx,ny,rad){
  var px=CC+nx*CC,py=CC+ny*CC,best=-1,bd=1e9,r=rad*DPR/VS;
  for(var i=0;i<sats.length;i++){var s=sats[i];if(!s.vis||s.sp<0.9)continue;var d=hyp(s.hx-px,s.hy-py);if(d<r&&d<bd){bd=d;best=i}}
  return best;
 }
 function setHover(i){if(i!==hover){hover=i;dirty=true}}
 function setFocus(i){if(i!==focus){focus=i;dirty=true}}
 function setPin(i){pin=i;pinT=4.5;dirty=true}
 function dragBy(dx,dy){drag=true;yaw+=dx*0.0085;pitch+=dy*0.0065;vyaw=vyaw*0.5+dx*0.0085*30;vpitch=vpitch*0.5+dy*0.0065*30;dirty=true}
 function dragEnd(){drag=false}
 function tilt(a,b){gx=clamp(a,-1,1);gy=clamp(b,-1,1);if(still)dirty=true}
 function restart(){age=0;setBots(bots);dirty=true}

 setTheme(hue,dark);
 return {start:start,stop:stop,resize:resize,setViewScale:setViewScale,setTheme:setTheme,setQuality:setQuality,setBots:setBots,setMode:setMode,burst:burst,pulse:pulse,
  pointer:pointer,pick:pick,setHover:setHover,setFocus:setFocus,pin:setPin,drag:dragBy,dragEnd:dragEnd,tilt:tilt,setVisible:setVisible,still:setStill,restart:restart,
  get quality(){return still&&Q===0?-1:Q},get plat(){return [platN,platS]},get count(){return sats.length},canvas:canvas,_draw:function(){dirty=true}};
}
return {create:create};
})();

</script>
<script>
(function(){
'use strict';
var NOMBRE=document.getElementById('bn').textContent, CANAL='__CANAL__';
var $=function(s,r){return (r||document).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clamp(v,a,b){return v<a?a:(v>b?b:v)}
var P={
 ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
 palette:'<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.2-1-1.4-1-2.5 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4A8.5 8.5 0 0 0 12 3z"/><path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01"/>',
 copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 up:'<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
 shield:'<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>',
 home:'<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
 link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 bot:'<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M9 13h.01M15 13h.01M9 16h6M3 12v3M21 12v3"/>',
 pulse:'<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
 keys:'<path d="M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01" stroke-width="3"/>',
 qr:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v6h-4M14 18v2"/>',
 prev:'<path d="m15 5-7 7 7 7"/>',
 next:'<path d="m9 5 7 7-7 7"/>'
};
function ic(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||'')+'</svg>'}
$$('[data-i]').forEach(function(e){e.innerHTML=ic(e.getAttribute('data-i'))});

/* ---------- almacenamiento (puede fallar en modo privado) ---------- */
function ls(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
function toast(t){var d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=t;document.body.appendChild(d);setTimeout(function(){d.style.opacity='0';d.style.transition='opacity .4s';setTimeout(function(){d.remove()},400)},2600)}

/* ---------- datos compartidos ---------- */
var BOTS=[],BOTS_OK=false,S=null,Sat=0,lat=[],timers=[],onbots=null;
function tokens(){var t=ls('tokens');return Array.isArray(t)?t:[]}
function api(path,opt){
 opt=opt||{};var h=opt.headers||{};var t=tokens();if(t.length)h['x-owner-tokens']=t.join(',');
 return fetch(path,{method:opt.method||'GET',headers:h,body:opt.body}).then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.error||('Error '+r.status));return j})})
}
function grupos(n){return n==null?'— grupos':n+(n===1?' grupo':' grupos')}
function dur(ms){var s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
 if(d)return d+'d '+h+'h';if(h)return h+'h '+m+'m';if(m)return m+'m '+(s%60)+'s';return s+'s'}

/* ---------- colores y efectos ---------- */
var DEF_H=338;
var PRE=[['Rosé',338],['Violeta',268],['Azul',222],['Cian',190],['Verde',152],['Naranja',22]];
var REDUCED=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
var HOVER=!!(window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches);
var DEBIL=(navigator.deviceMemory&&navigator.deviceMemory<=2)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4);
var tema=ls('tema3')||{};
if(tema.h==null)tema.h=DEF_H;
if(!tema.m)tema.m=(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';
function fxActual(){return tema.fx||(DEBIL?'lite':'full')}

/* ---------- reactor: un solo lienzo que vuela entre los huecos de cada sección ---------- */
var RXM=(function(){
 var wrap=$('#rxwrap'),cv=$('#rxc'),spot=$('#spot'),rx=null,slots=[],act=null,base=0,X=0,Y=0,Sc=1,snap=true,pageVis=true,slotVis=true,running=false,av=null,copyEl=null,scr=false,scrT=0,platEl=$('#rxplat');
 var ptr={down:false,lx:0,ly:0,moved:0},sp={x:-999,y:-999,raf:0,on:false};
 var INTER='a,button,input,select,textarea,label,summary,.top,.menu,.themep,.car,.carnav';
 function cap(){if(rx&&rx.quality<=0)return 1;return fxActual()==='lite'?1.25:1.75}
 function sub(b){var a=[];if(b.grupos!=null)a.push(grupos(b.grupos));if(b.online&&b.desde)a.push(dur(Date.now()-b.desde));return a.join(' · ')}
 function init(){
  rx=Reactor.create(cv,{quality:fxActual()==='lite'?1:2,tick:tick,sub:sub,avoid:avoid,onQuality:function(){if(base)rx.resize(base,cap())}});
  rx.setTheme(tema.h,tema.m==='dark');
  if(REDUCED)rx.still(true);
  rx.setBots(BOTS);
 }
 function apply(){if(rx)rx.setVisible(pageVis&&slotVis&&!scr)}
 function avoid(x,y){if(!av)return 1;var vx=X+x*Sc,vy=Y+y*Sc;return(vx>av.l&&vx<av.r&&vy>av.t&&vy<av.b)?0:1}
 function tick(dt){
  if(!slots.length)return;
  var vh=window.innerHeight,i,r,best=null,bel=null,bd=1e9;
  for(i=0;i<slots.length;i++){r=slots[i].getBoundingClientRect();if(r.width<8)continue;var d=Math.abs(r.top+r.height/2-vh*0.5);if(d<bd){bd=d;best=r;bel=slots[i]}}
  if(!best)return;
  act=best;
  if(copyEl&&bel&&bel.getAttribute('data-slot')==='hero'){var cr=copyEl.getBoundingClientRect();av={l:cr.left-12,r:cr.right+12,t:cr.top-12,b:cr.bottom+12}}else av=null;
  var sc=best.width/base,tx=best.left+best.width/2-base*sc/2,ty=best.top+best.height/2-base*sc/2,k=(snap||REDUCED)?1:1-Math.pow(0.03,dt||0.016);
  snap=false;X+=(tx-X)*k;Y+=(ty-Y)*k;Sc+=(sc-Sc)*k;
  wrap.style.transform='translate3d('+X.toFixed(1)+'px,'+Y.toFixed(1)+'px,0) scale('+Sc.toFixed(4)+')';
  rx.setViewScale(Sc);
  var pl=rx.plat;platEl.style.transform='translateY('+((pl[0]-0.905)*base).toFixed(1)+'px) scaleY('+(pl[1]/0.35).toFixed(3)+')';
  var sz=base*Sc,v=X+sz>-40&&X<window.innerWidth+40&&Y+sz>-40&&Y<vh+40;
  if(v!==slotVis){slotVis=v;apply()}
 }
 function refresh(){
  slots=$$('[data-slot]').filter(function(e){return e.getBoundingClientRect().width>=8});copyEl=$('.hero .copy');av=null;
  if(!slots.length){wrap.hidden=true;if(rx&&running){rx.stop();running=false}return}
  if(!rx)init();
  var mx=0;slots.forEach(function(e){mx=Math.max(mx,e.getBoundingClientRect().width)});
  var size=clamp(Math.round(mx),200,960);
  if(size!==base){base=size;rx.resize(base,cap());wrap.style.width=base+'px';wrap.style.height=base+'px'}
  wrap.hidden=false;snap=true;slotVis=true;apply();
  tick(0.016);
  if(!running){rx.start();running=true}
  rx.setBots(BOTS);label();
 }
 function label(){var n=BOTS.filter(function(b){return b.online}).length;cv.setAttribute('aria-label',n===1?'Núcleo con 1 bot en línea orbitando':'Núcleo con '+n+' bots en línea orbitando')}
 function bots(){if(!rx)return;rx.setBots(BOTS);label()}
 function toN(x,y){var half=base*Sc/2;return [(x-(X+half))/half,(y-(Y+half))/half]}
 function inActive(x,y){if(!act)return false;var m=act.width/2,dx=x-(act.left+m),dy=y-(act.top+act.height/2);return dx*dx+dy*dy<m*m*1.1}
 function isUI(e){
  var t=e.target;if(!t||!t.closest)return false;
  if(t.closest(INTER))return true;
  var g=t.closest('.glass');
  if(g){if(!g.querySelector('[data-slot]'))return true;return !inActive(e.clientX,e.clientY)}
  return false;
 }
 function spotMove(e){
  if(!HOVER||fxActual()==='lite'||e.pointerType==='touch')return;
  sp.x=e.clientX;sp.y=e.clientY;if(!sp.on){sp.on=true;spot.classList.add('on')}
  if(!sp.raf)sp.raf=requestAnimationFrame(function(){sp.raf=0;spot.style.transform='translate3d('+sp.x+'px,'+sp.y+'px,0)'});
 }
 function onMove(e){
  if(!rx||wrap.hidden)return;
  spotMove(e);
  var n=toN(e.clientX,e.clientY),ui=isUI(e),inside=Math.abs(n[0])<1&&Math.abs(n[1])<1;
  rx.pointer(n[0],n[1],inside&&!ui);
  if(ptr.down){var dx=e.clientX-ptr.lx,dy=e.clientY-ptr.ly;ptr.lx=e.clientX;ptr.ly=e.clientY;ptr.moved+=Math.abs(dx)+Math.abs(dy);rx.drag(dx,dy);return}
  if(e.pointerType==='mouse'||e.pointerType==='pen'){var i=(inside&&!ui)?rx.pick(n[0],n[1],20):-1;rx.setHover(i);document.documentElement.style.cursor=i>=0?'pointer':''}
 }
 function onDown(e){
  if(!rx||wrap.hidden||e.button>0||e.pointerType==='touch')return;
  var n=toN(e.clientX,e.clientY);if(Math.abs(n[0])>=1||Math.abs(n[1])>=1||isUI(e))return;
  ptr.down=true;ptr.lx=e.clientX;ptr.ly=e.clientY;ptr.moved=0;document.body.classList.add('dragging');e.preventDefault();
 }
 function onUp(){if(ptr.down){ptr.down=false;rx.dragEnd();document.body.classList.remove('dragging')}}
 function onClick(e){
  if(!rx||wrap.hidden)return;
  var mv=ptr.moved;ptr.moved=0;if(mv>6||isUI(e))return;
  var n=toN(e.clientX,e.clientY);if(Math.abs(n[0])>=1||Math.abs(n[1])>=1)return;
  var i=rx.pick(n[0],n[1],e.pointerType==='touch'?30:24);if(i>=0)rx.pin(i);else if(inActive(e.clientX,e.clientY))rx.pulse();
 }
 document.addEventListener('pointermove',onMove,{passive:true});
 document.addEventListener('pointerdown',onDown);
 document.addEventListener('pointerup',onUp);
 document.addEventListener('pointercancel',onUp);
 document.addEventListener('click',onClick);
 document.documentElement.addEventListener('mouseleave',function(){spot.classList.remove('on');sp.on=false;if(rx)rx.pointer(0,0,false)});
 document.addEventListener('visibilitychange',function(){pageVis=!document.hidden;apply()});
 window.addEventListener('scroll',function(){if(fxActual()!=='lite'||!rx)return;scr=true;apply();clearTimeout(scrT);scrT=setTimeout(function(){scr=false;apply()},140)},{passive:true});
 window.addEventListener('resize',function(){if(slots.length)refresh()});
 window.addEventListener('deviceorientation',function(e){if(!rx||e.gamma==null||e.beta==null)return;rx.tilt(clamp(e.gamma/28,-1,1),clamp((e.beta-55)/28,-1,1))});
 return {
  refresh:refresh,bots:bots,
  theme:function(){if(rx)rx.setTheme(tema.h,tema.m==='dark')},
  fx:function(){if(!rx)return;rx.still(REDUCED);rx.setQuality(fxActual()==='lite'?1:2);if(base)rx.resize(base,cap())},
  mode:function(m){if(rx)rx.setMode(m);if(m==='ok'){wrap.classList.add('flash');setTimeout(function(){wrap.classList.remove('flash')},650)}},
  reset:function(){if(rx){rx.setFocus(-1);rx.setHover(-1)}},
  focus:function(i){if(rx)rx.setFocus(i)},
  pin:function(i){if(rx)rx.pin(i)}
 };
})();

/* ---------- vidrio: brillo que sigue al puntero e inclinación ---------- */
(function(){
 var GL={el:null,raf:0,ev:null};
 function out(el){el.classList.remove('lit');if(el.hasAttribute('data-tilt')){el.classList.add('back');setTimeout(function(){el.classList.remove('back')},340)}el.style.removeProperty('--rx');el.style.removeProperty('--ry')}
 document.addEventListener('pointermove',function(e){
  if(e.pointerType==='touch')return;
  var g=e.target.closest?e.target.closest('.glass'):null;
  if(g!==GL.el){if(GL.el)out(GL.el);GL.el=g;if(g)g.classList.add('lit')}
  if(!g)return;
  GL.ev=e;
  if(!GL.raf)GL.raf=requestAnimationFrame(function(){
   GL.raf=0;var el=GL.el,ev=GL.ev;if(!el||!ev)return;
   var r=el.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top;
   el.style.setProperty('--mx',x.toFixed(0)+'px');el.style.setProperty('--my',y.toFixed(0)+'px');
   if(el.hasAttribute('data-tilt')&&fxActual()!=='lite'&&!REDUCED){el.style.setProperty('--ry',((x/r.width-0.5)*9).toFixed(2)+'deg');el.style.setProperty('--rx',(-(y/r.height-0.5)*9).toFixed(2)+'deg')}
  });
 },{passive:true});
 document.documentElement.addEventListener('mouseleave',function(){if(GL.el){out(GL.el);GL.el=null}});
})();

/* ---------- panel de colores ---------- */
function aplicar(){
 var d=document.documentElement;
 d.setAttribute('data-theme',tema.m);d.setAttribute('data-fx',fxActual());d.style.setProperty('--h',tema.h);
 var mt=document.querySelector('meta[name=theme-color]');if(mt)mt.content=tema.m==='dark'?'#08050a':'#f6f1f4';
 $$('#mode button').forEach(function(b){b.classList.toggle('on',b.dataset.m===tema.m)});
 $$('#fx button').forEach(function(b){b.classList.toggle('on',b.dataset.v===fxActual())});
 $$('#sw button').forEach(function(b){b.classList.toggle('on',Number(b.dataset.h)===Number(tema.h))});
 $('#hue').value=tema.h;ls('tema3',tema);
 RXM.theme();
}
$('#sw').innerHTML=PRE.map(function(p){return '<button title="'+p[0]+'" aria-label="'+p[0]+'" data-h="'+p[1]+'" style="background:linear-gradient(135deg,hsl('+p[1]+' 96% 68%),hsl('+((p[1]+288)%360)+' 92% 74%))"></button>'}).join('');
$('#sw').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tema.h=Number(b.dataset.h);aplicar()});
$('#mode').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tema.m=b.dataset.m;aplicar()});
$('#fx').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tema.fx=b.dataset.v;aplicar();RXM.fx()});
$('#hue').addEventListener('input',function(e){tema.h=Number(e.target.value);aplicar()});
$('#treset').addEventListener('click',function(){tema={h:DEF_H,m:'dark'};aplicar();RXM.fx()});
function panel(v){var p=$('#themep');p.hidden=!v;$('#tbtn').setAttribute('aria-expanded',v?'true':'false')}
$('#tbtn').addEventListener('click',function(e){e.stopPropagation();panel($('#themep').hidden)});
document.addEventListener('click',function(e){var p=$('#themep');if(!p.hidden&&!p.contains(e.target))panel(false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape')panel(false)});
aplicar();

/* ---------- estado global ---------- */
function limpiar(){timers.forEach(function(t){clearInterval(t);clearTimeout(t)});timers=[];onbots=null;RXM.mode('idle');RXM.reset()}
function cargarStats(){var t0=performance.now();return api('/api/stats').then(function(s){S=s;Sat=Date.now();S.ping=Math.round(performance.now()-t0);lat.push(S.ping);if(lat.length>40)lat.shift();$('#dot').classList.remove('off');$('#pst').textContent='Servicio en línea';return s}).catch(function(){$('#dot').classList.add('off');$('#pst').textContent='Sin conexión'})}
function ordenar(a){return a.slice().sort(function(x,y){if(!!x.online!==!!y.online)return x.online?-1:1;return (x.desde||1e15)-(y.desde||1e15)})}
function cargarBots(){return api('/api/bots').then(function(r){BOTS=ordenar(r.bots||[]);BOTS_OK=true;RXM.bots();if(onbots)onbots();return BOTS}).catch(function(){return BOTS})}
cargarStats();cargarBots();setInterval(cargarStats,20000);setInterval(cargarBots,15000);
function relojes(){$$('[data-d]').forEach(function(e){var d=Number(e.getAttribute('data-d'));if(d)e.textContent=dur(Date.now()-d)})}
function segs(n,total){var N=14,on=total?Math.round(n/total*N):0;if(n>0&&on<1)on=1;var h='';for(var i=0;i<N;i++)h+='<i'+(i<on?' class="on"':'')+'></i>';return '<div class="seg" aria-hidden="true">'+h+'</div>'}
function tween(el,to,ms){
 if(!el)return;
 if(REDUCED||fxActual()==='lite'||!to){el.textContent=String(to);return}
 var t0=performance.now();(function f(t){var p=Math.min(1,(t-t0)/ms);el.textContent=String(Math.round(to*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(f)})(t0);
}

/* ---------- números ---------- */
var PAISES={'54':'Argentina','52':'México','56':'Chile','57':'Colombia','51':'Perú','598':'Uruguay','595':'Paraguay','591':'Bolivia','593':'Ecuador','58':'Venezuela','55':'Brasil','34':'España','1':'EE. UU., Canadá o Caribe','506':'Costa Rica','507':'Panamá','502':'Guatemala','503':'El Salvador','504':'Honduras','505':'Nicaragua','53':'Cuba','39':'Italia','33':'Francia','49':'Alemania','44':'Reino Unido','351':'Portugal'};
function pais(n){for(var l=3;l>=1;l--){var p=n.slice(0,l);if(PAISES[p])return {c:p,n:PAISES[p]}}return null}
function pista(n){
 if(!n)return {t:'Con código de país, sin + ni espacios.',k:''};
 var p=pais(n),pre=p?p.n+' (+'+p.c+') · ':'';
 if(n.length<8)return {t:pre+'Faltan dígitos.',k:''};
 if(n.length>15)return {t:'Es muy largo: revisá que no sobren dígitos.',k:'bad'};
 if(n.indexOf('54')===0&&n.indexOf('549')!==0&&n.length<=12)return {t:'En Argentina los celulares llevan un 9 después del 54: 549 + área + número.',k:'bad'};
 return {t:pre+n.length+' dígitos. Listo para vincular.',k:'ok'};
}

/* ---------- páginas ---------- */
var page=$('#page');
var booted=false;
var vinc={estado:'form',modo:'code',numero:'',id:null,err:'',data:null,auto:false,fin:0};
var CMD=['/tt','/ytaudio','/ytvideo','/search','/ig','/fb','/x','/pin','/mf','/apk'];
function chars(t){var n=0;return t.split(' ').map(function(w){return '<span class="w">'+w.split('').map(function(c){return '<span class="c" style="--n:'+(n++)+'">'+esc(c)+'</span>'}).join('')+'</span>'}).join(' ')}

function card(viz,t,p,extra){return '<article class="card glass" data-tilt tabindex="0"><div class="viz '+viz[0]+'">'+viz[1]+'</div><h3>'+t+'</h3><p>'+p+'</p>'+(extra||'')+'</article>'}

function pInicio(){
 var primera=!booted;booted=true;var anim=primera&&!REDUCED;
 var H1='Tu bot de WhatsApp, en un minuto.';
 page.innerHTML=
 '<section class="hero" id="hero"><div class="copy">'+
 '<h1 aria-label="'+esc(H1)+'" class="'+(anim?'boot':'')+'">'+(anim?'<span aria-hidden="true">'+chars(H1)+'</span>':esc(H1))+'</h1>'+
 '<p class="lede">Vinculá tu número con un código o un QR. Sin registro y sin instalar nada.</p>'+
 '<div class="glass blur console'+(anim?' boot':'')+'"><label for="qn">Tu número de WhatsApp</label><div class="field"><span class="pr">+</span><input class="inp" id="qn" inputmode="numeric" autocomplete="tel" placeholder="5493331234567"></div>'+
 '<p class="hint" id="qh">Con código de país, sin + ni espacios.</p>'+
 '<div class="quickbtns"><button class="btn pri" type="button" data-m="code">Obtener código</button><button class="btn" type="button" data-m="qr">Generar QR</button></div></div></div>'+
 '<div class="slot" data-slot="hero"></div>'+
 '<div class="readout glass blur"><b id="rn">–</b><span><span id="rl">bots en línea</span><span class="tip">'+(HOVER?'Pasá el mouse por un satélite':'Tocá un satélite')+'</span></span></div></section>'+

 '<section class="glass tele" aria-label="Estado en vivo">'+
 '<div><span class="k">Tiempo en línea</span><b id="t-up">—</b></div>'+
 '<div><span class="k">Bots conectados</span><b id="t-on">—</b><div id="t-seg"></div></div>'+
 '<div><span class="k">Grupos atendidos</span><b id="t-gr">—</b></div>'+
 '<div><span class="k">Comandos</span><b id="t-cm">—</b></div></section>'+

 '<div class="sh"><h2>En línea ahora</h2></div>'+
 '<div class="split"><ol class="glass lines" id="lines"><li class="none">Buscando bots…</li></ol><div class="slot" data-slot="online"></div></div>'+

 '<div class="sh"><h2>Qué puede hacer tu bot</h2><p>Deslizá para ver todo lo que trae.</p></div>'+
 '<div class="car" id="car" aria-label="Funciones del bot">'+
  card(['v-dl','<div class="file"><b>video.mp4</b><span>4,2 MB</span></div><div class="bar"><i></i></div><div class="src"><span>TikTok</span><span>YouTube</span><span>Instagram</span><span>MediaFire</span></div>'],'Descargas','Videos, audios, fotos y archivos de las redes de siempre, sin marca de agua. También busca en YouTube.','<div class="cmds">'+CMD.map(function(c){return '<code>'+c+'</code>'}).join('')+'</div>')+
  card(['v-st','<i class="ph"></i><span class="ar">&rarr;</span><i class="sk"></i>'],'Stickers','Mandá una foto con <code>/s</code> y vuelve como sticker. Si mandás varias juntas, convierte todas.')+
  card(['v-eco','<p><span>/daily</span><b class="up">+35.000</b></p><p><span>/work</span><b class="up">+12.400</b></p><p><span>/crime</span><b class="dn">&minus;71.000</b></p>'],'Economía','Daily, trabajos, apuestas y robos entre amigos, con la moneda que elijas para tu bot.')+
  card(['v-ai','<span class="me">/gemini ¿qué es un agujero negro?</span><span class="bot"><em></em><em></em><em></em></span>'],'IA y letras','<code>/gemini</code> responde y recuerda la conversación de cada persona. <code>/lyrics</code> busca por título y artista.')+
  card(['v-gr','<div class="av3"><i></i><i></i><i></i><i></i></div><code>/mute @user 10m</code>'],'Grupos','Silenciar personas, expulsar inactivos y programar mensajes automáticos.')+
 '</div>'+
 '<div class="carnav"><button class="btn" type="button" id="cprev" aria-label="Anterior">'+ic('prev')+'</button><button class="btn" type="button" id="cnext" aria-label="Siguiente">'+ic('next')+'</button></div>'+

 '<div class="sh"><h2>Cómo se vincula</h2></div>'+
 '<ol class="path" id="path"><i class="pulse" aria-hidden="true"></i>'+
 '<li style="--i:0"><span class="node">1</span><b>Elegí código o QR</b><p>El código de 8 caracteres se escribe en WhatsApp. El QR se escanea desde otro dispositivo.</p></li>'+
 '<li style="--i:1"><span class="node">2</span><b>Personalizalo</b><p>Ponele nombre, foto y, si querés, tu propio prefijo de comandos.</p></li>'+
 '<li style="--i:2"><span class="node">3</span><b>Escribile en WhatsApp</b><p>Cuando termina de vincularse, el bot aparece en Mis bots y ya responde.</p></li></ol>'+
 '<footer class="foot"><span>Hecho por <b>Vand4lw</b></span><a href="'+esc(CANAL)+'" target="_blank" rel="noopener">Canal oficial</a></footer>';

 /* número rápido */
 function ir(m){
  var n=$('#qn').value.replace(/\D/g,'');
  if(n.length<8||n.length>15){toast('Ingresá un número válido, con código de país.');$('#qn').focus();return}
  vinc={estado:'form',modo:m,numero:n,id:null,err:'',data:null,auto:true,fin:0};
  location.hash='#/vincular';
 }
 $$('.quickbtns button').forEach(function(b){b.addEventListener('click',function(){ir(b.dataset.m)})});
 $('#qn').addEventListener('keydown',function(e){if(e.key==='Enter')ir('code')});
 $('#qn').addEventListener('input',function(){var n=this.value.replace(/\D/g,''),p=pista(n),h=$('#qh');h.textContent=p.t;h.className='hint '+p.k});

 /* bots en línea: lista, número y reactor */
 var lastN=-1;
 function lista(){
  var on=BOTS.filter(function(b){return b.online});
  var rn=$('#rn');
  if(rn&&lastN!==on.length){if(lastN<0)tween(rn,on.length,primera?1400:500);else rn.textContent=String(on.length);lastN=on.length}
  var rl=$('#rl');if(rl)rl.textContent=on.length===1?'bot en línea':'bots en línea';
  var tp=$('.readout .tip');if(tp)tp.textContent=on.length?(HOVER?'Pasá el mouse por un satélite':'Tocá un satélite'):(BOTS_OK?'Vinculá el primero desde acá':'Buscando bots…');
  var el=$('#lines');if(!el)return;
  el.innerHTML=on.length?on.slice(0,8).map(function(b){return '<li data-i="'+BOTS.indexOf(b)+'"><span class="led"></span><div><b>'+esc(b.nombre)+'</b><small>'+grupos(b.grupos)+'</small></div><span class="up mono" data-d="'+(b.desde||'')+'">'+(b.desde?dur(Date.now()-b.desde):'—')+'</span></li>'}).join(''):'<li class="none">'+(BOTS_OK?'Todavía no hay bots en línea. El tuyo puede ser el primero.':'Buscando bots…')+'</li>';
 }
 onbots=lista;lista();
 var ls1=$('#lines');
 ls1.addEventListener('pointerover',function(e){if(e.pointerType==='touch')return;var li=e.target.closest('li[data-i]');$$('li.hot',ls1).forEach(function(x){if(x!==li)x.classList.remove('hot')});if(li){li.classList.add('hot');RXM.focus(Number(li.dataset.i))}});
 ls1.addEventListener('pointerleave',function(e){if(e.pointerType==='touch')return;$$('li.hot',ls1).forEach(function(x){x.classList.remove('hot')});RXM.focus(-1)});
 ls1.addEventListener('click',function(e){var li=e.target.closest('li[data-i]');if(li)RXM.pin(Number(li.dataset.i))});

 /* telemetría */
 var primeraTele=primera;
 function tele(){
  if(!S){timers.push(setTimeout(tele,300));return}
  var seg=$('#t-seg');if(!seg)return;
  seg.innerHTML=segs(S.online,S.total);
  $('#t-on').textContent=S.online+' de '+S.total;
  if(primeraTele){tween($('#t-gr'),S.grupos||0,1000);tween($('#t-cm'),S.comandos||0,1000)}
  else{$('#t-gr').textContent=S.grupos==null?'—':S.grupos;$('#t-cm').textContent=S.comandos}
  primeraTele=false;
  function up(){var e=$('#t-up');if(e&&S)e.textContent=dur(S.uptime*1000+(Date.now()-Sat))}
  up();timers.push(setInterval(function(){up();relojes()},1000));
 }
 tele();

 /* carrusel con profundidad */
 var car=$('#car'),cards=$$('.card',car),rafC=0;
 function prof(){
  rafC=0;var r=car.getBoundingClientRect(),mid=r.left+r.width/2;
  cards.forEach(function(c){var b=c.getBoundingClientRect(),d=clamp(((b.left+b.width/2)-mid)/(b.width+22),-2,2);c.style.setProperty('--d',d.toFixed(3));c.style.setProperty('--a',Math.abs(d).toFixed(3))});
 }
 car.addEventListener('scroll',function(){if(!rafC)rafC=requestAnimationFrame(prof)},{passive:true});
 if('IntersectionObserver' in window){new IntersectionObserver(function(es){car.classList.toggle('vis',es[0].isIntersecting)},{rootMargin:'80px'}).observe(car)}else car.classList.add('vis');
 prof();setTimeout(prof,120);
 function paso(dir){var w=cards[0].getBoundingClientRect().width+22;car.scrollBy({left:dir*w,behavior:REDUCED?'auto':'smooth'})}
 $('#cprev').addEventListener('click',function(){paso(-1)});$('#cnext').addEventListener('click',function(){paso(1)});

 /* ruta de vuelo: arranca cuando entra en pantalla */
 var pt=$('#path');
 if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){pt.classList.add('go');io.disconnect()}})},{threshold:.5});io.observe(pt)}else pt.classList.add('go');
}

/* --- vincular --- */
function pVincular(){
 function marco(inner){return '<div class="phead"><div><h2 class="title">Vincular un bot</h2><p class="sub">Tu bot queda fijo y se reconecta solo cuando el servicio se reinicia.</p></div></div><div class="vgrid"><section class="glass pad" id="vbox">'+inner+'</section><aside class="glass pad vside"><div class="slot" data-slot="link"></div><h3>Cómo se hace</h3><ol class="rail" id="how"></ol><p class="note">'+ic('shield')+'<span>Podés desvincularlo cuando quieras desde WhatsApp, en Dispositivos vinculados.</span></p></aside></div>'}
 function como(paso){
  var L=vinc.modo==='code'?
   ['Escribí tu número con código de país y tocá <b>Obtener código</b>.','En WhatsApp: Ajustes › Dispositivos vinculados › Vincular un dispositivo › <b>Vincular con el número de teléfono</b>.','Ingresá el código de 8 caracteres.']:
   ['Escribí tu número con código de país y tocá <b>Generar QR</b>.','Abrí WhatsApp <b>en otro dispositivo</b> con esa cuenta: Dispositivos vinculados › Vincular un dispositivo.','Escaneá el QR antes de que venza.'];
  var h=$('#how');if(!h)return;
  h.innerHTML=L.map(function(t,i){return '<li class="'+(i+1===paso?'on':(i+1<paso?'done':''))+'"><span class="k">'+(i+1)+'</span><div>'+t+'</div></li>'}).join('');
 }
 function opt(m,icn,t,d){return '<button type="button" role="radio" aria-checked="'+(vinc.modo===m)+'" data-m="'+m+'" class="opt'+(vinc.modo===m?' on':'')+'"><span class="oi">'+ic(icn)+'</span><b>'+t+'</b><span class="d">'+d+'</span></button>'}
 function form(){
  var p0=pista(vinc.numero);
  page.innerHTML=marco('<h3>Tus datos</h3>'+
   '<span class="lbl">Cómo querés vincularlo</span><div class="opts" id="opts" role="radiogroup" aria-label="Modo de vinculación">'+
   opt('code','keys','Código de 8 caracteres','Lo escribís en WhatsApp. Sirve desde el mismo celular.')+opt('qr','qr','Código QR','Lo escaneás desde otro dispositivo.')+'</div>'+
   '<label for="num">Número de WhatsApp</label><div class="field"><span class="pr">+</span><input class="inp" id="num" inputmode="numeric" autocomplete="tel" placeholder="5493331234567" value="'+esc(vinc.numero)+'"></div>'+
   '<p class="hint '+p0.k+'" id="nh">'+esc(vinc.numero?p0.t:'Con código de país, sin + ni espacios. Argentina: 549 + código de área + número.')+'</p>'+
   (vinc.err?'<div class="err" role="alert">'+esc(vinc.err)+'</div>':'')+
   '<button class="btn pri" id="go" style="width:100%;margin-top:20px">'+(vinc.modo==='code'?'Obtener código':'Generar QR')+'</button>');
  como(1);RXM.refresh();RXM.mode('idle');
  $('#opts').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;vinc.modo=b.dataset.m;vinc.numero=$('#num').value;form()});
  $('#num').addEventListener('keydown',function(e){if(e.key==='Enter')$('#go').click()});
  $('#num').addEventListener('input',function(){var n=this.value.replace(/\D/g,''),p=pista(n),h=$('#nh');h.textContent=n?p.t:'Con código de país, sin + ni espacios. Argentina: 549 + código de área + número.';h.className='hint '+(n?p.k:'')});
  $('#go').addEventListener('click',function(){
   var n=$('#num').value.replace(/\D/g,'');vinc.numero=n;
   if(n.length<8||n.length>15){vinc.err='Ingresá un número válido, con código de país.';return form()}
   vinc.err='';$('#go').disabled=true;
   api('/api/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numero:n,modo:vinc.modo})})
    .then(function(r){vinc.id=r.id;vinc.estado='espera';vinc.data=null;vinc.fin=0;esperar()})
    .catch(function(e){vinc.err=e.message;form()})
  });
  if(vinc.auto){vinc.auto=false;$('#go').click()}
 }
 function ring(left){var p=clamp(left/120,0,1);return '<div class="ring'+(left<20?' low':'')+'" id="ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="rt" cx="22" cy="22" r="19" pathLength="100"/><circle class="rp" cx="22" cy="22" r="19" pathLength="100" stroke-dashoffset="'+(100-p*100).toFixed(1)+'"/></svg><b id="rs">'+left+'</b></div>'}
 function ringSet(left){
  var r=$('#ring');if(!r)return;
  r.classList.toggle('low',left<20);
  var c=$('.rp',r);if(c)c.setAttribute('stroke-dashoffset',(100-clamp(left/120,0,1)*100).toFixed(1));
  var s=$('#rs');if(s)s.textContent=left;
  var h=$('#hl');if(h)h.textContent='Vence en '+left+' s. '+(vinc.modo==='code'?'Esperando que lo ingreses…':'Esperando el escaneo…');
 }
 function restante(){return Math.max(0,Math.round((vinc.fin-Date.now())/1000))}
 function esperar(){
  page.innerHTML=marco('<div class="wait"><i></i><h3 style="margin:0">'+(vinc.modo==='code'?'Generando tu código…':'Generando el QR…')+'</h3></div><p class="sub">Un momento, ya casi.</p>');como(1);RXM.refresh();RXM.mode('wait');
  function sondeo(){
   if(vinc.estado!=='espera'||!document.body.contains($('#vbox')))return;
   api('/api/link/'+vinc.id).then(function(r){
    vinc.data=r;
    if(r.estado==='conectado'){vinc.estado='ok';var t=tokens();if(r.token&&t.indexOf(r.token)<0){t.push(r.token);ls('tokens',t)}return listo()}
    if(r.estado==='error'){vinc.estado='form';vinc.err=r.error||'No se pudo vincular.';return form()}
    pintar(r);timers.push(setTimeout(sondeo,1800));
   }).catch(function(){timers.push(setTimeout(sondeo,3000))});
  }
  sondeo();
  timers.push(setInterval(function(){if(vinc.fin)ringSet(restante())},500));
 }
 function pintar(r){
  var box=$('#vbox');if(!box)return;
  var left=Math.max(0,(r.restante!=null?r.restante:120));vinc.fin=Date.now()+left*1000;
  if(r.estado==='codigo'&&r.code){
   var c=String(r.code).replace(/[^A-Za-z0-9]/g,'');
   if(box.dataset.k==='c:'+c){ringSet(left);return}
   box.dataset.k='c:'+c;
   var spans=c.split('').map(function(ch,i){return (i===4?'<span class="sep mono">-</span>':'')+'<span style="animation-delay:'+(i*45)+'ms">'+esc(ch)+'</span>'}).join('');
   box.innerHTML='<h3>Tu código de vinculación</h3><p class="sub">Ingresalo en WhatsApp ahora.</p><div class="bigcode" aria-label="Código '+esc(c)+'">'+spans+'</div><div class="cdrow">'+ring(left)+'<button class="btn" id="cp">'+ic('copy')+'Copiar código</button></div><p class="hint center" id="hl" style="margin-top:16px">Vence en '+left+' s. Esperando que lo ingreses…</p>';
   var cp=$('#cp');if(cp)cp.onclick=function(){try{navigator.clipboard.writeText(c);toast('Código copiado')}catch(e){toast(c)}};
   como(2);RXM.mode('code');
  }else if(r.estado==='qr'&&r.qr){
   var im=$('#qrimg');
   if(im&&box.dataset.k==='qr'){im.src=r.qr;ringSet(left)}
   else{box.dataset.k='qr';box.innerHTML='<h3>Escaneá el QR</h3><p class="sub">Desde <b>otro dispositivo</b>, con la cuenta del número '+esc(vinc.numero)+'.</p><div class="qrbox"><img id="qrimg" alt="Código QR para vincular" src="'+r.qr+'"><span class="scan" aria-hidden="true"></span></div><div class="cdrow">'+ring(left)+'</div><p class="hint center" id="hl" style="margin-top:14px">Vence en '+left+' s. Esperando el escaneo…</p>';como(2);RXM.mode('code')}
  }
 }
 function listo(){
  page.innerHTML=marco('<div class="center"><div class="okm">'+ic('check')+'</div><h3>Tu bot quedó vinculado</h3><p class="sub" style="margin-inline:auto">Escribile por WhatsApp o personalizalo desde acá.</p><div class="acts"><a class="btn pri" href="#/bots?t=mis">Personalizar mi bot</a><button class="btn" id="otro">Vincular otro</button></div></div>');como(4);RXM.refresh();RXM.mode('ok');
  cargarBots();
  $('#otro').onclick=function(){vinc={estado:'form',modo:'code',numero:'',id:null,err:'',data:null,auto:false,fin:0};form()};
 }
 if(vinc.estado==='espera'&&vinc.id){esperar()}else if(vinc.estado==='ok'){listo()}else{form()}
}

/* --- bots --- */
function fila(b,extra){
 var ini=esc((b.nombre||'?').trim().charAt(0).toUpperCase()||'?');
 var av='<span class="avs'+(b.online?'':' off')+'"><span class="avw"></span><span class="av"'+(b.banner?' style="background-image:url('+esc(b.banner)+')"':'')+'>'+(b.banner?'':ini)+'</span><i class="led'+(b.online?'':' off')+'"></i></span>';
 var est=b.principal?'<span class="chipst main">Principal</span>':(b.online?'<span class="chipst">Conectado</span>':'<span class="chipst off">Desconectado</span>');
 var up=b.online&&b.desde;
 return '<article class="glass bot" data-i="'+BOTS.indexOf(b)+'"><div class="bhead">'+av+'<div class="bname"><b>'+esc(b.nombre)+'</b>'+(b.mio?'<span class="num mono">+'+esc(b.numero)+'</span>':'')+'</div>'+est+
  '<div class="bmeta"><span class="mono"'+(up?' data-d="'+b.desde+'"':'')+'>'+(up?dur(Date.now()-b.desde):'—')+'</span><span>'+grupos(b.grupos)+'</span></div></div>'+(extra||'')+'</article>'
}
function pBots(){
 var q=(location.hash.split('?')[1]||'');var tab=/t=mis/.test(q)?'mis':'todos';
 page.innerHTML='<div class="phead"><div><h2 class="title">Bots</h2><p class="sub">Los bots en línea y los que vinculaste desde este navegador.</p></div><div class="slot" data-slot="bots" aria-hidden="true"></div><a class="btn pri" href="#/vincular">Vincular un bot</a></div><div class="tabs" id="tabs" role="tablist"><button role="tab" data-t="todos">Todos</button><button role="tab" data-t="mis">Mis bots</button></div><div id="lista"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
 RXM.refresh();
 function marcar(){$$('#tabs button').forEach(function(b){b.classList.toggle('on',b.dataset.t===tab);b.setAttribute('aria-selected',b.dataset.t===tab)})}
 function editor(b){
  return '<div class="edit" data-s="'+esc(b.slug)+'">'+(b.banner?'<img class="prev" alt="Banner actual del menú" src="'+esc(b.banner)+'">':'')+'<div class="two"><div><label>Nombre</label><input class="inp" data-f="nombre" maxlength="40" value="'+esc(b.nombre)+'"></div><div><label>Moneda</label><input class="inp" data-f="moneda" maxlength="20" value="'+esc(b.moneda||'')+'"></div></div>'+
  '<div class="two"><div><label>Prefijo (1 símbolo o letra)</label><input class="inp mono" data-f="prefijo" maxlength="2" value="'+esc(b.prefijo||'/')+'"></div><div><label>Banner del menú</label><label class="btn up-btn"><input type="file" accept="image/*" data-f="banner" hidden>'+ic('up')+'Subir imagen</label></div></div>'+
  '<div class="two"><button class="btn pri" data-a="guardar">'+ic('check')+'Guardar cambios</button><button class="btn" data-a="quitar"'+(b.banner?'':' disabled')+'>Quitar banner</button></div></div>'
 }
 function pintar(sin){
  marcar();var l=$('#lista');if(!l||!BOTS_OK)return;
  if(sin&&document.querySelector('.edit input:focus'))return;
  var arr=BOTS.filter(function(b){return tab==='mis'?b.mio:true});
  if(tab==='mis'&&!arr.length){l.innerHTML='<div class="empty">Todavía no vinculaste ningún bot desde este navegador.<div class="acts"><a class="btn pri" href="#/vincular">Vincular mi bot</a></div></div>';return}
  l.innerHTML=arr.map(function(b){return fila(b,tab==='mis'?editor(b):'')}).join('')||'<div class="empty">No hay bots para mostrar.</div>';
 }
 onbots=function(){pintar(true)};
 $('#tabs').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tab=b.dataset.t;history.replaceState(null,'','#/bots'+(tab==='mis'?'?t=mis':''));pintar()});
 page.addEventListener('change',function(e){var f=e.target;if(f.dataset&&f.dataset.f==='banner'&&f.files&&f.files[0]){
  var ed=f.closest('.edit'),file=f.files[0];if(file.size>8*1048576)return toast('La imagen pesa demasiado (máx. 8 MB)');
  toast('Subiendo…');
  api('/api/bot/'+ed.dataset.s+'/banner',{method:'POST',headers:{'Content-Type':file.type||'image/jpeg'},body:file}).then(function(){toast('Banner actualizado');cargarBots().then(function(){pintar()})}).catch(function(er){toast(er.message)})}});
 page.addEventListener('click',function(e){var b=e.target.closest('[data-a]');if(!b)return;var ed=b.closest('.edit'),s=ed.dataset.s;
  if(b.dataset.a==='guardar'){
   var body={nombre:$('[data-f=nombre]',ed).value,moneda:$('[data-f=moneda]',ed).value,prefijo:$('[data-f=prefijo]',ed).value};
   b.disabled=true;api('/api/bot/'+s+'/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(){toast('Cambios guardados');cargarBots().then(function(){pintar()})}).catch(function(er){toast(er.message);b.disabled=false})}
  if(b.dataset.a==='quitar'){api('/api/bot/'+s+'/banner/borrar',{method:'POST'}).then(function(){toast('Banner quitado');cargarBots().then(function(){pintar()})}).catch(function(er){toast(er.message)})}
 });
 var LB=$('#lista');
 LB.addEventListener('pointerover',function(e){if(e.pointerType==='touch')return;var a=e.target.closest('.bot[data-i]');RXM.focus(a?Number(a.dataset.i):-1)});
 LB.addEventListener('pointerleave',function(e){if(e.pointerType==='touch')return;RXM.focus(-1)});
 marcar();pintar();cargarBots();timers.push(setInterval(relojes,1000));
}

/* --- estado --- */
function pEstado(){
 var uid=Math.floor(Math.random()*1e6);
 function gauge(id,val,tot,t1,t2){
  var pct=tot?Math.min(1,val/tot):0;
  return '<div class="glass g"><div class="gv"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="gg'+id+uid+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--acc)"/><stop offset="1" style="stop-color:var(--acc2)"/></linearGradient></defs><circle class="gt" cx="60" cy="60" r="50" pathLength="100"/><circle class="gp" data-p="'+(pct*75).toFixed(1)+'" cx="60" cy="60" r="50" pathLength="100" style="stroke:url(#gg'+id+uid+')"/></svg><b>'+val+'/'+tot+'</b></div><div class="gl"><b>'+t1+'</b><span>'+t2+'</span></div></div>';
 }
 page.innerHTML='<div class="phead"><div><h2 class="title">Estado del servicio</h2><p class="sub">Información en vivo del bot, actualizada cada pocos segundos.</p></div></div><div id="est"><div class="skel" style="margin-top:30px"></div></div><footer class="foot"><span>Hecho por <b>Vand4lw</b></span><a href="'+esc(CANAL)+'" target="_blank" rel="noopener">Canal oficial</a></footer>';
 RXM.refresh();
 var armado=false;
 function armar(){
  armado=true;
  $('#est').innerHTML='<div class="glass eh"><div class="slot" data-slot="estado"></div><div><span class="k">Tiempo en línea</span><b class="big" id="e-up">—</b><span class="chipst"><i class="led"></i>Servicio en línea</span></div><dl class="mini"><div><dt>Grupos atendidos</dt><dd id="e-gr">—</dd></div><div><dt>Comandos disponibles</dt><dd id="e-cm">—</dd></div></dl></div>'+
  '<div class="gauges">'+gauge('a',S.online,S.total,'Bots conectados','De todos los vinculados')+gauge('b',S.usados,S.max,'Sub-bots vinculados','Cupo disponible: '+Math.max(0,S.max-S.usados))+'</div>'+
  '<div class="glass lat"><h3>Respuesta del servidor</h3><div class="st"><span>Último <b id="l-ult">—</b></span><span>Promedio <b id="l-avg">—</b></span><span>Mínimo <b id="l-min">—</b></span><span>Máximo <b id="l-max">—</b></span></div><div id="spk" class="empty" style="padding:26px">Midiendo…</div></div>';
  requestAnimationFrame(function(){$$('.gp').forEach(function(c){c.style.strokeDasharray=c.dataset.p+' 100'})});
  RXM.refresh();
 }
 function spark(){
  var el=$('#spk');if(!el||lat.length<2)return;
  var mn=Math.min.apply(null,lat),mx=Math.max.apply(null,lat),span=Math.max(1,mx-mn),W=300,Hh=80,pts=lat.map(function(v,i){return [i/(lat.length-1)*W,Hh-6-((v-mn)/span)*(Hh-14)]});
  var d=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)}).join(' ');
  el.className='';el.removeAttribute('style');
  el.innerHTML='<svg class="spark" viewBox="0 0 '+W+' '+Hh+'" preserveAspectRatio="none" role="img" aria-label="Gráfico de latencia"><defs><linearGradient id="sg'+uid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--acc);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--acc);stop-opacity:0"/></linearGradient></defs><path style="fill:url(#sg'+uid+')" d="'+d+' L'+W+' '+Hh+' L0 '+Hh+' Z"/><path class="sl" d="'+d+'"/></svg>';
 }
 function pintar(){
  if(!S)return;
  if(!armado)armar();
  var up=S.uptime*1000+(Date.now()-Sat),sum=lat.reduce(function(a,b){return a+b},0);
  $('#e-up').textContent=dur(up);$('#e-gr').textContent=S.grupos==null?'—':S.grupos;$('#e-cm').textContent=S.comandos;
  if(lat.length){$('#l-ult').textContent=lat[lat.length-1]+' ms';$('#l-avg').textContent=Math.round(sum/lat.length)+' ms';$('#l-min').textContent=Math.min.apply(null,lat)+' ms';$('#l-max').textContent=Math.max.apply(null,lat)+' ms'}
  spark();
 }
 cargarStats().then(pintar);
 timers.push(setInterval(function(){cargarStats().then(pintar)},5000));
 timers.push(setInterval(function(){if(S&&armado){$('#e-up').textContent=dur(S.uptime*1000+(Date.now()-Sat))}},1000));
}

/* ---------- ruteo ---------- */
var RUTAS={inicio:pInicio,vincular:pVincular,bots:pBots,estado:pEstado};
function ruta(){
 limpiar();
 var r=(location.hash||'#/inicio').replace(/^#\//,'').split('?')[0];if(!RUTAS[r])r='inicio';
 $$('.menu a[data-r]').forEach(function(n){n.classList.toggle('on',n.dataset.r===r)});
 RUTAS[r]();window.scrollTo(0,0);RXM.refresh();
}
window.addEventListener('hashchange',ruta);
ruta();
})();

</script>
</body>
</html>
`;

module.exports = { WEB_PAGE };
