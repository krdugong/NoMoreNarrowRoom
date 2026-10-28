// Builds the search-facing pages for NoMoreNarrowRoom from the hotel data files.
// Run from the repository root: node scripts/build-seo.cjs
// Share images need `sharp`: NODE_PATH=/path/to/node_modules node ... (skipped with a warning if missing).
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const root = path.resolve(__dirname, '..');            // site source folder
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'seo-config.json'), 'utf8'));
const repo = cfg.basePath ? path.resolve(root, '..') : root;  // folder served at siteUrl/
const BASE = cfg.basePath;                             // '' when the site is served at the domain root
const ORIGIN = cfg.siteUrl;                            // e.g. https://nomorenarrowroom.com
const abs = p => ORIGIN + p;
const ASSET_V = '20261028seo';

const CITIES = [
  {slug: 'fukuoka', name: '후쿠오카', en: 'FUKUOKA', file: 'fukuoka.html', data: 'data/hotels.js',
    areas: {'하카타': 'hakata', '텐진': 'tenjin', '나카스': 'nakasu'}},
  {slug: 'tokyo', name: '도쿄', en: 'TOKYO', file: 'tokyo.html', data: 'data/tokyo-hotels.js',
    areas: {'고탄다': 'gotanda', '긴시초': 'kinshicho', '긴자': 'ginza', '닛포리': 'nippori', '도쿄역': 'tokyo-station', '롯폰기': 'roppongi', '시나가와': 'shinagawa', '시바·다이몬': 'shiba-daimon', '시바공원': 'shibakoen', '시부야': 'shibuya', '시오도메': 'shiodome', '시오미': 'shiomi', '신바시': 'shimbashi', '신주쿠': 'shinjuku', '아사쿠사': 'asakusa', '아키하바라': 'akihabara', '오시아게': 'oshiage', '오이마치': 'oimachi', '우에노': 'ueno', '이케부쿠로': 'ikebukuro', '히비야': 'hibiya'}},
  {slug: 'sapporo', name: '삿포로', en: 'SAPPORO', file: 'sapporo.html', data: 'data/sapporo-hotels.js',
    areas: {'삿포로역': 'sapporo-station', '오도리': 'odori', '타누키코지': 'tanukikoji', '스스키노': 'susukino'}},
];
const MIN_LIST = 3;   // landing pages with fewer hotels than this would be thin, so they are not built
const LARGE = 20;     // ㎡ threshold for the "넓은 호텔" pages

// ---------- helpers ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = m => Number.isFinite(m);
const median = xs => { const s = xs.filter(num).sort((a, b) => a - b); if (!s.length) return null; const i = s.length >> 1; return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) * 5) / 10; };
const maxDate = list => list.map(h => h.verifiedAt).filter(Boolean).sort().pop() || '2026-10-13';
const monthLabel = d => `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월`;
const bathStatus = h => h.bath === true ? 'yes' : h.bath === false ? 'no' : 'unknown';
const bathText = h => ({yes: '대욕장 있음', no: '대욕장 없음', unknown: '대욕장 확인 필요'})[bathStatus(h)];
const byRoom = (a, b) => (num(b.minRoom2Pax) ? b.minRoom2Pax : -1) - (num(a.minRoom2Pax) ? a.minRoom2Pax : -1) || a.name.localeCompare(b.name, 'ko');
const byPopular = (a, b) => (a.popularityRank ?? 999) - (b.popularityRank ?? 999) || byRoom(a, b);
const isBoilerplate = note => !note || /일정 중심으로 비교할 호텔$/.test(note);
function roomFeel(m) {
  if (!num(m)) return '공식 면적 확인 중';
  if (m <= 15) return '캐리어 펴면 길 막힘';
  if (m < 20) return '둘이 쓰면 조금 타이트';
  if (m < 25) return '캐리어 2개도 비교적 여유';
  return '일본 도심호텔 기준 넓은 편';
}
const sizeText = h => num(h.minRoom2Pax) ? `${h.minRoom2Pax}㎡` : '면적 확인 중';
function write(rel, content) {
  const file = path.join(repo, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}
function loadHotels(city) {
  const ctx = vm.createContext({window: {}});
  vm.runInContext(fs.readFileSync(path.join(root, city.data), 'utf8'), ctx);
  return ctx.window.NMNR_HOTELS.map(h => ({...h, citySlug: city.slug}));
}

// ---------- URL plan ----------
const cityUrl = c => `${BASE}/${c.file}`;
const bathUrl = c => `${BASE}/${c.slug}/bath/`;
const largeUrl = c => `${BASE}/${c.slug}/large-room/`;
const areaUrl = (c, area) => `${BASE}/${c.slug}/${c.areas[area]}/`;
const hotelSlug = h => h.citySlug === 'fukuoka' ? `fukuoka-${h.id}` : String(h.id).replace(/_/g, '-');
const hotelUrl = h => `${BASE}/hotel/${hotelSlug(h)}/`;
const imgUrl = name => `${BASE}/assets/og/${name}.png`;

// ---------- share images ----------
const images = [];   // {name, title, sub, big, bath}
function card(name, opts) { images.push({name, ...opts}); return imgUrl(name); }
function wrapText(text, maxEm) {
  const width = s => [...s].reduce((w, ch) => w + (/[\u0000-\u00ff]/.test(ch) ? 0.56 : 1), 0);
  const lines = [''];
  for (const word of text.split(' ')) {
    const next = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + word : word;
    if (width(next) > maxEm && lines[lines.length - 1]) lines.push(word); else lines[lines.length - 1] = next;
  }
  return lines.slice(0, 3);
}
function cardSvg({title, sub, big, bath}) {
  const font = "font-family='Apple SD Gothic Neo, Noto Sans KR, sans-serif'";
  const lines = wrapText(title, big ? 15 : 13);
  const size = big ? 64 : 76;
  const t = lines.map((l, i) => `<text x='72' y='${230 + i * (size + 16)}' ${font} font-weight='800' font-size='${size}' fill='#202124'>${esc(l)}</text>`).join('');
  const subY = 230 + lines.length * (size + 16) + 12;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'>
<rect width='1200' height='630' fill='#f5f6f7'/><rect x='0' y='0' width='1200' height='10' fill='#315e70'/>
<text x='72' y='96' ${font} font-weight='800' font-size='30' fill='#315e70'>NoMoreNarrowRoom</text>
<text x='72' y='134' ${font} font-size='24' fill='#686b70'>일본 호텔 · 방 크기와 대욕장 비교</text>
${t}
<text x='72' y='${subY}' ${font} font-size='34' fill='#43464b'>${esc(sub)}</text>
${big ? `<text x='72' y='560' ${font} font-weight='800' font-size='96' fill='#202124'>${esc(big)}</text>` : ''}
${bath ? `<text x='${big ? 520 : 72}' y='548' ${font} font-weight='700' font-size='42' fill='#315e70'>${esc(bath)}</text>` : ''}
</svg>`;
}
async function renderImages() {
  let sharp;
  try { sharp = require('sharp'); } catch { console.warn('! sharp not found: share images were not regenerated (set NODE_PATH to a node_modules with sharp).'); return; }
  fs.mkdirSync(path.join(root, 'assets/og'), {recursive: true});
  for (const img of images) await sharp(Buffer.from(cardSvg(img))).png({compressionLevel: 9, palette: true}).toFile(path.join(root, 'assets/og', img.name + '.png'));
  console.log(`Rendered ${images.length} share images`);
}

// ---------- page shell ----------
// Google Analytics 4 (gtag.js), on when seo-config.json has googleAnalyticsId.
const gaTag = () => cfg.googleAnalyticsId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(cfg.googleAnalyticsId)}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(cfg.googleAnalyticsId)}');</script>` : '';
function headTags({title, desc, url, image, updated, jsonld, type = 'website'}) {
  const v = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`,
    `<link rel="canonical" href="${abs(url)}">`,
    cfg.naverSiteVerification ? `<meta name="naver-site-verification" content="${esc(cfg.naverSiteVerification)}">` : '',
    cfg.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(cfg.googleSiteVerification)}">` : '',
    gaTag(),
    `<meta property="og:locale" content="ko_KR">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${esc(cfg.siteName)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${abs(url)}">`,
    `<meta property="og:image" content="${abs(image)}">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta property="og:updated_time" content="${updated}T09:00:00+09:00">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="alternate" type="application/rss+xml" title="${esc(cfg.siteName)}" href="${abs(BASE + '/rss.xml')}">`,
    ...jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ];
  return v.filter(Boolean).join('\n  ');
}
const nav = current => `<header class="top"><div class="wrap topin">
    <a class="brand" href="${BASE}/">NoMoreNarrowRoom<span>일본 호텔 · 방 크기와 대욕장</span></a>
    <nav aria-label="도시 선택"><a href="${BASE}/">홈</a>${CITIES.map(c => `<a href="${cityUrl(c)}"${c.slug === current ? ' aria-current="page"' : ''}>${c.name}</a>`).join('')}</nav>
  </div></header>`;
function shell({head, current, body}) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  ${head}
  <link rel="stylesheet" href="${BASE}/assets/site.css?v=20261013hoteldots">
  <link rel="stylesheet" href="${BASE}/assets/seo.css?v=${ASSET_V}">
</head>
<body class="seo-page">
  <a class="skip" href="#content">본문으로 바로가기</a>
  ${nav(current)}
  <main class="wrap seo-main" id="content">
${body}
    <p class="affiliate-note"><b>제휴 안내</b> · 일부 예약 링크는 제휴 링크입니다. 해당 링크를 통해 예약이 이루어지면 운영자에게 수수료가 지급됩니다.</p>
    <footer><p>객실 면적과 대욕장 정보는 호텔 공식 자료를 우선해 확인합니다. 기본 객실 면적은 2인 투숙 가능한 기본 객실 중 확인된 가장 작은 방 기준이며, 요금은 날짜와 예약 조건에 따라 달라집니다.</p><span>NoMoreNarrowRoom</span></footer>
  </main>
</body>
</html>
`;
}
const crumbs = items => `<nav class="crumbs" aria-label="현재 위치">${items.map((it, i) => i === items.length - 1 ? `<span aria-current="page">${esc(it.name)}</span>` : `<a href="${it.url}">${esc(it.name)}</a>`).join('<span aria-hidden="true">›</span>')}</nav>`;
const crumbLd = items => ({'@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({'@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.url)}))});
const faqHtml = faqs => `<section class="faq" aria-labelledby="faqTitle"><h2 id="faqTitle">자주 묻는 질문</h2>${faqs.map(f => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
const faqLd = faqs => ({'@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}}))});
const webPageLd = (name, desc, url, updated) => ({'@context': 'https://schema.org', '@type': 'WebPage', name, description: desc, url: abs(url), inLanguage: 'ko-KR', dateModified: updated, isPartOf: {'@type': 'WebSite', name: cfg.siteName, url: abs(BASE + '/')}});
const tripLink = h => h.tripUrl ? `<a class="booking-link" href="${esc(h.tripUrl)}" target="_blank" rel="sponsored noopener">트립닷컴에서 가격 보기 <span aria-hidden="true">↗</span></a>` : '';

// Ranked hotel cards used on every landing page. Each name links to its own hotel page.
function hotelCards(list) {
  return `<ol class="rank-list">${list.map((h, i) => {
    const s = bathStatus(h);
    return `<li class="rank-item"><span class="rank-no">${i + 1}</span><div class="rank-body"><h3><a href="${hotelUrl(h)}">${esc(h.name)}</a></h3><p class="rank-meta"><b>${esc(sizeText(h))}</b> ${esc(roomFeel(h.minRoom2Pax))} · <span class="bath-${s}">${s === 'yes' ? '♨ ' : ''}${esc(s === 'yes' ? h.bathLabel : bathText(h))}</span> · ${esc(h.area)}</p><p class="rank-note">${esc(h.roomType)} 기준${isBoilerplate(h.reviewNote) ? '' : ` · ${esc(h.reviewNote)}`}</p></div><div class="rank-actions"><a class="detail-link" href="${hotelUrl(h)}">방 크기 자세히</a>${tripLink(h)}</div></li>`;
  }).join('')}</ol>`;
}
const itemListLd = (name, list) => ({'@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: list.length, itemListElement: list.map((h, i) => ({'@type': 'ListItem', position: i + 1, name: h.name, url: abs(hotelUrl(h))}))});

// ---------- data ----------
const all = [];
const cityData = CITIES.map(c => { const hotels = loadHotels(c); all.push(...hotels); return {c, hotels}; });
const pages = [];  // for sitemap + rss: {url, title, desc, updated}
const landingLinks = {};  // city slug -> [{url, label, count}]

// ---------- landing pages ----------
function landing({c, hotels, kind, area}) {
  const updated = maxDate(hotels);
  const month = monthLabel(updated);
  const n = hotels.length;
  const med = median(hotels.map(h => h.minRoom2Pax));
  const large = hotels.filter(h => h.minRoom2Pax >= LARGE).length;
  const baths = hotels.filter(h => h.bath === true).length;
  let kw, url, sorted, intro, imgName, guide;
  if (kind === 'bath') {
    kw = `${c.name} 대욕장 호텔`; url = bathUrl(c); sorted = [...hotels].sort(byRoom); imgName = `${c.slug}-bath`;
    intro = `${c.name}에서 대욕장(온천·스파 포함)이 있는 호텔 ${n}곳을 기본 객실 면적이 넓은 순서로 정리했습니다. 이 중 2인 기본 객실이 ${LARGE}㎡ 이상인 곳은 ${large}곳이고, 기본 객실 면적 중앙값은 ${med ?? '-'}㎡입니다.`;
    guide = `대욕장 호텔은 객실 욕실이 작은 경우가 많아, 기본 객실 면적과 대욕장 이용 조건을 함께 보는 것이 좋습니다. 일부 호텔은 스파가 특정 객실에만 포함되니 각 호텔 상세의 대욕장 메모를 확인하세요.`;
  } else if (kind === 'large') {
    kw = `${c.name} 넓은 호텔`; url = largeUrl(c); sorted = [...hotels].sort(byRoom); imgName = `${c.slug}-large-room`;
    intro = `${c.name} 비교 호텔 중 2인 기본 객실이 ${LARGE}㎡ 이상인 ${n}곳입니다. 이 중 대욕장이 있는 곳은 ${baths}곳입니다. 일본 도심 비즈니스호텔의 기본 더블룸은 15㎡ 안팎인 경우가 많아, ${LARGE}㎡ 이상이면 캐리어 두 개를 펼쳐도 비교적 여유가 있습니다.`;
    guide = `같은 호텔이어도 객실 타입마다 면적이 다릅니다. 여기 적힌 면적은 2인 투숙 가능한 기본 객실 중 가장 작은 방 기준이라, 예약 화면에서 고른 객실의 면적을 한 번 더 확인하세요.`;
  } else {
    kw = `${area} 호텔`; url = areaUrl(c, area); sorted = [...hotels].sort(byPopular); imgName = `${c.slug}-${c.areas[area]}`;
    intro = `${c.name} ${area} 지역 호텔 ${n}곳의 기본 객실 면적과 대욕장 여부를 비교했습니다. 대욕장이 있는 곳은 ${baths}곳, 2인 기본 객실이 ${LARGE}㎡ 이상인 곳은 ${large}곳이며, 기본 객실 면적 중앙값은 ${med ?? '-'}㎡입니다.`;
    guide = `${area} 호텔은 목록 순서가 후보 선정 기준(인기순)입니다. 방이 넓은 곳을 먼저 보려면 ${c.name} 전체 비교 페이지에서 '방 넓은 순'으로 정렬해 보세요.`;
  }
  const title = `${kw} 추천 ${n}곳 - 방 크기·대욕장 비교 (${month})`;
  const desc = `${kw} ${n}곳의 2인 기본 객실 면적(㎡)과 대욕장 여부를 한눈에 비교하세요. ${month} 호텔 공식 자료 기준, 넓은 방 순위와 지역별 위치까지 정리했습니다.`;
  const top = sorted.find(h => num(h.minRoom2Pax));
  const faqs = [
    top && {q: `${kw} 중 방이 가장 넓은 곳은 어디인가요?`, a: `이 목록에서 2인 기본 객실이 가장 넓은 곳은 ${top.name}(${top.minRoom2Pax}㎡, ${top.roomType})입니다. ${top.bath === true ? `대욕장도 있습니다(${top.bathLabel}).` : `대욕장 정보: ${bathText(top)}.`}`},
    {q: `${kw} 중 ${LARGE}㎡ 이상인 곳은 몇 곳인가요?`, a: `${n}곳 중 ${large}곳입니다${large ? `: ${sorted.filter(h => h.minRoom2Pax >= LARGE).slice(0, 6).map(h => `${h.name}(${h.minRoom2Pax}㎡)`).join(', ')}${large > 6 ? ' 등' : ''}.` : '.'}`},
    kind !== 'bath' && {q: `${kw} 중 대욕장이 있는 곳은?`, a: baths ? `${sorted.filter(h => h.bath === true).map(h => h.name).join(', ')}입니다.` : '이 목록에는 대욕장이 확인된 호텔이 없습니다.'},
    {q: '기본 객실 면적은 어떤 기준인가요?', a: '2인이 투숙할 수 있는 기본 객실 중 호텔 공식 자료 등으로 확인된 가장 작은 방의 면적입니다. 상위 객실은 더 넓을 수 있습니다.'},
  ].filter(Boolean);
  const img = card(imgName, {title: `${kw} ${n}곳`, sub: `방 크기·대욕장 비교 · ${month} 기준`});
  const trail = [{name: '홈', url: `${BASE}/`}, {name: `${c.name} 호텔`, url: cityUrl(c)}, {name: kw, url}];
  const related = landingLinks[c.slug].filter(l => l.url !== url);
  const body = `    ${crumbs(trail)}
    <section class="seo-intro">
      <p class="eyebrow">${c.en} HOTEL GUIDE</p>
      <h1>${esc(kw)} 추천 ${n}곳</h1>
      <p class="lead">${esc(intro)}</p>
      <p class="updated">정보 확인 ${esc(updated)} · 호텔 공식 자료 우선</p>
      <img class="seo-card" src="${img}" width="1200" height="630" alt="${esc(kw)} ${n}곳 방 크기·대욕장 비교">
    </section>
    <section aria-labelledby="listTitle"><h2 id="listTitle">${esc(kw)} ${kind === 'area' ? '목록' : '방 넓은 순'}</h2>${hotelCards(sorted)}</section>
    <section class="seo-guide"><h2>${esc(kw)} 고를 때 확인할 점</h2><p>${esc(guide)}</p><p><a href="${cityUrl(c)}">${esc(c.name)} 호텔 ${cityData.find(d => d.c === c).hotels.length}곳 전체 비교 · 필터로 직접 찾기 →</a></p></section>
    ${faqHtml(faqs)}
    <section class="related"><h2>${esc(c.name)} 호텔 더 보기</h2><ul>${related.map(l => `<li><a href="${l.url}">${esc(l.label)} <small>${l.count}곳</small></a></li>`).join('')}</ul></section>`;
  const head = headTags({title, desc, url, image: img, updated, jsonld: [webPageLd(title, desc, url, updated), crumbLd(trail), itemListLd(kw, sorted), faqLd(faqs)]});
  write(url.slice(1) + 'index.html', shell({head, current: c.slug, body}));
  pages.push({url, title, desc, updated});
}

// ---------- hotel pages ----------
function hotelPage(h, c, cityHotels) {
  const updated = h.verifiedAt || maxDate(cityHotels);
  const s = bathStatus(h);
  const sized = cityHotels.filter(x => num(x.minRoom2Pax)).sort(byRoom);
  const rank = sized.indexOf(h) + 1;
  const med = median(cityHotels.map(x => x.minRoom2Pax));
  const areaHotels = cityHotels.filter(x => x.area === h.area);
  const areaRank = areaHotels.filter(x => num(x.minRoom2Pax)).sort(byRoom).indexOf(h) + 1;
  const kw = `${h.name} 방 크기`;
  const title = `${h.name} 방 크기 ${sizeText(h)} · ${bathText(h)} | ${c.name} ${h.area} 호텔`;
  const desc = `${h.name}의 2인 기본 객실은 ${h.roomType} ${sizeText(h)}입니다(${roomFeel(h.minRoom2Pax)}). ${s === 'yes' ? `대욕장: ${h.bathLabel}.` : `${bathText(h)}.`} ${c.name} ${h.area} 호텔 ${areaHotels.length}곳과 방 크기를 비교해 보세요.`;
  const lines = [];
  if (num(h.minRoom2Pax)) {
    lines.push(`${h.name}의 2인 기본 객실은 ${h.roomType} ${h.minRoom2Pax}㎡로, ${roomFeel(h.minRoom2Pax)} 수준입니다.`);
    if (med != null && rank) lines.push(`NoMoreNarrowRoom에서 비교하는 ${c.name} 호텔 ${sized.length}곳 중 기본 객실 면적이 ${rank}번째로 넓고, ${c.name} 중앙값(${med}㎡)보다 ${Math.abs(Math.round((h.minRoom2Pax - med) * 10) / 10)}㎡ ${h.minRoom2Pax >= med ? '넓습니다' : '좁습니다'}.`);
    if (areaHotels.length > 1 && areaRank) lines.push(`${h.area} 지역 ${areaHotels.length}곳 중에서는 ${areaRank}번째로 넓습니다.`);
  } else lines.push(`${h.name}의 기본 객실 면적은 아직 공식 자료로 확인 중입니다.`);
  lines.push(s === 'yes' ? `대욕장 정보는 '${h.bathLabel}'로 확인했습니다. 이용 시간과 객실별 이용 조건은 예약 전 호텔에서 다시 확인하세요.` : s === 'no' ? '대욕장은 없는 것으로 확인했습니다. 객실 욕실만 이용할 수 있습니다.' : '대욕장 여부는 아직 확인 중입니다.');
  if (!isBoilerplate(h.reviewNote)) lines.push(`한줄 메모: ${h.reviewNote}.`.replace('..', '.'));
  const similar = cityHotels.filter(x => x !== h && num(x.minRoom2Pax) && num(h.minRoom2Pax) && Math.abs(x.minRoom2Pax - h.minRoom2Pax) <= 2.5).sort(byRoom).slice(0, 6);
  const neighbours = areaHotels.filter(x => x !== h).sort(byRoom).slice(0, 6);
  const faqs = [
    {q: `${h.name} 방 크기는 몇 ㎡인가요?`, a: num(h.minRoom2Pax) ? `2인 기본 객실(${h.roomType}) 기준 ${h.minRoom2Pax}㎡입니다. 상위 객실은 더 넓을 수 있습니다.` : '기본 객실 면적은 확인 중입니다.'},
    {q: `${h.name}에 대욕장이 있나요?`, a: s === 'yes' ? `네, 있습니다(${h.bathLabel}).` : s === 'no' ? '대욕장은 없습니다.' : '대욕장 여부는 확인 중입니다.'},
    {q: `${h.name}은 어느 지역에 있나요?`, a: `${c.name} ${h.area} 지역에 있습니다. 같은 지역 호텔 ${areaHotels.length}곳과 비교할 수 있습니다.`},
  ];
  const img = card(`hotel-${hotelSlug(h)}`, {title: h.name, sub: `${c.name} ${h.area} · ${h.roomType}`, big: sizeText(h), bath: s === 'yes' ? '♨ 대욕장 있음' : bathText(h), isHotel: true});
  const url = hotelUrl(h);
  const hasArea = areaHotels.length >= MIN_LIST && c.areas[h.area];
  const trail = [{name: '홈', url: `${BASE}/`}, {name: `${c.name} 호텔`, url: cityUrl(c)}, ...(hasArea ? [{name: `${h.area} 호텔`, url: areaUrl(c, h.area)}] : []), {name: h.name, url}];
  const hotelLd = {'@context': 'https://schema.org', '@type': 'Hotel', name: h.name, url: abs(url), image: abs(img),
    address: {'@type': 'PostalAddress', addressLocality: `${c.name} ${h.area}`, addressCountry: 'JP'},
    ...(h.location ? {geo: {'@type': 'GeoCoordinates', latitude: h.location.lat, longitude: h.location.lng}} : {}),
    ...(s !== 'unknown' ? {amenityFeature: [{'@type': 'LocationFeatureSpecification', name: '대욕장', value: s === 'yes'}]} : {}),
    ...(num(h.minRoom2Pax) ? {containsPlace: {'@type': 'HotelRoom', name: h.roomType, occupancy: {'@type': 'QuantitativeValue', value: 2}, floorSize: {'@type': 'QuantitativeValue', value: h.minRoom2Pax, unitCode: 'MTK'}}} : {})};
  const mini = list => `<ul class="mini-list">${list.map(x => `<li><a href="${hotelUrl(x)}">${esc(x.name)}</a> <span>${esc(sizeText(x))} · ${esc(bathText(x))}</span></li>`).join('')}</ul>`;
  const body = `    ${crumbs(trail)}
    <article class="hotel-page">
      <p class="eyebrow">${c.en} · ${esc(h.area)}</p>
      <h1>${esc(kw)}·대욕장</h1>
      <div class="hotel-facts"><div><span>2인 기본 객실</span><strong>${esc(sizeText(h))}</strong><small>${esc(roomFeel(h.minRoom2Pax))}</small></div><div><span>대욕장</span><strong class="bath-${s}">${s === 'yes' ? '♨ 있음' : s === 'no' ? '없음' : '확인 필요'}</strong><small>${esc(s === 'yes' ? h.bathLabel : '')}</small></div><div><span>지역</span><strong>${esc(h.area)}</strong><small>${esc(c.name)}</small></div></div>
      <div class="hotel-text">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>
      <div class="hotel-cta">${num(h.minRoom2Pax) ? `<a class="simulation-link" href="${BASE}/simulator.html?area=${h.minRoom2Pax}">${h.minRoom2Pax}㎡ 방에 캐리어 넣어보기</a>` : ''}${tripLink(h)}</div>
      <img class="seo-card" src="${img}" width="1200" height="630" alt="${esc(h.name)} 방 크기 ${esc(sizeText(h))} ${esc(bathText(h))}">
      <h2>확인한 정보</h2>
      <dl class="fact-table"><div><dt>확인 객실 타입</dt><dd>${esc(h.roomType)}</dd></div><div><dt>기본 객실 면적</dt><dd>${esc(sizeText(h))}</dd></div><div><dt>대욕장 / 온욕시설</dt><dd>${esc(h.bathLabel)}</dd></div><div><dt>확인 근거</dt><dd>${esc(h.verification)}</dd></div><div><dt>정보 확인일</dt><dd>${esc(h.verifiedAt)}</dd></div></dl>
      <p class="sources">${h.officialSourceUrl ? `<a href="${esc(h.officialSourceUrl)}" target="_blank" rel="noopener">객실 공식 자료 ↗</a>` : ''}${h.bathSourceUrl ? `<a href="${esc(h.bathSourceUrl)}" target="_blank" rel="noopener">대욕장 공식 자료 ↗</a>` : ''}${h.reviewSourceUrl ? `<a href="${esc(h.reviewSourceUrl)}" target="_blank" rel="noopener">트립닷컴 후기 ↗</a>` : ''}</p>
    </article>
    ${neighbours.length ? `<section class="related"><h2>${esc(h.area)} 다른 호텔과 방 크기 비교</h2>${mini(neighbours)}${hasArea ? `<p><a href="${areaUrl(c, h.area)}">${esc(h.area)} 호텔 ${areaHotels.length}곳 전체 보기 →</a></p>` : ''}</section>` : ''}
    ${similar.length ? `<section class="related"><h2>비슷한 크기의 ${esc(c.name)} 호텔</h2>${mini(similar)}</section>` : ''}
    ${faqHtml(faqs)}
    <section class="related"><h2>${esc(c.name)} 호텔 더 보기</h2><ul>${landingLinks[c.slug].map(l => `<li><a href="${l.url}">${esc(l.label)} <small>${l.count}곳</small></a></li>`).join('')}</ul></section>`;
  const head = headTags({title, desc, url, image: img, updated, jsonld: [webPageLd(title, desc, url, updated), crumbLd(trail), hotelLd, faqLd(faqs)]});
  write(url.slice(1) + 'index.html', shell({head, current: c.slug, body}));
  pages.push({url, title, desc, updated});
}

// ---------- existing interactive pages: prerender list + SEO head/content ----------
function replaceBetween(html, start, end, content, fallback) {
  if (html.includes(start)) return html.slice(0, html.indexOf(start) + start.length) + content + html.slice(html.indexOf(end));
  return fallback(html, start + content + end);
}
function prerenderList(c, hotels, html) {
  const results = {innerHTML: ''}, count = {textContent: ''};
  const renderer = fs.readFileSync(path.join(root, 'assets/site.js'), 'utf8');
  const ctx = vm.createContext({window: {NMNR_HOTELS: hotels}, document: {querySelector: s => s === '#results' ? results : s === '#count' ? count : null, dispatchEvent() {}}, Event: class {}});
  vm.runInContext(renderer.slice(0, renderer.indexOf('function sync()')) + '\nrender();', ctx);
  html = replaceBetween(html, '<!-- hotel-list:start -->', '<!-- hotel-list:end -->', results.innerHTML, (h, block) => h.replace('<div id="results"></div>', `<div id="results">${block}</div>`));
  html = html.replace(/(<p id="count"[^>]*>)[^<]*(<\/p>)/, '$1' + count.textContent + '$2');
  html = html.replace('<noscript><p>호텔 목록과 필터를 보려면 브라우저에서 JavaScript를 켜주세요.</p></noscript>', '<noscript><p>전체 호텔 정보는 목록에서 확인할 수 있습니다. 조건 필터와 시뮬레이션을 사용하려면 JavaScript를 켜주세요.</p></noscript>');
  return html;
}
function cityPage(c, hotels) {
  const file = path.join(root, c.file);
  let html = fs.readFileSync(file, 'utf8');
  const updated = maxDate(hotels), month = monthLabel(updated), n = hotels.length;
  const baths = hotels.filter(h => h.bath === true), large = hotels.filter(h => h.minRoom2Pax >= LARGE);
  const url = cityUrl(c);
  const title = `${c.name} 호텔 추천 ${n}곳 - 방 크기·대욕장 비교 (${month})`;
  const desc = `${c.name} 호텔 ${n}곳의 2인 기본 객실 면적과 대욕장을 비교하세요. 대욕장 호텔 ${baths.length}곳, ${LARGE}㎡ 이상 넓은 호텔 ${large.length}곳을 지역·방 크기 조건으로 바로 찾을 수 있습니다.`;
  const widest = [...hotels].sort(byRoom).slice(0, 5);
  const faqs = [
    {q: `${c.name}에서 방이 넓은 호텔은 어디인가요?`, a: `2인 기본 객실 기준으로 ${widest.map(h => `${h.name}(${sizeText(h)})`).join(', ')} 순으로 넓습니다.`},
    {q: `${c.name} 대욕장 호텔은 몇 곳인가요?`, a: `비교 중인 ${n}곳 중 ${baths.length}곳에서 대욕장(온천·스파 포함)을 확인했습니다.`},
    {q: `${c.name} 호텔은 어느 지역에 묵는 게 좋나요?`, a: `${Object.keys(c.areas).filter(a => hotels.some(h => h.area === a)).slice(0, 6).map(a => `${a} ${hotels.filter(h => h.area === a).length}곳`).join(', ')}을 비교하고 있습니다. 일정의 중심이 되는 역과 가까운 지역을 고르고, 같은 지역 안에서 방 크기와 대욕장을 비교해 보세요.`},
  ];
  const img = card(`${c.slug}`, {title: `${c.name} 호텔 ${n}곳`, sub: `방 크기·대욕장 비교 · ${month} 기준`});
  const trail = [{name: '홈', url: `${BASE}/`}, {name: `${c.name} 호텔`, url}];
  const head = headTags({title, desc, url, image: img, updated, jsonld: [webPageLd(title, desc, url, updated), crumbLd(trail), itemListLd(`${c.name} 호텔`, [...hotels].sort(byPopular)), faqLd(faqs)]});
  html = replaceBetween(html, '<!-- seo-head:start -->', '<!-- seo-head:end -->', '\n  ' + head + '\n  ', (h, block) => h.replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, block));
  html = html.replace(/<h1 id="title">[^<]*<span id="total">/, `<h1 id="title">${c.name} 호텔 추천 <span id="total">`);
  html = prerenderList(c, hotels, html);
  const content = `
    <section class="seo-guide city-guide" aria-labelledby="guideTitle">
      <h2 id="guideTitle">${esc(c.name)} 호텔, 조건별로 바로 보기</h2>
      <p>${esc(c.name)} 호텔 ${n}곳 중 대욕장이 있는 곳은 ${baths.length}곳, 2인 기본 객실이 ${LARGE}㎡ 이상인 곳은 ${large.length}곳입니다. 기본 객실 면적 중앙값은 ${median(hotels.map(h => h.minRoom2Pax))}㎡이며, 정보는 ${esc(updated)} 기준으로 확인했습니다.</p>
      <ul class="guide-links">${landingLinks[c.slug].map(l => `<li><a href="${l.url}">${esc(l.label)} <small>${l.count}곳</small></a></li>`).join('')}</ul>
      <img class="seo-card" src="${img}" width="1200" height="630" alt="${esc(c.name)} 호텔 ${n}곳 방 크기·대욕장 비교" loading="lazy">
      <h2>${esc(c.name)} 호텔별 상세</h2>
      <ul class="hotel-index">${[...hotels].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(h => `<li><a href="${hotelUrl(h)}">${esc(h.name)} 방 크기</a></li>`).join('')}</ul>
    </section>
    ${faqHtml(faqs)}
    `;
  html = replaceBetween(html, '<!-- seo-content:start -->', '<!-- seo-content:end -->', content, (h, block) => h.replace(/(\s*<footer>)/, '\n    ' + block + '$1'));
  if (!html.includes('assets/seo.css')) html = html.replace(/(<link rel="stylesheet" href="assets\/site\.css[^"]*">)/, `$1\n  <link rel="stylesheet" href="assets/seo.css?v=${ASSET_V}">`);
  fs.writeFileSync(file, html);
  pages.push({url, title, desc, updated});
}

function homePage() {
  const file = path.join(root, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const updated = maxDate(all), url = `${BASE}/`;
  const title = '일본 호텔 방 크기·대욕장 비교 - 후쿠오카·도쿄·삿포로 | NoMoreNarrowRoom';
  const desc = `일본 호텔 ${all.length}곳의 2인 기본 객실 면적과 대욕장을 비교하세요. 후쿠오카·도쿄·삿포로 대욕장 호텔, 방 넓은 호텔, 지역별 호텔을 호텔 공식 자료 기준으로 정리했습니다.`;
  const img = card('home', {title: '일본 호텔 방 크기·대욕장 비교', sub: `후쿠오카·도쿄·삿포로 ${all.length}곳`});
  const site = {'@context': 'https://schema.org', '@type': 'WebSite', name: cfg.siteName, alternateName: '노모어내로우룸', url: abs(url), inLanguage: 'ko-KR'};
  const head = headTags({title, desc, url, image: img, updated, jsonld: [site, webPageLd(title, desc, url, updated)]});
  html = replaceBetween(html, '<!-- seo-head:start -->', '<!-- seo-head:end -->', '\n' + head + '\n', (h, block) => h.replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, block));
  const content = `<section class="wrap seo-guide home-guide" aria-labelledby="guideTitle"><h2 id="guideTitle">도시별 호텔 비교 바로가기</h2><div class="home-guide-grid">${cityData.map(({c, hotels}) => `<div><h3><a href="${cityUrl(c)}">${esc(c.name)} 호텔 ${hotels.length}곳</a></h3><ul>${landingLinks[c.slug].map(l => `<li><a href="${l.url}">${esc(l.label)} <small>${l.count}곳</small></a></li>`).join('')}</ul></div>`).join('')}</div></section>`;
  html = replaceBetween(html, '<!-- seo-content:start -->', '<!-- seo-content:end -->', content, (h, block) => h.replace(/(<footer class="home-footer)/, block + '\n$1'));
  if (!html.includes('assets/seo.css')) html = html.replace(/(<link rel="stylesheet" href="assets\/site\.css[^"]*">)/, `$1<link rel="stylesheet" href="assets/seo.css?v=${ASSET_V}">`);
  fs.writeFileSync(file, html);
  pages.unshift({url, title, desc, updated});
}

// ---------- run ----------
(async () => {
  // Decide which landing pages exist first, so every page can link to all of them.
  for (const {c, hotels} of cityData) {
    const links = landingLinks[c.slug] = [];
    const baths = hotels.filter(h => h.bath === true), large = hotels.filter(h => h.minRoom2Pax >= LARGE);
    if (baths.length >= MIN_LIST) links.push({url: bathUrl(c), label: `${c.name} 대욕장 호텔`, count: baths.length, kind: 'bath', list: baths});
    if (large.length >= MIN_LIST) links.push({url: largeUrl(c), label: `${c.name} 넓은 호텔 (${LARGE}㎡+)`, count: large.length, kind: 'large', list: large});
    for (const area of Object.keys(c.areas)) {
      const list = hotels.filter(h => h.area === area);
      if (list.length >= MIN_LIST) links.push({url: areaUrl(c, area), label: `${area} 호텔`, count: list.length, kind: 'area', area, list});
    }
  }
  homePage();
  // The simulator page is hand-written, so only the analytics tag is added to it.
  const simFile = path.join(root, 'simulator.html');
  const sim = fs.readFileSync(simFile, 'utf8');
  fs.writeFileSync(simFile, replaceBetween(sim, '<!-- ga:start -->', '<!-- ga:end -->', gaTag(), (h, block) => h.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + block)));
  for (const {c, hotels} of cityData) {
    cityPage(c, hotels);
    for (const l of landingLinks[c.slug]) landing({c, hotels: l.list, kind: l.kind, area: l.area});
    for (const h of hotels) hotelPage(h, c, hotels);
  }
  // Sitemap, RSS (네이버 서치어드바이저 제출용), robots.txt at the domain root.
  write(path.join(BASE.slice(1), 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `  <url><loc>${abs(p.url)}</loc><lastmod>${p.updated}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  const rfc = d => new Date(d + 'T09:00:00+09:00').toUTCString();
  write(path.join(BASE.slice(1), 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(cfg.siteName)} - 일본 호텔 방 크기·대욕장 비교</title><link>${abs(BASE + '/')}</link><description>일본 호텔의 2인 기본 객실 면적과 대욕장 비교</description><language>ko</language><lastBuildDate>${rfc(maxDate(all))}</lastBuildDate>\n${pages.map(p => `<item><title>${esc(p.title)}</title><link>${abs(p.url)}</link><guid>${abs(p.url)}</guid><description>${esc(p.desc)}</description><pubDate>${rfc(p.updated)}</pubDate></item>`).join('\n')}\n</channel></rss>\n`);
  const robots = path.join(repo, 'robots.txt');
  if (!fs.existsSync(robots)) fs.writeFileSync(robots, `User-agent: *\nAllow: /\n\nSitemap: ${abs(BASE + '/sitemap.xml')}\n`);
  await renderImages();
  console.log(`Built ${pages.length} pages (${Object.values(landingLinks).flat().length} landing, ${all.length} hotel)`);
})();
