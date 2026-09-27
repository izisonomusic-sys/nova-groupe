/* NOVA — Authentification réelle Supabase (aucun mot de passe ni profil métier stocké par l'application). */
(function () {
  var C = window.NOVA;
  var client = window.supabase.createClient(C.supabase.url, C.supabase.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.NovaAuth = client;
  var countrySel = document.getElementById('country');
  var dialSel = document.getElementById('dial');
  if (countrySel) {
    countrySel.innerHTML = C.countries.map(function(c){return '<option value="'+c.code+'">'+c.label+' ('+c.code+')</option>';}).join('');
    countrySel.value = '+228';
    countrySel.addEventListener('change', fillDial); fillDial();
  }
  function fillDial(){ if(!dialSel)return; dialSel.innerHTML=C.countries.map(function(c){return '<option value="'+c.code+'">'+c.code+'</option>';}).join(''); dialSel.value=countrySel?countrySel.value:'+228'; }
  function phoneE164(){ var raw=(document.getElementById('phone').value||'').replace(/\D/g,''); return (dialSel.value||'+228')+raw.replace(/^0+/, ''); }
  function showError(id,msg){ var el=document.querySelector('#'+id+' .err'); if(el)el.textContent=msg; var f=document.getElementById(id); if(f)f.classList.add('invalid'); }
  function clearErrors(){ document.querySelectorAll('.field.invalid').forEach(function(el){el.classList.remove('invalid');}); }
  function toast(msg){ if(window.NovaStore)window.NovaStore.toast(msg,'check'); else {var t=document.getElementById('toast');if(t){t.textContent=msg;t.classList.add('show');}} }
  var rf=document.getElementById('registerForm');
  if(rf){
    var pass=document.getElementById('pass'), pass2=document.getElementById('pass2'), hint=document.getElementById('passMatch');
    pass2.addEventListener('input',function(){if(hint){hint.textContent=pass2.value===pass.value?'✓ Correspondance des mots de passe':'Les mots de passe doivent correspondre.';hint.className='hint'+(pass2.value===pass.value?' ok':'');}});
    rf.addEventListener('submit',async function(e){e.preventDefault();clearErrors();var name=document.getElementById('username').value.trim(),pwd=pass.value,pwd2=pass2.value,phone=phoneE164();
      if(name.length<3)return showError('f-user','Veuillez saisir un nom d’au moins 3 caractères.');
      if(phone.replace(/\D/g,'').length<8)return showError('f-phone','Numéro de téléphone invalide.');
      if(pwd.length<8)return showError('f-pass','Le mot de passe doit contenir au moins 8 caractères.');
      if(pwd!==pwd2)return showError('f-pass2','Les mots de passe ne correspondent pas.');
      var btn=rf.querySelector('[type=submit]');btn.disabled=true;
      try{
        var result=await client.auth.signUp({phone:phone,password:pwd,options:{data:{full_name:name,country_code:dialSel.value,referral_code:document.getElementById('ref').value.trim()}}});
        if(result.error)throw result.error;
        var user=result.data.user;
        if(user && result.data.session){
          window.location.href='app.html?welcome=1';
        } else {
          alert('Compte créé. Si Supabase exige une confirmation du téléphone, la confirmation doit être désactivée dans Auth > Providers > Phone pour permettre la connexion sans code SMS.');
        }
      }catch(err){showError('f-phone',err.message||'Impossible de créer le compte. Vérifiez la configuration Supabase.');}
      finally{btn.disabled=false;}
    });
  }
  var lf=document.getElementById('loginForm');
  if(lf){lf.addEventListener('submit',async function(e){e.preventDefault();clearErrors();var pwd=document.getElementById('pass').value,phone=phoneE164();if(!pwd)return showError('f-pass','Mot de passe requis.');if(phone.replace(/\D/g,'').length<8)return showError('f-phone','Numéro de téléphone invalide.');var btn=lf.querySelector('[type=submit]');btn.disabled=true;try{var r=await client.auth.signInWithPassword({phone:phone,password:pwd});if(r.error)throw r.error;window.location.href='app.html';}catch(err){showError('f-pass',err.message||'Connexion impossible.');}finally{btn.disabled=false;}});}
})();
