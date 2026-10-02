const VERSION='2.5.1-usually-now-last-good-fix';
const STATIC_CACHE=`fz-traffic-static-${VERSION}`;
const RUNTIME_CACHE=`fz-traffic-runtime-${VERSION}`;
const APP_SHELL=[
  '/', '/index.html', '/app.css', '/app.js', '/pwa.js', '/forecast-engine.js',
  '/external-signals.js', '/event-signals.js', '/data-adapter.js', '/manifest.webmanifest',
  '/icon-96.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>![STATIC_CACHE,RUNTIME_CACHE].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  // Google API responses stay network-side; Vercel CDN owns the shared quota cache.
  if(url.origin===location.origin && url.pathname.startsWith('/api/')){
    event.respondWith(fetch(req)); return;
  }
  // Navigation: network first, app-shell fallback.
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{
      const copy=res.clone(); caches.open(RUNTIME_CACHE).then(c=>c.put('/index.html',copy)).catch(()=>{}); return res;
    }).catch(()=>caches.match('/index.html'))); return;
  }
  // Same-origin static assets: cache first + background refresh.
  if(url.origin===location.origin){
    event.respondWith(caches.match(req).then(hit=>{
      const fresh=fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(RUNTIME_CACHE).then(c=>c.put(req,copy)).catch(()=>{})}return res}).catch(()=>hit);
      return hit || fresh;
    })); return;
  }
  // Firebase JS modules are immutable versioned assets. Cache after first successful load.
  if(url.hostname==='www.gstatic.com'){
    event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{const copy=res.clone();caches.open(RUNTIME_CACHE).then(c=>c.put(req,copy)).catch(()=>{});return res}))); return;
  }
  // All Firebase/Google data calls stay network-only to avoid stale operational data.
  event.respondWith(fetch(req));
});
