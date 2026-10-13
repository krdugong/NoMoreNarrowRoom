'use strict';
(() => {
  const canvas=document.querySelector('.geographic-map');
  if(!canvas)return;
  const message=document.querySelector('#mapLoadMessage');
  if(!window.L){message.textContent='지도를 불러오지 못했습니다. 위의 지역 필터로 호텔을 찾을 수 있습니다.';return;}
  const configs={"sapporo":{"zoom":16,"areas":[["삿포로역",43.0687,141.3508,"JR 삿포로역","left",true],["오도리",43.0606,141.3533,"오도리역 · 공원","right",true],["타누키코지",43.057,141.352,"타누키코지 4초메","left",true],["스스키노",43.0555,141.3533,"스스키노역","right",true]]},"fukuoka":{"zoom":15,"areas":[["하카타",33.5902,130.4206,"하카타역","right",true],["텐진",33.5908,130.3997,"텐진역","left",true],["나카스",33.5947,130.4065,"나카스카와바타역","top",true]]},"tokyo":{"zoom":13,"areas":[["이케부쿠로",35.7295,139.7109,"이케부쿠로역","left",false],["닛포리",35.7278,139.7709,"닛포리역","top",false],["우에노",35.7138,139.7773,"우에노역","left",true],["아사쿠사",35.7107,139.7975,"아사쿠사역","right",false],["오시아게",35.7107,139.8133,"오시아게역 · 스카이트리","top",false],["긴시초",35.6968,139.814,"긴시초역","top",false],["아키하바라",35.6983,139.773,"아키하바라역","right",false],["신주쿠",35.6907,139.7006,"신주쿠역","left",true],["도쿄역",35.6812,139.7671,"도쿄역 · 마루노우치·야에스","right",true],["히비야",35.6748,139.7596,"히비야역","top",false],["긴자",35.672,139.7638,"긴자역","top",false],["신바시",35.6662,139.7583,"신바시역","top",false],["시오도메",35.6631,139.7598,"시오도메역","top",false],["롯폰기",35.6628,139.7315,"롯폰기역","right",true],["시부야",35.658,139.7016,"시부야역","left",true],["시바·다이몬",35.6569,139.754,"다이몬역 · 하마마쓰초 주변","top",false],["시바공원",35.6548,139.7492,"시바공원역 · 도쿄타워 주변","top",false],["시오미",35.6589,139.8174,"시오미역","top",false],["시나가와",35.6285,139.7388,"시나가와역","right",true],["고탄다",35.6264,139.7234,"고탄다역","top",false],["오이마치",35.6063,139.7349,"오이마치역","right",false]]}};
  const config=configs[canvas.dataset.city];
  if(!config)return;
  const areas=config.areas;
  const map=L.map(canvas,{scrollWheelZoom:false,zoomControl:false});
  L.control.zoom({position:'topright',zoomInTitle:'지도 확대',zoomOutTitle:'지도 축소'}).addTo(map);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  const tiles=L.tileLayer(canvas.dataset.tiles,{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',className:'hotel-base-tiles'}).addTo(map);
  const bounds=L.latLngBounds(areas.map(a=>[a[1],a[2]]));
  const overview=()=>map.fitBounds(bounds,{padding:[65,45],maxZoom:config.zoom,animate:false});
  const hotelLayer=L.layerGroup().addTo(map);
  const callouts=L.layerGroup().addTo(map);
  let hotelPins=[];
  // Separate overlapping buttons, leaving a dot and connector at the real coordinate.
  function positionPins(){
    callouts.clearLayers();const occupied=[];
    for(const[marker,location]of hotelPins){
      const origin=map.latLngToLayerPoint(location);let point=origin;
      const candidates=[[0,0]];
      for(const distance of [36,72,108])for(const[dx,dy]of [[1,0],[-1,0],[0,-1],[0,1],[1,-1],[-1,1]])candidates.push([dx*distance,dy*distance]);
      for(const[dx,dy]of candidates){const candidate=origin.add([dx,dy]);if(occupied.every(p=>Math.abs(p.x-candidate.x)>=36||Math.abs(p.y-candidate.y)>=36)){point=candidate;break;}}
      occupied.push(point);const display=map.layerPointToLatLng(point);marker.setLatLng(display);
      if(point.distanceTo(origin)>0){
        L.polyline([location,display],{color:'#315e70',weight:1.5,interactive:false}).addTo(callouts);
        L.circleMarker(location,{radius:3,color:'#315e70',weight:1,fillOpacity:1,interactive:false}).addTo(callouts);
      }
    }
  }
  const highlight=L.layerGroup().addTo(map);
  const hint=document.querySelector('#mapSelection');
  const markers=new Map();
  for(const[name,lat,lng,anchor,direction,major]of areas){
    const count=hotels.filter(h=>h.area===name).length;
    const marker=L.marker([lat,lng],{icon:L.divIcon({className:'area-pin-wrap',html:`<button type="button" class="area-pin" aria-label="${escapeHTML(name)} 지역 호텔 ${count}곳 보기"><span></span></button>`,iconSize:[32,32],iconAnchor:[16,16]}),keyboard:false}).addTo(map);
    const select=()=>document.querySelector(`.filters [data-area="${name}"]`).click();
    marker.bindTooltip(`<button type="button" aria-label="${escapeHTML(name)} 지역 호텔 ${count}곳 보기">${escapeHTML(name)} <span>${count}곳</span></button>`,{interactive:true,permanent:major,direction,className:'area-map-label',offset:[0,0]});
    marker.on('click',select);marker.getTooltip().on('click',select);
    markers.set(name,{marker,anchor,major});
  }
  let lastView='';
  function update(){
    hotelLayer.clearLayers();highlight.clearLayers();callouts.clearLayers();hotelPins=[];
    const item=markers.get(state.area);
    const visible=current().filter(h=>h.location);
    for(const[name,{marker,major}]of markers){
      marker.getElement()?.querySelector('button')?.setAttribute('aria-pressed',String(name===state.area));
      marker.getElement()?.querySelector('button')?.classList.toggle('selected',name===state.area);
      const permanent=item?name===state.area:major||map.getZoom()>=14;
      marker.getTooltip().options.permanent=permanent;
      const count=hotels.filter(h=>h.area===name).length;
      marker.getTooltip().setContent(`<button type="button" aria-label="${escapeHTML(name)} 지역 호텔 ${count}곳 보기">${escapeHTML(item&&name===state.area?markers.get(name).anchor:name)} ${item?'':`<span>${count}곳</span>`}</button>`);
      if(permanent)marker.openTooltip();else marker.closeTooltip();
      marker.getTooltip().getElement()?.classList.toggle('station-map-label',Boolean(item));
    }
    if(item){
      visible.forEach(h=>{
        const label=`${h.name} 위치 보기`;
        const marker=L.marker([h.location.lat,h.location.lng],{keyboard:false,icon:L.divIcon({className:'hotel-pin-wrap',html:`<button type="button" class="hotel-map-pin" aria-label="${escapeHTML(label)}"><span aria-hidden="true"></span></button>`,iconSize:[32,32],iconAnchor:[16,16]})}).addTo(hotelLayer);
        hotelPins.push([marker,L.latLng(h.location.lat,h.location.lng)]);
        marker.bindTooltip(escapeHTML(h.name),{direction:'top',className:'hotel-map-label'});
        marker.bindPopup(`<div class="hotel-map-popup"><strong>${escapeHTML(h.name)}</strong><p>${Number.isFinite(h.minRoom2Pax)?`${h.minRoom2Pax}㎡`:'면적 확인 중'} · ${bathStatus(h)==='yes'?'대욕장 있음':bathStatus(h)==='no'?'대욕장 없음':'대욕장 확인 필요'}</p><button type="button" class="map-show-hotel">목록에서 보기 ↓</button></div>`,{maxWidth:260});
        marker.on('popupopen',()=>{
          const button=marker.getPopup().getElement().querySelector('.map-show-hotel');
          button.addEventListener('click',()=>{
            const row=[...document.querySelectorAll('.hotel')].find(r=>r.querySelector('.hotelname strong')?.textContent===h.name);
            if(row){row.querySelector('details').open=true;row.scrollIntoView({behavior:'smooth',block:'center'});row.querySelector('summary').focus({preventScroll:true});}
          });
        });
      });
      if(visible.length){
        const selectedBounds=L.latLngBounds(visible.map(h=>[h.location.lat,h.location.lng])).extend(item.marker.getLatLng());
        L.rectangle(selectedBounds.pad(.16),{color:'#315e70',weight:1,fillOpacity:.07,interactive:false}).addTo(highlight);
        const key=state.area+visible.map(h=>h.id).sort().join(',');
        if(lastView!==key){map.fitBounds(selectedBounds,{padding:[45,45],maxZoom:17,animate:false});lastView=key;}
      }else if(lastView!==state.area+'empty'){map.setView(item.marker.getLatLng(),16,{animate:false});lastView=state.area+'empty';}
      positionPins();
      hint.textContent=`${state.area} · ${item.anchor} 주변 / 호텔 ${visible.length}곳 · 호텔 점을 누르면 호텔 정보를 볼 수 있습니다.`;
    }else{
      if(lastView!=='all'){overview();lastView='all';}
      hint.textContent='지역 이름을 누르면 해당 호텔들이 점으로 표시됩니다.';
    }
  }
  document.querySelector('#mapOverview').addEventListener('click',()=>{document.querySelector('.filters [data-area="all"]').click();overview();});
  document.querySelector('#mapDetail').addEventListener('click',event=>{
    const active=event.currentTarget.getAttribute('aria-pressed')!=='true';
    event.currentTarget.setAttribute('aria-pressed',String(active));event.currentTarget.textContent=active?'간결한 지도':'도로 자세히';canvas.classList.toggle('map-detailed',active);
  });
  document.addEventListener('nmnr:filterschange',update);
  map.on('zoomend',()=>{
    positionPins();
    if(state.area==='all')for(const{marker,major}of markers.values()){
      const permanent=major||map.getZoom()>=14;marker.getTooltip().options.permanent=permanent;
      if(permanent)marker.openTooltip();else marker.closeTooltip();
    }
  });
  let loaded=false;
  tiles.on('tileload',()=>{loaded=true;message.hidden=true;});
  tiles.on('tileerror',()=>{if(!loaded){message.hidden=false;message.textContent='배경 지도를 불러오지 못했습니다. 호텔 점과 지역 필터는 계속 사용할 수 있습니다.';}});
  update();
})();
