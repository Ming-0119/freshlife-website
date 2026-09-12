import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pages=['index.html','404.html','app/index.html',...['features','support','privacy','terms','safety','philosophy','circularity','circularity/materials'].map(p=>p+'/index.html'),'en/index.html',...['features','support','privacy','terms','safety','philosophy','circularity','circularity/materials'].map(p=>'en/'+p+'/index.html')];
test('every public page includes shared reading preferences exactly once',()=>{
 for(const page of pages){const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');assert.equal((html.match(/src="(?:\/app\/accessibility|\/assets\/reading-[a-f0-9]+)\.mjs"/g)||[]).length,1,page);}
});

test('public pages reference the current reading module while PWA keeps its bundled path',()=>{
 const source=readFileSync(new URL('../site/static/app/accessibility.mjs',import.meta.url),'utf8');
 for(const page of pages){
  const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');
  if(page==='app/index.html'){assert.ok(html.includes('src="/app/accessibility.mjs"'));continue;}
  const asset=html.match(/src="(\/assets\/reading-[a-f0-9]+\.mjs)"/);
  assert.ok(asset,page);
  assert.equal(readFileSync(new URL('..'+asset[1],import.meta.url),'utf8'),source,page);
 }
});
