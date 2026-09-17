const CACHE='freshlife-web-shell-ec85479cfe56';
const ASSET_HASHES={"/app/accessibility.mjs": "416eb11341ce965e3015fe96a171c6b7e041f6b1083623f4de2f40020a0eddfa", "/app/app.css": "4cc24ec0b09a40eee5d38b17eed00efeb2dc92d20fdb791bebff38c47736f4ff", "/app/app.mjs": "38ec48eb8b9fa852e648fe9cd41e148eaeee7d33a67d696a962964582e4d32c6", "/app/core.mjs": "dbaaba97b183df3ce0f7d52dcbb85c50dcb2a83884751ca138ffb027272fd2f5", "/app/food-identity.mjs": "3bb15e9ca074bdd2d811426a80b382a856220b763ffc23eb646f2527c7ba9228", "/app/index.html": "9435f6d658defda67f7b977426aeb508deb9c58555d50503f006a170da27f8d8", "/app/manifest.webmanifest": "0609d5f412c7331b9fc0d19aaf75817882af459d9d7d3382239b8e1a6250ca7f", "/app/": "9435f6d658defda67f7b977426aeb508deb9c58555d50503f006a170da27f8d8", "/app-icon.png": "fbad508baae338bade7cedf9a40db0e3412758d3c65898e21ddc854e34147294"};
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
