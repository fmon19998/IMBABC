-- Super admin provisions isolated agent workspaces. No self-service role escalation.
create table public.account_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null, name text not null,
 role text not null check(role in ('SUPER_ADMIN','AGENT')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from public,anon,authenticated;
grant select on public.account_profiles to authenticated;
grant all on public.account_profiles to service_role;
create policy "read own account" on public.account_profiles for select to authenticated using(user_id=(select auth.uid()));
create table public.server_settings (key text primary key,value text not null);
alter table public.server_settings enable row level security;
revoke all on public.server_settings from public,anon,authenticated;
grant all on public.server_settings to service_role;
insert into public.server_settings(key,value) values ('TOKEN_ENCRYPTION_KEY',encode(extensions.gen_random_bytes(32),'base64'));
revoke insert on public.organizations,public.organization_members,public.workspaces from authenticated;
grant all on public.organizations,public.organization_members,public.workspaces to service_role;
grant insert,delete on public.campaigns,public.contacts to service_role;
create policy "active agent organizations" on public.organizations as restrictive for all to authenticated using(exists(select 1 from public.account_profiles p where p.user_id=(select auth.uid()) and p.active and p.role='AGENT'));
create policy "active agent contacts" on public.contacts as restrictive for all to authenticated using(exists(select 1 from public.account_profiles p where p.user_id=(select auth.uid()) and p.active and p.role='AGENT'));
create policy "active agent campaigns" on public.campaigns as restrictive for all to authenticated using(exists(select 1 from public.account_profiles p where p.user_id=(select auth.uid()) and p.active and p.role='AGENT'));
create or replace function public.provision_agent(p_user uuid,p_email text,p_name text,p_company text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare org uuid;
begin
 insert into public.account_profiles(user_id,email,name,role) values(p_user,p_email,p_name,'AGENT');
 insert into public.organizations(name,owner_id) values(p_company,p_user) returning id into org;
 insert into public.organization_members(organization_id,user_id,role) values(org,p_user,'OWNER');
 insert into public.workspaces(organization_id,name,created_by) values(org,'Utama',p_user);
 return org;
end $$;
revoke all on function public.provision_agent(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.provision_agent(uuid,text,text,text) to service_role;
create or replace function public.activate_super_admin(p_user uuid,p_email text,p_code_hash text)
returns void language plpgsql security invoker set search_path='' as $$
declare expected text;
begin
 select value into expected from public.server_settings where key='BOOTSTRAP_HASH' for update;
 if expected is null or expected<>p_code_hash or exists(select 1 from public.account_profiles where role='SUPER_ADMIN') then raise exception 'Aktivasi tidak tersedia'; end if;
 insert into public.account_profiles(user_id,email,name,role) values(p_user,p_email,'Felix','SUPER_ADMIN');
 delete from public.server_settings where key='BOOTSTRAP_HASH';
end $$;
revoke all on function public.activate_super_admin(uuid,text,text) from public,anon,authenticated;
grant execute on function public.activate_super_admin(uuid,text,text) to service_role;
-- Disabling an agent suppresses its unsent recipients, including queued retries.
create function private.suppress_disabled_agent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.active then
 update public.campaign_recipients set status='SUPPRESSED',updated_at=now() where status='QUEUED' and organization_id in(select id from public.organizations where owner_id=new.user_id);
 end if;
 return new;
end $$;
revoke all on function private.suppress_disabled_agent() from public,anon,authenticated;
create trigger suppress_disabled_agent after update of active on public.account_profiles for each row execute function private.suppress_disabled_agent();

drop function public.launch_campaign(uuid,uuid,uuid);
create or replace function public.launch_campaign(
  p_campaign_id uuid, p_owner_id uuid, p_template_id uuid, p_contact_id uuid default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare c public.campaigns%rowtype; t public.templates%rowtype; n integer;
begin
  select * into c from public.campaigns where id=p_campaign_id for update;
  if not found or c.status <> 'DRAFT' or c.created_by <> p_owner_id or not exists (
    select 1 from public.organizations where id=c.organization_id and owner_id=p_owner_id
  ) then raise exception 'Campaign draft tidak tersedia untuk pemilik ini'; end if;
  if not exists(select 1 from public.account_profiles where user_id=p_owner_id and active and role='AGENT') then raise exception 'Agen tidak aktif'; end if;
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
    where co.organization_id=c.organization_id and co.consent_status='OPTED_IN' and (p_contact_id is null or co.id=p_contact_id)
    on conflict(campaign_id,contact_id) do nothing;
  get diagnostics n = row_count;
  if n=0 then raise exception 'Tidak ada penerima dengan izin pesan'; end if;
  update public.campaigns set status='RUNNING',template_id=t.id,
    template_name=t.name,template_language=t.language,started_at=now(),updated_at=now()
    where id=c.id;
  return n;
end $$;
revoke all on function public.launch_campaign(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.launch_campaign(uuid,uuid,uuid,uuid) to service_role;

