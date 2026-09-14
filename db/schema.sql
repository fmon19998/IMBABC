-- IMBABC phase 1 schema. Apply to a dedicated Supabase project, never to
-- an existing product database. Tables exposed through the Data API use RLS.
create schema if not exists private;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organizations_owner_idx on public.organizations(owner_id);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','SUPERVISOR','MARKETING','AGENT','VIEWER')),
  created_at timestamptz not null default now(),
  unique(organization_id,user_id)
);
create index if not exists organization_members_user_idx on public.organization_members(user_id);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspaces_organization_idx on public.workspaces(organization_id);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 100),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  consent_status text not null default 'UNKNOWN' check (consent_status in ('OPTED_IN','OPTED_OUT','UNKNOWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,phone_e164)
);
create index if not exists contacts_org_created_idx on public.contacts(organization_id,created_at desc);
create index if not exists contacts_org_consent_idx on public.contacts(organization_id,consent_status);

create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null check (status in ('OPTED_IN','OPTED_OUT','UNKNOWN')),
  source text not null,
  actor_id uuid,
  recorded_at timestamptz not null default now()
);
create index if not exists consent_logs_contact_idx on public.consent_logs(contact_id,recorded_at desc);

create or replace function private.record_contact_consent()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.consent_logs(organization_id,contact_id,status,source,actor_id)
    values(new.organization_id,new.id,new.consent_status,
      case when new.consent_status='OPTED_IN' then 'manual_attestation' else 'not_provided' end,
      (select auth.uid()));
  elsif new.consent_status is distinct from old.consent_status then
    insert into public.consent_logs(organization_id,contact_id,status,source,actor_id)
    values(new.organization_id,new.id,new.consent_status,'status_change',(select auth.uid()));
  end if;
  return new;
end;
$$;
revoke all on function private.record_contact_consent() from public, anon, authenticated;
drop trigger if exists record_contact_consent on public.contacts;
create trigger record_contact_consent after insert or update of consent_status on public.contacts
for each row execute function private.record_contact_consent();

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meta_template_id text,
  name text not null,
  language text not null default 'id',
  category text not null check(category in ('MARKETING','UTILITY','AUTHENTICATION')),
  status text not null check(status in ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','DISABLED')),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists templates_org_status_idx on public.templates(organization_id,status);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null check(length(trim(name)) between 1 and 120),
  status text not null default 'DRAFT' check(status in ('DRAFT','SCHEDULED','PREPARING','RUNNING','PAUSED','COMPLETED','FAILED','CANCELLED')),
  template_id uuid references public.templates(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaigns_org_created_idx on public.campaigns(organization_id,created_at desc);

-- Raw access credentials remain outside exposed schemas and are never read by a browser.
create table if not exists private.meta_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  business_id text,
  waba_id text,
  phone_number_id text,
  access_token_ciphertext text,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.contacts enable row level security;
alter table public.consent_logs enable row level security;
alter table public.templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.webhook_events enable row level security;
alter table private.meta_connections enable row level security;

create policy "owner reads organization" on public.organizations for select to authenticated
using (owner_id=(select auth.uid()));
create policy "user creates own organization" on public.organizations for insert to authenticated
with check (owner_id=(select auth.uid()));
create policy "user reads own membership" on public.organization_members for select to authenticated
using (user_id=(select auth.uid()));
create policy "owner joins own organization" on public.organization_members for insert to authenticated
with check (user_id=(select auth.uid()) and role='OWNER' and exists(
  select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())
));
create policy "owner reads workspace" on public.workspaces for select to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));
create policy "owner creates workspace" on public.workspaces for insert to authenticated
with check (created_by=(select auth.uid()) and exists(
  select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())
));
create policy "owner reads contacts" on public.contacts for select to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));
create policy "owner adds contacts" on public.contacts for insert to authenticated
with check (created_by=(select auth.uid()) and exists(
  select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())
));
create policy "owner reads templates" on public.templates for select to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));
create policy "owner reads campaigns" on public.campaigns for select to authenticated
using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())));
create policy "owner creates draft" on public.campaigns for insert to authenticated
with check (created_by=(select auth.uid()) and status='DRAFT' and template_id is null and exists(
  select 1 from public.organizations o where o.id=organization_id and o.owner_id=(select auth.uid())
));

revoke all on public.organizations,public.organization_members,public.workspaces,public.contacts,
  public.consent_logs,public.templates,public.campaigns,public.webhook_events from anon,authenticated;
grant select,insert on public.organizations,public.organization_members,public.workspaces,public.contacts,public.campaigns to authenticated;
grant select on public.templates to authenticated;
grant insert on public.webhook_events to service_role;
-- Consent logs are written by the trigger and webhook events only by the backend.
revoke all on private.meta_connections from public,anon,authenticated;
