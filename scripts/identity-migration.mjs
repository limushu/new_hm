export function identityMigrationSql(source) {
  const migration = source.replace(/^begin;\s*$/im, '').replace(/^commit;\s*$/im, '');
  return `begin;
select pg_advisory_xact_lock(87161860);
create schema if not exists anjian_internal;
revoke all on schema anjian_internal from public,anon,authenticated;
create table if not exists anjian_internal.schema_migrations(version text primary key,applied_at timestamptz not null default now());
do $anjian_migration$ begin
  if not exists(select 1 from anjian_internal.schema_migrations where version='202611160001') then
    execute $anjian_ddl$${migration}$anjian_ddl$;
    insert into anjian_internal.schema_migrations(version) values ('202611160001');
  end if;
end $anjian_migration$;
commit;`;
}
