const CACHE='freshlife-web-shell-8daf2e364162';
const SHELL=['/app/','/app/index.html','/app/app.css','/app/app.mjs','/app/core.mjs','/app/manifest.webmanifest','/app-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('freshlife-web-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;event.respondWith(fetch(event.request).then(response=>{if(!response.ok)throw new Error('offline');const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(url.pathname,copy)));return response;}).catch(()=>caches.match(url.pathname).then(cached=>cached||Response.error())));});
