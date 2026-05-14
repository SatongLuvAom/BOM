alter table public.mat_category enable row level security;
alter table public.mat_master enable row level security;
alter table public.mat_alias enable row level security;
alter table public.mat_uom enable row level security;
alter table public.mat_uom_conv enable row level security;
alter table public.supplier enable row level security;
alter table public.mat_supplier_map enable row level security;
alter table public.mat_price_base enable row level security;
alter table public.mat_audit_log enable row level security;

drop policy if exists "anon can read mat_category" on public.mat_category;
create policy "anon can read mat_category"
on public.mat_category
for select
to anon
using (true);

drop policy if exists "anon can read mat_master" on public.mat_master;
create policy "anon can read mat_master"
on public.mat_master
for select
to anon
using (true);

drop policy if exists "anon can read mat_alias" on public.mat_alias;
create policy "anon can read mat_alias"
on public.mat_alias
for select
to anon
using (true);

drop policy if exists "anon can read mat_uom" on public.mat_uom;
create policy "anon can read mat_uom"
on public.mat_uom
for select
to anon
using (true);

drop policy if exists "anon can read mat_uom_conv" on public.mat_uom_conv;
create policy "anon can read mat_uom_conv"
on public.mat_uom_conv
for select
to anon
using (true);

drop policy if exists "anon can read supplier" on public.supplier;
create policy "anon can read supplier"
on public.supplier
for select
to anon
using (true);

drop policy if exists "anon can read mat_supplier_map" on public.mat_supplier_map;
create policy "anon can read mat_supplier_map"
on public.mat_supplier_map
for select
to anon
using (true);

drop policy if exists "anon can read mat_price_base" on public.mat_price_base;
create policy "anon can read mat_price_base"
on public.mat_price_base
for select
to anon
using (true);

notify pgrst, 'reload schema';
