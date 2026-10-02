/* NOVA — tableau de bord relié à Supabase et aux opérations sécurisées du serveur. */
(async function () {
  "use strict";
  var C=window.NOVA, S=window.NovaStore, auth=window.NovaAuth;
  if(!auth){location.replace("login.html");return;}
  var session=null, user=null, profile={}, wallet={balance:0,bonus_balance:0,bonus_locked:0}, projects=[], investments=[], ledger=[];
  var currentTab="plans", selectedProject=null;
  function el(id){return document.getElementById(id);}
  function setText(id,v){var n=el(id);if(n)n.textContent=v==null?"":String(v);}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function money(v){return S.fcn(Number(v)||0);}
  function imagePath(v){return v||"assets/img/projet-solaire.jpg";}
  function listen(id,event,handler){var n=el(id);if(n&&typeof n.addEventListener==="function")n.addEventListener(event,handler);}
  var VIEWS=["home","recharger","retrait","presence","assistance","equipe","publications","investissements","historique","compte"];
  function route(){
    var v=(location.hash||"#/home").replace(/^#\//,"");if(!VIEWS.includes(v))v="home";
    document.querySelectorAll(".view").forEach(function(x){x.classList.toggle("active",x.id==="view-"+v);});
    document.querySelectorAll(".bn-item").forEach(function(x){x.classList.toggle("active",(x.dataset.nav||"")===v);});
    var hero=el("appHero");if(hero)hero.style.display=v==="home"?"block":"none";
    if(user){try{render(v);}catch(err){console.error("NOVA render:",err);}}
  }
  try{route();}catch(err){console.error("NOVA boot route:",err);}
  window.addEventListener("hashchange",function(){try{route();}catch(err){console.error("NOVA route:",err);}});


  document.addEventListener("click",function(e){
    var a=e.target.closest('a[href^="#/"]');if(a){var v=a.dataset.nav||a.getAttribute("href").slice(2);if(VIEWS.includes(v)){e.preventDefault();location.hash="#/"+v;}}
    var btn=e.target.closest("[data-invest]");if(btn){selectedProject=projects.find(p=>p.id===btn.dataset.invest);if(!selectedProject)return;
      el("investModalText").textContent="Projet "+selectedProject.title+" — "+money(selectedProject.minimum_amount)+" pour "+selectedProject.duration_days+" jours. Solde disponible : "+money(wallet.balance);
      el("investModal").classList.add("open");}
  });
  document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",function(){document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");renderPlans(t.dataset.tab);}));
  function closeModal(id){var n=el(id);if(n)n.classList.remove("open");}
  listen("investCancel","click",()=>closeModal("investModal"));
  listen("investConfirm","click",async function(){
    if(!selectedProject)return;var b=el("investConfirm");b.disabled=true;
    try{await api("/api/investments",{method:"POST",body:JSON.stringify({project_id:selectedProject.id})});closeModal("investModal");await loadAll();render(location.hash.replace(/^#\//,"")||"home");S.toast("Investissement confirmé : le solde a été débité.");}
    catch(e){S.toast(e.message||"Investissement impossible.");}finally{b.disabled=false;}
  });
  var softpayPollTimer=null,softpayReference="";
  var chips=document.querySelectorAll("#rcChips .chip");
  chips.forEach(ch=>ch.addEventListener("click",function(){
    chips.forEach(x=>x.classList.remove("active"));
    ch.classList.add("active");
    el("rcAmount").value=ch.textContent.replace(/\s/g,"");
  }));

  function setSoftPayOperator(operator){
    var select=el("rcOperator");
    var cards=[el("spOpTmoney"),el("spOpMoov")];
    cards.forEach(function(card){
      if(card)card.classList.toggle("active",card.dataset.operator===operator);
    });
    if(select){
      var exists=Array.from(select.options).some(function(o){return o.value===operator;});
      if(exists)select.value=operator;
    }
  }

  function refreshSoftPayOperatorUi(){
    var country=el("rcCountry"), cards=el("softpayOperators"), select=el("rcOperator");
    if(!country||!cards||!select)return;
    var isTogo=country.value==="+228";
    cards.style.display=isTogo?"grid":"none";
    select.style.display=isTogo?"none":"block";
    if(isTogo){
      var current=select.value==="Moov Togo"?"Moov Togo":"Togocom";
      setSoftPayOperator(current);
    }
  }

  function showSoftPayModal(data){
    softpayReference=String(data.reference||"");
    setText("softpayAmount",money(data.amount));
    setText("softpayOperator",data.operator==="Moov Togo"?"Moov Money":"Yas (Togocom)");
    setText("softpayPhone",data.phone||"—");
    setText("softpayStatus",data.status==="completed"?"Confirmé":"En attente");
    setText("softpayMessage",data.message||"La demande a été envoyée. Validez le paiement directement sur votre téléphone.");
    var modal=el("softpayModal");if(modal){modal.classList.add("open");modal.setAttribute("aria-hidden","false");}
    var retry=el("softpayRetry");if(retry)retry.style.display="none";
  }

  function closeSoftPayModal(){
    if(softpayPollTimer){clearTimeout(softpayPollTimer);softpayPollTimer=null;}
    var modal=el("softpayModal");if(modal){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");}
  }

  async function verifySoftPayPayment(manual){
    if(!softpayReference)return;
    var statusNode=el("softpayStatus"),messageNode=el("softpayMessage"),verify=el("softpayVerify");
    if(verify)verify.disabled=true;
    if(statusNode)statusNode.textContent="Vérification…";
    try{
      var result=await api("/api/payments/paydunya/sync",{method:"POST",body:JSON.stringify({reference:softpayReference})});
      var row=Array.isArray(result.results)?result.results[0]:null;
      var status=String(row&&row.status||"pending").toLowerCase();
      if(status==="completed"){
        if(statusNode)statusNode.textContent="Confirmé";
        if(messageNode)messageNode.textContent="Paiement confirmé. Votre portefeuille NOVA a été crédité.";
        localStorage.removeItem("nova:lastPendingPaymentReference");
        await loadAll();
        setText("wdAvail",money(wallet.balance));
        S.toast("Paiement confirmé : portefeuille crédité.");
        setTimeout(closeSoftPayModal,700);
        return true;
      }
      if(status==="failed"||status==="cancelled"){
        if(statusNode)statusNode.textContent=status==="cancelled"?"Annulé":"Échec";
        if(messageNode)messageNode.textContent=status==="cancelled"?"Le paiement a été annulé. Aucun solde n'a été crédité.":"Le paiement a échoué. Aucun solde n'a été crédité.";
        var retry=el("softpayRetry");if(retry)retry.style.display="block";
        return false;
      }
      if(statusNode)statusNode.textContent="En attente";
      if(messageNode)messageNode.textContent=manual?"La validation n'est pas encore confirmée. Validez la demande sur votre téléphone puis réessayez.":"La demande est en attente de validation sur votre téléphone.";
      return false;
    }catch(e){
      if(statusNode)statusNode.textContent="Vérification impossible";
      if(messageNode)messageNode.textContent=e.message||"Impossible de vérifier le paiement pour le moment.";
      return false;
    }finally{
      if(verify)verify.disabled=false;
    }
  }

  function startSoftPayPolling(){
    if(softpayPollTimer)clearTimeout(softpayPollTimer);
    var started=Date.now();
    async function poll(){
      if(!softpayReference)return;
      var done=await verifySoftPayPayment(false);
      if(done)return;
      if(Date.now()-started<90000){
        softpayPollTimer=setTimeout(poll,4000);
      }
    }
    softpayPollTimer=setTimeout(poll,4000);
  }

  listen("softpayVerify","click",function(){verifySoftPayPayment(true);});
  listen("softpayClose","click",closeSoftPayModal);
  listen("softpayRetry","click",function(){closeSoftPayModal();var b=el("btnRecharge");if(b)b.click();});
  listen("softpayModal","click",function(e){if(e.target===el("softpayModal"))closeSoftPayModal();});

  listen("spOpTmoney","click",function(){setSoftPayOperator("Togocom");});
  listen("spOpMoov","click",function(){setSoftPayOperator("Moov Togo");});
  listen("rcCountry","change",refreshSoftPayOperatorUi);
  refreshSoftPayOperatorUi();

  listen("btnRecharge","click",async function(){
    var amount=Number(el("rcAmount").value);
    if(!Number.isSafeInteger(amount)||amount<3000){S.toast("Montant minimum : 3 000 FCFA");return;}
    var country=el("rcCountry").value;
    var operator=el("rcOperator").value;
    var phone=(el("rcDial").value||"")+(el("rcPhone").value||"").replace(/\D/g,"").replace(/^0+/,"");
    if(!/^\+228$/.test(country)){ // Preserve the existing PayDunya redirect flow for non-Togo countries.
      var bLegacy=el("btnRecharge");bLegacy.disabled=true;
      try{
        var legacy=await api("/api/payments/paydunya/create",{method:"POST",body:JSON.stringify({amount:amount})});
        if(!legacy.checkout_url||!/^https:\/\//i.test(legacy.checkout_url))throw new Error("Lien de paiement invalide.");
        localStorage.setItem("nova:lastPendingPaymentReference",legacy.reference||"");
        location.assign(legacy.checkout_url);
      }catch(e){S.toast(e.message||"Paiement impossible. Aucun solde n'a été crédité.");}
      finally{bLegacy.disabled=false;}
      return;
    }
    if(!["Togocom","Moov Togo"].includes(operator))operator="Togocom";
    if(!/^\+228\d{8}$/.test(phone)){S.toast("Entrez un numéro Togo valide à 8 chiffres.");return;}
    var b=el("btnRecharge");b.disabled=true;
    try{
      var result=await api("/api/payments/paydunya/softpay",{method:"POST",body:JSON.stringify({amount:amount,country_code:country,operator:operator,phone:phone})});
      localStorage.setItem("nova:lastPendingPaymentReference",result.reference||"");
      showSoftPayModal(result);
      if(result.status==="completed"){
        localStorage.removeItem("nova:lastPendingPaymentReference");
        await loadAll();
        setTimeout(closeSoftPayModal,700);
      }else{
        startSoftPayPolling();
      }
    }catch(e){S.toast(e.message||"Paiement SoftPay impossible. Aucun solde n'a été crédité.");}
    finally{b.disabled=false;}
  });
  listen("btnWithdraw","click",async function(){
    var amount=Number(el("wdAmount").value),phone=(el("wdDial").value||"")+(el("wdPhone").value||"").replace(/\D/g,"").replace(/^0+/,"");
    var payload={amount:amount,country_code:el("wdCountry").value,operator:el("wdOperator").value,phone:phone,account_name:el("wdName").value.trim()};
    if(!Number.isSafeInteger(amount)||amount<1500){S.toast("Montant minimum de retrait : 1 500 FCFA");return;}
    var b=el("btnWithdraw");b.disabled=true;
    try{await api("/api/withdrawals",{method:"POST",body:JSON.stringify(payload)});S.toast("Demande de retrait envoyée pour validation.");el("wdAmount").value="";await loadAll();setText("wdAvail",money(wallet.balance));}
    catch(e){S.toast(e.message||"Retrait impossible.");}finally{b.disabled=false;}
  });
  listen("btnPresence","click",async function(){
    var b=el("btnPresence");b.disabled=true;
    try{await api("/api/bonus/claim",{method:"POST",body:JSON.stringify({})});await loadAll();renderPresence();renderHome();S.toast("Bonus de 50 FCFA crédité.");}
    catch(e){S.toast(e.message||"Bonus indisponible.");}finally{b.disabled=false;}
  });
  listen("copyTeamLink","click",function(){var n=el("teamRefLink");if(n&&navigator.clipboard)navigator.clipboard.writeText(n.textContent).then(()=>S.toast("Lien copié"),()=>S.toast("Copiez le lien manuellement"));});
  listen("btnLogout","click",async function(){await auth.auth.signOut();location.href="login.html";});
  listen("btnPassword","click",()=>{var m=el("passModal");if(m)m.classList.add("open");});
  listen("npCancel","click",()=>closeModal("passModal"));
  listen("npSave","click",async function(){var p=el("npNew").value;if(!p||p.length<8){S.toast("Le mot de passe doit contenir au moins 8 caractères.");return;}var r=await auth.auth.updateUser({password:p});if(r.error)S.toast(r.error.message);else{S.toast("Mot de passe modifié.");closeModal("passModal");}});
  document.querySelectorAll(".modal-overlay").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.remove("open");}));
  function setExternalContact(id,url,emptyLabel){
    var n=el(id);if(!n)return;
    if(url){n.href=url;n.removeAttribute('aria-disabled');n.classList.remove('is-disabled');}else{n.href='#';n.setAttribute('aria-disabled','true');n.classList.add('is-disabled');var sub=n.querySelector('span:last-child');if(sub&&emptyLabel)sub.textContent=emptyLabel;}
  }
  var wa=C.whatsapp ? (/^https?:\/\//i.test(String(C.whatsapp).trim()) ? String(C.whatsapp).trim() : 'https://wa.me/'+String(C.whatsapp).replace(/\D/g,'')) : '';
  setExternalContact('assistWa',wa,'Numéro WhatsApp en attente');
  setExternalContact('welcomeWa',wa,'WhatsApp bientôt disponible');
  setExternalContact('assistTg',C.telegramService,'Lien Telegram en attente');
  setExternalContact('assistGroup',C.telegramGroup,'Groupe Telegram en attente');
  if(el("welcomeLater"))el("welcomeLater").addEventListener("click",()=>closeModal("welcomeModal"));
  if(location.search.includes("welcome=1")){if(el("welcomeModal"))el("welcomeModal").classList.add("open");history.replaceState(null,"",location.pathname+location.hash);}
  try{
    await loadAll();
    await reconcileInvestmentIncome();
    await reconcileReferralBonus();
    await confirmPaymentReturn();
    var lastRef=localStorage.getItem("nova:lastPendingPaymentReference");
    if(lastRef){
      var syncResult=await syncPendingPayment(lastRef);
      if(syncResult && Array.isArray(syncResult.results) && syncResult.results.some(function(x){return x.status==="completed";})){
        localStorage.removeItem("nova:lastPendingPaymentReference");
        await loadAll();
      }
    }
    route();
  }catch(err){
    console.error("NOVA load:",err);
    // Les vues restent affichées même si une requête secondaire Supabase échoue.
    route();
    S.toast("Certaines données sont encore en chargement. Réessayez dans quelques instants.");
  }
})();