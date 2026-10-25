/* TTE Energy — catalogue de produits publié depuis Supabase. */
(async function(){
  "use strict";
  var S=window.NovaStore,A=window.NovaAuth,C=window.NOVA;
  function setText(id,v){var n=document.getElementById(id);if(n)n.textContent=v;}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function card(p){
    var d=Number(p.daily_return_amount)||0,days=Number(p.duration_days)||0,amount=Number(p.minimum_amount)||0;
    return '<article class="plan product-tile"><h3 class="product-tile-title">'+esc(p.badge||p.category||p.title||"Projet")+'</h3><div class="ph"><img src="'+esc(p.image_url||"assets/img/hero-tte.svg")+'" alt="'+esc(p.title)+'" loading="lazy"></div><div class="pb"><h3 class="product-name">'+esc(p.title)+'</h3><p class="muted product-description">'+esc(p.description||"")+'</p><div class="product-metrics"><p>Revenu quotidien: <strong>'+S.fcn(d)+'</strong></p><p>Revenu total: <strong>'+S.fcn(d*days)+'</strong></p><p>Période de validité: <strong>'+days+' jours</strong></p></div><div class="product-buy-row"><b class="product-price">'+S.fcn(amount)+'</b><a class="btn btn-primary product-buy" href="login.html">Acheter</a></div></div></article>';
  }
  var session=null;
  if(A){var r=await A.auth.getSession();session=r.data&&r.data.session;}
  setText("homeGreet",session?"Bonjour, "+((session.user.user_metadata&&session.user.user_metadata.full_name)||"membre").split(/\s+/)[0]:"Bienvenue chez TTE Energy");
  if(session){
    try{
      var w=await A.from("wallet_balances").select("balance").eq("user_id",session.user.id).maybeSingle();
      if(!w.error)setText("homeSolde",S.fcn(w.data&&w.data.balance||0));
      var l=await A.from("wallet_ledger").select("entry_type,amount,status").eq("user_id",session.user.id).eq("status","posted");
      if(!l.error){
        var rows=l.data||[];
        setText("homeRevenus",S.fcn(rows.filter(x=>x.entry_type==="investment_income").reduce((s,x)=>s+Number(x.amount||0),0)));
        setText("homeRecharge",S.fcn(rows.filter(x=>x.entry_type==="deposit").reduce((s,x)=>s+Number(x.amount||0),0)));
      }
    }catch(e){console.warn("TTE Energy landing balances:",e.message);}
  }
  document.querySelectorAll("[data-app]").forEach(function(a){a.href=session?"app.html"+a.dataset.app:"login.html";});
  var publishedFallback=Array.isArray(C.publishedProjectsFallback)?C.publishedProjectsFallback:[];
  // Public projects are readable anonymously by policy, so use Supabase first.
  // Render remains a fallback; the static snapshot is the last resort.
  var list=publishedFallback.slice();
  try{
    var loaded=false;
    if(A){
      try{
        var r=await A.from("projects").select("id,slug,title,badge,description,category,image_url,minimum_amount,duration_days,daily_return_amount,return_terms,status").eq("status","published").order("minimum_amount");
        if(!r.error&&Array.isArray(r.data)&&r.data.length){list=r.data;loaded=true;}
        else if(r.error)console.warn("TTE Energy Supabase project feed:",r.error.message);
      }catch(err){console.warn("NOVA Supabase project feed:",err.message);}
    }
    if(!loaded){
      var bases=[];
        [C.apiBase,location.origin].forEach(function(base){base=String(base||"").replace(/\/$/,"");if(base&&!bases.includes(base))bases.push(base);});
      for(var bi=0;bi<bases.length&&!loaded;bi++){
        try{
          var serverResponse=await fetch(bases[bi]+"/api/public/projects",{headers:{"Accept":"application/json"}});
          if(!serverResponse.ok)continue;
          var serverData=await serverResponse.json();
          if(Array.isArray(serverData.projects)&&serverData.projects.length){list=serverData.projects;loaded=true;}
        }catch(err){console.warn("TTE Energy server project feed:",err.message);}
      }
    }
    if(!loaded&&publishedFallback.length)list=publishedFallback.slice();
  }catch(e){console.error("TTE Energy public projects:",e.message);}
  function render(tab){
    var filtered=list.filter(p=>{var special=String(p.return_terms||"").startsWith("SPECIAL:");return tab==="speciaux"?special:true;});
    var n=document.getElementById("homePlanList");if(n)n.innerHTML=filtered.length?filtered.map(card).join(""):'<div class="empty"><strong>Aucun projet publié pour le moment.</strong><br>Les projets apparaîtront ici après leur publication par TTE Energy.</div>';
  }
  document.querySelectorAll(".tab").forEach(function(t){t.addEventListener("click",function(){document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");render(t.dataset.tab);});});
  render("plans");

  // Rotating vertical feed backed exclusively by completed withdrawals from the server.
  (function initWithdrawalActivity(){
    var card=document.getElementById("withdrawalActivity");
    var message=document.getElementById("withdrawalActivityMessage");
    var meta=document.getElementById("withdrawalActivityMeta");
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
        [C.apiBase,location.origin].forEach(function(base){base=String(base||"");if(base&&!bases.includes(base))bases.push(base);});
        var data=null;
        for(var i=0;i<bases.length&&!data;i++){
          try{
            var response=await fetch(bases[i]+"/api/public/withdrawal-activity",{headers:{"Accept":"application/json"},cache:"no-store"});
            if(response.ok){var parsed=await response.json();if(Array.isArray(parsed.withdrawals))data=parsed.withdrawals;}
          }catch(_){}
        }
        entries=(data||[]).filter(function(x){return x&&typeof x.first_name==="string"&&typeof x.country_code==="string";});
        index=0;
        paint();
        if(timer)window.clearInterval(timer);
        if(entries.length>1)timer=window.setInterval(paint,4000);
      }catch(err){console.warn("TTE Energy withdrawal activity:",err.message);}
    }
    load();
    window.setInterval(load,60000);
  })();
})();
