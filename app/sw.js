const CACHE='freshlife-web-shell-a7bb59fb96f0';
const ASSET_HASHES={"/app/accessibility.mjs": "f0d8002ae61a19ee829c1871c6f0665ed40bbc0e057d647ab5011ef1503ca9e8", "/app/app.css": "8e5d02ad7e38b653688722031ea4cec386a5ee7c1a12e6dd127c9831f4ab9eac", "/app/app.mjs": "7fa5987f78fc0e6ec7a1fb197883df7ab2fe808dc11f5ba29c6957f8485c91ea", "/app/core.mjs": "e3fc678ee2508b27775d74f760682670a81f77ebe84ff78e9a7aea6f4cf76348", "/app/index.html": "2888a9b873b5f9901507aa789c5bd96f3792a9acc2abacdc54499b0b2d6ccc3e", "/app/manifest.webmanifest": "0609d5f412c7331b9fc0d19aaf75817882af459d9d7d3382239b8e1a6250ca7f", "/app/": "2888a9b873b5f9901507aa789c5bd96f3792a9acc2abacdc54499b0b2d6ccc3e", "/app-icon.png": "fbad508baae338bade7cedf9a40db0e3412758d3c65898e21ddc854e34147294"};
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
