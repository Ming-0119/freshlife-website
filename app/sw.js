const CACHE='freshlife-web-shell-762460bb364f';
const ASSET_HASHES={"/app/accessibility.mjs": "a3f5f28ef787a7da8945ae12c104a7a40c0a77b3857fa7975240f5ce1407a50c", "/app/app.css": "5c70ce5794f34107bd9dc3f7b2ba5a0a27f149327b6bdec52073b0a0f1ea296a", "/app/app.mjs": "997240f51657e1dfd38f5c08bd85ca23704b8d80142538a4fece661ece9767ca", "/app/core.mjs": "e3fc678ee2508b27775d74f760682670a81f77ebe84ff78e9a7aea6f4cf76348", "/app/index.html": "a448f573daf4a1505243b54b9e1d57cde30d249080b11f8911ac23ff62f3621c", "/app/manifest.webmanifest": "0609d5f412c7331b9fc0d19aaf75817882af459d9d7d3382239b8e1a6250ca7f", "/app/": "a448f573daf4a1505243b54b9e1d57cde30d249080b11f8911ac23ff62f3621c", "/app-icon.png": "fbad508baae338bade7cedf9a40db0e3412758d3c65898e21ddc854e34147294"};
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
