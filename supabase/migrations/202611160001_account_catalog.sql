-- Account/catalog metadata only. Case bodies, files, recordings and cloud tokens never belong here.
begin;

create table public.account_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create function public.create_account_profile() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$ begin
  insert into public.account_profiles(id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.create_account_profile() from public;
create trigger anjian_create_account_profile after insert on auth.users
for each row execute function public.create_account_profile();
insert into public.account_profiles(id) select id from auth.users on conflict do nothing;

create table public.cloud_bindings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('cloudkit','onedrive','google-drive')),
  provider_subject text not null check (char_length(provider_subject) between 1 and 512),
  label text not null default '' check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  unique (owner_id,provider,provider_subject),
  unique (id,owner_id,provider)
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default '我的工作区' check (char_length(label) between 1 and 120),
  provider text not null check (provider in ('cloudkit','onedrive','google-drive')),
  cloud_binding_id uuid not null,
  -- Opaque provider locators, not an arbitrary JSON bag where credentials might be saved.
  remote_locator jsonb not null check (
    jsonb_typeof(remote_locator) = 'object'
    and octet_length(remote_locator::text) <= 4096
    and remote_locator - array['container','zone','workspaceId','driveId','folderId','rootId']::text[] = '{}'::jsonb
  ),
  created_at timestamptz not null default now(),
  foreign key (cloud_binding_id,owner_id,provider)
    references public.cloud_bindings(id,owner_id,provider) on delete no action deferrable initially deferred
);

alter table public.account_profiles enable row level security;
alter table public.cloud_bindings enable row level security;
alter table public.workspaces enable row level security;

revoke all on public.account_profiles, public.cloud_bindings, public.workspaces from public, anon, authenticated;
grant select on public.account_profiles, public.cloud_bindings, public.workspaces to authenticated;
grant update(display_name) on public.account_profiles to authenticated;
grant insert(id,provider,provider_subject,label), update(label), delete on public.cloud_bindings to authenticated;
grant insert(id,label,provider,cloud_binding_id,remote_locator), update(label,remote_locator), delete on public.workspaces to authenticated;

create policy own_profile_read on public.account_profiles for select to authenticated using ((select auth.uid())=id);
create policy own_profile_update on public.account_profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy own_binding_read on public.cloud_bindings for select to authenticated using ((select auth.uid())=owner_id);
create policy own_binding_insert on public.cloud_bindings for insert to authenticated with check ((select auth.uid())=owner_id);
create policy own_binding_update on public.cloud_bindings for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy own_binding_delete on public.cloud_bindings for delete to authenticated using ((select auth.uid())=owner_id);
create policy own_workspace_read on public.workspaces for select to authenticated using ((select auth.uid())=owner_id);
create policy own_workspace_insert on public.workspaces for insert to authenticated with check ((select auth.uid())=owner_id);
create policy own_workspace_update on public.workspaces for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy own_workspace_delete on public.workspaces for delete to authenticated using ((select auth.uid())=owner_id);

commit;
