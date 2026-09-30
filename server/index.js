require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const crypto = require('node:crypto');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..')));

const paydunyaMode = (process.env.PAYDUNYA_MODE || 'live').trim().toLowerCase();
const isTest = paydunyaMode === 'test';
const paydunyaBase = isTest ? 'https://app.paydunya.com/sandbox-api/v1' : 'https://app.paydunya.com/api/v1';
const paydunyaDisbursementBase = isTest
  ? 'https://app.paydunya.com/sandbox-api/v2/disburse'
  : 'https://app.paydunya.com/api/v2/disburse';
const paydunyaDisbursementCallbackUrl =
  process.env.PAYDUNYA_DISBURSEMENT_CALLBACK_URL ||
  'https://nova-groupe-dpnx.onrender.com/payments/webhooks/paydunya/disbursement';

const PAYDUNYA_WITHDRAW_MODES = new Map([
  ['+228|togocom', 't-money-togo'],
  ['+228|moov togo', 'moov-togo'],
  ['+229|moov bénin', 'moov-benin'],
  ['+226|orange burkina', 'orange-money-burkina'],
  ['+226|moov burkina', 'moov-burkina-faso'],
  ['+225|orange ci', 'orange-money-ci'],
  ['+225|mtn ci', 'mtn-ci'],
  ['+225|moov ci', 'moov-ci'],
  ['+221|orange sn', 'orange-money-senegal'],
  ['+221|free sn', 'free-money-senegal'],
  ['+221|expresso', 'expresso-senegal'],
  ['+237|orange cm', 'orange-cameroon'],
  ['+237|mtn cm', 'mtn-cameroun'],
  ['+223|orange ml', 'orange-money-mali'],
  ['+223|moov ml', 'moov-mali'],
  ['+222|chinguitel', 'chinguitel-mauritania'],
]);

function normalizeOperator(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function paydunyaWithdrawMode(countryCode, operator) {
  return PAYDUNYA_WITHDRAW_MODES.get(`${String(countryCode || '').trim()}|${normalizeOperator(operator)}`) || '';
}
function localPhoneForPayDunya(phone, countryCode) {
  const digits = String(phone || '').replace(/\D/g, '');
  const cc = String(countryCode || '').replace(/\D/g, '');
  return cc && digits.startsWith(cc) ? digits.slice(cc.length) : digits.replace(/^0+/, '');
}
async function paydunyaDisbursementRequest(endpoint, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${paydunyaDisbursementBase}/${endpoint}`, {
      method: 'POST',
      headers: paydunyaHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = { response_text: raw }; }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function envFirst(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

// Keep TEST and LIVE credentials separate to prevent accidental mixing.
const paydunyaKeys = {
  master: envFirst('PAYDUNYA_MASTER_KEY'),
  privateKey: isTest
    ? envFirst('PAYDUNYA_TEST_PRIVATE_KEY', 'PAYDUNYA_PRIVATE_KEY')
    : envFirst('PAYDUNYA_LIVE_PRIVATE_KEY', 'PAYDUNYA_PRIVATE_KEY'),
  token: isTest
    ? envFirst('PAYDUNYA_TEST_TOKEN', 'PAYDUNYA_TOKEN')
    : envFirst('PAYDUNYA_LIVE_TOKEN', 'PAYDUNYA_TOKEN')
};
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = [];
if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!paydunyaKeys.master) missing.push('PAYDUNYA_MASTER_KEY');
if (!paydunyaKeys.privateKey) missing.push(isTest ? 'PAYDUNYA_TEST_PRIVATE_KEY ou PAYDUNYA_PRIVATE_KEY' : 'PAYDUNYA_LIVE_PRIVATE_KEY ou PAYDUNYA_PRIVATE_KEY');
if (!paydunyaKeys.token) missing.push(isTest ? 'PAYDUNYA_TEST_TOKEN ou PAYDUNYA_TOKEN' : 'PAYDUNYA_LIVE_TOKEN ou PAYDUNYA_TOKEN');

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function paydunyaHeaders() {
  return {
    'Content-Type': 'application/json',
    'PAYDUNYA-MASTER-KEY': paydunyaKeys.master,
    'PAYDUNYA-PRIVATE-KEY': paydunyaKeys.privateKey,
    'PAYDUNYA-TOKEN': paydunyaKeys.token
  };
}
function optionalHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.toString();
  } catch (_) {
    return '';
  }
}
function publicHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:') return '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')) return '';
    return u.toString();
  } catch (_) {
    return '';
  }
}
function maskedKeyInfo(value) {
  const v = String(value || '');
  return { present: !!v, length: v.length, prefix: v.slice(0, 14) };
}

function verifyPayDunyaHash(payload) {
  const received = String(payload?.hash || '').trim().toLowerCase();
  const expected = crypto.createHash('sha512').update(paydunyaKeys.master, 'utf8').digest('hex');
  if (!received || received.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex')); }
  catch (_) { return false; }
}
async function requireUser(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !supabase) return res.status(401).json({ error: 'Authentification Supabase requise.' });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Session invalide ou expirée.' });
    req.user = data.user;
    next();
  } catch (_) { return res.status(401).json({ error: 'Authentification impossible.' }); }
}

async function reconcileReferralBonusForUser(userId) {
  if (!supabase || !userId) return { ok: false, status: 'skipped' };

  const { data: authResult, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authResult?.user) {
    throw authError || new Error('Utilisateur introuvable.');
  }

  const metadata = authResult.user.user_metadata || authResult.user.raw_user_meta_data || {};
  const referralCode = String(metadata.referral_code || '').trim();
  if (!referralCode) return { ok: true, status: 'no_referral' };

  let referrer = null;
  const { data: byMemberCode, error: memberCodeError } = await supabase
    .from('profiles')
    .select('id,member_code')
    .eq('member_code', referralCode)
    .maybeSingle();
  if (memberCodeError) throw memberCodeError;
  referrer = byMemberCode;

  if (!referrer && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(referralCode)) {
    const { data: byId, error: byIdError } = await supabase
      .from('profiles')
      .select('id,member_code')
      .eq('id', referralCode)
      .maybeSingle();
    if (byIdError) throw byIdError;
    referrer = byId;
  }

  if (!referrer || referrer.id === userId) return { ok: true, status: 'referrer_not_found' };

  const bonus = 500;
  let { data: referral, error: referralLookupError } = await supabase
    .from('referrals')
    .select('id,status,bonus_amount')
    .eq('referred_user_id', userId)
    .maybeSingle();
  if (referralLookupError) throw referralLookupError;

  if (!referral) {
    let created;
    ({ data: created, error: referralLookupError } = await supabase
      .from('referrals')
      .insert({
        referrer_id: referrer.id,
        referred_user_id: userId,
        bonus_amount: bonus,
        status: 'paid'
      })
      .select('id,status,bonus_amount')
      .maybeSingle());

    // Some older NOVA databases used "credited" instead of "paid".
    if (referralLookupError) {
      ({ data: created, error: referralLookupError } = await supabase
        .from('referrals')
        .insert({
          referrer_id: referrer.id,
          referred_user_id: userId,
          bonus_amount: bonus,
          status: 'credited'
        })
        .select('id,status,bonus_amount')
        .maybeSingle());
    }

    if (!referralLookupError && created) {
      referral = created;
    } else if (referralLookupError) {
      // A concurrent repair may have created the row. Re-read before failing.
      const { data: existing, error: existingError } = await supabase
        .from('referrals')
        .select('id,status,bonus_amount')
        .eq('referred_user_id', userId)
        .maybeSingle();
      if (existingError) throw existingError;
      referral = existing;
      if (!referral) throw referralLookupError;
    }
  }

  if (!referral?.id) return { ok: false, status: 'referral_not_created' };

  const refId = String(referral.id);
  const referrerReference = `REF-${refId}-PARRAIN`;
  const referredReference = `REF-${refId}-FILLEUL`;
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('wallet_ledger')
    .select('user_id,reference,amount,entry_type,status')
    .in('reference', [referrerReference, referredReference]);
  if (ledgerError) throw ledgerError;

  const hasReferrerLedger = (ledgerRows || []).some(row =>
    row.user_id === referrer.id && row.reference === referrerReference &&
    row.entry_type === 'referral_bonus' && row.status === 'posted' && Number(row.amount) === bonus
  );
  const hasReferredLedger = (ledgerRows || []).some(row =>
    row.user_id === userId && row.reference === referredReference &&
    row.entry_type === 'referral_bonus' && row.status === 'posted' && Number(row.amount) === bonus
  );

  const credited = [];
  for (const item of [
    { userId: referrer.id, reference: referrerReference, description: 'Bonus de parrainage pour une nouvelle inscription', relatedUserId: userId, missing: !hasReferrerLedger },
    { userId, reference: referredReference, description: 'Bonus de bienvenue par parrainage', relatedUserId: referrer.id, missing: !hasReferredLedger }
  ]) {
    if (!item.missing) continue;

    const { error: walletEnsureError } = await supabase
      .from('wallet_balances')
      .upsert({ user_id: item.userId, balance: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (walletEnsureError) throw walletEnsureError;

    const { data: wallet, error: walletReadError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', item.userId)
      .maybeSingle();
    if (walletReadError || !wallet) throw walletReadError || new Error('Portefeuille introuvable.');

    const { error: balanceError } = await supabase
      .from('wallet_balances')
      .update({ balance: Number(wallet.balance || 0) + bonus, updated_at: new Date().toISOString() })
      .eq('user_id', item.userId);
    if (balanceError) throw balanceError;

    const { error: ledgerInsertError } = await supabase
      .from('wallet_ledger')
      .insert({
        user_id: item.userId,
        entry_type: 'referral_bonus',
        amount: bonus,
        status: 'posted',
        reference: item.reference,
        description: item.description,
        related_user_id: item.relatedUserId,
        posted_at: new Date().toISOString()
      });
    if (ledgerInsertError) throw ledgerInsertError;
    credited.push(item.userId);
  }

  return {
    ok: true,
    status: credited.length ? 'credited' : 'already_credited',
    referral_id: refId,
    credited_count: credited.length
  };
}

async function reconcileAllReferralBonuses() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    let repaired = 0;
    for (const authUser of data?.users || []) {
      try {
        const result = await reconcileReferralBonusForUser(authUser.id);
        if (result?.status === 'credited') repaired += Number(result.credited_count || 0);
      } catch (err) {
        console.error('[REFERRAL] reconciliation error', { userId: authUser.id, message: err.message });
      }
    }
    if (repaired) console.log('[REFERRAL] automatic bonus recovery completed', { ledgerEntriesRepaired: repaired });
  } catch (err) {
    console.error('[REFERRAL] automatic reconciliation failed:', err.message);
  }
}

app.post('/api/referrals/reconcile', requireUser, async (req, res) => {
  try {
    const result = await reconcileReferralBonusForUser(req.user.id);
    return res.json(result);
  } catch (err) {
    console.error('[REFERRAL] user reconciliation error:', err.message);
    return res.status(500).json({ error: 'Impossible de vérifier automatiquement votre bonus de parrainage.' });
  }
});

app.get('/api/health', (_req, res) => {
  const callbackConfigured = !!process.env.PAYDUNYA_CALLBACK_URL;
  const callbackUrl = callbackConfigured ? optionalHttpUrl(process.env.PAYDUNYA_CALLBACK_URL) : '';
  res.json({
    ok: true, service: 'nova-api', configured: missing.length === 0, missing,
    paydunya: {
      mode: isTest ? 'test' : 'live', base: paydunyaBase,
      master: maskedKeyInfo(paydunyaKeys.master), privateKey: maskedKeyInfo(paydunyaKeys.privateKey),
      token: maskedKeyInfo(paydunyaKeys.token), callbackConfigured, disbursementCallbackConfigured: !!publicHttpsUrl(paydunyaDisbursementCallbackUrl),
      callbackUrlValid: !!callbackUrl, callbackUrl: callbackUrl || null
    }
  });
});

// Crée une facture PayDunya pour le compte authentifié. Aucun solde n'est crédité ici.
app.post('/api/payments/paydunya/create', requireUser, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 5000000) {
      return res.status(400).json({ error: 'Le montant doit être un nombre entier entre 1 000 et 5 000 000 FCFA.' });
    }
    if (missing.length) return res.status(503).json({ error: 'Configuration serveur incomplète.', missing });

    const reference = `NOVA-${crypto.randomUUID()}`;
    const { data: pending, error: dbError } = await supabase.from('payment_transactions').insert({
      user_id: req.user.id, reference, amount, provider: 'paydunya', status: 'pending', currency: 'XOF'
    }).select('id, reference, amount').single();
    if (dbError) throw dbError;

    const profileResult = await supabase.from('profiles')
      .select('display_name,phone,country_code')
      .eq('id', req.user.id)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;
    const customerName = profileResult.data?.display_name || req.user.user_metadata?.full_name || '';
    const customerPhone = String(profileResult.data?.phone || req.user.phone || '').replace(/[^0-9+]/g, '');
    // Pour un test local de création de facture LIVE, ces URLs restent optionnelles.
    // Dès qu'une URL est fournie, elle doit être valide ; en production, utilisez HTTPS public.
    const callbackUrl = process.env.PAYDUNYA_CALLBACK_URL ? optionalHttpUrl(process.env.PAYDUNYA_CALLBACK_URL) : '';
    const actions = {};
    const returnUrl = process.env.PAYDUNYA_RETURN_URL ? optionalHttpUrl(process.env.PAYDUNYA_RETURN_URL) : '';
    const cancelUrl = process.env.PAYDUNYA_CANCEL_URL ? optionalHttpUrl(process.env.PAYDUNYA_CANCEL_URL) : '';
    if (returnUrl) actions.return_url = returnUrl;
    if (cancelUrl) actions.cancel_url = cancelUrl;
    if (callbackUrl) actions.callback_url = callbackUrl;

    // PayDunya attend custom_data et actions au niveau racine de la facture HTTP JSON.
    const payload = {
      invoice: {
        total_amount: amount,
        description: `Recharge portefeuille NOVA — ${reference}`,
        customer: {
          name: customerName,
          email: req.user.email || undefined,
          phone: customerPhone || undefined
        }
      },
      store: { name: process.env.PAYDUNYA_STORE_NAME || 'NOVA' },
      custom_data: { reference, user_id: req.user.id, payment_id: pending.id },
      ...(Object.keys(actions).length ? { actions } : {})
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    let result;
    try {
      response = await fetch(`${paydunyaBase}/checkout-invoice/create`, {
        method: 'POST',
        headers: paydunyaHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const raw = await response.text();
      try { result = JSON.parse(raw); } catch (_) { result = { response_text: raw }; }
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || result.response_code !== '00' || !result.token || !result.response_text) {
      await supabase.from('payment_transactions').update({ status: 'failed', provider_payload: result || { http_status: response?.status } }).eq('id', pending.id);
      console.error('PayDunya create rejected:', response?.status, result);
      const providerCode = result?.response_code || null;
      const providerDetail = result?.response_text || result?.description || `Réponse HTTP ${response?.status || 'inconnue'} du prestataire.`;
      const friendlyDetail = providerCode === '1001'
        ? `${providerDetail}. Vérifiez que PAYDUNYA_PRIVATE_KEY et PAYDUNYA_TOKEN proviennent de la même application et du même mode (${isTest ? 'TEST' : 'LIVE'}).`
        : providerDetail;
      return res.status(502).json({
        error: 'PayDunya n’a pas pu créer la facture.',
        detail: friendlyDetail,
        provider_code: providerCode
      });
    }
    await supabase.from('payment_transactions').update({ provider_token: result.token }).eq('id', pending.id);
    return res.json({ checkout_url: result.response_text, token: result.token, reference });
  } catch (err) {
    console.error('PayDunya create error:', err);
    if (err?.name === 'AbortError') return res.status(504).json({ error: 'PayDunya a mis trop de temps à répondre.' });
    return res.status(500).json({ error: 'Impossible de créer le paiement.', detail: err?.message || 'Erreur serveur inconnue.' });
  }
});

// Demande de retrait sécurisée : solde débité/réservé dans une RPC atomique.
app.post('/api/withdrawals', requireUser, async (req, res) => {
  let withdrawalId = null;
  try {
    const amount = Number(req.body.amount);
    const countryCode = String(req.body.country_code || '').trim();
    const operator = String(req.body.operator || '').trim();
    const phone = String(req.body.phone || '').replace(/[^0-9+]/g, '');
    const accountName = String(req.body.account_name || '').trim();
    const withdrawMode = paydunyaWithdrawMode(countryCode, operator);
    const accountAlias = localPhoneForPayDunya(phone, countryCode);

    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 5000000) {
      return res.status(400).json({ error: 'Le montant doit être compris entre 1 000 et 5 000 000 FCFA.' });
    }
    if (!countryCode || countryCode.length > 8 || !operator || operator.length > 80 ||
        accountAlias.length < 8 || accountAlias.length > 24 ||
        accountName.length < 3 || accountName.length > 120) {
      return res.status(400).json({ error: 'Informations du bénéficiaire invalides.' });
    }
    if (!withdrawMode) {
      return res.status(400).json({
        error: 'Ce moyen de retrait n’est pas encore disponible automatiquement via PayDunya.',
        operator,
        country_code: countryCode
      });
    }
    if (!paydunyaKeys.master || !paydunyaKeys.privateKey || !paydunyaKeys.token) {
      return res.status(503).json({ error: 'Configuration PayDunya de déboursement incomplète.' });
    }
    const callbackUrl = publicHttpsUrl(paydunyaDisbursementCallbackUrl);
    if (!callbackUrl) {
      return res.status(503).json({ error: 'URL de callback PayDunya pour les retraits invalide.' });
    }

    const { data: createdId, error: withdrawalError } = await supabase.rpc('nova_request_withdrawal', {
      p_user_id: req.user.id,
      p_amount: amount,
      p_country_code: countryCode,
      p_operator: operator,
      p_phone: phone,
      p_account_name: accountName
    });
    if (withdrawalError) {
      if (/Insufficient balance/i.test(withdrawalError.message)) return res.status(409).json({ error: 'Solde insuffisant.' });
      if (/Invalid withdrawal amount|Missing withdrawal details/i.test(withdrawalError.message)) return res.status(400).json({ error: 'Demande de retrait invalide.' });
      throw withdrawalError;
    }
    withdrawalId = createdId;

    const { response: createResponse, data: created } = await paydunyaDisbursementRequest('get-invoice', {
      account_alias: accountAlias,
      amount,
      withdraw_mode: withdrawMode,
      callback_url: callbackUrl
    });

    if (!createResponse.ok || created.response_code !== '00' || !created.disburse_token) {
      const detail = created?.response_text || created?.description || `Réponse HTTP ${createResponse.status}`;
      await supabase.rpc('nova_finalize_withdrawal_failure', {
        p_withdrawal_id: withdrawalId,
        p_provider_token: '',
        p_provider_payload: created || { http_status: createResponse.status },
        p_failure_reason: detail
      });
      return res.status(502).json({ error: 'PayDunya n’a pas pu préparer le retrait.', detail });
    }

    const disburseToken = String(created.disburse_token);
    const { error: processingError } = await supabase.rpc('nova_set_withdrawal_processing', {
      p_withdrawal_id: withdrawalId,
      p_provider_token: disburseToken,
      p_provider_payload: created
    });
    if (processingError) throw processingError;

    const { response: submitResponse, data: submitted } = await paydunyaDisbursementRequest('submit-invoice', {
      disburse_invoice: disburseToken,
      disburse_id: withdrawalId
    });

    if (submitResponse.ok && submitted.response_code === '00') {
      const providerStatus = String(submitted.status || '').toLowerCase();
      if (providerStatus === 'success') {
        await supabase.rpc('nova_finalize_withdrawal_success', {
          p_withdrawal_id: withdrawalId,
          p_provider_token: disburseToken,
          p_provider_payload: submitted
        });
        return res.status(201).json({
          ok: true,
          withdrawal_id: withdrawalId,
          status: 'paid',
          provider: 'paydunya',
          message: 'Retrait envoyé automatiquement avec succès.'
        });
      }
      if (providerStatus === 'failed') {
        const detail = submitted.response_text || submitted.description || 'PayDunya a refusé le retrait.';
        await supabase.rpc('nova_finalize_withdrawal_failure', {
          p_withdrawal_id: withdrawalId,
          p_provider_token: disburseToken,
          p_provider_payload: submitted,
          p_failure_reason: detail
        });
        return res.status(502).json({ error: 'Le retrait PayDunya a échoué.', detail });
      }
      return res.status(201).json({
        ok: true,
        withdrawal_id: withdrawalId,
        status: 'processing',
        provider: 'paydunya',
        message: 'Retrait envoyé à PayDunya et en cours de traitement.'
      });
    }

    // If submit timed out or returned an ambiguous error, verify the disbursement token
    // before deciding whether the wallet should be refunded.
    const { response: checkResponse, data: checked } = await paydunyaDisbursementRequest('check-status', {
      disburse_invoice: disburseToken
    });
    if (checkResponse.ok && checked.response_code === '00') {
      const checkedStatus = String(checked.status || '').toLowerCase();
      if (checkedStatus === 'success') {
        await supabase.rpc('nova_finalize_withdrawal_success', {
          p_withdrawal_id: withdrawalId,
          p_provider_token: disburseToken,
          p_provider_payload: checked
        });
        return res.status(201).json({ ok: true, withdrawal_id: withdrawalId, status: 'paid', provider: 'paydunya', message: 'Retrait confirmé automatiquement.' });
      }
      if (checkedStatus === 'failed') {
        const detail = checked.response_text || checked.description || 'Retrait PayDunya échoué.';
        await supabase.rpc('nova_finalize_withdrawal_failure', {
          p_withdrawal_id: withdrawalId,
          p_provider_token: disburseToken,
          p_provider_payload: checked,
          p_failure_reason: detail
        });
        return res.status(502).json({ error: 'Le retrait PayDunya a échoué.', detail });
      }
    }

    // Keep funds reserved while PayDunya remains pending/ambiguous; callback + reconciler will settle it.
    return res.status(201).json({
      ok: true,
      withdrawal_id: withdrawalId,
      status: 'processing',
      provider: 'paydunya',
      message: 'Retrait transmis à PayDunya. Le statut sera mis à jour automatiquement.'
    });
  } catch (err) {
    console.error('Automatic withdrawal error:', err?.message || err);
    if (withdrawalId) {
      try {
        await supabase.rpc('nova_finalize_withdrawal_failure', {
          p_withdrawal_id: withdrawalId,
          p_provider_token: '',
          p_provider_payload: { error: err?.message || 'unknown_error' },
          p_failure_reason: err?.name === 'AbortError'
            ? 'Délai dépassé lors de la communication avec PayDunya.'
            : 'Erreur technique lors du traitement du retrait.'
        });
      } catch (rollbackError) {
        console.error('Automatic withdrawal refund error:', rollbackError.message);
      }
    }
    if (err?.name === 'AbortError') return res.status(504).json({ error: 'PayDunya a mis trop de temps à répondre. Le retrait est sécurisé et sera réconcilié automatiquement.' });
    return res.status(500).json({ error: 'Impossible de traiter automatiquement le retrait.' });
  }
});

// Statut d'une recharge : un utilisateur ne peut consulter que ses propres transactions.
app.get('/api/payments/paydunya/:reference', requireUser, async (req, res) => {
  try {
    const { data, error } = await supabase.from('payment_transactions')
      .select('reference, amount, currency, status, created_at, completed_at')
      .eq('reference', req.params.reference).eq('user_id', req.user.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Transaction introuvable.' });
    return res.json(data);
  } catch (err) {
    console.error('PayDunya status error:', err.message);
    return res.status(500).json({ error: 'Impossible de consulter cette transaction.' });
  }
});

// Retour navigateur : vérifie le token côté PayDunya puis crédite via la RPC idempotente.
app.post('/api/payments/paydunya/confirm-return', requireUser, async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    if (!token || token.length > 300) return res.status(400).json({ error: 'Jeton de paiement invalide.' });
    const { data: tx, error: lookupError } = await supabase.from('payment_transactions')
      .select('id,reference,amount,status,provider_token,user_id')
      .eq('provider_token', token).eq('user_id', req.user.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!tx) return res.status(404).json({ error: 'Paiement introuvable pour ce compte.' });
    if (tx.status === 'completed') return res.json({ ok: true, status: 'completed', reference: tx.reference });
    const response = await fetch(`${paydunyaBase}/checkout-invoice/confirm/${encodeURIComponent(token)}`, { method: 'GET', headers: paydunyaHeaders() });
    const confirmed = await response.json();
    if (!response.ok || confirmed.response_code !== '00' || !verifyPayDunyaHash(confirmed)) {
      return res.status(502).json({ error: 'Réponse PayDunya invalide lors de la vérification.' });
    }

    const providerStatus = String(confirmed.status ?? confirmed.invoice?.status ?? 'pending').toLowerCase();
    if (providerStatus !== 'completed') {
      if (['pending', 'failed', 'cancelled'].includes(providerStatus)) {
        const { error: stateError } = await supabase.rpc('nova_reconcile_paydunya_state', {
          p_payment_id: tx.id,
          p_provider_token: token,
          p_provider_status: providerStatus,
          p_provider_payload: confirmed
        });
        if (stateError) throw stateError;
      }
      return res.json({ ok: true, status: providerStatus, reference: tx.reference });
    }

    const amount = Number(confirmed.invoice.total_amount);
    if (!Number.isSafeInteger(amount) || amount !== Number(tx.amount)) return res.status(409).json({ error: 'Le montant confirmé ne correspond pas à la transaction.' });
    const { error: creditError } = await supabase.rpc('nova_confirm_paydunya_payment', {
      p_payment_id: tx.id, p_provider_token: token, p_paid_amount: amount, p_provider_payload: confirmed
    });
    if (creditError) throw creditError;
    return res.json({ ok: true, status: 'completed', reference: tx.reference });
  } catch (err) {
    console.error('PayDunya return confirmation error:', err.message);
    return res.status(500).json({ error: 'Impossible de confirmer le paiement pour le moment.' });
  }
});

// Reconciliation: recovers pending payments when the IPN/callback is delayed.
app.post('/api/payments/paydunya/sync', requireUser, async (req, res) => {
  try {
    if (missing.length) return res.status(503).json({ error: 'Configuration serveur PayDunya incomplète.', missing });
    const requestedReference = String(req.body?.reference || '').trim();
    let query = supabase.from('payment_transactions')
      .select('id,reference,amount,status,provider_token,created_at')
      .eq('user_id', req.user.id)
      .eq('provider', 'paydunya')
      .eq('status', 'pending')
      .not('provider_token', 'is', null);

    if (requestedReference) {
      query = query.eq('reference', requestedReference).limit(1);
    } else {
      query = query
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const results = [];
    for (const tx of rows || []) {
      try {
        const token = String(tx.provider_token || '').trim();
        const response = await fetch(`${paydunyaBase}/checkout-invoice/confirm/${encodeURIComponent(token)}`, { method: 'GET', headers: paydunyaHeaders() });
        const confirmed = await response.json();
        if (!response.ok || confirmed.response_code !== '00' || !verifyPayDunyaHash(confirmed)) {
          results.push({ reference: tx.reference, status: 'pending', error: 'Confirmation PayDunya invalide.' });
          continue;
        }
        const status = String(confirmed.invoice?.status || '').toLowerCase();
        if (status === 'completed') {
          const amount = Number(confirmed.invoice?.total_amount);
          if (!Number.isSafeInteger(amount) || amount !== Number(tx.amount)) throw new Error('Payment amount mismatch');
          const { error: creditError } = await supabase.rpc('nova_confirm_paydunya_payment', {
            p_payment_id: tx.id,
            p_provider_token: token,
            p_paid_amount: amount,
            p_provider_payload: confirmed
          });
          if (creditError) throw creditError;
          results.push({ reference: tx.reference, status: 'completed', amount });
        } else if (['pending', 'failed', 'cancelled'].includes(status)) {
          const { error: stateError } = await supabase.rpc('nova_reconcile_paydunya_state', {
            p_payment_id: tx.id,
            p_provider_token: token,
            p_provider_status: status,
            p_provider_payload: confirmed
          });
          if (stateError) throw stateError;
          results.push({ reference: tx.reference, status });
        } else {
          results.push({ reference: tx.reference, status: status || 'pending' });
        }
      } catch (err) {
        results.push({ reference: tx.reference, status: 'pending', error: err.message });
      }
    }
    return res.json({ results });
  } catch (err) {
    console.error('PayDunya sync error:', err.message);
    return res.status(500).json({ error: 'Impossible de synchroniser les paiements PayDunya.' });
  }
});

// Notification PayDunya: vérifier le hash puis confirmer le statut auprès de l'API PayDunya.
app.post(['/api/payments/paydunya/callback', '/payments/webhooks/paydunya'], async (req, res) => {
  console.log('[PAYDUNYA] webhook received', { contentType: req.headers['content-type'], bodyKeys: Object.keys(req.body || {}) });
  try {
    if (!supabase || !process.env.PAYDUNYA_MASTER_KEY) {
      console.error('[PAYDUNYA] webhook not configured');
      return res.status(503).send('Not configured');
    }
    let data = req.body?.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (parseError) {
        console.error('[PAYDUNYA] invalid data JSON:', parseError.message);
        return res.status(400).send('Invalid data payload');
      }
    }
    const receivedHash = data?.hash;
    const expectedHash = crypto.createHash('sha512').update(process.env.PAYDUNYA_MASTER_KEY).digest('hex');
    if (typeof receivedHash !== 'string' || receivedHash.length !== expectedHash.length || !crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(expectedHash))) {
      console.error('[PAYDUNYA] invalid signature');
      return res.status(401).send('Invalid signature');
    }
    const token = data?.invoice?.token || data?.token;
    if (!token) {
      console.error('[PAYDUNYA] missing invoice token');
      return res.status(400).send('Missing invoice token');
    }
    console.log('[PAYDUNYA] token received', token.slice(0, 8) + '…');

    const confirmResponse = await fetch(`${paydunyaBase}/checkout-invoice/confirm/${encodeURIComponent(token)}`, { method: 'GET', headers: paydunyaHeaders() });
    const confirmed = await confirmResponse.json();
    console.log('[PAYDUNYA] confirm response', { httpStatus: confirmResponse.status, responseCode: confirmed?.response_code, status: confirmed?.status ?? confirmed?.invoice?.status });
    if (!confirmResponse.ok || confirmed?.response_code !== '00' || !verifyPayDunyaHash(confirmed)) {
      console.error('[PAYDUNYA] invalid confirmation hash or response');
      return res.status(502).send('Invalid PayDunya confirmation');
    }
    const providerStatus = String(confirmed.status ?? confirmed.invoice?.status ?? 'pending').toLowerCase();
    const amount = Number(confirmed.invoice?.total_amount);
    const custom = confirmed.custom_data || confirmed.invoice?.custom_data || data?.custom_data || data?.invoice?.custom_data || {};
    let paymentId = custom.payment_id;

    // Fallback: if PayDunya does not echo custom_data, recover the transaction by its provider token.
    if (!paymentId) {
      const { data: txByToken, error: lookupError } = await supabase
        .from('payment_transactions').select('id, status, amount').eq('provider_token', token).maybeSingle();
      if (lookupError) {
        console.error('[PAYDUNYA] transaction lookup error:', lookupError.message);
        return res.status(500).send('Could not find payment');
      }
      paymentId = txByToken?.id;
      if (paymentId) console.log('[PAYDUNYA] payment matched by provider token');
    }
    if (!paymentId || !Number.isSafeInteger(amount) || amount <= 0) {
      console.error('[PAYDUNYA] missing payment metadata', { hasPaymentId: !!paymentId, amount, providerStatus });
      return res.status(500).send('Missing payment metadata');
    }

    if (providerStatus !== 'completed') {
      if (['pending', 'failed', 'cancelled'].includes(providerStatus)) {
        const { error: stateError } = await supabase.rpc('nova_reconcile_paydunya_state', {
          p_payment_id: paymentId,
          p_provider_token: token,
          p_provider_status: providerStatus,
          p_provider_payload: confirmed
        });
        if (stateError) {
          console.error('[PAYDUNYA] payment state RPC error:', stateError.message);
          return res.status(500).send('Could not record payment state');
        }
      }
      console.log('[PAYDUNYA] payment state recorded', { paymentId, status: providerStatus, amount });
      return res.status(200).send('OK');
    }

    const { error } = await supabase.rpc('nova_confirm_paydunya_payment', {
      p_payment_id: paymentId,
      p_provider_token: token,
      p_paid_amount: amount,
      p_provider_payload: confirmed
    });
    if (error) {
      console.error('[PAYDUNYA] payment credit RPC error:', error.message);
      return res.status(500).send('Could not record payment');
    }
    console.log('[PAYDUNYA] payment credited successfully', { paymentId, amount });
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[PAYDUNYA] callback error:', err.message);
    return res.status(500).send('Callback error');
  }
});


async function reconcilePayDunyaWithdrawals() {
  if (!supabase || !paydunyaKeys.master || !paydunyaKeys.privateKey || !paydunyaKeys.token) return;
  try {
    const { data: rows, error } = await supabase
      .from('withdrawal_requests')
      .select('id,amount,status,provider_token,created_at')
      .eq('provider','paydunya')
      .in('status',['processing','pending'])
      .not('provider_token','is',null)
      .order('created_at',{ ascending: true })
      .limit(20);
    if (error) throw error;

    for (const row of rows || []) {
      const token = String(row.provider_token || '').trim();
      if (!token) continue;
      try {
        const { response, data } = await paydunyaDisbursementRequest('check-status', { disburse_invoice: token });
        if (!response.ok || data.response_code !== '00') continue;
        const status = String(data.status || '').toLowerCase();
        const providerAmount = Number(data.amount ?? data.total_amount);
        if (!Number.isSafeInteger(providerAmount) || providerAmount !== Number(row.amount)) {
          console.error('[PAYDUNYA][WITHDRAWAL] amount mismatch', { withdrawalId: row.id });
          continue;
        }
        if (status === 'success') {
          const { error: e } = await supabase.rpc('nova_finalize_withdrawal_success', {
            p_withdrawal_id: row.id,
            p_provider_token: token,
            p_provider_payload: data
          });
          if (e) console.error('[PAYDUNYA][WITHDRAWAL] success finalize error:', e.message);
        } else if (status === 'failed') {
          const detail = data.response_text || data.description || 'Retrait PayDunya échoué.';
          const { error: e } = await supabase.rpc('nova_finalize_withdrawal_failure', {
            p_withdrawal_id: row.id,
            p_provider_token: token,
            p_provider_payload: data,
            p_failure_reason: detail
          });
          if (e) console.error('[PAYDUNYA][WITHDRAWAL] failure finalize error:', e.message);
        }
      } catch (err) {
        console.error('[PAYDUNYA][WITHDRAWAL] reconcile error:', err.message);
      }
    }
  } catch (err) {
    console.error('[PAYDUNYA][WITHDRAWAL] reconcile query error:', err.message);
  }
}

function paydunyaDisbursementCallbackHealth(_req, res) {
  return res.status(200).json({ ok: true, service: 'nova-paydunya-disbursement-callback' });
}

app.get(['/api/payments/paydunya/disbursement-callback', '/payments/webhooks/paydunya/disbursement'], paydunyaDisbursementCallbackHealth);
app.head(['/api/payments/paydunya/disbursement-callback', '/payments/webhooks/paydunya/disbursement'], paydunyaDisbursementCallbackHealth);

app.post(['/api/payments/paydunya/disbursement-callback', '/payments/webhooks/paydunya/disbursement'], async (req, res) => {
  try {
    if (!supabase || !paydunyaKeys.master) return res.status(503).send('Not configured');

    let data = req.body?.data ?? req.body;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (_) {}
    }
    if (!data || typeof data !== 'object') data = {};

    const token = String(data?.token || data?.disburse_invoice || '').trim();
    const status = String(data?.status || '').trim().toLowerCase();

    // PayDunya validates callback_url before authorizing a disbursement. That
    // accessibility probe may contain no transaction payload and no hash.
    // Return 200 without mutating any data so PayDunya can validate the URL.
    if (!token && !status && !data?.hash) {
      console.log('[PAYDUNYA][WITHDRAWAL] callback accessibility probe accepted');
      return res.status(200).send('OK');
    }

    const receivedHash = String(data?.hash || '').trim().toLowerCase();
    const expectedHash = crypto.createHash('sha512').update(paydunyaKeys.master, 'utf8').digest('hex');
    if (
      !receivedHash ||
      receivedHash.length !== expectedHash.length ||
      !/^[0-9a-f]+$/.test(receivedHash) ||
      !crypto.timingSafeEqual(Buffer.from(receivedHash, 'hex'), Buffer.from(expectedHash, 'hex'))
    ) {
      console.error('[PAYDUNYA][WITHDRAWAL] invalid callback signature', {
        hasHash: !!receivedHash,
        hashLength: receivedHash.length,
        hasToken: !!token,
        status
      });
      return res.status(401).send('Invalid signature');
    }

    if (!token) return res.status(400).send('Missing disbursement token');

    const { data: wr, error: lookupError } = await supabase
      .from('withdrawal_requests')
      .select('id,amount,status,provider_token')
      .eq('provider_token', token)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!wr) return res.status(404).send('Withdrawal not found');

    const providerAmount = Number(data?.amount ?? data?.total_amount);
    if (!Number.isSafeInteger(providerAmount) || providerAmount !== Number(wr.amount)) {
      console.error('[PAYDUNYA][WITHDRAWAL] amount mismatch', { withdrawalId: wr.id });
      return res.status(409).send('Amount mismatch');
    }

    if (status === 'success') {
      const { error } = await supabase.rpc('nova_finalize_withdrawal_success', {
        p_withdrawal_id: wr.id,
        p_provider_token: token,
        p_provider_payload: data
      });
      if (error) throw error;
      console.log('[PAYDUNYA][WITHDRAWAL] paid', { withdrawalId: wr.id, amount: wr.amount });
      return res.status(200).send('OK');
    }

    if (status === 'failed') {
      const detail = String(data?.response_text || data?.description || 'Retrait PayDunya échoué.');
      const { error } = await supabase.rpc('nova_finalize_withdrawal_failure', {
        p_withdrawal_id: wr.id,
        p_provider_token: token,
        p_provider_payload: data,
        p_failure_reason: detail
      });
      if (error) throw error;
      console.log('[PAYDUNYA][WITHDRAWAL] failed/refunded', { withdrawalId: wr.id, amount: wr.amount });
      return res.status(200).send('OK');
    }

    await supabase.rpc('nova_set_withdrawal_processing', {
      p_withdrawal_id: wr.id,
      p_provider_token: token,
      p_provider_payload: data
    });
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[PAYDUNYA][WITHDRAWAL] callback error:', err.message);
    return res.status(500).send('Callback error');
  }
});

setInterval(() => {
  reconcilePayDunyaWithdrawals().catch(err => console.error('[PAYDUNYA][WITHDRAWAL] scheduler error:', err.message));
}, 60000);
setTimeout(() => {
  reconcilePayDunyaWithdrawals().catch(err => console.error('[PAYDUNYA][WITHDRAWAL] initial reconcile error:', err.message));
}, 10000);


async function requireAdmin(req, res, next) {
  try {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', req.user.id).maybeSingle();
    if (error) throw error;
    if (!data || !['admin','SUPER_ADMIN','super_admin'].includes(String(data.role || ''))) return res.status(403).json({ error: 'Accès réservé à un compte ayant le rôle administrateur.' });
    next();
  } catch (err) {
    console.error('Admin authorization error:', err.message);
    return res.status(500).json({ error: 'Vérification du rôle administrateur impossible.' });
  }
}

app.get('/api/admin/me', requireUser, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('id,display_name,phone,role').eq('id', req.user.id).maybeSingle();
    if (error) throw error;
    return res.json({ ok: true, user: data || { id: req.user.id, role: 'admin' } });
  } catch (err) {
    console.error('Admin profile read error:', err.message);
    return res.status(500).json({ error: 'Impossible de charger le profil administrateur.' });
  }
});

app.get('/api/admin/stats', requireUser, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase.rpc('nova_admin_dashboard_stats');
    if (error) throw error;
    return res.json({ stats: data || {} });
  } catch (err) {
    console.error('Admin dashboard stats error:', err.message);
    return res.status(500).json({ error: 'Impossible de charger les statistiques administrateur.' });
  }
});

app.get('/api/referrals/me', requireUser, async (req, res) => {
  try {
    const { data: referrals, error } = await supabase.from('referrals')
      .select('id,referred_user_id,bonus_amount,status,created_at')
      .eq('referrer_id', req.user.id).order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const rows = referrals || [];
    const ids = rows.map(r => r.referred_user_id);
    let profiles = [], investments = [];
    if (ids.length) {
      const [p, i] = await Promise.all([
        supabase.from('profiles').select('id,display_name').in('id', ids),
        supabase.from('investments').select('user_id,principal_amount,status').in('user_id', ids)
      ]);
      if (p.error) throw p.error; if (i.error) throw i.error;
      profiles = p.data || []; investments = i.data || [];
    }
    const names = new Map(profiles.map(p => [p.id, p.display_name]));
    const investmentTotal = investments.filter(i => ['active','completed'].includes(i.status)).reduce((sum, i) => sum + Number(i.principal_amount || 0), 0);
    const { data: bonusRows, error: bonusError } = await supabase.from('wallet_ledger').select('amount').eq('user_id', req.user.id).eq('entry_type', 'referral_bonus').eq('status', 'posted');
    if (bonusError) throw bonusError;
    return res.json({
      team_size: rows.length,      investment_total: investmentTotal,
      commission_total: (bonusRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0),
      referrals: rows.map(r => ({ ...r, display_name: names.get(r.referred_user_id) || 'Membre NOVA' }))
    });
  } catch (err) {
    console.error('Referral summary error:', err.message);
    return res.status(500).json({ error: 'Impossible de charger votre équipe.' });
  }
});

// Admin projects: every write is authorized server-side from the authenticated profile role.
app.get('/api/admin/projects', requireUser, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('projects')
    .select('id,slug,title,badge,description,category,image_url,minimum_amount,duration_days,daily_return_amount,return_terms,status,created_at')
    .order('minimum_amount', { ascending: true });
  if (error) return res.status(500).json({ error: 'Impossible de charger les projets.' });
  return res.json({ projects: data || [] });
});

app.post('/api/admin/projects', requireUser, requireAdmin, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const slug = String(req.body.slug || '').trim().toLowerCase();
    const description = String(req.body.description || '').trim();
    const badge = String(req.body.badge || '').trim().slice(0,80);
    const category = ['real_estate','solar','wind','agriculture','other'].includes(req.body.category) ? req.body.category : 'other';
    const minimum_amount = Number(req.body.minimum_amount);
    const daily_return_amount = Number(req.body.daily_return_amount);
    const duration_days = Number(req.body.duration_days);
    const image_url = String(req.body.image_url || '').trim();
    const return_terms = String(req.body.return_terms || '').trim();
    if (title.length < 3 || title.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: 'Titre ou slug invalide.' });
    if (!Number.isSafeInteger(minimum_amount) || minimum_amount < 1000 || !Number.isSafeInteger(daily_return_amount) || daily_return_amount < 0 || !Number.isSafeInteger(duration_days) || duration_days < 1 || duration_days > 3650) return res.status(400).json({ error: 'Montant, rendement ou durée invalide.' });
    const { data, error } = await supabase.from('projects').insert({
      title, slug, badge, description, category, image_url, minimum_amount, daily_return_amount, duration_days,
      return_terms, status: 'published', created_by: req.user.id
    }).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ce slug existe déjà. Modifiez le titre du projet.' });
      throw error;
    }
    return res.status(201).json({ project: data });
  } catch (err) {
    console.error('Admin project create error:', err.message);
    return res.status(500).json({ error: 'Impossible de publier le projet.' });
  }
});

app.patch('/api/admin/projects/:id', requireUser, requireAdmin, async (req, res) => {
  try {
    const { data: current, error: readError } = await supabase.from('projects').select('id,status').eq('id', req.params.id).maybeSingle();
    if (readError) throw readError;
    if (!current) return res.status(404).json({ error: 'Projet introuvable.' });
    const status = current.status === 'published' ? 'paused' : 'published';
    const { error } = await supabase.from('projects').update({ status, updated_at: new Date().toISOString() }).eq('id', current.id);
    if (error) throw error;
    return res.json({ ok: true, message: status === 'published' ? 'Projet publié.' : 'Projet masqué.' });
  } catch (err) {
    console.error('Admin project update error:', err.message);
    return res.status(500).json({ error: 'Impossible de modifier le projet.' });
  }
});

app.delete('/api/admin/projects/:id', requireUser, requireAdmin, async (req, res) => {
  try {
    const { count, error: countError } = await supabase.from('investments').select('id', { count: 'exact', head: true }).eq('project_id', req.params.id);
    if (countError) throw countError;
    if (count > 0) {
      const { error } = await supabase.from('projects').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', req.params.id);
      if (error) throw error;
      return res.json({ ok: true, message: 'Projet clôturé : les investissements existants sont conservés.' });
    }
    const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ ok: true, message: 'Projet supprimé.' });
  } catch (err) {
    console.error('Admin project delete error:', err.message);
    return res.status(500).json({ error: 'Impossible de supprimer le projet.' });
  }
});

// Investment and bonus endpoints: authenticated identity is taken only from the verified token.
app.post('/api/investments', requireUser, async (req, res) => {
  try {
    const projectId = String(req.body.project_id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) return res.status(400).json({ error: 'Projet invalide.' });
    const { data, error } = await supabase.rpc('nova_create_investment', { p_user_id: req.user.id, p_project_id: projectId });
    if (error) {
      if (/Solde insuffisant/i.test(error.message)) return res.status(409).json({ error: 'Solde insuffisant. Rechargez votre portefeuille.' });
      if (/Project is not available/i.test(error.message)) return res.status(409).json({ error: 'Ce projet n’est plus disponible.' });
      throw error;
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('Investment create error:', err.message);
    return res.status(500).json({ error: 'Impossible de réaliser cet investissement.' });
  }
});

app.post('/api/bonus/claim', requireUser, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('nova_claim_daily_bonus', { p_user_id: req.user.id });
    if (error) {
      if (/déjà réclamé|24 hours/i.test(error.message)) return res.status(409).json({ error: 'Bonus déjà réclamé. Revenez après 24 heures.' });
      throw error;
    }
    return res.json(data);
  } catch (err) {
    console.error('Daily bonus error:', err.message);
    return res.status(500).json({ error: 'Impossible de créditer le bonus.' });
  }
});

// Compatibilité navigation : si un ancien lien ouvre /app.html/compte,
// servir l'application puis laisser le routeur par hash afficher la vue demandée.
app.get('/app.html/:view', (req, res, next) => {
  const allowedViews = new Set(['home', 'recharger', 'retrait', 'presence', 'assistance', 'equipe', 'publications', 'investissements', 'historique', 'compte']);
  if (!allowedViews.has(req.params.view)) return next();
  return res.redirect(302, `/app.html#/${req.params.view}`);
});

app.listen(Number(process.env.PORT || 3000), () => console.log(`NOVA API listening on http://localhost:${process.env.PORT || 3000}`));