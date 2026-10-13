'use strict';
(() => {
  const canvas = document.querySelector('#sapporoMap');
  if (!canvas) return;
  if (!window.L) {
    document.querySelector('#mapLoadMessage').textContent='지도를 불러오지 못했습니다. 위의 지역 필터로 호텔을 찾을 수 있습니다.';
    return;
  }
  // Approximate area anchors at representative stations, not hotel coordinates.
  const areas = [
    ['삿포로역',43.0687,141.3508,'JR 삿포로역',true,'left'],
    ['오도리',43.0606,141.3533,'오도리역 · 오도리 공원',true,'right'],
    ['타누키코지',43.0570,141.3520,'타누키코지 4초메',true,'left'],
    ['스스키노',43.0555,141.3533,'스스키노역',true,'right']
  ];
  const map = L.map(canvas,{scrollWheelZoom:false,zoomControl:false});
  L.control.zoom({position:'topright',zoomInTitle:'지도 확대',zoomOutTitle:'지도 축소'}).addTo(map);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  const tiles = L.tileLayer(canvas.dataset.tiles,{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  const bounds = L.latLngBounds(areas.map(a=>[a[1],a[2]]));
  const overview = () => map.fitBounds(bounds,{padding:[50,40],maxZoom:15,animate:false});
  const hint = document.querySelector('#mapSelection');
  const markers = new Map();
  for (const [name,lat,lng,anchor,major,direction] of areas) {
    const count = hotels.filter(h=>h.area===name).length;
    const icon = L.divIcon({className:'area-pin-wrap',html:`<button type="button" class="area-pin" aria-label="${escapeHTML(name)} 지역 호텔 ${count}곳 보기"><span></span></button>`,iconSize:[32,32],iconAnchor:[16,16]});
    const marker = L.marker([lat,lng],{icon,keyboard:false}).addTo(map);
    const selectArea=()=>document.querySelector(`.filters [data-area="${name}"]`).click();
    marker.bindTooltip(`<button type="button" aria-label="${escapeHTML(name)} 지역 호텔 ${count}곳 보기">${escapeHTML(name)} <span>${count}곳</span></button>`,{interactive:true,permanent:Boolean(major),direction:direction||'top',className:'area-map-label',offset:[0,0]});
    marker.on('click',selectArea);
    marker.getTooltip().on('click',selectArea);
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
    hint.textContent=item ? `${state.area} · ${item.anchor} 주변 / 현재 조건에 맞는 호텔 ${current().length}곳` : '지역 이름이나 핀을 누르면 아래 호텔 목록이 바뀝니다. 확대하면 주변 역과 도로를 더 자세히 볼 수 있습니다.';
    if(lastArea!==state.area) {
      if(item) map.setView(item.marker.getLatLng(),16,{animate:false}); else overview();
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
