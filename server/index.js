require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const crypto = require('node:crypto');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..')));

const paydunyaMode = (process.env.PAYDUNYA_MODE || 'live').trim().toLowerCase();
const isTest = paydunyaMode === 'test';
const paydunyaBase = isTest ? 'https://app.paydunya.com/sandbox-api/v1' : 'https://app.paydunya.com/api/v1';

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

app.get('/api/health', (_req, res) => {
  const callbackConfigured = !!process.env.PAYDUNYA_CALLBACK_URL;
  const callbackUrl = callbackConfigured ? optionalHttpUrl(process.env.PAYDUNYA_CALLBACK_URL) : '';
  res.json({
    ok: true, service: 'nova-api', configured: missing.length === 0, missing,
    paydunya: {
      mode: isTest ? 'test' : 'live', base: paydunyaBase,
      master: maskedKeyInfo(paydunyaKeys.master), privateKey: maskedKeyInfo(paydunyaKeys.privateKey),
      token: maskedKeyInfo(paydunyaKeys.token), callbackConfigured,
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
  try {
    const amount = Number(req.body.amount);
    const countryCode = String(req.body.country_code || '').trim();
    const operator = String(req.body.operator || '').trim();
    const phone = String(req.body.phone || '').replace(/[^0-9+]/g, '');
    const accountName = String(req.body.account_name || '').trim();
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 5000000) {
      return res.status(400).json({ error: 'Le montant doit être compris entre 1 000 et 5 000 000 FCFA.' });
    }
    if (!countryCode || countryCode.length > 8 || !operator || operator.length > 80 || phone.replace(/\D/g, '').length < 8 || phone.length > 24 || accountName.length < 3 || accountName.length > 120) {
      return res.status(400).json({ error: 'Informations du bénéficiaire invalides.' });
    }
    const { data, error } = await supabase.rpc('nova_request_withdrawal', {
      p_user_id: req.user.id, p_amount: amount, p_country_code: countryCode,
      p_operator: operator, p_phone: phone, p_account_name: accountName
    });
    if (error) {
      if (/Insufficient balance/i.test(error.message)) return res.status(409).json({ error: 'Solde insuffisant.' });
      if (/Invalid withdrawal amount|Missing withdrawal details/i.test(error.message)) return res.status(400).json({ error: 'Demande de retrait invalide.' });
      throw error;
    }
    return res.status(201).json({ ok: true, withdrawal_id: data, status: 'pending', message: 'Demande enregistrée. Elle reste soumise à validation.' });
  } catch (err) {
    console.error('Withdrawal request error:', err.message);
    return res.status(500).json({ error: 'Impossible d’enregistrer la demande de retrait.' });
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
    if (!response.ok || confirmed.response_code !== '00' || confirmed.invoice?.status !== 'completed') {
      return res.json({ ok: true, status: tx.status || 'pending', reference: tx.reference });
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
    console.log('[PAYDUNYA] confirm response', { httpStatus: confirmResponse.status, responseCode: confirmed?.response_code, status: confirmed?.invoice?.status });console.log(
  '[PAYDUNYA] full confirm response:',
  JSON.stringify(confirmed, null, 2)
);
    if (!confirmResponse.ok || confirmed.response_code !== '00' || confirmed.invoice?.status !== 'completed') {
      return res.status(200).send('Payment not completed');
    }
    const amount = Number(confirmed.invoice.total_amount);
    const custom = confirmed.invoice?.custom_data || data?.invoice?.custom_data || data?.custom_data || {};
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
      console.error('[PAYDUNYA] missing payment metadata', { hasPaymentId: !!paymentId, amount });
      return res.status(500).send('Missing payment metadata');
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
      team_size: rows.length,
      investment_total: investmentTotal,
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
