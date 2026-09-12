const CACHE='freshlife-web-shell-bccc1442ca44';
const ASSET_HASHES={"/app/accessibility.mjs": "416eb11341ce965e3015fe96a171c6b7e041f6b1083623f4de2f40020a0eddfa", "/app/app.css": "71d505f3288b58d21456051edbeb358acfb64955ad3f3f4370fd719f3f585ad5", "/app/app.mjs": "1ce9d599ea53d351dd231d38ed02789201e2bbb042e71674fbcc351515ce6713", "/app/core.mjs": "321d2407e81fc5cac59f2da2a6e892bb89db6732636cfaafb7175e97457f0ea4", "/app/food-identity.mjs": "3bb15e9ca074bdd2d811426a80b382a856220b763ffc23eb646f2527c7ba9228", "/app/index.html": "528008b9f59c218edd02608d3df319b09ec858a10483b26826846b866d5efc35", "/app/manifest.webmanifest": "0609d5f412c7331b9fc0d19aaf75817882af459d9d7d3382239b8e1a6250ca7f", "/app/": "528008b9f59c218edd02608d3df319b09ec858a10483b26826846b866d5efc35", "/app-icon.png": "fbad508baae338bade7cedf9a40db0e3412758d3c65898e21ddc854e34147294"};
const SHELL=Object.keys(ASSET_HASHES);
// Install one verified bundle. A partial deployment must not mix old and new modules.
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const entries=await Promise.all(SHELL.map(async path=>{
  const response=await fetch(path,{cache:'reload'});
  if(!response.ok)throw new Error('Incomplete app update');
  const hash=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
  const hex=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  if(hex!==ASSET_HASHES[path])throw new Error('App update version mismatch');
  return [path,response];
 }));
 const cache=await caches.open(CACHE);
 await Promise.all(entries.map(([path,response])=>cache.put(path,response)));
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('freshlife-web-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// The active worker serves its own complete version without waiting for a poor network.
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;
 event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(response=>response||Response.error()));
});
