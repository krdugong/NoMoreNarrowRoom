'use strict';
const hotels = window.NMNR_HOTELS || [];
const state = {room: 0, area: 'all', bath: 'all', sort: 'name', query: ''};
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
function roomFeel(m) {
  if (!Number.isFinite(m)) return '공식 면적 확인 중';
  if (m <= 15) return '캐리어 펴면 길 막힘';
  if (m < 20) return '둘이 쓰면 조금 타이트';
  if (m < 25) return '캐리어 2개도 비교적 여유';
  return '일본 도심호텔 기준 넓은 편';
}
function bathStatus(h) { return h.bath ? 'yes' : /확인 안 됨/.test(h.bathLabel) ? 'unknown' : 'no'; }
function current() {
  const list = hotels.filter(h => (state.area === 'all' || h.area === state.area) && (state.room === 0 || (Number.isFinite(h.minRoom2Pax) && h.minRoom2Pax >= state.room)) && (state.bath === 'all' || bathStatus(h) === state.bath) && h.name.toLocaleLowerCase('ko').includes(state.query.trim().toLocaleLowerCase('ko')));
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  list.sort((a, b) => {
    if (['room', 'small', 'bath'].includes(state.sort) && (a.minRoom2Pax == null || b.minRoom2Pax == null)) {
      if (a.minRoom2Pax == null && b.minRoom2Pax == null) return byName(a,b);
      return a.minRoom2Pax == null ? 1 : -1;
    }
    if (state.sort === 'room') return b.minRoom2Pax - a.minRoom2Pax || byName(a,b);
    if (state.sort === 'small') return a.minRoom2Pax - b.minRoom2Pax || byName(a,b);
    if (state.sort === 'bath') return Number(b.bath) - Number(a.bath) || b.minRoom2Pax - a.minRoom2Pax || byName(a,b);
    return byName(a,b);
  });
  return list;
}
function render() {
  const list = current();
  document.querySelector('#count').textContent = `${list.length}곳 / 전체 ${hotels.length}곳`;
  document.querySelector('#results').innerHTML = list.length ? list.map((h,index) => {
    const status = bathStatus(h);
    const label = status === 'yes' ? '♨ 대욕장 있음' : status === 'unknown' ? '대욕장 확인 필요' : '대욕장 없음';
    return `<article class="hotel"><details class="hotel-info"><summary><span class="hotelname"><strong>${escapeHTML(h.name)}</strong><small class="review-note">${h.reviewSourceUrl ? '<span>후기 참고</span> ' : ''}${escapeHTML(h.reviewNote || h.roomType)}</small></span><span class="size"><strong>${Number.isFinite(h.minRoom2Pax) ? `${h.minRoom2Pax}<small>㎡</small>` : '<span class="unknown-size">확인 중</span>'}</strong><span class="feel">${roomFeel(h.minRoom2Pax)}</span></span><span class="bath ${status}"><b>${label}</b>${status === 'yes' ? `<small>${escapeHTML(h.bathLabel)}</small>` : ''}</span><span class="area">${escapeHTML(h.area)}</span><span class="expand"><span class="sr-only">상세 정보</span></span></summary><div class="detail"><dl><div><dt>확인 객실 타입</dt><dd>${escapeHTML(h.roomType)}</dd></div><div><dt>대욕장 / 온욕시설</dt><dd>${escapeHTML(h.bathLabel)}</dd></div><div><dt>확인 근거</dt><dd>${escapeHTML(h.verification)}</dd></div><div><dt>정보 확인일</dt><dd>${escapeHTML(h.verifiedAt)}</dd></div></dl><p>${Number.isFinite(h.minRoom2Pax) ? `기본 객실 면적 ${h.minRoom2Pax}㎡` : '기본 객실 면적 확인 중'} · 2인 투숙 가능한 기본 객실 중 가장 작은 방 기준. 예약 전 선택한 객실의 면적${h.bath ? '과 온욕시설 이용 조건' : ''}을 확인하세요.</p>${h.officialSourceUrl ? `<p><a class="source-link" href="${escapeHTML(h.officialSourceUrl)}" target="_blank" rel="noopener">객실 확인 자료 ↗</a></p>` : ''}${h.bathSourceUrl ? `<p><a class="source-link" href="${escapeHTML(h.bathSourceUrl)}" target="_blank" rel="noopener">대욕장 공식 확인 자료 ↗</a></p>` : ''}${h.reviewSourceUrl ? `<p class="review-source">한줄 메모는 후기 일부를 참고해 정리했습니다. <a href="${escapeHTML(h.reviewSourceUrl)}" target="_blank" rel="noopener">트립닷컴 후기 보기 ↗</a> · 확인 ${escapeHTML(h.reviewCheckedAt)}</p>` : ''}</div></details>${Number.isFinite(h.minRoom2Pax) || h.tripUrl ? `<div class="booking-row">${Number.isFinite(h.minRoom2Pax) ? `<button type="button" class="simulation-link" data-sim-area="${h.minRoom2Pax}" data-sim-name="${escapeHTML(h.name)}" aria-expanded="false" aria-controls="inline-sim-${index}" aria-label="${escapeHTML(h.name)} ${h.minRoom2Pax}㎡ 캐리어 시뮬레이션">캐리어 시뮬레이션</button>` : ''}${h.tripUrl ? `<span>날짜별 요금과 예약 가능한 객실 확인</span><a class="booking-link" href="${escapeHTML(h.tripUrl)}" target="_blank" rel="sponsored noopener" aria-label="${escapeHTML(h.name)} 트립닷컴에서 가격 보기 · 새 탭">트립닷컴에서 가격 보기 <span aria-hidden="true">↗</span></a>` : ''}</div>` : ''}${Number.isFinite(h.minRoom2Pax) ? `<section class="inline-simulator" id="inline-sim-${index}" aria-label="${escapeHTML(h.name)} 캐리어 시뮬레이션" hidden></section>` : ''}</article>`;
  }).join('') : '<div class="empty">조건에 맞는 호텔이 없습니다.<br>방 크기나 지역 조건을 조금 넓혀보세요.<button id="emptyReset">조건 초기화</button></div>';
  document.querySelector('#emptyReset')?.addEventListener('click', resetAll);
  document.dispatchEvent(new Event('nmnr:filterschange')); 
}
function sync() {
  for (const key of ['room', 'area', 'bath']) {
    document.querySelectorAll(`[data-${key}]`).forEach(button => {
      const active = String(state[key]) === button.dataset[key];
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  document.querySelector('#sort').value = state.sort;
  document.querySelector('#search').value = state.query;
}
function resetAll() {
  Object.assign(state, {room: 0, area: 'all', bath: 'all', sort: 'name', query: ''});
  sync(); render();
}
for (const key of ['room', 'area', 'bath']) {
  document.querySelectorAll(`[data-${key}]`).forEach(button => button.addEventListener('click', () => {
    state[key] = key === 'room' ? Number(button.dataset[key]) : button.dataset[key];
    sync(); render();
  }));
}
document.querySelector('#sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
document.querySelector('#search').addEventListener('input', event => { state.query = event.target.value; render(); });
document.querySelector('#reset').addEventListener('click', resetAll);
document.querySelectorAll('[data-area-count]').forEach(label => {
  label.textContent = `${hotels.filter(h => h.area === label.dataset.areaCount).length}곳`;
});
document.querySelector('#total').textContent = `${hotels.length}곳`;
sync(); render();

function closeInlineSimulator(panel) {
  document.querySelector(`[aria-controls="${panel.id}"]`)?.setAttribute('aria-expanded','false');
  panel.hidden=true;
  panel.replaceChildren();
}
document.querySelector('#results').addEventListener('click',event=>{
  const close=event.target.closest('.inline-sim-close');
  if(close){const panel=close.closest('.inline-simulator');const trigger=document.querySelector(`[aria-controls="${panel.id}"]`);closeInlineSimulator(panel);trigger?.focus();return;}
  const button=event.target.closest('[data-sim-area]');
  if(!button)return;
  const panel=document.getElementById(button.getAttribute('aria-controls'));
  if(!panel.hidden){closeInlineSimulator(panel);return;}
  document.querySelectorAll('.inline-simulator:not([hidden])').forEach(closeInlineSimulator);
  const url=`./simulator.html?area=${encodeURIComponent(button.dataset.simArea)}`;
  panel.innerHTML=`<div class="inline-sim-head"><strong>${escapeHTML(button.dataset.simName)} · ${button.dataset.simArea}㎡</strong><div><a class="inline-sim-full" href="${url}">더 크게 보기 ↗</a><button type="button" class="inline-sim-close">접기</button></div></div><iframe src="${url}&embed=1&v=20261013area" title="${escapeHTML(button.dataset.simName)} 객실 면적의 캐리어 시뮬레이션"></iframe>`;
  panel.hidden=false;
  button.setAttribute('aria-expanded','true');
});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.data?.type!=='nmnr:simulator')return;
  const frame=[...document.querySelectorAll('.inline-simulator iframe')].find(frame=>frame.contentWindow===event.source);
  if(!frame)return;
  if(Number.isFinite(event.data.height))frame.style.height=Math.max(300,Math.min(3000,event.data.height))+'px';
  if(typeof event.data.params==='string'){
    const allowed=['area','height','build','people','size','cases','opened','shopping','caseH','caseW','caseD'];
    const params=new URLSearchParams(event.data.params),clean=new URLSearchParams();
    allowed.forEach(key=>{if(params.has(key))clean.set(key,params.get(key));});
    frame.closest('.inline-simulator').querySelector('.inline-sim-full').href='./simulator.html?'+clean;
  }
});
