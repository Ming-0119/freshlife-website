import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pages=['index.html','404.html','app/index.html',...['features','support','privacy','terms','safety','philosophy','circularity','circularity/materials'].map(p=>p+'/index.html'),'en/index.html',...['features','support','privacy','terms','safety','philosophy','circularity','circularity/materials'].map(p=>'en/'+p+'/index.html')];
test('every public page includes shared reading preferences exactly once',()=>{
 for(const page of pages){const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');assert.equal((html.match(/src="\/app\/accessibility\.mjs"/g)||[]).length,1,page);}
});
