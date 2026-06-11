-- =====================================================
-- Migration v3: Demirbaş yönetimi
-- =====================================================

create table if not exists public.demirbaslar (
  id uuid default gen_random_uuid() primary key,
  ad text not null,
  kategori text not null,
  marka text,
  model text,
  seri_no text,
  alis_tarihi date,
  alis_fiyati numeric(12,2),
  konum text,
  durum text not null default 'aktif'
    check (durum in ('aktif', 'bakimda', 'hurda', 'devredildi')),
  zimmet_kullanici_id uuid references auth.users(id) on delete set null,
  zimmet_tarihi date,
  garanti_bitis date,
  son_bakim_tarihi date,
  sonraki_bakim_tarihi date,
  notlar text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.demirbaslar enable row level security;

create policy "demirbaslar_select" on public.demirbaslar
  for select using (auth.uid() is not null);

create policy "demirbaslar_insert" on public.demirbaslar
  for insert with check (auth.uid() is not null);

create policy "demirbaslar_update" on public.demirbaslar
  for update using (
    exists (select 1 from public.kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
  );

create policy "demirbaslar_delete" on public.demirbaslar
  for delete using (
    exists (select 1 from public.kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
  );
