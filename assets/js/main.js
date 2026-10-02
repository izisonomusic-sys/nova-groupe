/* NOVA — page d'accueil : affichage des projets publiés depuis Supabase. */
(async function(){
  "use strict";
  var S=window.NovaStore,A=window.NovaAuth,C=window.NOVA;
  function setText(id,v){var n=document.getElementById(id);if(n)n.textContent=v;}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function card(p){
    var d=Number(p.daily_return_amount)||0,days=Number(p.duration_days)||0,amount=Number(p.minimum_amount)||0;
    return '<article class="plan"><div class="ph"><img src="'+esc(p.image_url||"assets/img/projet-solaire.jpg")+'" alt="'+esc(p.title)+'" loading="lazy"><span class="badge">'+esc(p.badge||p.category||"Projet")+'</span></div><div class="pb"><h3>'+esc(p.title)+'</h3><p class="muted">'+esc(p.description||"")+'</p><div class="stats"><div><span>Prix</span><b>'+S.fcn(amount)+'</b></div><div><span>Gain/jour estimé</span><b class="est">'+S.fcn(d)+'</b></div><div><span>Durée</span><b>'+days+' jours</b></div><div><span>Gain total estimé</span><b class="est">'+S.fcn(d*days)+'</b></div></div><a class="btn btn-primary btn-block" href="login.html">Investir maintenant</a></div></article>';
  }
  var session=null;
  if(A){var r=await A.auth.getSession();session=r.data&&r.data.session;}
  setText("homeGreet",session?"Bonjour, "+((session.user.user_metadata&&session.user.user_metadata.full_name)||"membre").split(/\s+/)[0]:"Bienvenue chez NOVA");
  if(session){
    try{
      var w=await A.from("wallet_balances").select("balance").eq("user_id",session.user.id).maybeSingle();
      if(!w.error)setText("homeSolde",S.fcn(w.data&&w.data.balance||0));
      var l=await A.from("wallet_ledger").select("entry_type,amount,status").eq("user_id",session.user.id).eq("status","posted");
      if(!l.error){
        var rows=l.data||[];
        setText("homeRevenus",S.fcn(rows.filter(x=>x.entry_type==="investment_income").reduce((s,x)=>s+Number(x.amount||0),0)));
        setText("homeRecharge",S.fcn(rows.filter(x=>x.entry_type==="deposit").reduce((s,x)=>s+Number(x.amount||0),0)));\n        setText("homeBonus",S.fcn((w.data&&w.data.bonus_balance)||0));
      }
    }catch(e){console.warn("NOVA landing balances:",e.message);}
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
        else if(r.error)console.warn("NOVA Supabase project feed:",r.error.message);
      }catch(err){console.warn("NOVA Supabase project feed:",err.message);}
    }
    if(!loaded){
      var bases=[];
      [C.apiBase,location.origin].forEach(function(base){base=String(base||"").replace(/\\/$/,"");if(base&&!bases.includes(base))bases.push(base);});
      for(var bi=0;bi<bases.length&&!loaded;bi++){
        try{
          var serverResponse=await fetch(bases[bi]+"/api/public/projects",{headers:{"Accept":"application/json"}});
          if(!serverResponse.ok)continue;
          var serverData=await serverResponse.json();
          if(Array.isArray(serverData.projects)&&serverData.projects.length){list=serverData.projects;loaded=true;}
        }catch(err){console.warn("NOVA server project feed:",err.message);}
      }
    }
    if(!loaded&&publishedFallback.length)list=publishedFallback.slice();
  }catch(e){console.error("NOVA public projects:",e.message);}
  function render(tab){
    var filtered=list.filter(p=>{var special=String(p.return_terms||"").startsWith("SPECIAL:");return tab==="speciaux"?special:!special;});
    var n=document.getElementById("homePlanList");if(n)n.innerHTML=filtered.length?filtered.map(card).join(""):'<div class="empty"><strong>Aucun projet publié pour le moment.</strong><br>Les projets apparaîtront ici après leur publication par NOVA.</div>';
  }
  document.querySelectorAll(".tab").forEach(function(t){t.addEventListener("click",function(){document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");render(t.dataset.tab);});});
  render("plans");
})();
