/* NOVA — administration authentifiée via Supabase et contrôlée par l'API serveur. */
(function(){
  "use strict";
  var C=window.NOVA,S=window.NovaStore,A=window.NovaAuth;
  var login= document.getElementById("adminLogin"), panel=document.getElementById("adminPanel"), logout=document.getElementById("adminLogout");
  function $(id){return document.getElementById(id);}
  function txt(id,v){var n=$(id);if(n)n.textContent=v==null?"":String(v);}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function money(n){return S.fcn(n);}
  async function request(path,opts){
    opts=opts||{};
    var ss=await A.auth.getSession(),session=ss.data&&ss.data.session;
    if(!session){
      var refresh=await A.auth.refreshSession();
      session=refresh.data&&refresh.data.session;
    }
    var token=session&&session.access_token;
    if(!token)throw new Error("Session expirée. Connectez-vous à nouveau.");
    async function send(accessToken){
      var headers=Object.assign({"Content-Type":"application/json","Authorization":"Bearer "+accessToken},opts.headers||{});
      return fetch(path,Object.assign({},opts,{headers:headers}));
    }
    var r=await send(token);
    if(r.status===401){
      var refresh2=await A.auth.refreshSession(),session2=refresh2.data&&refresh2.data.session;
      if(session2&&session2.access_token)r=await send(session2.access_token);
    }
    var d={};try{d=await r.json();}catch(_){}
    if(!r.ok)throw new Error(d.error||"Erreur serveur.");return d;
  }
  function showPanel(){login.style.display="none";panel.style.display="block";if(logout)logout.style.display="inline-flex";loadStats().catch(e=>S.toast(e.message));loadProjects().catch(e=>S.toast(e.message));loadWithdrawals().catch(e=>S.toast(e.message));}
  function fmtMoney(v){return money(Number(v)||0);}
  async function loadStats(){
    var r=await request("/api/admin/stats"),s=r.stats||{};
    txt("statMembers",Number(s.members_total||0).toLocaleString("fr-FR"));txt("statMembersToday",Number(s.members_today||0).toLocaleString("fr-FR")+" inscription(s) aujourd’hui");
    txt("statDeposits",Number(s.deposits_confirmed||0).toLocaleString("fr-FR"));txt("statDepositAmount",fmtMoney(s.deposits_amount)+" crédités");
    txt("statDepositsPending",Number(s.deposits_pending||0).toLocaleString("fr-FR"));
    txt("statWithdrawals",Number(s.withdrawals_total||0).toLocaleString("fr-FR"));txt("statWithdrawalsPending",Number(s.withdrawals_pending||0).toLocaleString("fr-FR")+" en attente");
    txt("statWithdrawalsAmount",fmtMoney(s.withdrawals_pending_amount));txt("statWithdrawalsPaid",fmtMoney(s.withdrawals_paid_amount)+" payés");
    txt("statInvestments",Number(s.investments_active||0).toLocaleString("fr-FR"));txt("statInvestmentsAmount",fmtMoney(s.investments_amount)+" engagés");
    txt("statProjects",Number(s.projects_published||0).toLocaleString("fr-FR"));txt("statReferrals",Number(s.referrals_total||0).toLocaleString("fr-FR"));txt("statReferralBonuses",fmtMoney(s.referral_bonuses_paid)+" de bonus crédités");
  }
  function showLogin(){login.style.display="block";panel.style.display="none";if(logout)logout.style.display="none";}
  async function verifyAdmin(){
    var s=await A.auth.getSession();
    if(!s.data||!s.data.session){
      var refresh=await A.auth.refreshSession();
      if(!refresh.data||!refresh.data.session)return false;
    }
    await request('/api/admin/me');
    return true;
  }
  var form=$("adminLoginForm");
  form.addEventListener("submit",async function(e){
    e.preventDefault();var phone=$("admUser").value.trim(),password=$("admPass").value;
    if(!phone||!password){S.toast("Saisissez votre téléphone et votre mot de passe.");return;}
    var b=form.querySelector('[type="submit"]');b.disabled=true;
    try{
      var r=await A.auth.signInWithPassword({phone:phone,password:password});if(r.error)throw r.error;
      await verifyAdmin();showPanel();S.toast("Connexion administrateur réussie.");
    }catch(err){await A.auth.signOut();S.toast(err.message||"Connexion admin refusée.");}
    finally{b.disabled=false;}
  });
  if(logout)logout.addEventListener("click",async function(){await A.auth.signOut();showLogin();S.toast("Déconnexion effectuée.");});
  function withdrawalCard(w){
    var status=w.status==="pending" && !w.admin_approved_at;
    var phone=w.phone||w.profile_phone||"";
    return '<div class="admin-row" style="grid-template-columns:1fr auto"><div class="ar-info"><span class="badge badge-amber">En attente de validation</span><b>'+esc(w.display_name||"Membre NOVA")+'</b><small>Retrait de <strong>'+money(w.amount)+'</strong> — '+esc(w.operator||"")+' — '+esc(phone)+'</small><small>Compte : '+esc(w.account_name||"")+' · '+new Date(w.created_at).toLocaleString("fr-FR")+'</small></div><div class="ar-actions"><button class="btn btn-primary btn-sm" data-approve-withdrawal="'+esc(w.id)+'">Valider et payer</button><button class="btn btn-danger btn-sm" data-reject-withdrawal="'+esc(w.id)+'">Refuser</button></div></div>';
  }
  async function loadWithdrawals(){
    var data=await request("/api/admin/withdrawals"),list=data.withdrawals||[];
    txt("withdrawalQueue",list.length+" retrait(s) en attente");
    var box=$("withdrawalQueue");
    box.innerHTML=list.length?list.map(withdrawalCard).join(""):'<p class="empty">Aucun retrait en attente de validation.</p>';
  }
  $("refreshWithdrawals").addEventListener("click",function(){loadWithdrawals().catch(e=>S.toast(e.message));});
  $("withdrawalQueue").addEventListener("click",async function(e){
    var approve=e.target.closest("[data-approve-withdrawal]");
    var reject=e.target.closest("[data-reject-withdrawal]");
    if(!approve&&!reject)return;
    var id=(approve||reject).dataset.approveWithdrawal||reject.dataset.rejectWithdrawal;
    try{
      if(approve){
        if(!confirm("Valider ce retrait et autoriser l'envoi PayDunya ?"))return;
        approve.disabled=true;
        var r=await request("/api/admin/withdrawals/"+encodeURIComponent(id)+"/approve",{method:"POST",body:"{}"});
        S.toast(r.message||"Retrait validé.");
      }else{
        var note=prompt("Motif du refus (optionnel) :","Retrait refusé par l'administrateur.");
        if(note===null)return;
        reject.disabled=true;
        var r2=await request("/api/admin/withdrawals/"+encodeURIComponent(id)+"/reject",{method:"POST",body:JSON.stringify({note:note})});
        S.toast(r2.message||"Retrait refusé.");
      }
      await Promise.all([loadWithdrawals(),loadStats()]);
    }catch(err){S.toast(err.message||"Action impossible.");}
    finally{if(approve)approve.disabled=false;if(reject)reject.disabled=false;}
  });
  function draft(){
    var title=$("pTitle").value.trim(),slug=title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    return {title:title,slug:slug,badge:$("pBadge").value.trim(),description:$("pDesc").value.trim(),category:$("pType").value==="1"?"other":categoryFromImage($("pImg").value),
      minimum_amount:Number($("pPrice").value),daily_return_amount:Number($("pDaily").value),duration_days:Number($("pDays").value),
      image_url:$("pImg").value,return_terms:($("pType").value==="1"?"SPECIAL: ":"")+"Rendement estimatif affiché à titre indicatif."};
  }
  function categoryFromImage(img){if(img.includes("immobilier")||img.includes("hero"))return "real_estate";if(img.includes("vent"))return "wind";if(img.includes("agri"))return "agriculture";return "solar";}
  function preview(){
    var d=draft(),total=(d.daily_return_amount||0)*(d.duration_days||0);
    $("previewCard").innerHTML='<article class="plan-card"><div class="plan-head"><img src="'+esc(d.image_url)+'" alt=""><span class="badge">'+esc($("pBadge").value.trim()||"Projet")+'</span></div><div class="plan-body"><h3>'+esc(d.title||"Titre du projet")+'</h3><p class="desc">'+esc(d.description||"Description du projet")+'</p><div class="plan-stats"><div class="plan-stat"><span>Prix</span><b>'+money(d.minimum_amount)+'</b></div><div class="plan-stat"><span>Gain/jour</span><b>'+money(d.daily_return_amount)+'</b></div><div class="plan-stat"><span>Durée</span><b>'+d.duration_days+' jours</b></div><div class="plan-stat"><span>Gain total estimé</span><b>'+money(total)+'</b></div></div></div></article>';
  }
  ["pType","pBadge","pTitle","pDesc","pPrice","pDaily","pDays","pImg"].forEach(id=>$(id).addEventListener("input",preview));
  $("btnPublish").addEventListener("click",async function(){
    var d=draft();if(!d.title||!d.slug){S.toast("Le titre est obligatoire.");return;}
    if(!Number.isSafeInteger(d.minimum_amount)||d.minimum_amount<1000){S.toast("Montant minimum : 1 000 FCFA.");return;}
    if(!Number.isSafeInteger(d.daily_return_amount)||d.daily_return_amount<0){S.toast("Gain quotidien invalide.");return;}
    if(!Number.isSafeInteger(d.duration_days)||d.duration_days<1){S.toast("Durée invalide.");return;}
    var b=$("btnPublish");b.disabled=true;
    try{await request("/api/admin/projects",{method:"POST",body:JSON.stringify(d)});S.toast("Projet publié dans Supabase.");["pBadge","pTitle","pDesc","pPrice","pDaily","pDays"].forEach(id=>$(id).value="");preview();await loadProjects();}
    catch(e){S.toast(e.message||"Publication impossible.");}finally{b.disabled=false;}
  });
  function card(p){
    var status=p.status==="published",category=p.category==="special"?"Plan spécial":p.category;
    return '<div class="admin-row"><img class="ar-img" src="'+esc(p.image_url||"assets/img/projet-solaire.jpg")+'" alt=""><div class="ar-info"><span class="badge">'+esc(p.badge||category)+'</span><b>'+esc(p.title)+'</b><small>'+esc(p.description)+'</small></div><div class="ar-right"><div class="ar-stats"><div class="ar-stat"><span>Investissement</span><b>'+money(p.minimum_amount)+'</b></div><div class="ar-stat"><span>Gain/jour</span><b>'+money(p.daily_return_amount)+'</b></div><div class="ar-stat"><span>Durée</span><b>'+p.duration_days+' j</b></div></div><div class="ar-actions"><span class="badge '+(status?"badge-teal":"badge-amber")+'">'+(status?"Publié":"Masqué")+'</span><button class="btn btn-sm btn-outline" data-toggle="'+esc(p.id)+'">'+(status?"Masquer":"Publier")+'</button><button class="btn btn-sm btn-danger" data-del="'+esc(p.id)+'">Supprimer</button></div></div></div>';
  }
  async function loadProjects(){
    var data=await request("/api/admin/projects");var list=data.projects||[];
    txt("projCount",list.length+" projets");$("projTable").innerHTML=list.length?list.map(card).join(""):'<p class="empty">Aucun projet. Créez votre premier projet ci-dessus.</p>';
  }
  $("projTable").addEventListener("click",async function(e){
    var t=e.target.closest("[data-toggle]"),d=e.target.closest("[data-del]");
    try{
      if(t){var p=await request("/api/admin/projects/"+encodeURIComponent(t.dataset.toggle),{method:"PATCH",body:JSON.stringify({toggle:true})});S.toast(p.message||"Statut modifié.");await loadProjects();}
      if(d&&confirm("Supprimer ou fermer ce projet ? Les investissements existants seront conservés.")){var p2=await request("/api/admin/projects/"+encodeURIComponent(d.dataset.del),{method:"DELETE"});S.toast(p2.message||"Projet retiré.");await loadProjects();}
    }catch(err){S.toast(err.message||"Action impossible.");}
  });
  txt("ftDisclaimer",C.disclaimer);txt("year",new Date().getFullYear());preview();
  (async function(){try{if(await verifyAdmin())showPanel();else showLogin();}catch(_){showLogin();}})();
})();