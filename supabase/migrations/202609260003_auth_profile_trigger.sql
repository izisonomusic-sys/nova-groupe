-- Create the public profile automatically when a Supabase Auth user is created.
-- This avoids client-side profile INSERT permissions and supports phone/password signup.
create or replace function public.nova_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, phone, country_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.phone, ''),
    coalesce(new.raw_user_meta_data ->> 'country_code', '+228')
  )
  on conflict (id) do update set
    display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    country_code = coalesce(excluded.country_code, public.profiles.country_code),
    updated_at = now();

  insert into public.wallet_balances (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists nova_auth_user_created on auth.users;
create trigger nova_auth_user_created
after insert on auth.users
for each row execute function public.nova_handle_new_auth_user();
