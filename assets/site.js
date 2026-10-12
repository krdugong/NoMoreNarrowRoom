'use strict';
const hotels = window.NMNR_HOTELS || [];
const state = {room: 0, area: 'all', bath: 'all', sort: 'name', query: ''};
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
function roomFeel(m) {
  if (m <= 15) return '캐리어 펴면 길 막힘';
  if (m < 20) return '둘이 쓰면 조금 타이트';
  if (m < 25) return '캐리어 2개도 비교적 여유';
  return '일본 도심호텔 기준 넓은 편';
}
function bathStatus(h) { return h.bath ? 'yes' : /확인 안 됨/.test(h.bathLabel) ? 'unknown' : 'no'; }
function current() {
  const list = hotels.filter(h => (state.area === 'all' || h.area === state.area) && h.minRoom2Pax >= state.room && (state.bath === 'all' || bathStatus(h) === state.bath) && h.name.toLocaleLowerCase('ko').includes(state.query.trim().toLocaleLowerCase('ko')));
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  list.sort((a, b) => {
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
  document.querySelector('#results').innerHTML = list.length ? list.map(h => {
    const status = bathStatus(h);
    const label = status === 'yes' ? '♨ 있음' : status === 'unknown' ? '확인 필요' : '없음';
    return `<details class="hotel"><summary><span class="hotelname"><strong>${escapeHTML(h.name)}</strong><small>${escapeHTML(h.roomType)}</small></span><span class="size"><strong>${h.minRoom2Pax}<small>㎡</small></strong><span class="feel">${roomFeel(h.minRoom2Pax)}</span></span><span class="bath ${status}"><b>${label}</b>${status === 'yes' ? `<small>${escapeHTML(h.bathLabel)}</small>` : ''}</span><span class="area">${escapeHTML(h.area)}</span><span class="expand"><span class="sr-only">상세 정보</span></span></summary><div class="detail"><dl><div><dt>확인 객실 타입</dt><dd>${escapeHTML(h.roomType)}</dd></div><div><dt>대욕장 / 온욕시설</dt><dd>${escapeHTML(h.bathLabel)}</dd></div><div><dt>확인 근거</dt><dd>${escapeHTML(h.verification)}</dd></div><div><dt>정보 확인일</dt><dd>${escapeHTML(h.verifiedAt)}</dd></div></dl><p>2인 기본 객실 최소 ${h.minRoom2Pax}㎡. 예약 전 선택한 객실의 면적${h.bath ? '과 온욕시설 이용 조건' : ''}을 확인하세요.</p></div></details>`;
  }).join('') : '<div class="empty">조건에 맞는 호텔이 없습니다.<br>방 크기나 지역 조건을 조금 넓혀보세요.<button id="emptyReset">조건 초기화</button></div>';
  document.querySelector('#emptyReset')?.addEventListener('click', resetAll);
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
document.querySelector('#total').textContent = `${hotels.length}곳`;
sync(); render();
