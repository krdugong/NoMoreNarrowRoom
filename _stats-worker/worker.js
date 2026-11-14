// 노모어내로우룸 통계 워커 (stats.nomorenarrowroom.com).
// 사이트(GitHub Pages)의 각 페이지가 보내는 방문·클릭 신호를 D1에 날짜별로 모으고, /admin 에서 관리자 키로 본다.
// 구조와 분류 규칙은 jarojaro.com 통계를 그대로 따랐다. IP는 저장하지 않고 날짜별 해시만 남긴다.
import ADMIN_HTML from "./admin.html";

const SITE = "nomorenarrowroom.com";
const ORIGINS = ["https://nomorenarrowroom.com", "https://www.nomorenarrowroom.com"];
const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const BOT = /bot|crawl|spider|slurp|yeti|daum|preview|facebookexternalhit|kakaotalk-scrap|headless|lighthouse|curl|python|wget|go-http|scrapy|axios|node-fetch/i;

// 유입 경로 분류. utm_source, 앱 안 브라우저 표시(UA), 리퍼러 순으로 본다.
const UTM = { threads: "스레드", thread: "스레드", instagram: "인스타그램", ig: "인스타그램", reels: "인스타그램", kakao: "카카오톡", kakaotalk: "카카오톡", naver: "네이버 기타", blog: "네이버 블로그", cafe: "네이버 카페", google: "구글", x: "X(트위터)", twitter: "X(트위터)", youtube: "유튜브", shorts: "유튜브", copy: "복사한 링크", facebook: "페이스북" };
const HOSTS = [[/(^|\.)threads\.(net|com)$/, "스레드"], [/(^|\.)instagram\.com$/, "인스타그램"], [/search\.naver\.com$/, "네이버 검색"], [/blog\.naver\.com$/, "네이버 블로그"], [/cafe\.naver\.com$/, "네이버 카페"], [/(^|\.)naver\.(com|me)$/, "네이버 기타"],
  [/(^|\.)google\.[a-z.]+$/, "구글"], [/(^|\.)bing\.com$/, "빙"], [/(^|\.)daum\.net$/, "다음"], [/(^|\.)kakao\.com$/, "카카오톡"], [/^(t\.co|x\.com|twitter\.com)$/, "X(트위터)"], [/(^|\.)(youtube\.com|youtu\.be)$/, "유튜브"], [/(^|\.)facebook\.com$/, "페이스북"],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com)$/, "AI 검색"]];
const APPS = [[/Barcelona/, "스레드"], [/Instagram/, "인스타그램"], [/KAKAOTALK/i, "카카오톡"], [/NAVER\(inapp/i, "네이버 앱"], [/FBAN|FBAV|FB_IAB/, "페이스북"]];

function classify(ua, refStr, search) {
  let ref = null;
  try { ref = refStr ? new URL(refStr) : null; } catch {}
  const host = ref ? ref.hostname.replace(/^(www|m|l)\./, "") : "";
  if (host === SITE) return null; // 사이트 안에서 옮겨 다닌 것은 유입이 아니다.
  let kw = "";
  if (ref && /search\.naver\.com$/.test(host)) kw = ref.searchParams.get("query") || "";
  else if (ref && /(daum\.net|bing\.com)$/.test(host)) kw = ref.searchParams.get("q") || "";
  kw = kw.trim().slice(0, 60);
  let utm = "";
  try { utm = (new URLSearchParams(search || "").get("utm_source") || "").toLowerCase().slice(0, 30); } catch {}
  if (utm) return { src: UTM[utm] || "링크 표시: " + utm, kw, host };
  const app = APPS.find(([re]) => re.test(ua));
  if (app) return { src: app[1], kw, host };
  if (host) { const h = HOSTS.find(([re]) => re.test(host)); return { src: h ? h[1] : host.slice(0, 60), kw, host }; }
  return { src: "직접·알 수 없음", kw, host };
}
const device = (ua) => /iPad|Tablet/i.test(ua) ? "태블릿" : /Mobi|Android|iPhone/i.test(ua) ? "모바일" : "PC";

async function visitorHash(request, env, day) {
  const raw = (request.headers.get("cf-connecting-ip") || "") + "|" + (request.headers.get("user-agent") || "") + "|" + day + "|" + (env.HASH_SALT || env.ADMIN_KEY || "");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].slice(0, 9).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const cleanPath = (p) => (String(p || "/").split(/[?#]/)[0].replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/+$/, "") || "/").slice(0, 120);

async function collect(request, env, body) {
  const ua = request.headers.get("user-agent") || "";
  if (BOT.test(ua)) return;
  let d = {};
  try { d = JSON.parse(body); } catch { return; }
  const day = kstDay(), path = cleanPath(d.p);
  if (d.t === "click") {
    const label = String(d.l || "").trim().slice(0, 80) || "(이름 없음)";
    await env.DB.prepare("INSERT INTO st_clicks (day,path,label,n) VALUES (?1,?2,?3,1) ON CONFLICT(day,path,label) DO UPDATE SET n=n+1").bind(day, path, label).run();
    return;
  }
  const v = await visitorHash(request, env, day);
  const hour = new Date(Date.now() + 9 * 3600e3).getUTCHours();
  const fresh = await env.DB.prepare("INSERT OR IGNORE INTO st_visitors (day,v) VALUES (?1,?2)").bind(day, v).run().then((r) => !!(r.meta && r.meta.changes)).catch(() => false);
  const stmts = [
    env.DB.prepare("INSERT INTO st_views (day,path,n) VALUES (?1,?2,1) ON CONFLICT(day,path) DO UPDATE SET n=n+1").bind(day, path),
    env.DB.prepare("INSERT INTO st_hours (day,h,n) VALUES (?1,?2,1) ON CONFLICT(day,h) DO UPDATE SET n=n+1").bind(day, hour),
  ];
  if (fresh) stmts.push(env.DB.prepare("INSERT INTO st_dev (day,dev,n) VALUES (?1,?2,1) ON CONFLICT(day,dev) DO UPDATE SET n=n+1").bind(day, device(ua)));
  // 리퍼러 없는 접속은 새로 고침도 섞이므로 그날 처음 온 방문자일 때만 센다.
  const c = classify(ua, d.r, d.q);
  if (c && (c.src !== "직접·알 수 없음" || fresh)) {
    stmts.push(env.DB.prepare("INSERT INTO st_src (day,src,path,n) VALUES (?1,?2,?3,1) ON CONFLICT(day,src,path) DO UPDATE SET n=n+1").bind(day, c.src, path));
    if (c.kw) stmts.push(env.DB.prepare("INSERT INTO st_kw (day,kw,n) VALUES (?1,?2,1) ON CONFLICT(day,kw) DO UPDATE SET n=n+1").bind(day, c.kw));
    if (c.host) stmts.push(env.DB.prepare("INSERT INTO st_refs (day,host,n) VALUES (?1,?2,1) ON CONFLICT(day,host) DO UPDATE SET n=n+1").bind(day, c.host.slice(0, 80)));
  }
  await env.DB.batch(stmts);
}

async function authed(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  const k = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|lock")))].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  const row = await env.DB.prepare("SELECT fails, until FROM st_lock WHERE k=?1").bind(k).first().catch(() => null);
  if (row && row.until > now) return 429;
  const ok = !!env.ADMIN_KEY && request.headers.get("authorization") === "Bearer " + env.ADMIN_KEY;
  if (ok) { if (row) await env.DB.prepare("DELETE FROM st_lock WHERE k=?1").bind(k).run(); return 200; }
  const fails = (row ? row.fails : 0) + 1;
  await env.DB.prepare("INSERT INTO st_lock (k,fails,until) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET fails=?2, until=?3").bind(k, fails >= 5 ? 0 : fails, fails >= 5 ? now + 10 * 60e3 : 0).run();
  return 401;
}

async function stats(env) {
  const today = kstDay(), from14 = kstDay(new Date(Date.now() - 13 * 864e5)), from7 = kstDay(new Date(Date.now() - 6 * 864e5));
  const yday = kstDay(new Date(Date.now() - 864e5));
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const r = await env.DB.batch([
    q("SELECT day, src, SUM(n) AS n FROM st_src WHERE day>=?1 GROUP BY day, src ORDER BY day", from14),
    q("SELECT src, path, SUM(n) AS n FROM st_src WHERE day>=?1 GROUP BY src, path ORDER BY n DESC LIMIT 80", from7),
    q("SELECT kw, SUM(n) AS n FROM st_kw WHERE day>=?1 GROUP BY kw ORDER BY n DESC LIMIT 60", from7),
    q("SELECT day, h, n FROM st_hours WHERE day>=?1 ORDER BY day, h", yday),
    q("SELECT day, SUM(n) AS n FROM st_views WHERE day>=?1 GROUP BY day ORDER BY day DESC", from14),
    q("SELECT day, COUNT(*) AS n FROM st_visitors WHERE day>=?1 GROUP BY day ORDER BY day DESC", from14),
    q("SELECT path, n FROM st_views WHERE day=?1 ORDER BY n DESC LIMIT 30", today),
    q("SELECT path, SUM(n) AS n FROM st_views WHERE day>=?1 GROUP BY path ORDER BY n DESC LIMIT 40", from7),
    q("SELECT host, SUM(n) AS n FROM st_refs WHERE day>=?1 GROUP BY host ORDER BY n DESC LIMIT 30", from7),
    q("SELECT dev, SUM(n) AS n FROM st_dev WHERE day>=?1 GROUP BY dev ORDER BY n DESC", from7),
    q("SELECT label, path, SUM(n) AS n FROM st_clicks WHERE day>=?1 GROUP BY label, path ORDER BY n DESC LIMIT 40", from7),
    q("SELECT day, SUM(n) AS n FROM st_clicks WHERE day>=?1 GROUP BY day ORDER BY day DESC", from14),
  ]).then((x) => x.map((y) => y.results));
  const [src14, srcPages, kws, hours, views, visitors, pagesToday, pages7, refs, devs, clicks7, clicks14] = r;
  return { today, yday, src14, srcPages, kws, hours, views, visitors, pagesToday, pages7, refs, devs, clicks7, clicks14 };
}

const cors = (request) => {
  const o = request.headers.get("origin") || "";
  return { "access-control-allow-origin": ORIGINS.includes(o) ? o : ORIGINS[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/c") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
      if (request.method !== "POST") return new Response("", { status: 405 });
      const o = request.headers.get("origin");
      if (o && !ORIGINS.includes(o)) return new Response("", { status: 403 });
      const body = (await request.text()).slice(0, 4000); // 응답을 보내기 전에 본문을 읽어 둬야 한다.
      ctx.waitUntil(collect(request, env, body).catch((e) => console.log('collect error', String(e))));
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (url.pathname === "/api/stats") {
      const a = await authed(request, env);
      if (a === 429) return json({ error: "locked" }, 429);
      if (a !== 200) return json({ error: "auth" }, 401);
      return json(await stats(env));
    }
    if (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/") {
      return new Response(ADMIN_HTML, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" } });
    }
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
    return new Response("Not found", { status: 404 });
  },
};
