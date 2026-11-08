-- Restrict sensitive financial SECURITY DEFINER RPCs to the trusted backend.
-- The application calls these through its service-role Supabase client after
-- validating the signed-in user's identity in the API layer.
revoke execute on function public.nova_reconcile_referral_bonus(uuid) from public, anon, authenticated;
grant execute on function public.nova_reconcile_referral_bonus(uuid) to service_role;

revoke execute on function public.nova_request_withdrawal(uuid, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.nova_request_withdrawal(uuid, bigint, text, text, text, text) to service_role;

-- Cover the ledger foreign key used by notification_reads.
create index if not exists notification_reads_ledger_id_idx
  on public.notification_reads(ledger_id);
