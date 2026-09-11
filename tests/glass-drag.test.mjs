import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const all=readFileSync(new URL('../site/scripts/main.js',import.meta.url),'utf8');
const source=all.slice(all.indexOf('/* Glass selection surface'));
function fixture(){
 const events={},frames=[],timers=[];let captured=false,active=0,clicks=0;
 const classes=new Set();
 const group={clientWidth:300,clientHeight:50,clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,
  querySelectorAll:()=>buttons,append(){},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
  getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,right:300,bottom:50}),
  addEventListener:(n,f)=>events[n]=f,setPointerCapture(){captured=true;},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false;}};
 const buttons=[0,1,2].map(i=>({getAttribute:n=>n==='aria-selected'?String(active===i):null,getBoundingClientRect:()=>({left:i*100,top:0,width:100,height:50}),closest(){return this;},focus(){},click(){clicks++;active=i;}}));
 const glass={style:{setProperty(k,v){this[k]=v;}},setAttribute(){}};
 vm.runInNewContext(source,{document:{querySelectorAll:()=>[group],createElement:()=>glass},window:{addEventListener(){}},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},requestAnimationFrame:f=>{frames.push(f);return frames.length;},setTimeout:f=>timers.push(f)});
 const send=(name,x=50,y=25,extra={})=>events[name]?.({pointerId:1,pointerType:'mouse',button:0,target:buttons[0],clientX:x,clientY:y,preventDefault(){},...extra});
 return {send,glass,classes,get active(){return active;},get clicks(){return clicks;},get captured(){return captured;},flush(){while(frames.length)frames.shift()();}};
}
test('drag previews without activation and commits only on release',()=>{const f=fixture();f.flush();f.send('pointerdown');f.send('pointermove',250);assert.equal(f.active,0);assert.equal(f.glass.style.transform,'translate(200px,0px)');f.send('pointerup',250);assert.equal(f.active,2);assert.equal(f.clicks,1);assert.equal(f.captured,false);});
test('ordinary press does not capture or synthesize click',()=>{const f=fixture();f.send('pointerdown');assert.equal(f.captured,false);f.send('pointerup');assert.equal(f.clicks,0);});
test('release outside restores original selection',()=>{const f=fixture();f.send('pointerdown');f.send('pointermove',350);f.send('pointerup',350);f.flush();assert.equal(f.active,0);assert.equal(f.glass.style.transform,'translate(0px,0px)');});
test('Escape cancels an active drag',()=>{const f=fixture();f.send('pointerdown');f.send('pointermove',250);f.send('keydown',0,0,{key:'Escape'});assert.equal(f.active,0);assert.equal(f.captured,false);assert.equal(f.classes.has('is-dragging'),false);});
test('touch gestures remain available for scrolling',()=>{const f=fixture();f.send('pointerdown',50,25,{pointerType:'touch'});f.send('pointermove',250,25,{pointerType:'touch'});assert.equal(f.captured,false);assert.equal(f.classes.has('is-dragging'),false);});
test('lens stretches along drag direction and returns to rest on release',()=>{const f=fixture();f.send('pointerdown',50,25,{timeStamp:100});f.send('pointermove',220,25,{timeStamp:116});assert.ok(Number(f.glass.style['--lens-x'])>1);assert.ok(Number(f.glass.style['--lens-y'])<1);f.send('pointerup',220,25);assert.equal(f.glass.style['--lens-x'],'1');assert.equal(f.glass.style['--lens-y'],'1');});
