// Reuse the interactive list renderer so initial HTML and filtered results agree.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const data=fs.readFileSync(path.join(root,'data/sapporo-hotels.js'),'utf8');
const renderer=fs.readFileSync(path.join(root,'assets/site.js'),'utf8');
const results={innerHTML:''},count={textContent:''};
const context=vm.createContext({window:{},document:{querySelector:selector=>selector==='#results'?results:selector==='#count'?count:null,dispatchEvent(){}},Event:class{}});
vm.runInContext(data,context);
vm.runInContext(renderer.slice(0,renderer.indexOf('function sync()'))+'\nrender();',context);
const file=path.join(root,'sapporo.html');
let html=fs.readFileSync(file,'utf8');
const start='<!-- hotel-list:start -->',end='<!-- hotel-list:end -->';
if(!html.includes(start)||!html.includes(end))throw new Error('Missing hotel list build markers');
html=html.slice(0,html.indexOf(start)+start.length)+results.innerHTML+html.slice(html.indexOf(end));
html=html.replace(/(<p id="count"[^>]*>)[^<]*(<\/p>)/,'$1'+count.textContent+'$2');
html=html.replace('<noscript><p>호텔 목록과 필터를 보려면 브라우저에서 JavaScript를 켜주세요.</p></noscript>','<noscript><p>전체 호텔 정보는 아래 목록에서 확인할 수 있습니다. 조건 필터와 시뮬레이션을 사용하려면 JavaScript를 켜주세요.</p></noscript>');
fs.writeFileSync(file,html);
console.log('Built Sapporo HTML: '+count.textContent);
