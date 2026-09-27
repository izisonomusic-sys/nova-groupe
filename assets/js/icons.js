/* =========================================================
   NOVA — Sprite d'icônes SVG (aucune dépendance externe)
   Utilisation : <svg class="ic"><use href="#i-home"/></svg>
   Icônes pleines :  <svg class="ic icf"><use href="#i-whatsapp"/></svg>
   ========================================================= */
(function () {
  var sprite =
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' +
    '<symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></symbol>' +
    '<symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 19c.8-3 3.4-5 6.5-5s5.7 2 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.2 14.6c2.4.4 4.3 2 5 4.4"/></symbol>' +
    '<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c1-3.5 4-5 8-5s7 1.5 8 5"/></symbol>' +
    '<symbol id="i-wallet" viewBox="0 0 24 24"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a2 2 0 0 1 2 2v1"/><rect x="3" y="6" width="18" height="13" rx="2.5"/><circle cx="16.5" cy="12.5" r="1.3"/></symbol>' +
    '<symbol id="i-arrow-up" viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></symbol>' +
    '<symbol id="i-arrow-down" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12l7 7 7-7"/></symbol>' +
    '<symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 3v4M16 3v4"/><path d="M9 14.5l2 2 4-4.5"/></symbol>' +
    '<symbol id="i-headphones" viewBox="0 0 24 24"><path d="M4 14a8 8 0 0 1 16 0"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></symbol>' +
    '<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4.5"/></symbol>' +
    '<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></symbol>' +
    '<symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></symbol>' +
    '<symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7.4l3-3a4 4 0 1 0-5.7-5.6l-1.6 1.6"/><path d="M14 10a4 4 0 0 0-5.7-.4l-3 3a4 4 0 1 0 5.7 5.6l1.6-1.6"/></symbol>' +
    '<symbol id="i-phone" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></symbol>' +
    '<symbol id="i-whatsapp" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zM8.9 7.4c-.2 0-.5.1-.7.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .2.2 2 3.1 5 4.3 2.5 1 3 .8 3.5.7.6 0 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.4l-2-1c-.3-.1-.5-.2-.7.1l-1 1.3c-.2.2-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.3 0-.5.1-.6l.6-.7c.2-.2.2-.4.1-.6l-1-2.3c-.2-.5-.4-.5-.6-.5h-.9z"/></symbol>' +
    '<symbol id="i-telegram" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M21.9 4.3 18.8 19c-.2 1-.8 1.2-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.9L18.2 6.6c.4-.3-.1-.5-.6-.2L7.3 12.8 2.6 11.4c-1-.3-1-1 .2-1.5l17.5-6.8c.8-.3 1.6.2 1.6 1.2z"/></symbol>' +
    '<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2.1 2.1M17.4 17.4l2.1 2.1M19.5 4.5l-2.1 2.1M6.6 17.4l-2.1 2.1"/></symbol>' +
    '<symbol id="i-building" viewBox="0 0 24 24"><rect x="4" y="4" width="10" height="16"/><path d="M14 9h5v11h-5"/><path d="M7 8h2M7 12h2M7 16h2M17 12h1M17 16h1"/></symbol>' +
    '<symbol id="i-wind" viewBox="0 0 24 24"><path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h7a2 2 0 1 1-2 2"/></symbol>' +
    '<symbol id="i-leaf" viewBox="0 0 24 24"><path d="M20 4C10 4 5 10 4 20c10 0 16-5 16-16z"/><path d="M4 20C9 15 13 11 17 7"/></symbol>' +
    '<symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6.5 20v-6M11.5 20V8M16.5 20v-9M21 20V5" stroke-width="2.4"/></symbol>' +
    '<symbol id="i-logout" viewBox="0 0 24 24"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/></symbol>' +
    '<symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></symbol>' +
    '<symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></symbol>' +
    '<symbol id="i-x" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></symbol>' +
    '<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/></symbol>' +
    '<symbol id="i-gift" viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="4"/><rect x="5" y="12" width="14" height="9"/><path d="M12 8v13"/><path d="M12 8C10 8 7.5 6.5 8 4.5 8.4 3 11 3 12 5c1-2 3.6-2 4-.5.5 2-2 3.5-4 3.5z"/></symbol>' +
    '<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></symbol>' +
    '<symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></symbol>' +
    '<symbol id="i-star" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9L12 2.5z"/></symbol>' +
    '<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1.2v5"/></symbol>' +
    '<symbol id="i-news" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 12.5h10M7 16h10"/></symbol>' +
    '<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>' +
    '</svg>';
  var div = document.createElement("div");
  div.innerHTML = sprite;
  document.body.insertBefore(div, document.body.firstChild);
})();
