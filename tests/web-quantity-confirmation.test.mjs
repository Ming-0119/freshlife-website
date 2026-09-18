import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('quantity confirmation requires an explicit amount and resets a previous value',()=>{
  const source=readFileSync(new URL('../site/static/app/app.mjs',import.meta.url),'utf8');
  const start=source.indexOf('function ask(');
  const end=source.indexOf("\n$('#action-form')",start);
  assert.ok(start>=0&&end>start);
  const nodes=new Map();
  const $=key=>{if(!nodes.has(key))nodes.set(key,{value:'99',focus(){this.focused=true;},showModal(){this.open=true;}});return nodes.get(key);};
  const context=vm.createContext({$,pending:null,lastUsageGuide:false,configureUsage(){}});
  vm.runInContext(source.slice(start,end)+';ask("用量","牛奶",()=>{},6);',context);
  assert.equal($('#amount').value,'');
  assert.equal($('#amount').required,true);
  assert.equal($('#amount').disabled,false);
  assert.equal($('#amount').max,6);
  assert.equal($('#amount').focused,true);
  assert.equal($('#action-dialog').open,true);
  vm.runInContext('ask("移除","牛奶",()=>{});',context);
  assert.equal($('#amount').required,false);
  assert.equal($('#amount').disabled,true);
});

test('usage preview rejects fractional whole items and unsupported precision',()=>{
  const source=readFileSync(new URL('../site/static/app/app.mjs',import.meta.url),'utf8');
  const start=source.indexOf('function updateUsagePreview(');
  const end=source.indexOf('\nfunction configureUsage',start);
  const amount={value:'0.5'}, preview={textContent:''};
  const context=vm.createContext({$:key=>key==='#amount'?amount:preview});
  vm.runInContext(source.slice(start,end),context);
  vm.runInContext('updateUsagePreview(2,"个",true)',context);
  assert.doesNotMatch(preview.textContent,/本次 0.5/);
  amount.value='1';vm.runInContext('updateUsagePreview(2,"个",true)',context);
  assert.match(preview.textContent,/本次 1 个 · 剩余 1 个/);
  amount.value='0.3333';vm.runInContext('updateUsagePreview(1,"份",false)',context);
  assert.doesNotMatch(preview.textContent,/本次 0.3333/);
  amount.value='0.333';vm.runInContext('updateUsagePreview(1,"份",false)',context);
  assert.match(preview.textContent,/剩余 0.667 份/);
});
