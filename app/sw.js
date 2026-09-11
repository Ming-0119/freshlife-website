const CACHE='freshlife-web-shell-3f365eb4bdb6';
const ASSET_HASHES={"/app/app.css": "7082691b5e4c8551251c19698c45242b387b63732a083b525beb577c08ee8632", "/app/app.mjs": "264b2f321fa7d1f9f7fe917d97307495193e040b9213ce10505f7fb185860a4a", "/app/core.mjs": "e3fc678ee2508b27775d74f760682670a81f77ebe84ff78e9a7aea6f4cf76348", "/app/index.html": "3c89b8b6560e366f2e244a5402e2dd7659597ed8742b07a0ddc19e9d49f65a2d", "/app/manifest.webmanifest": "0609d5f412c7331b9fc0d19aaf75817882af459d9d7d3382239b8e1a6250ca7f", "/app/": "3c89b8b6560e366f2e244a5402e2dd7659597ed8742b07a0ddc19e9d49f65a2d", "/app-icon.png": "fbad508baae338bade7cedf9a40db0e3412758d3c65898e21ddc854e34147294"};
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
