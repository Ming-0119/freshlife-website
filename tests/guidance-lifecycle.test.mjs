import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../site/static/app/app.mjs',import.meta.url),'utf8');
const education=source.slice(source.indexOf('let quantityEducation='),source.indexOf('// Keep the form'));
function fixture(storage=new Map(),fail=false,experienced=false){
 const help={open:false,addEventListener(_,f){this.toggle=f}},editor={open:true};
 const context={state:{items:experienced?[{id:'existing'}]:[],shopping:[]},$:id=>id==='#quantity-help'?help:editor,
  localStorage:{getItem:k=>{if(fail)throw Error('blocked');return storage.get(k)},setItem:(k,v)=>{if(fail)throw Error('blocked');storage.set(k,v)}}};
 vm.createContext(context);vm.runInContext(education,context);
 return {help,storage,prepare:()=>context.prepareQuantityHelp(),complete:()=>context.rememberQuantityEducation('completed')};
}
test('first form teaches once; closing the explanation survives a new session',()=>{
 const storage=new Map(),first=fixture(storage);first.prepare();assert.equal(first.help.open,true);
 first.help.open=false;first.help.toggle();assert.equal(storage.get('freshlife-guidance.quantity.v1'),'dismissed');
 const next=fixture(storage);next.prepare();assert.equal(next.help.open,false);
 next.help.open=true;next.help.toggle();assert.equal(next.help.open,true);
});
test('successful use prevents automatic education, even after explicitly reopening help',()=>{
 const f=fixture();f.prepare();f.complete();f.help.open=false;f.help.toggle();
 assert.equal(f.storage.get('freshlife-guidance.quantity.v1'),'completed');
 const next=fixture(f.storage);next.prepare();assert.equal(next.help.open,false);
});
test('existing inventory is evidence that basic entry does not need teaching',()=>{
 const f=fixture(new Map(),false,true);f.prepare();assert.equal(f.help.open,false);
 assert.equal(f.storage.get('freshlife-guidance.quantity.v1'),'completed');
});
test('unavailable preference storage does not block editing or repeatedly teach',()=>{
 const f=fixture(new Map(),true);assert.doesNotThrow(()=>f.prepare());assert.equal(f.help.open,false);
 assert.doesNotThrow(()=>f.complete());
});
