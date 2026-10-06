-- Keeps the transaction id visible in the admin/coordinator payment tables.
--
-- The gateway writes to `payment_responses`, while the app reads
-- `payments.utr`. The auto-verify trigger only copied `status`, so every new
-- row had `utr = null` and the "Transaction ID" column rendered as "—".
--
-- Run this once in the Supabase SQL editor. It backfills the existing rows and
-- adds a trigger so future registrations stay in sync automatically.

-- 1. Backfill from any matching gateway response (email + phone).
update public.payments p
   set utr = response.transaction_id
  from public.registrations reg
  join public.participants part on part.id = reg.participant_id
  join lateral (
    select gateway.transaction_id
      from public.payment_responses gateway
     where lower(btrim(gateway.email)) = lower(btrim(part.email))
       and regexp_replace(gateway.contact, '\D', '', 'g')
         = regexp_replace(part.phone, '\D', '', 'g')
       and gateway.transaction_id is not null
     order by gateway.payment_datetime desc nulls last
     limit 1
  ) response on true
 where p.registration_id = reg.id
   and p.utr is null;

-- 2. Keep it in sync for new payments.
create or replace function public.sync_payment_transaction_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.utr is null then
    select r.transaction_id
      into new.utr
      from public.registrations reg
      join public.participants part on part.id = reg.participant_id
      join public.payment_responses r
        on lower(btrim(r.email)) = lower(btrim(part.email))
       and regexp_replace(r.contact, '\D', '', 'g')
         = regexp_replace(part.phone, '\D', '', 'g')
     where reg.id = new.registration_id
     order by r.payment_datetime desc
     limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_payment_transaction_id on public.payments;

create trigger trg_sync_payment_transaction_id
before insert or update on public.payments
for each row execute function public.sync_payment_transaction_id();

-- 3. A gateway response can be written after the payment row. Keep that
--    ordering from leaving `payments.utr` empty.
create or replace function public.sync_gateway_response_transaction_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transaction_id is not null then
    update public.payments p
       set utr = new.transaction_id
      from public.registrations reg
      join public.participants part on part.id = reg.participant_id
     where p.registration_id = reg.id
       and p.utr is null
       and lower(btrim(part.email)) = lower(btrim(new.email))
       and regexp_replace(part.phone, '\D', '', 'g')
         = regexp_replace(new.contact, '\D', '', 'g');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_gateway_response_transaction_id on public.payment_responses;

create trigger trg_sync_gateway_response_transaction_id
after insert or update of transaction_id, email, contact on public.payment_responses
for each row execute function public.sync_gateway_response_transaction_id();
