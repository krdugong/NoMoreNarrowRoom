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
    areas: {'칸다': 'kanda', '고탄다': 'gotanda', '긴시초': 'kinshicho', '긴자': 'ginza', '니혼바시': 'nihonbashi', '닛포리': 'nippori', '도요스': 'toyosu', '도쿄역': 'tokyo-station', '롯폰기': 'roppongi', '센다가야': 'sendagaya', '시나가와': 'shinagawa', '시바·다이몬': 'shiba-daimon', '시바공원': 'shibakoen', '시부야': 'shibuya', '시오도메': 'shiodome', '시오미': 'shiomi', '신바시': 'shimbashi', '신주쿠': 'shinjuku', '아사쿠사': 'asakusa', '아카사카': 'akasaka', '아키하바라': 'akihabara', '오시아게': 'oshiage', '오이마치': 'oimachi', '우에노': 'ueno', '이케부쿠로': 'ikebukuro', '츠키지': 'tsukiji', '핫초보리': 'hatchobori', '히비야': 'hibiya'}},
  {slug: 'sapporo', name: '삿포로', en: 'SAPPORO', file: 'sapporo.html', data: 'data/sapporo-hotels.js',
    areas: {'삿포로역': 'sapporo-station', '오도리': 'odori', '다누키코지': 'tanukikoji', '스스키노': 'susukino'}},
  {slug: 'osaka', name: '오사카', en: 'OSAKA', file: 'osaka.html', data: 'data/osaka-hotels.js',
    areas: {'난바': 'namba', '신사이바시': 'shinsaibashi', '우메다': 'umeda', '혼마치': 'honmachi', '요도야바시': 'yodoyabashi', '닛폰바시': 'nipponbashi', '신세카이': 'shinsekai', '유니버설시티': 'universal-city'}},
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
const mentions = h => h.community ? h.community.mentions : 0;
const byCommunity = (a, b) => mentions(b) - mentions(a) || byRoom(a, b);   // 후기 언급 수가 많은 순, 같으면 방 넓은 순
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
// Bath feature pages (천연온천·노천탕·사우나) come from h.bathFeatures on hotels with bath === true.
const FEATURES = {
  onsen: {kw: '온천 호텔', label: '천연온천', what: '천연온천 대욕장', ko: '천연온천'},
  rotenburo: {kw: '노천탕 호텔', label: '노천탕', what: '노천탕(露天風呂)', ko: '노천탕'},
  sauna: {kw: '사우나 호텔', label: '사우나', what: '사우나', ko: '사우나'},
};
const hasFeature = (h, k) => h.bath === true && Boolean(h.bathFeatures && h.bathFeatures[k]);
const featureUrl = (c, k) => `${BASE}/${c.slug}/${k}/`;
// 3인·4인 pages: hotels with pax3/pax4 === true (a Jalan plan for that many adults), sorted by that room's size.
const PAX = {3: {slug: 'triple', kw: '3인 호텔·숙소', sub: '트리플룸·3인 객실'}, 4: {slug: 'quad', kw: '4인 가족 숙소·호텔', sub: '4인 객실'}};
// FAQ 재료: 검색창 자동완성·관련 질문(대욕장 이용방법·옷·문신·준비물·아기, 3인/4인, 숙박세, 객실 유형 차이)에 맞춘 공통 답변.
const TAX = {
  fukuoka: '후쿠오카시 숙박세는 1인 1박 200엔(숙박 요금이 2만 엔 이상이면 500엔)입니다. 예약 요금에 포함되지 않은 경우 체크인 때 호텔에서 따로 냅니다(2026년 10월 기준).',
  tokyo: '도쿄도 숙박세는 1인 1박 요금이 1만 엔 이상 1만 5천 엔 미만이면 100엔, 1만 5천 엔 이상이면 200엔이고 1만 엔 미만은 없습니다(2026년 10월 기준, 인상이 논의되고 있으니 예약 화면의 세금 안내도 확인하세요).',
  sapporo: '삿포로는 2026년부터 홋카이도 숙박세와 삿포로시 숙박세가 함께 붙어 1인 1박 수백 엔 수준이며, 금액은 숙박 요금 구간에 따라 다릅니다. 정확한 금액은 예약 화면의 세금 안내에서 확인하세요.',
  osaka: '오사카시 숙박세는 1인 1박 요금이 7천 엔 이상 1만 5천 엔 미만이면 100엔, 1만 5천 엔 이상 2만 엔 미만이면 200엔, 2만 엔 이상이면 300엔이고 7천 엔 미만은 없습니다(2026년 10월 기준, 예약 화면의 세금 안내도 확인하세요).',
};
const BATH_HOWTO = '객실에서 관내복이나 가운으로 갈아입고 객실 열쇠만 들고 내려가면 됩니다. 수영복은 입을 수 없고 알몸으로 입욕하며, 샴푸·바디워시·드라이어는 대욕장에 비치돼 있습니다. 수건도 대욕장에 두는 호텔이 많지만 객실 수건을 챙겨야 하는 곳도 있으니 안내문을 확인하세요. 문신이 있으면 입장을 제한하는 호텔이 많고 커버 스티커 허용 여부는 호텔마다 다릅니다. 이용 시간은 보통 15시부터 다음 날 10시 전후이고 심야 청소 시간에는 닫습니다.';
const kidsBathText = list => { const lim = list.filter(h => h.bath === true && /세 이상|성인 전용/.test(h.bathLabel || '')); return `기저귀를 찬 아기는 입욕이 안 되는 곳이 대부분이고, 이성 아동 동반은 미취학이나 초등 저학년까지로 제한하는 호텔이 많습니다. 가족 객실을 고르면 객실 욕실도 같이 확인하세요.${lim.length ? ` 연령 제한이 확인된 곳: ${lim.map(h => `${h.name}(${h.bathLabel})`).join(', ')}.` : ''}`; };
const roomTypeCat = t => !t ? '객실 유형 확인 중' : /화양실|패밀리|포스|4베드|쿼드|스위트/.test(t) ? '화양실·패밀리룸' : /트리플/.test(t) ? '트리플룸' : /트윈|더블|퀸|킹|세미/.test(t) ? '트윈·더블에 추가 침대' : '기타 객실';
const catCounts = (list, n) => { const m = {}; list.forEach(h => { const k = roomTypeCat(paxRoom(h, n)); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}곳`).join(', '); };
const baseTypeCounts = list => ['더블', '트윈', '세미더블', '싱글', '퀸', '킹'].map(t => [t, list.filter(h => (h.roomType || '').includes(t)).length]).filter(x => x[1]).map(([t, n]) => `${t} ${n}곳`).join(', ');
const paxUrl = (c, n) => `${BASE}/${c.slug}/${PAX[n].slug}/`;
const paxSize = (h, n) => n === 3 ? h.minRoom3Pax : n === 4 ? h.minRoom4Pax : h.minRoom2Pax;
const paxRoom = (h, n) => n === 3 ? h.roomType3Pax : n === 4 ? h.roomType4Pax : h.roomType;
const paxSizeText = (h, n) => num(paxSize(h, n)) ? `${paxSize(h, n)}㎡` : '면적 확인 중';
const byPax = n => (a, b) => (num(paxSize(b, n)) ? paxSize(b, n) : -1) - (num(paxSize(a, n)) ? paxSize(a, n) : -1) || a.name.localeCompare(b.name, 'ko');
const paxText = (h, n) => h[`pax${n}`] === undefined ? `${n}인 객실 확인 중` : h[`pax${n}`] ? `${n}인은 ${paxRoom(h, n) || `${n}인 객실`}${num(paxSize(h, n)) ? ` ${paxSize(h, n)}㎡` : ''}` : `${n}인 플랜은 없음`;
const featureText = h => h.bathFeatures ? ['onsen', 'rotenburo', 'sauna'].map(k => `${FEATURES[k].ko} ${h.bathFeatures[k] ? '있음' : '없음'}`).join(' · ') : '';
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
// Naver Analytics (wcslog.js), placed before </body> on every HTML page when seo-config.json has naverAnalyticsId.
const naverTag = () => cfg.naverAnalyticsId ? `<script src="https://wcs.pstatic.net/wcslog.js"></script>
<script>if(!wcs_add) var wcs_add = {};wcs_add["wa"] = "${esc(cfg.naverAnalyticsId)}";if(window.wcs) {wcs_do();}</script>` : '';
function addNaverAnalytics(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!['node_modules', 'assets', 'data', 'scripts', 'tests', '.git'].includes(entry.name)) addNaverAnalytics(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const html = fs.readFileSync(file, 'utf8');
    const next = replaceBetween(html, '<!-- naver-wa:start -->', '<!-- naver-wa:end -->', naverTag(), (h, block) => h.replace(/<\/body>/, block + '\n</body>'));
    if (next !== html) fs.writeFileSync(file, next);
  }
}
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
function hotelCards(list, pax = 2) {
  return `<ol class="rank-list">${list.map((h, i) => {
    const s = bathStatus(h);
    return `<li class="rank-item"><span class="rank-no">${i + 1}</span><div class="rank-body"><h3><a href="${hotelUrl(h)}">${esc(h.name)}</a></h3><p class="rank-meta"><b>${esc(pax === 2 ? sizeText(h) : paxSizeText(h, pax))}</b> ${esc(pax === 2 ? roomFeel(h.minRoom2Pax) : `${pax}인 객실 · 2인 기본 객실 ${sizeText(h)}`)} · <span class="bath-${s}">${s === 'yes' ? '♨ ' : ''}${esc(s === 'yes' ? h.bathLabel : bathText(h))}</span> · ${esc(h.area)}${h.community ? ` · 후기 언급 ${h.community.mentions}건` : ''}</p><p class="rank-note">${esc((pax === 2 ? h.roomType : paxRoom(h, pax)) || h.roomType)} 기준${isBoilerplate(h.reviewNote) ? '' : ` · ${esc(h.reviewNote)}`}</p></div><div class="rank-actions"><a class="detail-link" href="${hotelUrl(h)}">방 크기 자세히</a>${tripLink(h)}</div></li>`;
  }).join('')}</ol>`;
}
const itemListLd = (name, list) => ({'@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: list.length, itemListElement: list.map((h, i) => ({'@type': 'ListItem', position: i + 1, name: h.name, url: abs(hotelUrl(h))}))});

// ---------- data ----------
const all = [];
const cityData = CITIES.map(c => { const hotels = loadHotels(c); all.push(...hotels); return {c, hotels}; });
const pages = [];  // for sitemap + rss: {url, title, desc, updated}
const landingLinks = {};  // city slug -> [{url, label, count}]

// ---------- landing pages ----------
function landing({c, hotels, kind, area, feature, pax}) {
  const updated = maxDate(hotels);
  const month = monthLabel(updated);
  const n = hotels.length;
  const med = median(hotels.map(h => h.minRoom2Pax));
  const large = hotels.filter(h => h.minRoom2Pax >= LARGE).length;
  const baths = hotels.filter(h => h.bath === true).length;
  let kw, url, sorted, intro, imgName, guide;
  if (kind === 'bath') {
    kw = `${c.name} 대욕장 호텔`; url = bathUrl(c); sorted = [...hotels].sort(byCommunity); imgName = `${c.slug}-bath`;
    intro = `${c.name}에서 대욕장(온천·스파 포함)이 있는 호텔 ${n}곳을 한국 여행자 커뮤니티 후기에서 대욕장 언급이 많은 순서로 정리했습니다(언급이 없는 호텔은 방 넓은 순). 이 중 2인 기본 객실이 ${LARGE}㎡ 이상인 곳은 ${large}곳이고, 기본 객실 면적 중앙값은 ${med ?? '-'}㎡입니다.`;
    guide = `대욕장 호텔은 객실 욕실이 작은 경우가 많아, 기본 객실 면적과 대욕장 이용 조건을 함께 보는 것이 좋습니다. 일부 호텔은 스파가 특정 객실에만 포함되니 각 호텔 상세의 대욕장 메모를 확인하세요.`;
  } else if (kind === 'large') {
    kw = `${c.name} 넓은 호텔`; url = largeUrl(c); sorted = [...hotels].sort(byRoom); imgName = `${c.slug}-large-room`;
    intro = `${c.name} 비교 호텔 중 2인 기본 객실이 ${LARGE}㎡ 이상인 ${n}곳입니다. 이 중 대욕장이 있는 곳은 ${baths}곳입니다. 일본 도심 비즈니스호텔의 기본 더블룸은 15㎡ 안팎인 경우가 많아, ${LARGE}㎡ 이상이면 캐리어 두 개를 펼쳐도 비교적 여유가 있습니다.`;
    guide = `같은 호텔이어도 객실 타입마다 면적이 다릅니다. 여기 적힌 면적은 2인 투숙 가능한 기본 객실 중 가장 작은 방 기준이라, 예약 화면에서 고른 객실의 면적을 한 번 더 확인하세요.`;
  } else if (kind === 'pax') {
    const P = PAX[pax], pmed = median(hotels.map(h => paxSize(h, pax)));
    kw = `${c.name} ${P.kw}`; url = paxUrl(c, pax); sorted = [...hotels].sort(byPax(pax)); imgName = `${c.slug}-${P.slug}`;
    intro = `${c.name}에서 성인 ${pax}명이 한 방에 묵을 수 있는 호텔 ${n}곳을 ${pax}인 객실 면적이 넓은 순서로 정리했습니다. 이 중 대욕장이 있는 곳은 ${baths}곳이고, ${pax}인 객실 면적 중앙값은 ${pmed ?? '-'}㎡입니다.`;
    guide = `${pax}인 가능 여부는 일본 현지 예약 사이트에서 성인 ${pax}명으로 검색했을 때 예약 플랜이 있는지로 확인했고, 면적은 그 플랜에 나오는 객실 중 가장 작은 방 기준입니다. 트윈에 추가 침대나 소파베드를 넣는 객실도 포함되니, 침대 구성과 ${pax}인 요금은 예약 화면에서 다시 확인하세요. 트리플룸이 없는 호텔은 방 2개로 나누는 것이 낫습니다.`;
  } else if (kind === 'feature') {
    const F = FEATURES[feature];
    const others = ['onsen', 'rotenburo', 'sauna'].filter(k => k !== feature).map(k => `${FEATURES[k].ko} ${hotels.filter(h => hasFeature(h, k)).length}곳`).join(', ');
    kw = `${c.name} ${F.kw}`; url = featureUrl(c, feature); sorted = [...hotels].sort(byCommunity); imgName = `${c.slug}-${feature}`;
    intro = `${c.name}에서 ${F.what}이 있는 호텔 ${n}곳을 한국 여행자 커뮤니티 후기에서 대욕장 언급이 많은 순서로 정리했습니다(언급이 없는 호텔은 방 넓은 순). 이 중 2인 기본 객실이 ${LARGE}㎡ 이상인 곳은 ${large}곳이고, ${others}도 함께 있습니다. 기본 객실 면적 중앙값은 ${med ?? '-'}㎡입니다.`;
    guide = feature === 'onsen'
      ? `도심 호텔의 천연온천은 대부분 가열·순환 여과한 온천수를 씁니다. 온천 여부는 일본 현지 예약 사이트 시설 정보의 '温泉' 항목으로 확인했고, 인공온천·탄산천은 천연온천에 넣지 않았습니다. 이용 시간은 보통 15시부터 다음 날 아침까지이며, 문신이 있으면 입장이 제한되는 곳이 많습니다.`
      : feature === 'rotenburo'
      ? `도심 호텔의 노천탕은 최상층 대욕장에 딸린 작은 외탕인 경우가 많아, 풍경보다는 바깥 공기를 쐬는 용도로 보는 것이 좋습니다. 노천탕 여부는 일본 현지 예약 사이트 시설 정보의 '露天' 항목으로 확인했고, 반노천(半露天)만 있는 곳은 넣지 않았습니다.`
      : `사우나 여부는 일본 현지 예약 사이트 시설 정보의 'サウナ' 항목으로 확인했습니다. 남녀 중 한쪽에만 있거나 여성용이 스팀 사우나인 곳도 있으니, 사우나가 중요하면 각 호텔 상세의 대욕장 메모와 호텔 공식 안내를 함께 확인하세요.`;
  } else {
    kw = `${area} 호텔`; url = areaUrl(c, area); sorted = [...hotels].sort(byPopular); imgName = `${c.slug}-${c.areas[area]}`;
    intro = `${c.name} ${area} 지역 호텔 ${n}곳의 기본 객실 면적과 대욕장 여부를 비교했습니다. 대욕장이 있는 곳은 ${baths}곳, 2인 기본 객실이 ${LARGE}㎡ 이상인 곳은 ${large}곳이며, 기본 객실 면적 중앙값은 ${med ?? '-'}㎡입니다.`;
    guide = `${area} 호텔은 목록 순서가 후보 선정 기준(인기순)입니다. 방이 넓은 곳을 먼저 보려면 ${c.name} 전체 비교 페이지에서 '방 넓은 순'으로 정렬해 보세요.`;
  }
  const title = kind === 'pax' ? `${kw} 추천 ${n}곳 - ${PAX[pax].sub} 크기·대욕장 비교 (${month})` : `${kw} 추천 ${n}곳 - 방 크기·대욕장 비교 (${month})`;
  const desc = kind === 'pax'
    ? `${kw} ${n}곳의 ${pax}인 객실 면적(㎡)과 대욕장 여부를 한눈에 비교하세요. ${month} 기준 성인 ${pax}명이 한 방에 묵을 수 있는 호텔만 모았고, 2인 기본 객실 면적도 함께 보여줍니다.`
    : `${kw} ${n}곳의 2인 기본 객실 면적(㎡)과 대욕장 여부를 한눈에 비교하세요. ${month} 호텔 공식 자료 기준, 넓은 방 순위와 지역별 위치까지 정리했습니다.`;
  const top = sorted.find(h => num(h.minRoom2Pax));
  const ptop = kind === 'pax' && sorted.find(h => num(paxSize(h, pax)));
  const faqs = kind === 'pax' ? [
    ptop && {q: `${kw} 중 ${pax}인 객실이 가장 넓은 곳은 어디인가요?`, a: `${ptop.name}의 ${paxRoom(ptop, pax) || `${pax}인 객실`} ${paxSize(ptop, pax)}㎡입니다. 2인 기본 객실은 ${sizeText(ptop)}입니다.`},
    {q: `${kw} 중 대욕장이 있는 곳은?`, a: baths ? `${sorted.filter(h => h.bath === true).map(h => h.name).join(', ')}입니다.` : '이 목록에는 대욕장이 확인된 호텔이 없습니다.'},
    {q: `${pax}인 객실 면적은 어떤 기준인가요?`, a: `일본 현지 예약 사이트에서 성인 ${pax}명으로 검색했을 때 나오는 객실 중 가장 작은 방의 면적입니다. 추가 침대나 소파베드를 쓰는 객실이 포함될 수 있습니다.`},
    {q: `${c.name} ${pax}인 객실은 어떤 구조인가요?`, a: `${n}곳의 ${pax}인 객실은 ${catCounts(hotels, pax)}입니다. 트윈에 추가 침대를 넣는 방은 침대 폭이 100~110cm라 셋이 쓰면 좁게 느껴지고, 트리플룸·화양실은 처음부터 ${pax}명 기준이라 여유가 있습니다.`},
    {q: `2인실에 ${pax}명이 묵을 수 있나요? '기준 2인·최대 ${pax}인' 표시는 무슨 뜻인가요?`, a: `일본 호텔은 객실마다 정원(定員)이 정해져 있어 정원이 2명인 방에 ${pax}명이 묵을 수 없습니다. '기준 2인·최대 ${pax}인'은 추가 침대나 소파베드로 ${pax}명까지 받는다는 뜻이고, 예약할 때 성인 ${pax}명으로 검색해야 그 플랜이 나옵니다. 미취학 아동은 침대를 같이 쓰면 무료인 호텔이 많지만 인원에는 넣어야 합니다.`},
    {q: `아이와 함께 ${pax}명이 묵을 때 주의할 점은?`, a: `${kidsBathText(hotels)} 침대 폭이 좁은 트윈 추가 침대보다 화양실·패밀리룸이 아이와 쓰기 편합니다.`},
    {q: `${c.name}에서 ${pax}명이 묵을 트리플룸이 없는 호텔은 어떻게 하나요?`, a: `${c.name} 비교 호텔 ${cityData.find(d => d.c === c).hotels.length}곳 중 ${pax}인 플랜이 확인된 곳은 ${n}곳입니다. 나머지는 2인 객실 2개로 나누어 예약하는 것이 일반적이며, 이때는 2인 기본 객실 면적을 비교하세요.`},
  ].filter(Boolean) : [
    top && {q: `${kw} 중 방이 가장 넓은 곳은 어디인가요?`, a: `이 목록에서 2인 기본 객실이 가장 넓은 곳은 ${top.name}(${top.minRoom2Pax}㎡, ${top.roomType})입니다. ${top.bath === true ? `대욕장도 있습니다(${top.bathLabel}).` : `대욕장 정보: ${bathText(top)}.`}`},
    {q: `${kw} 중 ${LARGE}㎡ 이상인 곳은 몇 곳인가요?`, a: `${n}곳 중 ${large}곳입니다${large ? `: ${sorted.filter(h => h.minRoom2Pax >= LARGE).slice(0, 6).map(h => `${h.name}(${h.minRoom2Pax}㎡)`).join(', ')}${large > 6 ? ' 등' : ''}.` : '.'}`},
    !['bath', 'feature'].includes(kind) && {q: `${kw} 중 대욕장이 있는 곳은?`, a: baths ? `${sorted.filter(h => h.bath === true).map(h => h.name).join(', ')}입니다.` : '이 목록에는 대욕장이 확인된 호텔이 없습니다.'},
    kind === 'feature' && ['onsen', 'rotenburo', 'sauna'].filter(k => k !== feature).map(k => ({q: `${kw} 중 ${FEATURES[k].ko}도 있는 곳은?`, a: hotels.some(h => hasFeature(h, k)) ? `${sorted.filter(h => hasFeature(h, k)).map(h => h.name).join(', ')}입니다.` : `이 목록에는 ${FEATURES[k].ko}이 확인된 호텔이 없습니다.`})),
    {q: '기본 객실 면적은 어떤 기준인가요?', a: '2인이 투숙할 수 있는 기본 객실 중 호텔 공식 자료 등으로 확인된 가장 작은 방의 면적입니다. 상위 객실은 더 넓을 수 있습니다.'},
    ['bath', 'feature'].includes(kind) && {q: `${kw} 중 3인·4인이 한 방에 묵을 수 있는 곳은?`, a: `${n}곳 중 3인 플랜이 있는 곳은 ${hotels.filter(h => h.pax3).length}곳, 4인은 ${hotels.filter(h => h.pax4).length}곳입니다${hotels.some(h => h.pax3) ? `. 3인 객실이 넓은 순으로 ${[...hotels].filter(h => h.pax3).sort(byPax(3)).slice(0, 5).map(h => `${h.name}(${paxSizeText(h, 3)})`).join(', ')}${hotels.filter(h => h.pax3).length > 5 ? ' 등' : ''}` : ''}.`},
    ['bath', 'feature'].includes(kind) && {q: '대욕장은 어떻게 이용하나요? 옷·수건·문신은요?', a: BATH_HOWTO},
    ['bath', 'feature'].includes(kind) && {q: '아기나 아이와 같이 대욕장에 들어갈 수 있나요?', a: kidsBathText(hotels)},
    ['bath', 'feature'].includes(kind) && {q: `${kw} 중 대욕장이 유료이거나 일부 객실만 쓸 수 있는 곳은?`, a: hotels.some(h => /유료|전용|회원/.test(h.bathLabel || '')) ? `${hotels.filter(h => /유료|전용|회원/.test(h.bathLabel || '')).map(h => `${h.name}(${h.bathLabel})`).join(', ')}입니다. 나머지는 투숙객이 무료로 이용합니다.` : '이 목록의 대욕장은 모두 투숙객이 무료로 이용합니다.'},
  ].flat().filter(Boolean);
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
    <section aria-labelledby="listTitle"><h2 id="listTitle">${esc(kw)} ${kind === 'area' ? '목록' : kind === 'pax' ? `${pax}인 객실 넓은 순` : ['bath', 'feature'].includes(kind) ? '후기 언급 많은 순' : '방 넓은 순'}</h2>${hotelCards(sorted, kind === 'pax' ? pax : 2)}</section>
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
  const desc = `${h.name}의 2인 기본 객실은 ${h.roomType} ${sizeText(h)}입니다(${roomFeel(h.minRoom2Pax)}). ${s === 'yes' ? `대욕장: ${h.bathLabel}.` : `${bathText(h)}.`} ${c.name} ${h.area} 호텔 ${areaHotels.length}곳과 방 크기를 비교해 보세요.${h.aliases && h.aliases.length ? ` (${h.aliases.join(', ')}로도 검색)` : ''}`;
  const lines = [];
  if (num(h.minRoom2Pax)) {
    lines.push(`${h.name}의 2인 기본 객실은 ${h.roomType} ${h.minRoom2Pax}㎡로, ${roomFeel(h.minRoom2Pax)} 수준입니다.`);
    if (med != null && rank) lines.push(`NoMoreNarrowRoom에서 비교하는 ${c.name} 호텔 ${sized.length}곳 중 기본 객실 면적이 ${rank}번째로 넓고, ${c.name} 중앙값(${med}㎡)보다 ${Math.abs(Math.round((h.minRoom2Pax - med) * 10) / 10)}㎡ ${h.minRoom2Pax >= med ? '넓습니다' : '좁습니다'}.`);
    if (areaHotels.length > 1 && areaRank) lines.push(`${h.area} 지역 ${areaHotels.length}곳 중에서는 ${areaRank}번째로 넓습니다.`);
  } else lines.push(`${h.name}의 기본 객실 면적은 아직 공식 자료로 확인 중입니다.`);
  if (s === 'yes' && h.bathFeatures) { const yes = ['onsen', 'rotenburo', 'sauna'].filter(k => h.bathFeatures[k]).map(k => FEATURES[k].ko), no = ['onsen', 'rotenburo', 'sauna'].filter(k => !h.bathFeatures[k]).map(k => FEATURES[k].ko); lines.push(!yes.length ? '대욕장은 실내탕만 있고, 천연온천·노천탕·사우나 시설은 없습니다.' : !no.length ? `대욕장에는 ${yes.join('·')} 시설이 모두 있습니다.` : `대욕장에는 ${yes.join('·')} 시설이 있고, ${no.join('·')} 시설은 없습니다.`); }
  lines.push(s === 'yes' ? `대욕장 정보는 '${h.bathLabel}'로 확인했습니다. 이용 시간과 객실별 이용 조건은 예약 전 호텔에서 다시 확인하세요.` : s === 'no' ? '대욕장은 없는 것으로 확인했습니다. 객실 욕실만 이용할 수 있습니다.' : '대욕장 여부는 아직 확인 중입니다.');
  if (h.pax3 !== undefined || h.pax4 !== undefined) lines.push(`3·4인 투숙: ${paxText(h, 3)}, ${paxText(h, 4)}${h.paxVerifiedAt ? `(현지 예약 사이트 ${h.paxVerifiedAt} 기준)` : ''}.`);
  if (!isBoilerplate(h.reviewNote)) lines.push(`한줄 메모: ${h.reviewNote}.`.replace('..', '.'));
  if (h.community) lines.push(`한국 여행자 커뮤니티의 2023년 1월~2026년 10월 게시글 중 ${h.community.mentions}건이 이 호텔의 대욕장을 언급했습니다(${c.name} 대욕장 호텔 중 ${h.community.rank}위). 자주 나온 평가: ${h.community.summary}.`.replace('..', '.'));
  if (h.aliases && h.aliases.length) lines.push(`다른 표기: ${h.aliases.join(', ')}.`);
  const similar = cityHotels.filter(x => x !== h && num(x.minRoom2Pax) && num(h.minRoom2Pax) && Math.abs(x.minRoom2Pax - h.minRoom2Pax) <= 2.5).sort(byRoom).slice(0, 6);
  const neighbours = areaHotels.filter(x => x !== h).sort(byRoom).slice(0, 6);
  const faqs = [
    {q: `${h.name} 방 크기는 몇 ㎡인가요?`, a: num(h.minRoom2Pax) ? `2인 기본 객실(${h.roomType}) 기준 ${h.minRoom2Pax}㎡입니다. 상위 객실은 더 넓을 수 있습니다.` : '기본 객실 면적은 확인 중입니다.'},
    {q: `${h.name}에 대욕장이 있나요?`, a: s === 'yes' ? `네, 있습니다(${h.bathLabel}).` : s === 'no' ? '대욕장은 없습니다.' : '대욕장 여부는 확인 중입니다.'},
    s === 'yes' && h.bathFeatures && {q: `${h.name} 대욕장에 온천이나 노천탕, 사우나가 있나요?`, a: `${featureText(h)}입니다.`},
    {q: `${h.name}은 어느 지역에 있나요?`, a: `${c.name} ${h.area} 지역에 있습니다. 같은 지역 호텔 ${areaHotels.length}곳과 비교할 수 있습니다.`},
    (h.pax3 !== undefined || h.pax4 !== undefined) && {q: `${h.name}에 3명이나 4명이 한 방에 묵을 수 있나요?`, a: `${paxText(h, 3)}, ${paxText(h, 4)}입니다. ${h.pax3 || h.pax4 ? '침대 구성과 인원별 요금은 예약 화면에서 확인하세요.' : '2인 객실 2개로 나누어 예약하는 것이 일반적입니다.'}`},
    {q: `${h.name} 객실 유형은 어떤 차이가 있나요?`, a: `2인 기본 객실은 ${h.roomType} ${sizeText(h)}입니다.${h.pax3 ? ` 3인은 ${paxRoom(h, 3) || '3인 객실'} ${paxSizeText(h, 3)},` : ' 3인 플랜은 없고,'}${h.pax4 ? ` 4인은 ${paxRoom(h, 4) || '4인 객실'} ${paxSizeText(h, 4)}입니다.` : ' 4인 플랜은 없습니다.'} 상위 객실은 더 넓고, 요금 차이와 침대 구성은 예약 화면에서 확인하세요.`},
    s === 'yes' && {q: `${h.name} 대욕장 이용 시간과 조건은?`, a: `${/유료|전용|회원|세 이상/.test(h.bathLabel || '') ? `이 호텔은 '${h.bathLabel}' 조건이 있습니다. ` : '투숙객은 무료로 이용합니다. '}일본 도심 호텔 대욕장은 보통 15시부터 다음 날 10시 전후까지 열고 심야 청소 시간에는 닫으며, 문신이 있으면 입장이 제한될 수 있습니다. 정확한 시간은 대욕장 공식 자료 링크에서 확인하세요.`},
    h.community && {q: `${h.name} 대욕장, 한국 여행자 후기에서 많이 언급되나요?`, a: `한국 여행자 커뮤니티 게시글(2023년 1월~2026년 10월) ${h.community.mentions}건이 이 호텔의 대욕장을 언급해, ${c.name} 대욕장 호텔 중 ${h.community.rank}위입니다. 자주 나온 평가는 '${h.community.summary}'입니다.`},
  ].filter(Boolean);
  const img = card(`hotel-${hotelSlug(h)}`, {title: h.name, sub: `${c.name} ${h.area} · ${h.roomType}`, big: sizeText(h), bath: s === 'yes' ? '♨ 대욕장 있음' : bathText(h), isHotel: true});
  const url = hotelUrl(h);
  const hasArea = areaHotels.length >= MIN_LIST && c.areas[h.area];
  const trail = [{name: '홈', url: `${BASE}/`}, {name: `${c.name} 호텔`, url: cityUrl(c)}, ...(hasArea ? [{name: `${h.area} 호텔`, url: areaUrl(c, h.area)}] : []), {name: h.name, url}];
  const hotelLd = {'@context': 'https://schema.org', '@type': 'Hotel', name: h.name, ...(h.aliases && h.aliases.length ? {alternateName: h.aliases} : {}), url: abs(url), image: abs(img),
    address: {'@type': 'PostalAddress', addressLocality: `${c.name} ${h.area}`, addressCountry: 'JP'},
    ...(h.location ? {geo: {'@type': 'GeoCoordinates', latitude: h.location.lat, longitude: h.location.lng}} : {}),
    ...(s !== 'unknown' ? {amenityFeature: [{'@type': 'LocationFeatureSpecification', name: '대욕장', value: s === 'yes'}, ...(s === 'yes' && h.bathFeatures ? ['onsen', 'rotenburo', 'sauna'].map(k => ({'@type': 'LocationFeatureSpecification', name: FEATURES[k].ko, value: Boolean(h.bathFeatures[k])})) : [])]} : {}),
    ...(num(h.minRoom2Pax) ? {containsPlace: [2, 3, 4].filter(n => num(paxSize(h, n)) && (n === 2 || h[`pax${n}`])).map(n => ({'@type': 'HotelRoom', name: paxRoom(h, n) || `${n}인 객실`, occupancy: {'@type': 'QuantitativeValue', value: n}, floorSize: {'@type': 'QuantitativeValue', value: paxSize(h, n), unitCode: 'MTK'}}))} : {})};
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
      <dl class="fact-table"><div><dt>확인 객실 타입</dt><dd>${esc(h.roomType)}</dd></div><div><dt>기본 객실 면적</dt><dd>${esc(sizeText(h))}</dd></div><div><dt>대욕장 / 온욕시설</dt><dd>${esc(h.bathLabel)}</dd></div>${s === 'yes' && h.bathFeatures ? `<div><dt>온천·노천탕·사우나</dt><dd>${esc(featureText(h))}</dd></div>` : ''}${h.pax3 !== undefined || h.pax4 !== undefined ? `<div><dt>3인 객실</dt><dd>${esc(h.pax3 ? `${paxRoom(h, 3) || '3인 객실'} ${paxSizeText(h, 3)}` : h.pax3 === false ? '3인 플랜 없음' : '확인 중')}</dd></div><div><dt>4인 객실</dt><dd>${esc(h.pax4 ? `${paxRoom(h, 4) || '4인 객실'} ${paxSizeText(h, 4)}` : h.pax4 === false ? '4인 플랜 없음' : '확인 중')}</dd></div>` : ''}${h.community ? `<div><dt>후기 언급</dt><dd>${h.community.mentions}건 · ${esc(c.name)} 대욕장 호텔 중 ${h.community.rank}위 (2023~2026년 게시글, ${esc(h.community.checkedAt)} 집계)</dd></div>` : ''}<div><dt>확인 근거</dt><dd>${esc(h.verification)}</dd></div><div><dt>정보 확인일</dt><dd>${esc(h.verifiedAt)}</dd></div></dl>
      <p class="sources">${h.officialSourceUrl ? `<a href="${esc(h.officialSourceUrl)}" target="_blank" rel="noopener">객실 공식 자료 ↗</a>` : ''}${h.bathSourceUrl ? `<a href="${esc(h.bathSourceUrl)}" target="_blank" rel="noopener">대욕장 공식 자료 ↗</a>` : ''}${h.paxSourceUrl ? `<a href="${esc(h.paxSourceUrl)}" target="_blank" rel="noopener">3·4인 플랜 확인 자료 ↗</a>` : ''}${h.reviewSourceUrl ? `<a href="${esc(h.reviewSourceUrl)}" target="_blank" rel="noopener">트립닷컴 후기 ↗</a>` : ''}</p>
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
  html = html.replace(/(<span id="total">)[^<]*(<\/span>)/, `$1${hotels.length}곳$2`);
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
    ...(hotels.some(h => h.community) ? [{q: `${c.name}에서 한국 여행자가 많이 찾는 대욕장 호텔은?`, a: `한국 여행자 커뮤니티 게시글(2023년 1월~2026년 10월) 언급 수 기준으로 ${hotels.filter(h => h.community && h.bath === true).sort(byCommunity).slice(0, 5).map(h => `${h.name}(${h.community.mentions}건)`).join(', ')} 순입니다. 대욕장 호텔 페이지는 이 순서로 정렬되어 있습니다.`}] : []),
    {q: `${c.name}에서 3명이 한 방에 묵을 수 있는 호텔은?`, a: `${n}곳 중 ${hotels.filter(h => h.pax3).length}곳에 3인 플랜이 있습니다${hotels.some(h => h.pax3) ? `: ${[...hotels.filter(h => h.pax3)].sort(byPax(3)).slice(0, 5).map(h => `${h.name}(${paxSizeText(h, 3)})`).join(', ')} 등` : ''}. 자세한 목록은 '${c.name} ${PAX[3].kw}' 페이지에서 볼 수 있습니다.`},
    {q: `${c.name} 대욕장 호텔 중 3인·4인이 한 방에 묵을 수 있는 곳은?`, a: `대욕장 호텔 ${baths.length}곳 중 3인 플랜이 있는 곳은 ${baths.filter(h => h.pax3).length}곳, 4인은 ${baths.filter(h => h.pax4).length}곳입니다${baths.some(h => h.pax4) ? `. 4인까지 되는 곳: ${baths.filter(h => h.pax4).sort(byPax(4)).slice(0, 5).map(h => `${h.name}(${paxSizeText(h, 4)})`).join(', ')}${baths.filter(h => h.pax4).length > 5 ? ' 등' : ''}` : ''}. 도시 페이지에서 '투숙 인원'과 '대욕장' 필터를 같이 켜면 바로 추릴 수 있습니다.`},
    {q: `${c.name} 호텔 대욕장은 어떻게 이용하나요? 준비물이 있나요?`, a: BATH_HOWTO},
    {q: `${c.name} 호텔 숙박세는 얼마인가요?`, a: TAX[c.slug] || '숙박세는 예약 화면의 세금 안내에서 확인하세요.'},
    {q: `${c.name} 호텔 객실 유형(더블·트윈·트리플·화양실)은 어떻게 다른가요?`, a: `2인 기본 객실은 더블(침대 1개, 140cm 전후)이 가장 작고 트윈(침대 2개)이 조금 더 넓습니다. 비교 중인 ${n}곳의 기본 객실은 ${baseTypeCounts(hotels) || '유형 확인 중'}입니다. 3인은 트윈에 엑스트라 베드나 소파베드를 넣는 방이 많고, 4인은 화양실(다다미+침대)이나 패밀리룸이어야 하는 경우가 대부분입니다. 호텔 상세 페이지에서 2인·3인·4인 객실 면적을 따로 볼 수 있습니다.`},
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
      <p>${esc(c.name)} 호텔 ${n}곳 중 대욕장이 있는 곳은 ${baths.length}곳(천연온천 ${hotels.filter(h => hasFeature(h, 'onsen')).length}곳, 노천탕 ${hotels.filter(h => hasFeature(h, 'rotenburo')).length}곳, 사우나 ${hotels.filter(h => hasFeature(h, 'sauna')).length}곳), 2인 기본 객실이 ${LARGE}㎡ 이상인 곳은 ${large.length}곳, 3인이 한 방에 묵을 수 있는 곳은 ${hotels.filter(h => h.pax3).length}곳, 4인은 ${hotels.filter(h => h.pax4).length}곳입니다. 기본 객실 면적 중앙값은 ${median(hotels.map(h => h.minRoom2Pax))}㎡이며, 정보는 ${esc(updated)} 기준으로 확인했습니다.</p>
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
  const title = '일본 호텔 방 크기·대욕장 비교 - 후쿠오카·도쿄·삿포로·오사카 | NoMoreNarrowRoom';
  const desc = `일본 호텔 ${all.length}곳의 2인 기본 객실 면적과 대욕장을 비교하세요. 후쿠오카·도쿄·삿포로·오사카 대욕장 호텔, 방 넓은 호텔, 지역별 호텔을 호텔 공식 자료 기준으로 정리했습니다.`;
  const img = card('home', {title: '일본 호텔 방 크기·대욕장 비교', sub: `후쿠오카·도쿄·삿포로·오사카 ${all.length}곳`});
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
    for (const k of Object.keys(FEATURES)) {
      const list = hotels.filter(h => hasFeature(h, k));
      if (list.length >= MIN_LIST) links.push({url: featureUrl(c, k), label: `${c.name} ${FEATURES[k].label} 호텔`, count: list.length, kind: 'feature', feature: k, list});
    }
    for (const n of [3, 4]) {
      const list = hotels.filter(h => h[`pax${n}`] === true);
      if (list.length >= MIN_LIST) links.push({url: paxUrl(c, n), label: `${c.name} ${n}인 호텔`, count: list.length, kind: 'pax', pax: n, list});
    }
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
    for (const l of landingLinks[c.slug]) landing({c, hotels: l.list, kind: l.kind, area: l.area, feature: l.feature, pax: l.pax});
    for (const h of hotels) hotelPage(h, c, hotels);
  }
  // Sitemap, RSS (네이버 서치어드바이저 제출용), robots.txt at the domain root.
  write(path.join(BASE.slice(1), 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `  <url><loc>${abs(p.url)}</loc><lastmod>${p.updated}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  const rfc = d => new Date(d + 'T09:00:00+09:00').toUTCString();
  write(path.join(BASE.slice(1), 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(cfg.siteName)} - 일본 호텔 방 크기·대욕장 비교</title><link>${abs(BASE + '/')}</link><description>일본 호텔의 2인 기본 객실 면적과 대욕장 비교</description><language>ko</language><lastBuildDate>${rfc(maxDate(all))}</lastBuildDate>\n${pages.map(p => `<item><title>${esc(p.title)}</title><link>${abs(p.url)}</link><guid>${abs(p.url)}</guid><description>${esc(p.desc)}</description><pubDate>${rfc(p.updated)}</pubDate></item>`).join('\n')}\n</channel></rss>\n`);
  const robots = path.join(repo, 'robots.txt');
  if (!fs.existsSync(robots)) fs.writeFileSync(robots, `User-agent: *\nAllow: /\n\nSitemap: ${abs(BASE + '/sitemap.xml')}\n`);
  addNaverAnalytics(root);
  await renderImages();
  console.log(`Built ${pages.length} pages (${Object.values(landingLinks).flat().length} landing, ${all.length} hotel)`);
})();
