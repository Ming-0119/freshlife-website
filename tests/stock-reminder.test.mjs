import test from 'node:test';
import assert from 'node:assert/strict';
import {foodMatches} from '../site/static/app/food-identity.mjs';
import {matchingStock,stockReminder} from '../site/static/app/core.mjs';
const item=(id,name,expiry='2026-09-15',unit='个',quantity=2)=>({id,name,expiry,unit,quantity});
test('curated aliases match, unknown names remain conservative',()=>{
 assert.ok(foodMatches('西红柿','番茄')); assert.ok(foodMatches(' ＭＩＬＫ ','鲜牛奶'));
 assert.ok(foodMatches('自制  酱料','自制 酱料')); assert.equal(foodMatches('',' '),false);
 assert.equal(foodMatches('燕麦奶','牛奶'),false); assert.equal(foodMatches('苹果汁','苹果'),false);
});
test('stock evidence preserves batches, units, source data and expiry warning',()=>{
 const items=[item('b','鲜牛奶','2026-09-16','瓶'),item('a','牛奶','2026-09-11','毫升',500),item('c','燕麦奶')];
 const original=JSON.stringify(items);
 assert.deepEqual(matchingStock(items,'milk').map(x=>x.id),['a','b']);
 const note=stockReminder(items,'milk','2026-09-12');
 assert.match(note,/500 毫升（已过期 1 天）/);assert.match(note,/2 瓶/);
 assert.match(note,/不会自动改变/);assert.equal(JSON.stringify(items),original);
});
test('empty and long inventories have bounded, honest evidence',()=>{
 assert.equal(stockReminder([],'鸡蛋','2026-09-12'),'');
 const rows=Array.from({length:50},(_,i)=>item(String(i),'鸡蛋'));
 assert.match(stockReminder(rows,'egg','2026-09-12'),/另有 48 批/);
 assert.equal(rows.length,50);
});

import {shoppingStockReminders} from '../site/static/app/core.mjs';
test('grouped shopping evidence preserves results for aliases and separate unknown foods',()=>{
 const items=[item('a','牛奶'),item('b','苹果汁')];
 const shopping=[{id:'one',name:'Milk'},{id:'two',name:'鲜牛奶'},{id:'three',name:'苹果'},{id:'four',name:'苹果汁'}];
 const notes=shoppingStockReminders(items,shopping,'2026-09-12');
 assert.equal(notes.get('one'),notes.get('two'));
 assert.equal(notes.get('three'),'');assert.match(notes.get('four'),/苹果汁/);
});
