-- SAINIG secure rewarded-coins ledger
-- Apply with Supabase CLI/db migrations after confirming the correct project.
create table if not exists public.sainig_coin_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  completed_reward_ads bigint not null default 0 check (completed_reward_ads >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.sainig_reward_events (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_event_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('completed')),
  received_at timestamptz not null default now(),
  coins_awarded integer not null default 0 check (coins_awarded in (0, 10)),
  unique (provider, provider_event_id)
);

create table if not exists public.sainig_coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  reference text not null unique,
  created_at timestamptz not null default now()
);

alter table public.sainig_coin_balances enable row level security;
alter table public.sainig_reward_events enable row level security;
alter table public.sainig_coin_ledger enable row level security;

drop policy if exists "Users can read own coin balance" on public.sainig_coin_balances;
create policy "Users can read own coin balance"
on public.sainig_coin_balances for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own coin ledger" on public.sainig_coin_ledger;
create policy "Users can read own coin ledger"
on public.sainig_coin_ledger for select to authenticated
using (auth.uid() = user_id);

-- No client policies for reward events: only trusted service-role code can insert them.
revoke all on public.sainig_reward_events from anon, authenticated;
grant select on public.sainig_coin_balances to authenticated;
grant select on public.sainig_coin_ledger to authenticated;
revoke insert, update, delete on public.sainig_coin_balances from anon, authenticated;
revoke insert, update, delete on public.sainig_coin_ledger from anon, authenticated;

create or replace function public.sainig_record_verified_reward(
  p_provider text,
  p_event_id text,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id bigint;
  new_count bigint;
  awarded integer := 0;
  current_balance bigint;
begin
  if p_provider is null or length(p_provider) < 1 or length(p_provider) > 80
     or p_event_id is null or length(p_event_id) < 1 or length(p_event_id) > 255
     or p_user_id is null then
    raise exception 'Invalid reward payload';
  end if;

  -- Serialize rewards per user so simultaneous callbacks cannot double-award.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  insert into public.sainig_reward_events(provider, provider_event_id, user_id, status)
  values (p_provider, p_event_id, p_user_id, 'completed')
  on conflict (provider, provider_event_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select balance into current_balance from public.sainig_coin_balances where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'coins_awarded', 0, 'balance', coalesce(current_balance, 0));
  end if;

  insert into public.sainig_coin_balances(user_id, balance, completed_reward_ads)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  update public.sainig_coin_balances
    set completed_reward_ads = completed_reward_ads + 1, updated_at = now()
    where user_id = p_user_id
    returning completed_reward_ads into new_count;

  if new_count % 3 = 0 then
    awarded := 10;
    update public.sainig_coin_balances
      set balance = balance + awarded, updated_at = now()
      where user_id = p_user_id
      returning balance into current_balance;

    insert into public.sainig_coin_ledger(user_id, amount, reason, reference)
    values (p_user_id, awarded, '3 verified rewarded ads', p_provider || ':' || p_event_id);
    update public.sainig_reward_events set coins_awarded = awarded where id = inserted_id;
  else
    select balance into current_balance from public.sainig_coin_balances where user_id = p_user_id;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'completed_ads', new_count,
    'coins_awarded', awarded, 'balance', coalesce(current_balance, 0));
end;
$$;

revoke all on function public.sainig_record_verified_reward(text, text, uuid) from public, anon, authenticated;
grant execute on function public.sainig_record_verified_reward(text, text, uuid) to service_role;
