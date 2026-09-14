-- Apply after schema.sql, to a dedicated IMBABC Supabase project.
-- The token table is exposed to the service role only; RLS denies client access.
create table if not exists public.meta_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  waba_id text not null check (waba_id ~ '^[0-9]{5,30}$'),
  phone_number_id text not null check (phone_number_id ~ '^[0-9]{5,30}$'),
  access_token_ciphertext text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.meta_connections enable row level security;
revoke all on public.meta_connections from anon, authenticated;
grant select, insert, update on public.meta_connections to service_role;
grant select on public.organizations to service_role;

alter table public.templates add column if not exists components jsonb not null default '[]'::jsonb;
create unique index if not exists templates_org_meta_id_idx
  on public.templates(organization_id, meta_template_id);
grant select, insert, update on public.templates to service_role;

alter table public.campaigns add column if not exists template_name text;
alter table public.campaigns add column if not exists template_language text;
alter table public.campaigns add column if not exists started_at timestamptz;
alter table public.campaigns add column if not exists finished_at timestamptz;
grant select, update on public.campaigns to service_role;
grant select on public.contacts to service_role;
grant update(consent_status,updated_at) on public.contacts to service_role;
grant update(consent_status, updated_at) on public.contacts to authenticated;
create policy "owner changes contact consent" on public.contacts for update to authenticated
using (exists (select 1 from public.organizations o
  where o.id=organization_id and o.owner_id=(select auth.uid())))
with check (exists (select 1 from public.organizations o
  where o.id=organization_id and o.owner_id=(select auth.uid())));

create table if not exists public.campaign_recipients (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  phone_e164 text not null,
  status text not null default 'QUEUED' check(status in
    ('QUEUED','SENDING','ACCEPTED','SENT','DELIVERED','READ','FAILED','UNKNOWN','SUPPRESSED')),
  attempts integer not null default 0,
  meta_message_id text unique,
  error_code text,
  error_detail text,
  next_attempt_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),
  attempted_at timestamptz,
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(campaign_id, contact_id)
);
create index if not exists campaign_recipients_claim_idx
  on public.campaign_recipients(status, id) where status='QUEUED';
create index if not exists campaign_recipients_campaign_status_idx
  on public.campaign_recipients(campaign_id,status);
alter table public.campaign_recipients enable row level security;
revoke all on public.campaign_recipients from anon, authenticated;
grant select, insert, update on public.campaign_recipients to service_role;
grant select, update on public.webhook_events to service_role;

-- A server-only atomic snapshot; each recipient is unique within a campaign.
create or replace function public.launch_campaign(
  p_campaign_id uuid, p_owner_id uuid, p_template_id uuid
) returns integer language plpgsql security definer set search_path = '' as $$
declare c public.campaigns%rowtype; t public.templates%rowtype; n integer;
begin
  select * into c from public.campaigns where id=p_campaign_id for update;
  if not found or c.status <> 'DRAFT' or c.created_by <> p_owner_id or not exists (
    select 1 from public.organizations where id=c.organization_id and owner_id=p_owner_id
  ) then raise exception 'Campaign draft tidak tersedia untuk pemilik ini'; end if;
  if not exists (select 1 from public.meta_connections where organization_id=c.organization_id)
    then raise exception 'Nomor WhatsApp belum terhubung'; end if;
  select * into t from public.templates where id=p_template_id and organization_id=c.organization_id
    and status='APPROVED' and meta_template_id is not null;
  if not found then raise exception 'Template belum disetujui Meta'; end if;
  -- First live release supports only template text without per-recipient variables/media.
  if t.components::text ~ '\{\{[0-9]+\}\}' or exists (
    select 1 from jsonb_array_elements(t.components) x
    where x->>'type' in ('HEADER','BUTTONS')
  ) then raise exception 'Template dengan variabel, header, atau tombol belum didukung'; end if;
  insert into public.campaign_recipients(campaign_id,organization_id,contact_id,phone_e164)
    select c.id,c.organization_id,co.id,co.phone_e164 from public.contacts co
    where co.organization_id=c.organization_id and co.consent_status='OPTED_IN'
    on conflict(campaign_id,contact_id) do nothing;
  get diagnostics n = row_count;
  if n=0 then raise exception 'Tidak ada penerima dengan izin pesan'; end if;
  update public.campaigns set status='RUNNING',template_id=t.id,
    template_name=t.name,template_language=t.language,started_at=now(),updated_at=now()
    where id=c.id;
  return n;
end $$;
revoke all on function public.launch_campaign(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.launch_campaign(uuid,uuid,uuid) to service_role;

-- SKIP LOCKED ensures parallel workers cannot reserve the same message.
create or replace function public.claim_campaign_recipients(p_limit integer default 10)
returns setof public.campaign_recipients language plpgsql security definer set search_path = '' as $$
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'Invalid batch size'; end if;
  return query
    with claims as (
      select r.id from public.campaign_recipients r
      join public.campaigns c on c.id=r.campaign_id and c.status='RUNNING'
      join public.contacts co on co.id=r.contact_id and co.consent_status='OPTED_IN'
      where r.status='QUEUED' and r.next_attempt_at<=now()
      order by r.id limit p_limit for update of r skip locked
    )
    update public.campaign_recipients r set status='SENDING',attempts=r.attempts+1,
      attempted_at=now(),updated_at=now() from claims
    where r.id=claims.id returning r.*;
end $$;
revoke all on function public.claim_campaign_recipients(integer) from public,anon,authenticated;
grant execute on function public.claim_campaign_recipients(integer) to service_role;

create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  updated_at timestamptz not null default now()
);
alter table public.worker_heartbeats enable row level security;
revoke all on public.worker_heartbeats from anon, authenticated;
grant select, insert, update on public.worker_heartbeats to service_role;

-- Opt-outs suppress unsent queue entries immediately.
create or replace function private.suppress_opted_out() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.consent_status='OPTED_OUT' and old.consent_status is distinct from new.consent_status then
    update public.campaign_recipients set status='SUPPRESSED',updated_at=now()
    where contact_id=new.id and status='QUEUED';
  end if;
  return new;
end $$;
revoke all on function private.suppress_opted_out() from public,anon,authenticated;
drop trigger if exists suppress_opted_out on public.contacts;
create trigger suppress_opted_out after update of consent_status on public.contacts
for each row execute function private.suppress_opted_out();
