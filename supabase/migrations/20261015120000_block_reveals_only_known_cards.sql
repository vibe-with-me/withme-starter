-- A block keeps a card visible only if the blocker could already see it.
--
-- profiles_select let the blocker always see whom they blocked (the
-- block-list UI), and blocks_insert accepted any blocked_id. Together they
-- turned any known profile id into a card: every listed gathering exposes
-- its host_id to the tenant (20261014220000), so a user could block each
-- host, read the card and avatar path, and unblock, with the host never
-- told. The no-enumeration rule held only while ids stayed secret.
--
-- The fix records, on the block row, whether the blocker could see the card
-- when they blocked. blocks_insert lets reveals_card be true only when
-- private.sees_card says the blocker sees that card right then (the WITH
-- CHECK runs before the after-insert trigger drops the connection). There is
-- no update policy, so a row cannot be flipped afterwards. A block that does
-- not reveal still blocks; it just does not show up with a card in the block
-- list.
--
-- private.sees_card is also the non-block half of profiles_select, so the
-- two cannot drift. It is a definer because blocks_insert reading profiles
-- under RLS would recurse (profiles_select reads blocks).

alter table public.blocks
  add column reveals_card boolean not null default false;

-- Rows written before this migration came from the block-list flow, which
-- only offers Block on a visible connection. Keep them listable; an operator
-- worried about rows written by the exploit can set reveals_card = false.
update public.blocks set reveals_card = true;

-- "Does p_viewer see p_target's card, block list aside?" Themselves, or,
-- unless p_target blocked them, a connection or the sender of a live
-- request to them.
create function private.sees_card(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer = p_target
    or (
      not private.is_blocked(p_viewer, p_target)
      and (
        exists (
          select 1 from public.connections c
          where (c.user_a = p_viewer and c.user_b = p_target)
             or (c.user_b = p_viewer and c.user_a = p_target)
        )
        or exists (
          select 1 from public.connect_requests r
          where r.requester_id = p_target
            and r.recipient_id = p_viewer
            and r.status = 'pending'
            and r.expires_at > now()
        )
      )
    )
$$;

revoke execute on function private.sees_card(uuid, uuid) from public, anon;
grant execute on function private.sees_card(uuid, uuid) to authenticated;

drop policy blocks_insert on public.blocks;
create policy blocks_insert on public.blocks
  for insert to authenticated
  with check (
    tenant_id = private.current_tenant_id()
    and blocker_id = (select auth.uid())
    and (not reveals_card or private.sees_card((select auth.uid()), blocked_id))
  );

-- 20261014220000 (c) with the blocker clause gated on reveals_card and the
-- rest moved into private.sees_card.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and (
      -- the blocker sees whom they blocked (their own list UI), even under a
      -- mutual block, but only a card they could see when they blocked
      exists (
        select 1 from public.blocks b
        where b.blocker_id = (select auth.uid())
          and b.blocked_id = profiles.id
          and b.reveals_card
      )
      or private.sees_card((select auth.uid()), id)
    )
  );
