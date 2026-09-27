const CACHE_NAME = "nova-shell-v3";
const SHELL = ["./", "./index.html", "./login.html", "./register.html", "./app.html", "./admin.html", "./assets/css/style.css", "./assets/js/config.js", "./assets/js/icons.js", "./assets/js/store.js", "./assets/js/main.js", "./assets/js/auth.js", "./assets/js/app.js", "./assets/js/admin.js", "./assets/js/icons.js", "./assets/img/logo.svg", "./assets/img/icons/icon-192.png", "./assets/img/icons/icon-512.png", "./manifest.webmanifest"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
  const req=event.request;
  if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
  const url=new URL(req.url);
  if(url.pathname.startsWith("/api/"))return;
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).then(res=>{if(res.ok)caches.open(CACHE_NAME).then(c=>c.put(req,res.clone()));return res;}).catch(()=>caches.match(req).then(hit=>hit||caches.match("./index.html"))));
  } else {
    event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok)caches.open(CACHE_NAME).then(c=>c.put(req,res.clone()));return res;})));
  }
});