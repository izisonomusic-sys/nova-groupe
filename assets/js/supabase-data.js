/* NOVA Supabase data access. Read-only browser access; financial writes must be server/RPC controlled. */
(function () {
  'use strict';
  var client = window.NovaAuth;
  if (!client) throw new Error('Supabase client absent: charger auth.js avant supabase-data.js');
  async function requireUser() {
    var r = await client.auth.getUser();
    if (r.error) throw r.error;
    if (!r.data.user) throw new Error('Connexion requise.');
    return r.data.user;
  }
  async function getProfile() {
    var user = await requireUser();
    var r = await client.from('profiles').select('id,display_name,phone,country_code,role,created_at').eq('id', user.id).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }
  async function getPublishedProjects() {
    var r = await client.from('projects').select('id,slug,title,description,category,image_url,minimum_amount,duration_days,daily_return_amount,return_terms,status').eq('status','published').order('minimum_amount');
    if (r.error) throw r.error;
    return r.data || [];
  }
  async function getWallet() {
    var user = await requireUser();
    var r = await client.from('wallet_balances').select('balance,updated_at').eq('user_id',user.id).maybeSingle();
    if (r.error) throw r.error;
    return r.data || {balance:0};
  }
  async function getLedger(limit) {
    var user = await requireUser();
    var r = await client.from('wallet_ledger').select('id,entry_type,amount,status,reference,description,created_at,posted_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(Math.min(Math.max(Number(limit)||50,1),200));
    if (r.error) throw r.error;
    return r.data || [];
  }
  async function getInvestments() {
    var user = await requireUser();
    var r = await client.from('investments').select('id,project_id,principal_amount,status,started_at,ends_at,created_at,projects(title,slug)').eq('user_id',user.id).order('created_at',{ascending:false});
    if (r.error) throw r.error;
    return r.data || [];
  }
  window.NovaData = { getProfile:getProfile, getPublishedProjects:getPublishedProjects, getWallet:getWallet, getLedger:getLedger, getInvestments:getInvestments };
})();
