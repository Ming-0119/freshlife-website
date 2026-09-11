const CACHE='freshlife-web-shell-20fd7bbb8e88';
const ASSET_HASHES={"/app/accessibility.mjs": "7fdf70203cb7d696641d69c8d3d64a3a9b4eb40c81427ee50e651b7c459f91d5", "/app/app.css": "cfaa2bc73279db72dea7cb3969d6c75fde40cffe4af13949a4bc43dd6ba211b2", "/app/app.mjs": "264b2f321fa7d1f9f7fe917d97307495193e040b9213ce10505f7fb185860a4a", "/app/core.mjs": "e3fc678ee2508b27775d74f760682670a81f77ebe84ff78e9a7aea6f4cf76348", "/app/index.html": "a448f573daf4a1505243b54b9e1d57cde30d249080b11f8911ac23ff62f3621c", "/app/manifest.webmanifest": "0609d5f412c7331b9fc0d19aaf75817882af459d9d7d3382239b8e1a6250ca7f", "/app/": "a448f573daf4a1505243b54b9e1d57cde30d249080b11f8911ac23ff62f3621c", "/app-icon.png": "fbad508baae338bade7cedf9a40db0e3412758d3c65898e21ddc854e34147294"};
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
