const CACHE_NAME = "nova-shell-v5-20261002";
const SHELL = ["./", "./index.html", "./login.html", "./register.html", "./app.html", "./admin.html", "./assets/css/style.css?v=20261002b", "./assets/js/config.js?v=20261002b", "./assets/js/icons.js?v=20261002b", "./assets/js/store.js?v=20261002b", "./assets/js/main.js?v=20261002b", "./assets/js/auth.js?v=20261002b", "./assets/js/app.js?v=20261002b", "./assets/js/admin.js?v=20261002b", "./assets/img/logo.svg", "./assets/img/icons/icon-192.png", "./assets/img/icons/icon-512.png", "./manifest.webmanifest"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const req=event.request;
  if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
  const url=new URL(req.url);
  if(url.pathname.startsWith("/api/"))return;
  const isFreshAsset=/\.(?:js|css)$/i.test(url.pathname);
  if(req.mode==="navigate"||isFreshAsset){
    event.respondWith(fetch(req).then(res=>{
      if(res.ok)caches.open(CACHE_NAME).then(c=>c.put(req,res.clone()));
      return res;
    }).catch(()=>caches.match(req).then(hit=>hit||(req.mode==="navigate"?caches.match("./index.html"):Promise.reject(new Error("offline"))))));
  } else {
    event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok)caches.open(CACHE_NAME).then(c=>c.put(req,res.clone()));return res;})));
  }
});
