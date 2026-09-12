import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../site/scripts/main.js',import.meta.url),'utf8');
const math=source.slice(source.indexOf('  function storyBlend('),source.indexOf('  /* motion-math:end */'));
const context={};vm.runInNewContext(math,context);
const blend=(...args)=>JSON.parse(JSON.stringify(context.storyBlend(...args)));
test('scroll story remains normalized through forward and reverse travel',()=>{
 for(const p of Array.from({length:130},(_,i)=>i*10-100).concat(Array.from({length:130},(_,i)=>1200-i*10))){
  const {weights,index}=blend([100,400,700,1000],p);
  assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-9);
  assert.ok(weights.every(w=>w>=0&&w<=1));assert.ok(weights[index]>=.5);
  assert.ok(weights.filter(w=>w>0).length<=2);
 }
});
test('fast jumps, restoration and resized chapter positions need no intermediate events',()=>{
 assert.equal(blend([100,400,700,1000],2000).index,3);
 assert.equal(blend([100,400,700,1000],-400).index,0);
 assert.deepEqual(blend([100,400],250).weights,[.5,.5]);
 assert.equal(blend([100,800],250).index,0);
 assert.deepEqual(blend([],200),{index:-1,weights:[]});
 assert.deepEqual(blend([100],200).weights,[1]);
});
function runtime(){
 const frames=[],events={},attrs=new Set(),classes=new Set(),writes={};let reads=0,preferenceObserver;
 const root={scrollHeight:3000,hasAttribute:n=>attrs.has(n),classList:{toggle(n,v){v?classes.add(n):classes.delete(n);}},style:{setProperty(k,v){writes[k]=v;}}};
 const screen={style:{removeProperty(k){delete this[k];}}};
 const hero={style:{setProperty(k,v){writes[k]=v;}}};
 const c={root,reduceMotion:false,motionQuery:{matches:false,addEventListener(n,f){events.preference=f;}},
  storyStage:{getClientRects:()=>[{}]},storyChapters:[100,400].map(top=>({getBoundingClientRect(){reads++;return {top:top-c.window.scrollY,height:100};}})),storyScreens:[screen,screen],
  storyBlend:context.storyBlend,setStoryChapter:i=>writes.chapter=i,reveals:[{classList:{add:n=>writes.revealed=n}}],
  document:{hidden:false,body:{classList:{add(){}}},querySelector:q=>q==='.hero'?hero:{classList:{toggle(){}}},addEventListener(n,f){events[n]=f;}},
  window:{scrollY:0,innerWidth:1280,innerHeight:900,addEventListener(n,f){events[n]=f;}},
  ResizeObserver:class{constructor(f){events.resizeBody=f;}observe(){}},
  MutationObserver:class{constructor(f){preferenceObserver=f;}observe(){}},
  requestAnimationFrame:f=>{frames.push(f);return frames.length;}};
 const start=source.indexOf('  /* One event-driven frame'),end=source.indexOf('  /* ---------- 当前年份',start);
 vm.runInNewContext(source.slice(start,end),c);
 return {c,events,attrs,classes,writes,frames,get reads(){return reads;},changePreference:()=>preferenceObserver(),flush(){while(frames.length)frames.shift()();}};
}
test('scroll bursts coalesce and do not remeasure layout',()=>{
 const f=runtime();f.flush();assert.equal(f.reads,2);
 f.c.window.scrollY=400;for(let i=0;i<40;i++)f.events.scroll();assert.equal(f.frames.length,1);f.flush();assert.equal(f.reads,2);
 f.events.resize();f.flush();assert.equal(f.reads,4);assert.equal(f.frames.length,0);
});
test('motion preference changes apply immediately and restore without reload',()=>{
 const f=runtime();f.flush();f.c.window.scrollY=100;f.events.scroll();f.flush();assert.notEqual(f.writes['--hero-shrink'],'0.0000');
 f.attrs.add('data-reading-motion');f.changePreference();f.flush();assert.ok(f.classes.has('motion-static'));assert.equal(f.writes['--hero-shrink'],'0.0000');assert.equal(f.writes.revealed,'in-view');
 f.attrs.delete('data-reading-motion');f.changePreference();f.flush();assert.equal(f.classes.has('motion-static'),false);
 f.c.motionQuery.matches=true;f.events.preference();f.flush();assert.ok(f.classes.has('motion-static'));
});
test('hidden pages do no frame work and mobile keeps hero stationary',()=>{
 const f=runtime();f.flush();f.c.document.hidden=true;f.events.scroll();assert.equal(f.frames.length,0);
 f.c.document.hidden=false;f.c.window.innerWidth=390;f.c.window.scrollY=100;f.events.visibilitychange();f.flush();assert.equal(f.writes['--hero-shrink'],'0.0000');
});
