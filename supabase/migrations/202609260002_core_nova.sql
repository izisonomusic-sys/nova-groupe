-- NOVA core schema: profiles, projects, investments, ledger, referrals and withdrawals.
-- Apply in Supabase SQL Editor after reviewing RLS policies and business/legal requirements.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text unique,
  country_code text not null default '+228',
  role text not null default 'member' check (role in ('member','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  badge text not null default '',
  description text not null default '',
  category text not null default 'other' check (category in ('real_estate','solar','wind','agriculture','other')),
  image_url text,
  minimum_amount bigint not null default 1000 check (minimum_amount >= 0),
  duration_days integer not null default 15 check (duration_days > 0),
  daily_return_amount bigint not null default 0 check (daily_return_amount >= 0),
  return_terms text not null default '',
  status text not null default 'draft' check (status in ('draft','published','paused','closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  principal_amount bigint not null check (principal_amount > 0),
  status text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_type text not null check (entry_type in ('deposit','withdrawal','investment_debit','principal_return','investment_income','referral_bonus','daily_bonus','adjustment')),
  amount bigint not null,
  status text not null default 'pending' check (status in ('pending','posted','reversed','failed')),
  reference text,
  description text not null default '',
  related_user_id uuid references public.profiles(id),
  related_investment_id uuid references public.investments(id),
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  bonus_amount bigint not null default 0 check (bonus_amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referrer_id <> referred_user_id)
);

create table if not exists public.daily_bonus_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount >= 0),
  claimed_at timestamptz not null default now(),
  eligible_again_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','posted','cancelled'))
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount >= 1000),
  country_code text not null,
  operator text not null,
  phone text not null,
  account_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','paid','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_balances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.investments enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.referrals enable row level security;
alter table public.daily_bonus_claims enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.wallet_balances enable row level security;

drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles for select to authenticated using (id = auth.uid());
-- Profile role changes must be server-controlled; no self-update policy is granted.
drop policy if exists "profile self update" on public.profiles;
drop policy if exists "published projects readable" on public.projects;
create policy "published projects readable" on public.projects for select to anon, authenticated using (status = 'published');
drop policy if exists "own investments read" on public.investments;
create policy "own investments read" on public.investments for select to authenticated using (user_id = auth.uid());
drop policy if exists "own ledger read" on public.wallet_ledger;
create policy "own ledger read" on public.wallet_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists "own referrals read" on public.referrals;
create policy "own referrals read" on public.referrals for select to authenticated using (referrer_id = auth.uid() or referred_user_id = auth.uid());
drop policy if exists "own claims read" on public.daily_bonus_claims;
create policy "own claims read" on public.daily_bonus_claims for select to authenticated using (user_id = auth.uid());
drop policy if exists "own withdrawals read" on public.withdrawal_requests;
create policy "own withdrawals read" on public.withdrawal_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists "own balance read" on public.wallet_balances;
create policy "own balance read" on public.wallet_balances for select to authenticated using (user_id = auth.uid());

-- Deliberately no client INSERT/UPDATE policies for ledger, balances, investments,
-- bonuses or withdrawals. Add narrowly scoped RPCs/server endpoints before enabling money flows.
