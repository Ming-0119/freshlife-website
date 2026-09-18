import test from 'node:test';
import assert from 'node:assert/strict';
import {usageOptions,consume,emptyState} from '../site/static/app/core.mjs';
test('presets use the recorded unit and never guess package weight',()=>{
 assert.deepEqual(usageOptions(2,'份').map(x=>x.amount),[1,.5,.333,2]);
 assert.deepEqual(usageOptions(500,'克').map(x=>x.amount),[50,100,250,500]);
 assert.deepEqual(usageOptions(.5,'千克').map(x=>x.amount),[.05,.1,.25,.5]);
 assert.deepEqual(usageOptions(2,'个',true).map(x=>x.amount),[1,2]);
 assert.deepEqual(usageOptions(.2,'份').map(x=>x.amount),[.2]);
 assert.match(usageOptions(1,'份')[2].label,/约/);
});
test('one means exactly one and remaining can be fully consumed after rounded thirds',()=>{
 const s=emptyState();s.items=[{id:'a',name:'牛肉',quantity:1,unit:'份',expiry:'2026-12-01',location:'冷藏'}];
 const used=consume(s,'a',1,'consume','h1','2026-09-18T00:00:00Z');
 assert.equal(used.items.length,0);assert.equal(used.history[0].quantity,1);
 const t=emptyState();t.items=[{id:'a',name:'牛肉',quantity:1,unit:'份',expiry:'2026-12-01',location:'冷藏'}];
 const partial=consume(t,'a',.333,'consume','h2','2026-09-18T00:00:00Z');
 assert.equal(partial.items[0].quantity,.667);
 const all=usageOptions(.667,'份').at(-1).amount;
 assert.equal(consume(partial,'a',all,'consume','h3','2026-09-18T00:00:00Z').items.length,0);
});
