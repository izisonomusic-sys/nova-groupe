/* NOVA — Initialisation du client Supabase public.
   Le client utilise uniquement la clé publishable/anon. Ne jamais exposer service_role ici. */
(function () {
  var cfg = window.NOVA && window.NOVA.supabase;
  var sdk = window.supabase;
  if (!cfg || !cfg.url || !cfg.anonKey || !sdk || typeof sdk.createClient !== "function") {
    window.NovaSupabase = null;
    window.NovaSupabaseStatus = { connected: false, message: "Client Supabase non configuré ou SDK indisponible." };
    return;
  }
  try {
    window.NovaSupabase = sdk.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.NovaSupabaseStatus = { connected: true, url: cfg.url };
  } catch (error) {
    window.NovaSupabase = null;
    window.NovaSupabaseStatus = { connected: false, message: error.message || "Initialisation Supabase impossible." };
  }
})();
