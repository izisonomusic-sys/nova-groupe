/* NOVA — tableau de bord relié à Supabase et aux opérations sécurisées du serveur. */
(async function () {
  "use strict";
  var C=window.NOVA, S=window.NovaStore, auth=window.NovaAuth;
  if(!auth){location.replace("login.html");return;}
  var sr=await auth.auth.getSession(), session=sr.data&&sr.data.session;
  if(sr.error||!session){location.replace("login.html");return;}
  var user=session.user, profile={}, wallet={balance:0,bonus_balance:0,bonus_locked:0}, projects=[], investments=[], ledger=[];
  var currentTab="plans", selectedProject=null, handlersReady=false;
  function el(id){return document.getElementById(id);}
  function setText(id,v){var n=el(id);if(n)n.textContent=v==null?"":String(v);}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function money(v){return S.fcn(Number(v)||0);}
  function imagePath(v){return v||"assets/img/projet-solaire.jpg";}
  function listen(id,event,handler){var n=el(id);if(n&&typeof n.addEventListener==="function")n.addEventListener(event,handler);}
  async function api(path,opts){
    opts=opts||{};
    var configured=(C.apiBase||"").trim().replace(/\/$/,"");
    var localOrigin=String(location.origin||"").replace(/\/$/,"");
    var bases=[];
    // Prefer the host currently serving the application. This avoids cross-origin/API-base
    // mismatches when the same Render service is opened through another hostname.
    [localOrigin,configured].forEach(function(base){if(base&&!bases.includes(base))bases.push(base);});
    if(!bases.length)bases.push("");
    var lastError=null;
    async function send(base,accessToken){
      var target=/^https?:\/\//i.test(String(path))
        ?String(path)
        :((base||"")+String(path));
      var headers=Object.assign({"Content-Type":"application/json","Accept":"application/json","Authorization":"Bearer "+accessToken},opts.headers||{});
      return fetch(target,Object.assign({},opts,{headers:headers}));
    }
    for(var i=0;i<bases.length;i++){
      try{
        var r=await send(bases[i],session.access_token);
        if(r.status===401){
          var refreshed=await auth.auth.refreshSession();
          var nextSession=refreshed.data&&refreshed.data.session;
          if(nextSession&&nextSession.access_token){
            session=nextSession;
            r=await send(bases[i],session.access_token);
          }
        }
        if(r.status===404&&i<bases.length-1)continue;
        var data={};
        try{data=await r.json();}catch(_){data={};}
        if(!r.ok){
          var message=data.error||((r.status===404)?"API introuvable sur le serveur NOVA (404).":("Erreur API HTTP "+r.status+"."));
          if(data.detail)message += " — "+data.detail;
          if(data.provider_code)message += " (code PayDunya: "+data.provider_code+")";
          throw new Error(message);
        }
        return data;
      }catch(err){
        lastError=err;
        if(i<bases.length-1)continue;
        throw err;
      }
    }
    throw lastError||new Error("API NOVA indisponible.");
  }
  window.NovaApi={request:api,base:(C.apiBase||location.origin)};
  // Compatibilité avec les anciens handlers qui peuvent encore appeler la fonction API globalement.
  window.api=api;
  async function reconcileInvestmentIncome(){
    try{
      var result=await api("/api/investments/reconcile",{method:"POST",body:JSON.stringify({})});
      if(result && result.status==="credited"){
        await loadAll();
        render(location.hash.replace(/^#\\//,"")||"home");
        S.toast("Gains quotidiens de l’investissement vérifiés et crédités.");
      }
      return result;
    }catch(err){
      console.warn("Investment income reconciliation:",err.message);
      return null;
    }
  }
  async function reconcileReferralBonus(){
    try{
      var result=await api("/api/referrals/reconcile",{method:"POST",body:JSON.stringify({})});
      if(result && result.status==="credited"){
        await loadAll();
        S.toast("Bonus de parrainage vérifié et crédité automatiquement.");
      }
      return result;
    }catch(err){
      console.warn("Referral bonus reconciliation:",err.message);
      return null;
    }
  }
  async function syncPendingPayment(reference) {
    try {
      var body = reference ? { reference: reference } : {};
      return await api("/api/payments/paydunya/sync", {
        method: "POST",
        body: JSON.stringify(body)
      });
    } catch (err) {
      console.warn("PayDunya sync:", err.message);
      return null;
    }
  }
  async function confirmPaymentReturn(){
    var params=new URLSearchParams(location.search);var token=params.get("token")||params.get("invoice_token");
    if(!token){
      var pendingReference=localStorage.getItem("nova:lastPendingPaymentReference");
      if(pendingReference) await syncPendingPayment(pendingReference);
      return;
    }
    try{
      var result=await api("/api/payments/paydunya/confirm-return",{method:"POST",body:JSON.stringify({token:token})});
      if(result.status==="completed"){
        localStorage.removeItem("nova:lastPendingPaymentReference");
        await loadAll();
        S.toast("Paiement confirmé : votre portefeuille a été crédité.");
      } else {
        await syncPendingPayment(localStorage.getItem("nova:lastPendingPaymentReference")||"");
        await loadAll();
        S.toast("Paiement en cours de confirmation. Actualisez votre portefeuille dans quelques instants.");
      }
    }catch(err){console.warn("PayDunya return confirmation:",err.message);S.toast(err.message||"La confirmation du paiement est encore en cours.");}
    params.delete("token");params.delete("invoice_token");var clean=location.pathname+(params.toString()?"?"+params.toString():"")+location.hash;history.replaceState(null,"",clean);
  }
  async function loadAll(){
    // Browser Supabase is the source of truth for member identity/wallet because RLS
    // explicitly permits each authenticated user to read their own rows.
    // The Render snapshot remains a fallback for deployments where a browser query fails.
    var tasks=[
      auth.from('profiles').select('id,member_code,display_name,phone,country_code,role').eq('id',user.id).maybeSingle(),
      auth.from('wallet_balances').select('balance,bonus_balance,bonus_locked,updated_at').eq('user_id',user.id).maybeSingle(),
      auth.from('projects').select('id,slug,title,badge,description,category,image_url,minimum_amount,duration_days,daily_return_amount,return_terms,status').eq('status','published').order('minimum_amount'),
      auth.from('investments').select('id,project_id,principal_amount,status,started_at,ends_at,created_at,projects(title,daily_return_amount,duration_days)').eq('user_id',user.id).order('created_at',{ascending:false}),
      auth.from('wallet_ledger').select('id,entry_type,amount,status,reference,description,created_at,posted_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100)
    ];
    var results=await Promise.allSettled(tasks);
    var labels=['profiles','wallet','projects','investments','ledger'];
    var health={profile:false,wallet:false,projects:false,investments:false,ledger:false};

    results.forEach(function(result,i){
      if(result.status==='fulfilled' && result.value && !result.value.error){
        health[labels[i]]=true;
      }else{
        var detail=result.status==='rejected'?result.reason:result.value&&result.value.error;
        console.warn('NOVA browser load '+labels[i]+':',detail&&detail.message||detail||'unknown error');
      }
    });

    if(health.profile)profile=results[0].value.data||profile||{};
    if(health.wallet){
      var walletRow=results[1].value.data;
      if(walletRow)wallet=walletRow;
    }
    if(health.projects){
      var rows=results[2].value.data||[];
      projects=rows.length?rows:(Array.isArray(C.publishedProjectsFallback)?C.publishedProjectsFallback.slice():[]);
    }else{
      projects=Array.isArray(C.publishedProjectsFallback)?C.publishedProjectsFallback.slice():projects;
    }
    if(health.investments)investments=results[3].value.data||[];
    if(health.ledger)ledger=results[4].value.data||[];

    // Only ask the Render snapshot for missing pieces. Never replace a successful
    // browser wallet/profile value with a zero/default response.
    if(!health.profile||!health.wallet||!health.investments||!health.ledger||!health.projects){
      try{
        var snapshot=await api('/api/member/dashboard',{method:'GET'});
        if(!health.profile && snapshot.profile)profile=snapshot.profile;
        if(!health.wallet && snapshot.wallet)wallet=snapshot.wallet;
        if(!health.projects && Array.isArray(snapshot.projects)&&snapshot.projects.length)projects=snapshot.projects;
        if(!health.investments && Array.isArray(snapshot.investments))investments=snapshot.investments;
        if(!health.ledger && Array.isArray(snapshot.ledger))ledger=snapshot.ledger;
      }catch(serverError){
        console.warn('NOVA dashboard server snapshot unavailable:',serverError.message);
      }
    }

    return {
      profileOk:!!profile.id,
      walletOk:!!wallet,
      projectsOk:Array.isArray(projects)&&projects.length>0,
      investmentsOk:true,
      ledgerOk:true,
      source:'browser-first'
    };
  }
  function referralLink(){
    var code=String(profile.member_code||"").trim();
    if(!code)return "";
    return new URL("register.html?ref="+encodeURIComponent(code),location.href).href;
  }
  function renderHeader(){
    var name=profile.display_name||(user.user_metadata&&user.user_metadata.full_name)||"Membre NOVA";
    var code=String(profile.member_code||"").trim();
    var link=referralLink();
    setText("greetName","Bonjour, "+name.split(/\s+/)[0]);
    setText("greetId","ID : "+(code||"—"));
    setText("headerAvatar",S.initials(name));
    setText("homeMemberId",code||"—");
    setText("homeReferralLink",link||"Lien indisponible");
  }
  function planCard(p){
    var daily=Number(p.daily_return_amount)||0,days=Number(p.duration_days)||0,amount=Number(p.minimum_amount)||0;
    return '<article class="plan"><div class="ph"><img src="'+esc(imagePath(p.image_url))+'" alt="'+esc(p.title)+'" loading="lazy"><span class="badge">'+esc(p.badge||p.category||"Projet")+'</span></div><div class="pb"><h3>'+esc(p.title)+'</h3><p class="muted">'+esc(p.description||"")+'</p><div class="stats"><div><span>Prix</span><b>'+money(amount)+'</b></div><div><span>Gain/jour estimé</span><b class="est">'+money(daily)+'</b></div><div><span>Durée</span><b>'+days+' jours</b></div><div><span>Gain total estimé</span><b class="est">'+money(daily*days)+'</b></div></div><button class="btn btn-primary btn-block" data-invest="'+esc(p.id)+'">Investir maintenant</button></div></article>';
  }
  function renderPlans(tab){
    currentTab=tab||"plans";
    var source=projects.length?projects:(Array.isArray(C.publishedProjectsFallback)?C.publishedProjectsFallback:[]);
    var list=source.filter(function(p){var special=String(p.return_terms||"").startsWith("SPECIAL:");return currentTab==="speciaux" ? special : !special;});
    var n=el("planListHome");
    if(n)n.innerHTML=list.length?list.map(planCard).join(""):'<div class="empty"><strong>Aucun projet publié pour le moment.</strong><br>Les projets apparaîtront ici après leur publication par NOVA.</div>';
  }
  function renderHome(){
    renderHeader();var bal=Number(wallet.balance)||0;
    setText("balSolde",money(bal));
    setText("balRevenus",money(ledger.filter(x=>x.entry_type==="investment_income"&&x.status==="posted").reduce((s,x)=>s+Number(x.amount),0)));
    setText("balRecharge",money(ledger.filter(x=>x.entry_type==="deposit"&&x.status==="posted").reduce((s,x)=>s+Number(x.amount),0)));
    setText("balBonus",money(Number(wallet.bonus_balance)||0));
    renderPlans(currentTab);fillWalletForm("rc");
  }
  function fillWalletForm(prefix){
    var c=el(prefix+"Country"),o=el(prefix+"Operator"),d=el(prefix+"Dial");if(!c||!o||!d)return;
    if(!c.options.length){c.innerHTML=C.countries.map(x=>'<option value="'+esc(x.code)+'">'+esc(x.label)+' ('+esc(x.code)+')</option>').join("");d.innerHTML=C.countries.map(x=>'<option value="'+esc(x.code)+'">'+esc(x.code)+'</option>').join("");c.value="+228";c.addEventListener("change",function(){d.value=c.value;fillOperators(prefix);});}
    fillOperators(prefix);
  }
  function fillOperators(prefix){
    var c=el(prefix+"Country"),o=el(prefix+"Operator");if(!c||!o)return;
    var country=C.countries.find(x=>x.code===c.value);o.innerHTML=(country?country.ops:[]).map(x=>'<option>'+esc(x)+'</option>').join("");
  }
  function renderPresence(){
    setText("presenceDate",new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}));
    var claims=ledger.filter(x=>x.entry_type==="daily_bonus"&&x.status==="posted");
    setText("streakCount",String(claims.length));setText("presenceLast",claims.length?S.dateFr(claims[0].created_at):"—");
    var b=el("btnPresence");
    if(b){
      var last=claims.length?new Date(claims[0].created_at).getTime():0;
      var remain=Math.max(0,86400000-(Date.now()-last));
      b.disabled=!!last&&remain>0;
      b.textContent=b.disabled?"Bonus déjà réclamé — revenez après 24 h":"Réclamer mon bonus de 50 FCFA";
    }
  }
  function renderInvestments(){
    var total=0,active=0,earned=0;
    investments.forEach(function(i){total+=Number(i.principal_amount)||0;if(i.status==="active")active++;});
    ledger.filter(x=>x.entry_type==="investment_income"&&x.status==="posted").forEach(x=>earned+=Number(x.amount)||0);
    setText("invTotal",money(total));setText("invActive",String(active));setText("invEarned",money(earned));
    var n=el("invList");if(!n)return;
    n.innerHTML=investments.length?investments.map(function(i){
      var p=i.projects||{},start=i.started_at?S.dateFr(i.started_at):S.dateFr(i.created_at);
      return '<div class="hist-item"><span class="h-ic h-in">↗</span><div class="h-info"><b>'+esc(p.title||"Investissement")+'</b><span>'+esc(start)+' · '+esc(i.status)+'</span></div><span class="h-amt">'+money(i.principal_amount)+'</span></div>';
    }).join(""):'<p class="empty">Aucun investissement pour le moment.<br><a href="#/home">Voir les projets →</a></p>';
  }
  function renderHistory(){
    var n=el("histList");if(!n)return;
    n.innerHTML=ledger.length?ledger.map(function(x){
      var a=Number(x.amount)||0, cls=a>=0?"plus":"minus",sign=a>0?"+":"";
      return '<div class="hist-item"><span class="h-ic '+(a>=0?"h-in":"h-out")+'">↔</span><div class="h-info"><b>'+esc(x.description||x.entry_type)+'</b><span>'+esc(S.dateFr(x.created_at))+' · '+esc(x.status)+'</span></div><span class="h-amt '+cls+'">'+sign+money(a)+'</span></div>';
    }).join(""):'<p class="empty">Aucune transaction pour le moment.</p>';
  }
  async function renderTeam(){
    var code=String(profile.member_code||"").trim();
    var link=referralLink();
    setText("teamRefCode",code||"—");
    setText("teamRefLink",link||"Lien indisponible");
    setText("teamSize","…");setText("teamL1","…");setText("teamInvest","…");setText("teamComm","…");
    try{
      var team=await api("/api/referrals/me");
      setText("teamSize",String(team.team_size||0));setText("teamL1",String(team.team_size||0));
      setText("teamInvest",money(team.investment_total||0));setText("teamComm",money(team.commission_total||0));
      var n=el("teamList");if(n)n.innerHTML=(team.referrals||[]).length?team.referrals.map(function(r){return '<div class="hist-item"><span class="h-ic h-in">↗</span><div class="h-info"><b>'+esc(r.display_name||"Membre NOVA")+'</b><span>'+esc(S.dateFr(r.created_at))+' · '+esc(r.status||"inscrit")+'</span></div><span class="h-amt">'+money(r.bonus_amount||0)+'</span></div>';}).join(""):'<p class="empty">Aucun filleul pour le moment.</p>';
    }catch(err){console.warn("Referral dashboard:",err.message);setText("teamSize","0");setText("teamL1","0");setText("teamInvest",money(0));setText("teamComm",money(0));}
  }
  function renderAccount(){
    var name=profile.display_name||(user.user_metadata&&user.user_metadata.full_name)||"Membre NOVA";
    var code=String(profile.member_code||"").trim(), link=referralLink();
    setText("profileName",name);setText("profileId","ID : "+(code||"—"));setText("profileAvatar",S.initials(name));
    setText("accMemberId",code||"—");
    setText("accReferralLink",link||"Lien indisponible");
    setText("accSolde",money(wallet.balance));
    setText("accRecharge",money(ledger.filter(x=>x.entry_type==="deposit"&&x.status==="posted").reduce((s,x)=>s+Number(x.amount),0)));
    setText("accRevenus",money(ledger.filter(x=>x.entry_type==="investment_income"&&x.status==="posted").reduce((s,x)=>s+Number(x.amount),0)));
    setText("accMemberId",String(profile.member_code||"—"));
    setText("accReferralLink",referralLink()||"Lien indisponible");
  }
  function renderNews(){
    var n=el("newsList");if(n)n.innerHTML=(C.news||[]).map(x=>'<article class="news-card"><img src="'+esc(x.img)+'" alt="" loading="lazy"><div class="news-body"><div class="meta"><span class="badge">'+esc(x.tag)+'</span><span>'+esc(x.date)+'</span></div><h3>'+esc(x.title)+'</h3><p>'+esc(x.text)+'</p></div></article>').join("");
  }
  function render(view){
    if(view==="home")renderHome();if(view==="presence")renderPresence();if(view==="investissements")renderInvestments();
    if(view==="historique")renderHistory();if(view==="compte")renderAccount();if(view==="equipe")renderTeam();if(view==="publications")renderNews();
    if(view==="retrait"){setText("wdAvail",money(wallet.balance));fillWalletForm("wd");}
  }
  var VIEWS=["home","recharger","retrait","presence","assistance","equipe","publications","investissements","historique","compte"];
  function route(){
    var v=(location.hash||"#/home").replace(/^#\//,"");if(!VIEWS.includes(v))v="home";
    document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+v));
    document.querySelectorAll(".bn-item").forEach(x=>x.classList.toggle("active",x.dataset.nav===v));
    var hero=el("appHero");if(hero)hero.style.display=v==="home"?"block":"none";render(v);
  }
  try { route(); } catch(err) { console.error("NOVA initial route:",err); }
  window.addEventListener("hashchange",function(){ try { route(); } catch(err) { console.error("NOVA route:",err); } });

  try {
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
  listen("softpayRetry","click",function(){closeSoftPayModal();el("btnRecharge").click();});
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
      if(result.fallback && result.checkout_url){
        S.toast("SoftPay PayDunya a été refusé pour cette demande. Ouverture du paiement PayDunya classique…");
        location.assign(result.checkout_url);
        return;
      }
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
    var amount=Number(el("wdAmount").value),country=el("wdCountry").value,operator=el("wdOperator").value;
    var phone=(el("wdDial").value||"")+(el("wdPhone").value||"").replace(/\D/g,"").replace(/^0+/,"");
    var name=el("wdName").value.trim();
    var statusNode=el("withdrawStatus");
    var payload={amount:amount,country_code:country,operator:operator,phone:phone,account_name:name};
    if(!Number.isSafeInteger(amount)||amount<1500){S.toast("Montant minimum de retrait : 1 500 FCFA");if(statusNode)statusNode.textContent="Montant minimum : 1 500 FCFA.";return;}
    if(!operator){S.toast("Choisissez un opérateur.");if(statusNode)statusNode.textContent="Choisissez un opérateur avant de confirmer.";return;}
    if(!/^\\+228\\d{8}$/.test(phone)){S.toast("Entrez un numéro Togo valide à 8 chiffres.");if(statusNode)statusNode.textContent="Numéro de retrait invalide.";return;}
    if(name.length<3){S.toast("Saisissez le nom complet du titulaire.");if(statusNode)statusNode.textContent="Nom du titulaire requis.";return;}
    var b=el("btnWithdraw");b.disabled=true;
    if(statusNode)statusNode.textContent="Enregistrement de la demande…";
    try{
      var result=await api("/api/withdrawals",{method:"POST",body:JSON.stringify(payload)});
      S.toast(result.message||"Demande de retrait enregistrée.");
      if(statusNode)statusNode.textContent="Demande enregistrée. Statut : en attente de validation.";
      el("wdAmount").value="";
      try{await loadAll();}catch(loadError){console.warn("Withdrawal wallet refresh:",loadError.message);}
      setText("wdAvail",money(wallet.balance));
    }catch(e){
      S.toast(e.message||"Retrait impossible.");
      if(statusNode)statusNode.textContent=e.message||"Retrait impossible.";
    }finally{b.disabled=false;}
  });
  listen("btnPresence","click",async function(){
    var b=el("btnPresence");b.disabled=true;
    try{await api("/api/bonus/claim",{method:"POST",body:JSON.stringify({})});await loadAll();renderPresence();renderHome();S.toast("Bonus de 50 FCFA crédité.");}
    catch(e){S.toast(e.message||"Bonus indisponible.");}finally{b.disabled=false;}
  });
  function copyReferralLink(id){
    var n=el(id),value=n&&n.textContent?String(n.textContent).trim():referralLink();
    if(!value||value==="Lien indisponible"){S.toast("Lien de parrainage indisponible.");return;}
    if(navigator.clipboard)navigator.clipboard.writeText(value).then(()=>S.toast("Lien copié"),()=>S.toast("Copiez le lien manuellement"));
  }
  listen("copyTeamLink","click",function(){copyReferralLink("teamRefLink");});
  listen("copyAccountReferral","click",function(){copyReferralLink("accReferralLink");});
  listen("copyHomeReferral","click",function(){copyReferralLink("homeReferralLink");});
  listen("btnLogout","click",async function(){await auth.auth.signOut();location.href="login.html";});
  listen("btnPassword","click",()=>{var m=el("passModal");if(m)m.classList.add("open");});
  listen("npCancel","click",()=>closeModal("passModal"));
  listen("npSave","click",async function(){var p=el("npNew").value;if(!p||p.length<8){S.toast("Le mot de passe doit contenir au moins 8 caractères.");return;}var r=await auth.auth.updateUser({password:p});if(r.error)S.toast(r.error.message);else{S.toast("Mot de passe modifié.");closeModal("passModal");}});
  document.querySelectorAll(".modal-overlay").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.remove("open");}));
    handlersReady=true;
  } catch (handlerErr) { console.error("NOVA handler setup:", handlerErr); }
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
  // Afficher immédiatement la vue demandée. Le chargement Supabase est asynchrone et ne doit jamais laisser l'interface vide.
  route();
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
  window.NovaDashboardReady=handlersReady;
})();