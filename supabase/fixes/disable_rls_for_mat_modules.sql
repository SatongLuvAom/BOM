alter table public.mat_category disable row level security;
alter table public.mat_master disable row level security;
alter table public.mat_alias disable row level security;
alter table public.mat_uom disable row level security;
alter table public.mat_uom_conv disable row level security;

alter table public.supplier disable row level security;
alter table public.mat_supplier_map disable row level security;
alter table public.mat_price_base disable row level security;
alter table public.mat_audit_log disable row level security;

notify pgrst, 'reload schema';
