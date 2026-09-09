const CACHE='freshlife-web-shell-f95ce567f7ab';
const ASSET_HASHES={"/app/app.css": "ee684cd1172b82ffa77660d82608322e6371c7fde9024c84270268a59103eba4", "/app/app.mjs": "0cc03e6841c76dd92fc03dba9ab7d6073846d1daa4a664807c68c73fe2bbc61e", "/app/core.mjs": "e3fc678ee2508b27775d74f760682670a81f77ebe84ff78e9a7aea6f4cf76348", "/app/index.html": "1f41f245978668cde1a376cd46989676673d0e45397e8112d22187ea1c346c3a", "/app/manifest.webmanifest": "85507985a907d7c292ba9131a20169ccfa2b3670be7ceaf44aa9be0d224a5f37", "/app/": "1f41f245978668cde1a376cd46989676673d0e45397e8112d22187ea1c346c3a", "/app-icon.png": "fbad508baae338bade7cedf9a40db0e3412758d3c65898e21ddc854e34147294"};
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
