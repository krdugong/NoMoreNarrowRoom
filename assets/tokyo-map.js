'use strict';
(() => {
  const canvas = document.querySelector('#tokyoMap');
  if (!canvas) return;
  if (!window.L) {
    document.querySelector('#mapLoadMessage').textContent='지도를 불러오지 못했습니다. 위의 지역 필터로 호텔을 찾을 수 있습니다.';
    return;
  }
  // Approximate area anchors at representative stations, not hotel coordinates.
  const areas = [
    ['이케부쿠로',35.7295,139.7109,'이케부쿠로역',true,'left'],
    ['닛포리',35.7278,139.7709,'닛포리역'],
    ['우에노',35.7138,139.7773,'우에노역',true,'left'],
    ['아사쿠사',35.7107,139.7975,'아사쿠사역',true,'right'],
    ['오시아게',35.7107,139.8133,'오시아게역 · 스카이트리'],
    ['긴시초',35.6968,139.8140,'긴시초역'],
    ['아키하바라',35.6983,139.7730,'아키하바라역',true,'right'],
    ['신주쿠',35.6907,139.7006,'신주쿠역',true,'left'],
    ['도쿄역',35.6812,139.7671,'도쿄역 · 마루노우치·야에스',true,'right'],
    ['히비야',35.6748,139.7596,'히비야역'],
    ['긴자',35.6720,139.7638,'긴자역'],
    ['신바시',35.6662,139.7583,'신바시역'],
    ['시오도메',35.6631,139.7598,'시오도메역'],
    ['롯폰기',35.6628,139.7315,'롯폰기역',true,'right'],
    ['시부야',35.6580,139.7016,'시부야역',true,'left'],
    ['시바·다이몬',35.6569,139.7540,'다이몬역 · 하마마쓰초 주변'],
    ['시바공원',35.6548,139.7492,'시바공원역 · 도쿄타워 주변'],
    ['시오미',35.6589,139.8174,'시오미역'],
    ['시나가와',35.6285,139.7388,'시나가와역',true,'right'],
    ['고탄다',35.6264,139.7234,'고탄다역'],
    ['오이마치',35.6063,139.7349,'오이마치역',true,'right']
  ];
  const map = L.map(canvas,{scrollWheelZoom:false,zoomControl:false});
  L.control.zoom({position:'topright',zoomInTitle:'지도 확대',zoomOutTitle:'지도 축소'}).addTo(map);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  const tiles = L.tileLayer(canvas.dataset.tiles,{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  const bounds = L.latLngBounds(areas.map(a=>[a[1],a[2]]));
  const overview = () => map.fitBounds(bounds,{padding:[50,40],maxZoom:13,animate:false});
  const hint = document.querySelector('#mapSelection');
  const markers = new Map();
  for (const [name,lat,lng,anchor,major,direction] of areas) {
    const count = hotels.filter(h=>h.area===name).length;
    const icon = L.divIcon({className:'area-pin-wrap',html:`<button type="button" class="area-pin" aria-label="${escapeHTML(name)} 지역 호텔 ${count}곳 보기"><span></span></button>`,iconSize:[32,32],iconAnchor:[16,16]});
    const marker = L.marker([lat,lng],{icon,keyboard:false}).addTo(map);
    marker.bindTooltip(`${escapeHTML(name)} <span>${count}곳</span>`,{permanent:Boolean(major),direction:direction||'top',className:'area-map-label',offset:[0,0]});
    marker.on('click',()=>document.querySelector(`.filters [data-area="${name}"]`).click());
    markers.set(name,{marker,major,anchor,count});
  }
  function labels() {
    for (const [name,item] of markers) {
      const permanent = Boolean(item.major || map.getZoom()>=14 || name===state.area);
      item.marker.getTooltip().options.permanent=permanent;
      if (permanent) item.marker.openTooltip(); else item.marker.closeTooltip();
    }
  }
  let lastArea = 'all';
  function update() {
    for (const [name,item] of markers) {
      const button=item.marker.getElement()?.querySelector('button');
      button?.classList.toggle('selected',name===state.area);
      button?.setAttribute('aria-pressed',String(name===state.area));
    }
    const item=markers.get(state.area);
    hint.textContent=item ? `${state.area} · ${item.anchor} 주변 / 현재 조건에 맞는 호텔 ${current().length}곳` : '지역 핀을 누르면 아래 호텔 목록이 바뀝니다. 확대하면 주변 역과 도로를 더 자세히 볼 수 있습니다.';
    if(lastArea!==state.area) {
      if(item) map.setView(item.marker.getLatLng(),14,{animate:false}); else overview();
      lastArea=state.area;
    }
    labels();
  }
  map.on('zoomend',labels);
  document.querySelector('#mapOverview').addEventListener('click',()=>{document.querySelector('.filters [data-area="all"]').click();overview();});
  document.addEventListener('nmnr:filterschange',update);
  let loaded=false;
  tiles.on('tileload',()=>{loaded=true;document.querySelector('#mapLoadMessage').hidden=true;});
  tiles.on('tileerror',()=>{if(!loaded){const message=document.querySelector('#mapLoadMessage');message.hidden=false;message.textContent='배경 지도를 불러오지 못했습니다. 지역 핀과 위의 필터는 계속 사용할 수 있습니다.';}});
  overview();update();
})();
