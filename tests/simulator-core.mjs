import assert from 'node:assert/strict';
import {simulate,normalize,allowed,overlap} from '../assets/simulator-core.mjs';
assert.equal(simulate(normalize({area:12})).kind,'blocked');
assert.equal(simulate(normalize({area:12,opened:false})).kind,'clear');
assert.equal(simulate(normalize({area:24})).kind,'clear');
assert.equal(simulate(normalize({area:15,build:'broad'})).kind,'side');
for(const area of [12,15,18,24,30])for(const cases of [0,1,2,3,4])for(const opened of [true,false]){
 const state=normalize({area,cases,opened}),r=simulate(state);
 assert.ok(Math.abs(r.W*r.D-area)<1e-8);
 assert.equal(r.bags.length+r.outside.length,cases);
 for(let i=0;i<r.bags.length;i++){const b=r.bags[i];assert.ok(b.x>=0&&b.z>=0&&b.x+b.w<=r.W&&b.z+b.d<=r.D);for(const other of [r.bed,r.bath,...r.bags.slice(i+1)])assert.ok(!overlap(b,other));}
 const radius=r.kind==='side'?r.width*.28:r.width/2;
 for(const p of r.path)assert.ok(allowed(...p,radius,r),'walking path must stay out of luggage/furniture');
}
assert.equal(normalize({height:Infinity,cases:-5}).cases,0);
assert.equal(normalize({height:999}).height,205);
console.log('50 room/luggage configurations: no overlapping packed bags or walking paths through obstacles. Narrow, blocked and clear examples pass.');
