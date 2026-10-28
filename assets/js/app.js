/* TTE Energy — espace membre relié à Supabase et aux opérations sécurisées du serveur. */
(async function () {
  "use strict";
  var C=window.NOVA, S=window.NovaStore, auth=window.NovaAuth;
  if(!auth){location.replace("login.html");return;}
  var sr=await auth.auth.getSession(), session=sr.data&&sr.data.session;
  if(sr.error||!session){location.replace("login.html");return;}
  // Validate the session against the server before rendering private profile or wallet data.
  // Supabase may retain an old JWT after suspension, so a stored session alone is not enough.
  var accessCheck=null;
  try {
    var checkBase=String(C.apiBase||"").trim().replace(/\/+$/,"");
    accessCheck=await fetch(checkBase+"/api/member/dashboard",{method:"GET",headers:{"Accept":"application/json","Authorization":"Bearer "+session.access_token},cache:"no-store"});
  } catch (_) {}
  if(!accessCheck||!accessCheck.ok){
    await auth.auth.signOut();
    location.replace("login.html?blocked=1");
    return;
  }
  var user=session.user, profile={}, wallet={balance:0}, projects=[], investments=[], ledger=[], withdrawals=[];
  var withdrawalAccount=null, withdrawalAccountLoaded=false, withdrawalAccountLoading=null;
  var currentTab="plans", selectedProject=null, handlersReady=false;

  // Public activity feed, independent of member authentication and visible throughout the member shell.
  (function initMemberWithdrawalActivity(){
    var card=document.getElementById("memberWithdrawalActivity");
    var message=document.getElementById("memberWithdrawalActivityMessage");
    var meta=document.getElementById("memberWithdrawalActivityMeta");
    if(!card||!message||!meta)return;
    var entries=[],index=0,timer=null;
    var countryInfo={
      "+228":{flag:"🇹🇬",country:"Togo"},
      "+226":{flag:"🇧🇫",country:"Burkina Faso"},
      "+229":{flag:"🇧🇯",country:"Bénin"},
      "+225":{flag:"🇨🇮",country:"Côte d’Ivoire"},
      "+221":{flag:"🇸🇳",country:"Sénégal"},
      "+237":{flag:"🇨🇲",country:"Cameroun"},
      "+223":{flag:"🇲🇱",country:"Mali"}
    };
    function paint(){
      if(!entries.length){
        message.textContent="Les retraits confirmés apparaîtront ici.";
        meta.textContent="TTE Energy · activité vérifiée";
        return;
      }
      var item=entries[index%entries.length],info=countryInfo[item.country_code]||{flag:"🌍",country:""};
      card.classList.add("is-changing");
      window.setTimeout(function(){
        message.textContent=item.first_name+" vient d’effectuer un retrait.";
        meta.textContent=info.flag+" "+(info.country?info.country+" · ":"")+(item.country_code||"")+"  •••• ••••";
        card.classList.remove("is-changing");
      },220);
      index=(index+1)%entries.length;
    }
    async function load(){
      try{
        var bases=[];
        [location.origin,C.apiBase].forEach(function(base){
          base=String(base||"").trim().replace(/\/$/,"");
          if(base&&!bases.includes(base))bases.push(base);
        });
        var data=null;
        for(var i=0;i<bases.length&&!data;i++){
          try{
            var response=await fetch(bases[i]+"/api/public/withdrawal-activity",{headers:{"Accept":"application/json"},cache:"no-store"});
            if(response.ok){
              var parsed=await response.json();
              if(Array.isArray(parsed.withdrawals))data=parsed.withdrawals;
            }
          }catch(_){}
        }
        entries=(data||[]).filter(function(x){return x&&typeof x.first_name==="string"&&typeof x.country_code==="string";});
        index=0;
        paint();
        if(timer)window.clearInterval(timer);
        if(entries.length>1)timer=window.setInterval(paint,4000);
      }catch(err){console.warn("TTE Energy member withdrawal activity:",err.message);}
    }
    load();
    window.setInterval(load,60000);
  })();
  function el(id){return document.getElementById(id);}
  function setText(id,v){var n=el(id);if(n)n.textContent=v==null?"":String(v);}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function money(v){return S.fcn(Number(v)||0);}
  function imagePath(v){return v||"assets/img/projet-solaire.jpg";}
  // Normalize the selected country prefix without stripping significant local zeroes.
  function normalizeWalletPhone(countryCode, raw){
    var cc=String(countryCode||"").replace(/\D/g,"");
    var input=String(raw||"").trim();
    var hasInternationalPrefix=/^(?:\+|00)/.test(input);
    var digits=input.replace(/\D/g,"");
    if(hasInternationalPrefix && digits.indexOf("00")===0)digits=digits.slice(2);
    if(hasInternationalPrefix && cc && digits.indexOf(cc)===0)digits=digits.slice(cc.length);
    return cc?("+"+cc+digits):digits;
  }
  var WALLET_PHONE_RULES={
    "+228":{default:8},
    "+226":{default:8},
    "+229":{"MTN Bénin":8,"MOOV Bénin":10,"Celtiis Cash":10},
    "+225":{default:10},
    "+221":{default:9},
    "+237":{default:9},
    "+223":{default:8}
  };
  function validWalletPhone(countryCode,operator,phone){
    var rules=WALLET_PHONE_RULES[String(countryCode||"")];
    if(!rules)return false;
    var cc=String(countryCode||"").replace(/\D/g,"");
    var value=String(phone||"").trim();
    var digits=value.replace(/\D/g,"");
    // normalizeWalletPhone returns +<country code><local number>; validate only the local part.
    if(value.charAt(0)==="+" && cc && digits.indexOf(cc)===0)digits=digits.slice(cc.length);
    var expected=rules[operator]||rules.default;
    return !!expected && /^\d+$/.test(digits) && digits.length===expected;
  }
  function walletPhoneError(countryCode,operator){
    var rules=WALLET_PHONE_RULES[String(countryCode||"")];
    var expected=rules&&(rules[operator]||rules.default);
    return expected ? "Entrez un numéro valide à "+expected+" chiffres pour "+operator+"." : "Numéro invalide pour le pays/opérateur sélectionné.";
  }
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
        render(location.hash.replace(/^#\//,"")||"home");
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
      auth.from('wallet_balances').select('balance,updated_at').eq('user_id',user.id).maybeSingle(),
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
    setText("headerAvatar",S.initials(name));
    setText("homeReferralLink",link||"Lien indisponible");
  }
  function planCard(p){
    var daily=Number(p.daily_return_amount)||0,days=Number(p.duration_days)||0,amount=Number(p.minimum_amount)||0;
    return '<article class="plan product-tile"><h3 class="product-tile-title">'+esc(p.badge||p.category||p.title||"Projet")+'</h3><div class="ph"><img src="'+esc(imagePath(p.image_url))+'" alt="'+esc(p.title)+'" loading="lazy"></div><div class="pb"><h3 class="product-name">'+esc(p.title)+'</h3><p class="muted product-description">'+esc(p.description||"")+'</p><div class="product-metrics"><p>Revenu quotidien: <strong>'+money(daily)+'</strong></p><p>Revenu total: <strong>'+money(daily*days)+'</strong></p><p>Période de validité: <strong>'+days+' jours</strong></p></div><div class="product-buy-row"><b class="product-price">'+money(amount)+'</b><button class="btn btn-primary product-buy" data-invest="'+esc(p.id)+'">Acheter</button></div></div></article>';
  }
  function renderPlans(tab){
    currentTab=tab||"plans";
    var source=projects.length?projects:(Array.isArray(C.publishedProjectsFallback)?C.publishedProjectsFallback:[]);
    var list=source.filter(function(p){var special=String(p.return_terms||"").startsWith("SPECIAL:");return currentTab==="speciaux" ? special : true;});
    var n=el("planListHome");
    if(n)n.innerHTML=list.length?list.map(planCard).join(""):'<div class="empty"><strong>Aucun projet publié pour le moment.</strong><br>Les projets apparaîtront ici après leur publication par NOVA.</div>';
  }
  function renderHome(){
    renderHeader();var bal=Number(wallet.balance)||0;
    setText("balSolde",money(bal));
    setText("balRevenus",money(ledger.filter(x=>x.entry_type==="investment_income"&&x.status==="posted").reduce((s,x)=>s+Number(x.amount),0)));
    setText("balRecharge",money(ledger.filter(x=>x.entry_type==="deposit"&&x.status==="posted").reduce((s,x)=>s+Number(x.amount),0)));
    if(!projects.length && Array.isArray(C.publishedProjectsFallback) && C.publishedProjectsFallback.length){
      projects=C.publishedProjectsFallback.slice();
    }
    renderPlans(currentTab);fillWalletForm("rc");
  }
  function renderVIP(){
    var source=projects.length?projects:(Array.isArray(C.publishedProjectsFallback)?C.publishedProjectsFallback:[]);
    var n=el("planListVIP");
    setText("vipProjectCount",source.length+" projet"+(source.length>1?"s":"")+" publié"+(source.length>1?"s":""));
    if(n)n.innerHTML=source.length?source.map(planCard).join(""):'<div class="empty"><strong>Aucun projet publié pour le moment.</strong><br>Les projets apparaîtront ici après leur publication par TTE Energy.</div>';
  }
  function fillWalletForm(prefix){
    var c=el(prefix+"Country"),o=el(prefix+"Operator"),d=el(prefix+"Dial");
    if(!c||!o||!d||!Array.isArray(C.countries))return;
    if(!c.options.length){
      c.innerHTML=C.countries.map(function(x){return '<option value="'+esc(x.code)+'">'+esc(x.label)+' ('+esc(x.code)+')</option>';}).join("");
    }
    if(!d.options.length){
      d.innerHTML=C.countries.map(function(x){return '<option value="'+esc(x.code)+'">'+esc(x.code)+'</option>';}).join("");
    }
    if(!C.countries.some(function(x){return x.code===c.value;}))c.value="+228";
    d.value=c.value;
    c.onchange=function(){d.value=c.value;fillOperators(prefix);};
    fillOperators(prefix);
  }
  function fillOperators(prefix){
    var c=el(prefix+"Country"),o=el(prefix+"Operator");if(!c||!o||!Array.isArray(C.countries))return;
    var previous=String(o.value||"");
    var country=C.countries.find(function(x){return x.code===c.value;});
    var ops=country&&Array.isArray(country.ops)?country.ops:[];
    o.innerHTML=ops.map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>';}).join("");
    if(ops.indexOf(previous)!==-1)o.value=previous;
    else if(ops.length)o.value=ops[0];
  }
  async function getWithdrawalAccount(force){
    if(withdrawalAccountLoaded&&!force)return withdrawalAccount||{};
    if(withdrawalAccountLoading)return withdrawalAccountLoading;
    withdrawalAccountLoading=api("/api/member/withdrawal-account").then(function(result){
      withdrawalAccount=result&&result.account?result.account:null;
      withdrawalAccountLoaded=true;
      return withdrawalAccount||{};
    }).catch(function(err){
      console.warn("Withdrawal account load:",err.message);
      throw err;
    }).finally(function(){withdrawalAccountLoading=null;});
    return withdrawalAccountLoading;
  }
  function applyWithdrawalAccount(prefix,account){
    if(!account)return;
    var c=el(prefix+"Country"),o=el(prefix+"Operator"),d=el(prefix+"Dial");
    if(c&&account.country_code){c.value=account.country_code;fillOperators(prefix);}
    if(o&&account.operator)o.value=account.operator;
    if(d&&c)d.value=c.value;
    var phone=String(account.phone||"").replace(/\D/g,"");
    var cc=String((c&&c.value)||account.country_code||"").replace(/\D/g,"");
    if(cc&&phone.indexOf(cc)===0)phone=phone.slice(cc.length);
    var p=el(prefix+"Phone");if(p)p.value=phone;
    var n=el(prefix+"Name");if(n)n.value=account.account_name||"";
  }
  async function prepareWithdrawalAccountForm(prefix){
    fillWalletForm(prefix);
    try{var account=await getWithdrawalAccount();if(account&&account.phone)applyWithdrawalAccount(prefix,account);}
    catch(err){
      var status=el("withdrawalAccountStatus");
      if(status&&prefix==="wa")status.textContent="Impossible de charger le compte enregistré. Vérifiez votre connexion puis réessayez.";
    }
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
  async function renderWithdrawalDetails(){
    var container=el("withdrawalTrackingList");if(!container)return;
    container.innerHTML='<p class="empty">Chargement de vos retraits…</p>';
    try{
      var result=await api("/api/member/withdrawals",{method:"GET"});
      withdrawals=Array.isArray(result.withdrawals)?result.withdrawals:[];
      if(!withdrawals.length){container.innerHTML='<div class="card-flat"><p class="empty">Vous n’avez pas encore effectué de demande de retrait.</p><a class="btn btn-primary btn-block mt-2" href="#/retrait">Demander un retrait</a></div>';return;}
      function step(title,description,state){
        var icon=state==="done"?"✓":state==="current"?"•":state==="failed"?"!":"○";
        var color=state==="done"?"#16845b":state==="current"?"#b7791f":state==="failed"?"#c53030":"#9ca3af";
        return '<div class="withdrawal-step withdrawal-step--'+state+'"><span class="withdrawal-step__icon" style="border-color:'+color+';color:'+color+'">'+icon+'</span><div class="withdrawal-step__body"><strong>'+esc(title)+'</strong><span>'+esc(description)+'</span></div></div>';
      }
      container.innerHTML=withdrawals.map(function(w){
        var status=String(w.status||"pending").toLowerCase();
        var submitted=!["cancelled","canceled"].includes(status);
        var processing=["processing","paid"].includes(status);
        var paid=status==="paid";
        var failed=["rejected","cancelled","canceled","failed"].includes(status);
        var date=w.created_at?S.dateFr(w.created_at):"Date indisponible";
        var statusLabel=paid?"Retrait réussi":failed?(status==="cancelled"||status==="canceled"?"Demande annulée":"Retrait refusé ou échoué"):processing?"Paiement en cours":"En attente d’examen";
        var statusColor=paid?"#16845b":failed?"#c53030":"#b7791f";
        var info=failed?(w.failure_reason||"Cette demande n’a pas abouti. Contactez l’assistance si vous avez besoin d’aide."):
          paid?"Le paiement est confirmé par le système.":processing?"La demande a été validée et transmise pour paiement.":"Votre demande a été reçue et attend son traitement par l’administration.";
        var timeline=step("Demande de retrait soumise",date,submitted?"done":"failed")+
          step("En cours d’examen","Statut : "+(processing?"validée et transmise":failed?"interrompue":"en attente"),failed?"failed":processing?"done":"current")+
          step("Retrait réussi",paid?"Paiement confirmé":failed?"Non effectué":"En attente de confirmation du paiement",paid?"done":failed?"failed":"pending");
        var net=w.payout_amount!=null?Number(w.payout_amount):Math.max(0,Number(w.amount||0)-Number(w.fee_amount||0));
        return '<article class="withdrawal-tracking-card"><div class="withdrawal-tracking-card__head"><div><span class="muted" style="font-size:12px">DEMANDE DU '+esc(date)+'</span><h3 style="margin-top:4px">'+money(w.amount||0)+'</h3></div><span class="withdrawal-status" style="color:'+statusColor+';border-color:'+statusColor+'">'+esc(statusLabel)+'</span></div><div class="withdrawal-tracking-card__meta"><span>Montant net estimé : <strong>'+money(net)+'</strong></span><span>Référence : <strong>'+esc(String(w.id||"").slice(0,8).toUpperCase()||"—")+'</strong></span></div><div class="withdrawal-timeline">'+timeline+'</div><p class="withdrawal-tracking-note">'+esc(info)+'</p></article>';
      }).join("");
    }catch(err){
      console.warn("Withdrawal tracking load:",err.message);
      container.innerHTML='<div class="card-flat"><p class="muted">Impossible de charger les détails de vos retraits pour le moment.</p><button class="btn btn-outline btn-block mt-2" id="retryWithdrawalTracking" type="button">Réessayer</button></div>';
      var retry=el("retryWithdrawalTracking");if(retry)retry.addEventListener("click",renderWithdrawalDetails);
    }
  }
  function renderAccount(){
    var name=profile.display_name||(user.user_metadata&&user.user_metadata.full_name)||"Membre TTE Energy";
    var code=String(profile.member_code||"").trim(), link=referralLink();
    setText("profileName",name);setText("profileId","ID : "+(code||"—"));setText("profileAvatar",S.initials(name));
    setText("profilePhone",profile.phone||user.phone||"Téléphone non renseigné");
    setText("accMemberId",code||"—");
    setText("accReferralLink",link||"Lien indisponible");
    setText("accSolde",money(wallet.balance));
    setText("accRecharge",money(ledger.filter(x=>x.entry_type==="deposit"&&x.status==="posted").reduce((s,x)=>s+Number(x.amount),0)));
    setText("accRevenus",money(ledger.filter(x=>x.entry_type==="investment_income"&&x.status==="posted").reduce((s,x)=>s+Number(x.amount),0)));
    setText("accMemberId",String(profile.member_code||"—"));
    setText("accReferralLink",referralLink()||"Lien indisponible");
  }
  async function renderWithdrawalDetails(){
    var n=el("withdrawalTrackingList");if(!n)return;
    n.innerHTML='<p class="empty">Chargement de vos retraits…</p>';
    try{
      // RLS limits this query to the authenticated member's own withdrawal requests.
      var result=await auth.from("withdrawal_requests")
        .select("id,amount,status,created_at,processed_at,admin_approved_at,admin_rejected_at,fee_amount,payout_amount,operator,country_code,admin_note,failure_reason")
        .eq("user_id",user.id).order("created_at",{ascending:false});
      if(result.error)throw result.error;
      var rows=result.data||[];
      if(!rows.length){n.innerHTML='<p class="empty">Vous n’avez pas encore effectué de demande de retrait.</p>';return;}
      function dateLabel(value){return value?S.dateFr(value):"En attente";}
      n.innerHTML=rows.map(function(w){
        var status=String(w.status||"pending").toLowerCase();
        var paid=status==="paid",rejected=["rejected","cancelled","failed"].includes(status);
        var processing=["processing","approved","approved_pending"].includes(status);
        var stage2=paid||processing;
        var statusLabel=paid?"Retrait réussi":rejected?(status==="cancelled"?"Demande annulée":"Retrait refusé / échoué"):(processing?"Paiement en cours":"En attente d’examen");
        var statusClass=paid?"is-success":rejected?"is-error":"is-pending";
        var amount=Number(w.amount)||0,fee=Number(w.fee_amount)||0,net=Number(w.payout_amount);
        if(!Number.isFinite(net))net=amount-fee;
        var reference=String(w.id||"").slice(0,8).toUpperCase(),note=w.admin_note||w.failure_reason||"";
        return '<article class="withdrawal-track-card">'+
          '<div class="withdrawal-track-head"><div><span class="withdrawal-track-eyebrow">DEMANDE DU '+esc(dateLabel(w.created_at))+'</span><h3>'+money(amount)+'</h3><span class="muted">Montant demandé · Réf. '+esc(reference)+'</span></div><span class="withdrawal-track-status '+statusClass+'">'+esc(statusLabel)+'</span></div>'+
          '<div class="withdrawal-steps">'+
            '<div class="withdrawal-step '+(!rejected?'is-done':'')+'"><span class="withdrawal-step-marker">'+(!rejected?'✓':'1')+'</span><div><b>1. Demande de retrait soumise</b><small>'+esc(dateLabel(w.created_at))+'</small></div></div>'+
            '<div class="withdrawal-step '+(stage2?'is-done':(!paid&&!rejected?'is-current':''))+'"><span class="withdrawal-step-marker">'+(stage2?'✓':(!paid&&!rejected?'…':'2'))+'</span><div><b>2. En cours d’examen</b><small>'+esc(processing?"Paiement transmis au prestataire":(paid?"Demande traitée":(rejected?"Demande clôturée":"En attente de validation par l’administration")))+'</small></div></div>'+
            '<div class="withdrawal-step '+(paid?'is-done':(rejected?'is-error':''))+'"><span class="withdrawal-step-marker">'+(paid?'✓':(rejected?'!':'3'))+'</span><div><b>3. Retrait réussi</b><small>'+esc(paid?("Paiement confirmé"+(w.processed_at?" · "+dateLabel(w.processed_at):"")):(rejected?"Le paiement n’a pas abouti":"Sera confirmé après paiement effectif"))+'</small></div></div>'+
          '</div>'+
          '<div class="withdrawal-track-meta"><span>Frais : '+money(fee)+'</span><span>Net prévu : '+money(net)+'</span>'+(w.operator?'<span>'+esc(w.operator)+'</span>':'')+'</div>'+
          (note?'<p class="withdrawal-track-note">'+esc(note)+'</p>':'')+
        '</article>';
      }).join("");
    }catch(err){
      console.warn("Withdrawal status tracker:",err.message);
      n.innerHTML='<p class="empty">Impossible de charger vos détails de retrait pour le moment. Réessayez dans quelques instants.</p>';
    }
  }
  function renderNews(){
    var n=el("newsList");if(n)n.innerHTML=(C.news||[]).map(x=>'<article class="news-card"><img src="'+esc(x.img)+'" alt="" loading="lazy"><div class="news-body"><div class="meta"><span class="badge">'+esc(x.tag)+'</span><span>'+esc(x.date)+'</span></div><h3>'+esc(x.title)+'</h3><p>'+esc(x.text)+'</p></div></article>').join("");
  }
  function render(view){
    if(view==="home")renderHome();if(view==="vip")renderVIP();if(view==="presence")renderPresence();if(view==="investissements")renderInvestments();
    if(view==="historique")renderHistory();if(view==="compte")renderAccount();if(view==="details-retrait")renderWithdrawalDetails();if(view==="equipe")renderTeam();if(view==="publications")renderNews();
    if(view==="retrait"){setText("wdAvail",money(wallet.balance));prepareWithdrawalAccountForm("wd");}
    if(view==="compte-retrait"){prepareWithdrawalAccountForm("wa");}
    if(view==="details-retrait"){renderWithdrawalDetails();}
  }
  var VIEWS=["home","vip","recharger","retrait","compte-retrait","details-retrait","presence","assistance","regles","equipe","publications","investissements","historique","compte"];
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
    var a=e.target.closest('a[href^="#/"]');
    if(a){
      var v=a.dataset.nav||a.getAttribute("href").slice(2);
      if(VIEWS.includes(v)){e.preventDefault();location.hash="#/"+v;}
    }
    var btn=e.target.closest("[data-invest]");
    if(btn){
      var projectId=btn.dataset.invest;
      selectedProject=projects.find(function(p){return String(p.id)===String(projectId);});
      if(!selectedProject && Array.isArray(C.publishedProjectsFallback)){
        selectedProject=C.publishedProjectsFallback.find(function(p){return String(p.id)===String(projectId);});
      }
      if(!selectedProject){
        S.toast("Projet indisponible. Actualisez les projets puis réessayez.");
        return;
      }
      var modalText=el("investModalText");
      var modal=el("investModal");
      if(modalText)modalText.textContent="Projet "+selectedProject.title+" — "+money(selectedProject.minimum_amount)+" pour "+selectedProject.duration_days+" jours. Solde disponible : "+money(wallet.balance);
      if(modal)modal.classList.add("open");
    }
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
    setText("softpayOperator",data.operator||"");
    setText("softpayPhone",data.phone||"—");
    setText("softpayStatus",data.status==="completed"?"Confirmé":"En attente");
    setText("softpayMessage",data.message||"La demande a été envoyée. Suivez les instructions de votre opérateur pour finaliser le paiement.");
    var paymentLink=el("softpayPaymentLink");
    if(paymentLink)paymentLink.remove();
    if(data.payment_url){
      var messageNode=el("softpayMessage");
      if(messageNode&&messageNode.parentNode){
        paymentLink=document.createElement("a");
        paymentLink.id="softpayPaymentLink";
        paymentLink.href=data.payment_url;
        paymentLink.target="_blank";
        paymentLink.rel="noopener noreferrer";
        paymentLink.textContent="Continuer chez l'opérateur";
        paymentLink.className="btn btn-primary";
        messageNode.insertAdjacentElement("afterend",paymentLink);
      }
    }
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
     var phone=normalizeWalletPhone(country,el("rcPhone").value);
     if(!operator){S.toast("Choisissez un opérateur.");return;}
     if(!validWalletPhone(country,operator,phone)){S.toast(walletPhoneError(country,operator));return;}
     if(!validWalletPhone(country,operator,phone)){S.toast(walletPhoneError(country,operator));return;}
    var softpayOtp="";
    if((country==="+225" && operator==="Orange CI") || (country==="+226" && operator==="Orange Burkina")){
      softpayOtp=window.prompt("Saisissez le code de paiement/OTP fourni par "+operator+" avant de continuer :")||"";
      if(!softpayOtp.trim()){S.toast("Le code de validation est requis pour cet opérateur.");return;}
    }
    var b=el("btnRecharge");b.disabled=true;
    try{
      var result=await api("/api/payments/paydunya/softpay",{method:"POST",body:JSON.stringify({amount:amount,country_code:country,operator:operator,phone:phone,otp:softpayOtp})});
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
  listen("btnSaveWithdrawalAccount","click",async function(){
    var country=el("waCountry").value,operator=el("waOperator").value;
    var phone=normalizeWalletPhone(country,el("waPhone").value),name=el("waName").value.trim();
    var statusNode=el("withdrawalAccountStatus"),button=el("btnSaveWithdrawalAccount");
    if(!operator){S.toast("Choisissez un opérateur.");if(statusNode)statusNode.textContent="Choisissez un opérateur.";return;}
    if(!validWalletPhone(country,operator,phone)){S.toast(walletPhoneError(country,operator));if(statusNode)statusNode.textContent=walletPhoneError(country,operator);return;}
    if(name.length<3){S.toast("Saisissez le nom complet du titulaire.");if(statusNode)statusNode.textContent="Le nom complet du titulaire est requis.";return;}
    button.disabled=true;if(statusNode)statusNode.textContent="Enregistrement sécurisé en cours…";
    try{
      var result=await api("/api/member/withdrawal-account",{method:"PUT",body:JSON.stringify({country_code:country,operator:operator,phone:phone,account_name:name})});
      withdrawalAccount=result.account||{country_code:country,operator:operator,phone:phone,account_name:name};
      withdrawalAccountLoaded=true;
      applyWithdrawalAccount("wd",withdrawalAccount);
      if(statusNode)statusNode.textContent="Compte de retrait enregistré. Il sera prérempli pour vos prochaines demandes.";
      S.toast(result.message||"Compte de retrait enregistré.");
    }catch(err){
      if(statusNode)statusNode.textContent=err.message||"Impossible d’enregistrer le compte de retrait.";
      S.toast(err.message||"Impossible d’enregistrer le compte de retrait.");
    }finally{button.disabled=false;}
  });
  listen("btnWithdraw","click",async function(){
    var amount=Number(el("wdAmount").value),country=el("wdCountry").value,operator=el("wdOperator").value;
     var phone=normalizeWalletPhone(country,el("wdPhone").value);
    var name=el("wdName").value.trim();
    var statusNode=el("withdrawStatus");
    var payload={amount:amount,country_code:country,operator:operator,phone:phone,account_name:name};
    if(!Number.isSafeInteger(amount)||amount<2000){S.toast("Montant minimum de retrait : 2 000 FCFA");if(statusNode)statusNode.textContent="Montant minimum : 2 000 FCFA.";return;}
    if(!operator){S.toast("Choisissez un opérateur.");if(statusNode)statusNode.textContent="Choisissez un opérateur avant de confirmer.";return;}
     if(!validWalletPhone(country,operator,phone)){S.toast(walletPhoneError(country,operator));return;}
    if(name.length<3){S.toast("Saisissez le nom complet du titulaire.");if(statusNode)statusNode.textContent="Nom du titulaire requis.";return;}
    var b=el("btnWithdraw");b.disabled=true;
    if(statusNode)statusNode.textContent="Enregistrement de la demande…";
    try{
      var result=await api("/api/withdrawals",{method:"POST",body:JSON.stringify(payload)});
      S.toast(result.message||"Demande de retrait enregistrée.");
      if(statusNode)statusNode.textContent="Demande enregistrée. Montant : "+money(result.amount_requested||amount)+" · frais : "+money(result.fee_amount||Math.ceil(amount*0.15))+" · net à payer : "+money(result.payout_amount||amount-Math.ceil(amount*0.15))+". Statut : en attente de validation.";
      el("wdAmount").value="";
      try{await loadAll();}catch(loadError){console.warn("Withdrawal wallet refresh:",loadError.message);}
      setText("wdAvail",money(wallet.balance));
    }catch(e){
      S.toast(e.message||"Retrait impossible.");
      if(statusNode)statusNode.textContent=e.message||"Retrait impossible.";
    }finally{b.disabled=false;}
  });
  function updateWithdrawalFeePreview(){
    var input=el("wdAmount"),node=el("withdrawFeePreview");
    if(!input||!node)return;
    var amount=Number(input.value);
    if(!Number.isSafeInteger(amount)||amount<=0){node.textContent="Minimum : 2 000 FCFA · Frais : 15 % · Horaires : tous les jours de 07 h à 18 h (Togo).";return;}
    var fee=Math.ceil(amount*0.15),net=amount-fee;
    node.textContent="Frais (15 %) : "+money(fee)+" · Montant net estimé : "+money(net)+". Minimum : 2 000 FCFA.";
  }
  if(el("wdAmount"))el("wdAmount").addEventListener("input",updateWithdrawalFeePreview);
  updateWithdrawalFeePreview();

  function renderNotifications(items){
    var box=el("notificationList");if(!box)return;
    if(!items||!items.length){box.innerHTML='<p class="muted notification-empty">Aucune notification récente.</p>';return;}
    box.innerHTML=items.map(function(n){
      var amount=Number(n.amount)||0, sign=amount>0?"+":"";
      return '<article class="notification-item"><span class="notification-item-icon">◈</span><div><b>'+esc(n.title||n.entry_type||"Mise à jour du compte")+'</b><small>'+esc(S.dateFr(n.created_at))+' · '+esc(n.status||"")+'</small></div><strong class="'+(amount>=0?"plus":"minus")+'">'+sign+money(amount)+'</strong></article>';
    }).join("");
  }
  listen("notificationButton","click",async function(){
    var panel=el("notificationPanel"),button=el("notificationButton");
    if(!panel||!button)return;
    var opening=panel.hidden;panel.hidden=!opening;button.setAttribute("aria-expanded",String(opening));
    if(!opening)return;
    var box=el("notificationList");if(box)box.innerHTML='<p class="muted notification-empty">Chargement…</p>';
    try{
      var data=await api("/api/notifications");
      var items=data.notifications||[];
      renderNotifications(items);
      var count=el("notificationCount");
      if(items.length){
        try{
          await api("/api/notifications/read",{method:"POST",body:JSON.stringify({ids:items.map(function(n){return n.id;})})});
          if(count){count.textContent="0";count.hidden=true;}
        }catch(markErr){console.warn("Notification read status:",markErr.message);if(count){count.textContent=String(data.unread||items.length);count.hidden=!(Number(data.unread||items.length)>0);}}
      }else if(count){count.textContent="0";count.hidden=true;}
    }catch(err){if(box)box.innerHTML='<p class="muted notification-empty">'+esc(err.message||"Notifications indisponibles.")+'</p>';}
  });
  listen("closeNotifications","click",function(){
    var panel=el("notificationPanel"),button=el("notificationButton");
    if(panel)panel.hidden=true;if(button)button.setAttribute("aria-expanded","false");
  });
  api("/api/notifications").then(function(data){var count=el("notificationCount");if(count){count.textContent=String(data.unread||0);count.hidden=!(Number(data.unread)>0);}}).catch(function(err){console.warn("Notification badge:",err.message);});
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
    // Mark the interactive shell ready immediately after handlers are attached.
    // Long-running Supabase/background reconciliation must never disable buttons.
    window.NovaDashboardReady=true;
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
  setExternalContact('welcomeTelegram',C.telegramGroup,'Telegram bientôt disponible');
  function closeWelcomeModal(){var modal=el("welcomeModal");if(modal){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");}}
  if(el("welcomeLater"))el("welcomeLater").addEventListener("click",function(event){event.preventDefault();event.stopPropagation();closeWelcomeModal();});
  ['welcomeWa','welcomeTelegram'].forEach(function(id){var link=el(id);if(link)link.addEventListener('click',function(){closeWelcomeModal();});});
  if(location.search.includes("welcome=1")){var welcomeModal=el("welcomeModal");if(welcomeModal){welcomeModal.classList.add("open");welcomeModal.setAttribute("aria-hidden","false");}history.replaceState(null,"",location.pathname+location.hash);}
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