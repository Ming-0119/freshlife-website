import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
function worker(bad=false){
 const body={'/app/':'page','/app/app.mjs':'script'};
 const hashes=Object.fromEntries(Object.entries(body).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]));
 const events={},data=new Map(),deleted=[];let fetches=0,claimed=false;
 const cache={put:async(k,v)=>data.set(k,v),match:async k=>data.get(k)?.clone()};
 const context={self:{location:{origin:'https://example.test'},addEventListener:(k,f)=>events[k]=f,clients:{claim:async()=>{claimed=true;}}},crypto:webcrypto,URL,Response,Uint8Array,caches:{open:async()=>cache,keys:async()=>['freshlife-web-shell-old','freshlife-web-shell-test','other-app'],delete:async k=>deleted.push(k)},fetch:async path=>{fetches++;return new Response(bad&&path.endsWith('mjs')?'mismatched':body[path]);}};
 const source=readFileSync(new URL('../site/static/app/sw.js',import.meta.url),'utf8').replace('__BUILD__','test').replace('__ASSET_HASHES__',JSON.stringify(hashes));vm.runInNewContext(source,context);
 return {events,data,deleted,get fetches(){return fetches;},get claimed(){return claimed;}};
}
async function dispatch(w,event){let task;w.events[event]({waitUntil:p=>task=p});await task;}
test('verified bundle installs and cached navigation makes no network request',async()=>{const w=worker();await dispatch(w,'install');assert.equal(w.data.size,2);const before=w.fetches;let response;w.events.fetch({request:{method:'GET',url:'https://example.test/app/?from=home'},respondWith:p=>response=p});assert.equal(await (await response).text(),'page');assert.equal(w.fetches,before);});
test('mismatched deployment does not write a partial cache',async()=>{const w=worker(true);await assert.rejects(dispatch(w,'install'),/version mismatch/);assert.equal(w.data.size,0);});
test('activation only removes older FreshLife caches',async()=>{const w=worker();await dispatch(w,'activate');assert.deepEqual(w.deleted,['freshlife-web-shell-old']);assert.equal(w.claimed,true);});
test('requests outside the app scope and writes are not intercepted',()=>{const w=worker();for(const request of [{method:'POST',url:'https://example.test/app/'},{method:'GET',url:'https://elsewhere.test/app/'},{method:'GET',url:'https://example.test/privacy/'}])w.events.fetch({request,respondWith:()=>assert.fail('unexpected interception')});});
