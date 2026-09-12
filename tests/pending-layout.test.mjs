import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../site/static/app/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('function pendingForm('),end=source.indexOf('\nlet state=',start);
function fixture(){
 const attrs=new Map(),original={text:'保存并继续添加'};
 const active={style:{minWidth:'9em'},childNodes:[original],disabled:false,
  getBoundingClientRect:()=>({width:157.4}),setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),replaceChildren(...nodes){this.childNodes=nodes}};
 const field={disabled:false},alreadyDisabled={disabled:true};
 const formAttrs=new Map(),form={querySelectorAll:()=>[active,field,alreadyDisabled],getAttribute:k=>formAttrs.get(k)??null,setAttribute:(k,v)=>formAttrs.set(k,v),removeAttribute:k=>formAttrs.delete(k)};
 const context=vm.createContext({});vm.runInContext(source.slice(start,end),context);
 return {active,field,alreadyDisabled,formAttrs,attrs,original,start:()=>context.pendingForm(form,active,'正在保存…')};
}
test('pending save preserves the existing wide action and restores sizing and controls',()=>{
 const f=fixture(),finish=f.start();assert.equal(f.active.style.minWidth,'min(158px, 100%)');assert.equal(f.active.textContent,'正在保存…');
 assert.equal(f.field.disabled,true);assert.equal(f.formAttrs.get('aria-busy'),'true');
 finish();assert.equal(f.active.style.minWidth,'9em');assert.equal(f.field.disabled,false);assert.equal(f.alreadyDisabled.disabled,true);
 assert.equal(f.active.childNodes[0],f.original);assert.equal(f.formAttrs.has('aria-busy'),false);
});
test('settling twice does not disable or relabel the next form operation',()=>{
 const f=fixture(),finish=f.start();finish();f.active.style.minWidth='10em';f.field.disabled=true;finish();
 assert.equal(f.active.style.minWidth,'10em');assert.equal(f.field.disabled,true);
});
