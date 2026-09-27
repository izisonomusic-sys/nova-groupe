/* NOVA — utilitaires d'affichage uniquement. Aucune donnée métier ni session n'est stockée ici. */
(function () {
  function fmt(n) { return Math.round(Number(n) || 0).toLocaleString("fr-FR"); }
  function fcn(n) { return fmt(n) + " " + (window.NOVA ? NOVA.currency : "FCFA"); }
  function todayStr() { return new Date().toISOString().slice(0,10); }
  function dateFr(ts) { return new Date(ts).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}); }
  function initials(name) { return (name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(function(w){return w.charAt(0).toUpperCase();}).join(""); }
  function toast(msg, icon) {
    var t=document.getElementById("toast"); if(!t)return;
    t.textContent=String(msg||""); t.classList.add("show");
    clearTimeout(toast._t); toast._t=setTimeout(function(){t.classList.remove("show");},3000);
  }
  window.NovaStore={fmt:fmt,fcn:fcn,todayStr:todayStr,dateFr:dateFr,initials:initials,toast:toast};
})();