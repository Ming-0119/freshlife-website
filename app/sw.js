const CACHE='freshlife-web-shell-eef7ad86d564';
const ASSET_HASHES={"/app/accessibility.mjs": "416eb11341ce965e3015fe96a171c6b7e041f6b1083623f4de2f40020a0eddfa", "/app/app.css": "bf39ddebf901f22550d55d15564ae02ff4f13d971d409d72ec8705bd5ee77141", "/app/app.mjs": "d63d503c5c6b8ae606d44d9947c409baf5dfe62dcdc140cac734faca56ea923d", "/app/core.mjs": "c7f50684a3010f72a86f8e7e5a882d8c324e3e9314a301166481dc67beca322a", "/app/food-identity.mjs": "3bb15e9ca074bdd2d811426a80b382a856220b763ffc23eb646f2527c7ba9228", "/app/index.html": "7eb87bdec8c9bd82a55ec20dcbbbbfbd3d3afab72d260532edc83022aec5649e", "/app/manifest.webmanifest": "0609d5f412c7331b9fc0d19aaf75817882af459d9d7d3382239b8e1a6250ca7f", "/app/sorting-guide.mjs": "f4fa40e2336008d5cf3ee7e2499e8b769277619ead4a6840148057540e93e812", "/app/": "7eb87bdec8c9bd82a55ec20dcbbbbfbd3d3afab72d260532edc83022aec5649e", "/app-icon.png": "fbad508baae338bade7cedf9a40db0e3412758d3c65898e21ddc854e34147294"};
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
