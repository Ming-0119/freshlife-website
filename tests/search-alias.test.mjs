import test from 'node:test';
import assert from 'node:assert/strict';
import {foodSearchMatches,foodMatches} from '../site/static/app/food-identity.mjs';
import {matchingShopping} from '../site/static/app/core.mjs';
test('search accepts aliases and full width input without merging stock identities',()=>{
 for(const [name,query,expected] of [['Milk','牛奶',true],['鲜牛奶',' ＭＩＬＫ ',true],['番茄','西红柿',true],['燕塘纯牛奶 250ml','牛奶',true],['燕麦奶','milk',false],['苹果汁','apple',false],['鸡胸肉','   ',true]])assert.equal(foodSearchMatches(name,query),expected,name+' / '+query);
 assert.equal(foodMatches('燕塘纯牛奶 250ml','牛奶'),false);
 assert.deepEqual(matchingShopping([{name:'Milk'},{name:'燕麦奶'}],'牛奶'),[{name:'Milk'}]);
});
