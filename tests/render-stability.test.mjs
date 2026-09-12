import {foodSearchMatches} from '../site/static/app/food-identity.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {emptyState,matchingShopping,shoppingStockReminders,matchingHistory} from '../site/static/app/core.mjs';
const source=readFileSync(new URL('../site/static/app/app.mjs',import.meta.url),'utf8');
const renderSource=source.slice(source.indexOf('let lastRenderKey;'),source.indexOf('\nfunction edit(mode'));
function fixture(){
 const elements=new Map(),writes=[];
 const $=id=>{if(!elements.has(id))elements.set(id,new Proxy({value:''},{set(target,key,value){if(key!=='value')writes.push([id,key]);target[key]=value;return true;}}));return elements.get(id);};
 let day='2026-09-12';
 const context={$,state:emptyState(),view:'shopping',historyLimit:100,foodSearchMatches,today:()=>day,matchingShopping,shoppingStockReminders,matchingHistory,empty:()=>'',escape:String,actionButton:()=>'',Date};
 vm.createContext(context);vm.runInContext(renderSource,context);
 return {context,$,writes,render:()=>vm.runInContext('render()',context),advance:()=>{day='2026-09-13';}};
}
test('unchanged refresh does not replace controls or rebuild hidden lists',()=>{
 const f=fixture();f.render();const first=f.writes.length;
 assert.ok(first>0);f.render();assert.equal(f.writes.length,first);
 assert.equal(f.writes.some(([id])=>id==='#inventory'||id==='#history-list'),false);
});
test('data, filter, date and view changes still refresh visible content',()=>{
 const f=fixture();f.render();
 f.context.state.shopping.push({id:'a',name:'牛奶',quantity:1,unit:'瓶'});f.context.state.revision++;
 f.render();assert.match(f.$('#shopping-list').innerHTML,/牛奶/);
 f.$('#shopping-search').value='不存在';f.render();assert.equal(f.$('#shopping-list').innerHTML,'');
 const count=f.writes.length;f.advance();f.render();assert.ok(f.writes.length>count);
 f.context.view='history';f.render();assert.ok(f.writes.some(([id])=>id==='#history-list'));
});

import {status,sortedInventory} from '../site/static/app/core.mjs';
test('same-name inventory batches provide distinct action context',()=>{
 const f=fixture();Object.assign(f.context,{view:'pantry',status,sortedInventory,
  document:{querySelectorAll:()=>[],querySelector:id=>({setAttribute(){}})},
  actionButton:(action,id,label,name)=>`<button data-id="${id}" aria-label="${label}：${name}"></button>`});
 f.$('#filter').value='all';f.$('#location-filter').value='all';f.$('#inventory-order').value='expiry';
 f.context.state.items=[{id:'a',name:'牛奶',quantity:1,unit:'瓶',location:'冷藏',expiry:'2026-09-18'},
 {id:'b',name:'牛奶',quantity:2,unit:'盒',location:'常温',expiry:'2026-10-18'}];
 f.render();const html=f.$('#inventory').innerHTML;
 assert.match(html,/用掉：牛奶，1 瓶，冷藏，2026-09-18 到期/);
 assert.match(html,/用掉：牛奶，2 盒，常温，2026-10-18 到期/);
 assert.match(html,/更多操作：牛奶，2 盒，常温，2026-10-18 到期/);
});
