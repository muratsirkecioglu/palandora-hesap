-- =====================================================
-- Palandöken Hesap - Supabase Veritabanı Şeması
-- Supabase Dashboard > SQL Editor'da çalıştırın
-- =====================================================

-- Kullanıcılar tablosu (auth.users ile bağlantılı)
create table public.kullanicilar (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  ad_soyad text not null,
  rol text not null default 'calisan' check (rol in ('admin', 'calisan')),
  aktif boolean not null default true,
  created_at timestamptz default now()
);

-- Finans işlemleri tablosu
create table public.islemler (
  id uuid default gen_random_uuid() primary key,
  tarih date not null,
  aciklama text not null,
  tutar numeric(12, 2) not null check (tutar > 0),
  tur text not null check (tur in ('gelir', 'gider')),
  kategori text not null,
  kullanici_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Malzeme / stok tablosu
create table public.malzemeler (
  id uuid default gen_random_uuid() primary key,
  ad text not null,
  kategori text not null,
  miktar numeric(12, 3) not null default 0,
  birim text not null default 'Adet',
  min_miktar numeric(12, 3) not null default 0,
  birim_fiyat numeric(12, 2) not null default 0,
  aciklama text,
  kullanici_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

alter table public.kullanicilar enable row level security;
alter table public.islemler enable row level security;
alter table public.malzemeler enable row level security;

-- Kullanıcılar: herkes kendi profilini görebilir, adminler hepsini
create policy "kullanicilar_select" on public.kullanicilar
  for select using (
    auth.uid() = id
    or exists (
      select 1 from public.kullanicilar k
      where k.id = auth.uid() and k.rol = 'admin'
    )
  );

create policy "kullanicilar_update" on public.kullanicilar
  for update using (
    auth.uid() = id
    or exists (
      select 1 from public.kullanicilar k
      where k.id = auth.uid() and k.rol = 'admin'
    )
  );

create policy "kullanicilar_insert" on public.kullanicilar
  for insert with check (
    exists (
      select 1 from public.kullanicilar k
      where k.id = auth.uid() and k.rol = 'admin'
    )
  );

-- İşlemler: adminler hepsini, çalışanlar sadece kendilerini
create policy "islemler_select" on public.islemler
  for select using (
    kullanici_id = auth.uid()
    or exists (
      select 1 from public.kullanicilar k
      where k.id = auth.uid() and k.rol = 'admin'
    )
  );

create policy "islemler_insert" on public.islemler
  for insert with check (auth.uid() is not null);

create policy "islemler_update" on public.islemler
  for update using (
    kullanici_id = auth.uid()
    or exists (
      select 1 from public.kullanicilar k
      where k.id = auth.uid() and k.rol = 'admin'
    )
  );

create policy "islemler_delete" on public.islemler
  for delete using (
    kullanici_id = auth.uid()
    or exists (
      select 1 from public.kullanicilar k
      where k.id = auth.uid() and k.rol = 'admin'
    )
  );

-- Malzemeler: tüm kullanıcılar görebilir, adminler her şeyi yapabilir
create policy "malzemeler_select" on public.malzemeler
  for select using (auth.uid() is not null);

create policy "malzemeler_insert" on public.malzemeler
  for insert with check (auth.uid() is not null);

create policy "malzemeler_update" on public.malzemeler
  for update using (
    kullanici_id = auth.uid()
    or exists (
      select 1 from public.kullanicilar k
      where k.id = auth.uid() and k.rol = 'admin'
    )
  );

create policy "malzemeler_delete" on public.malzemeler
  for delete using (
    exists (
      select 1 from public.kullanicilar k
      where k.id = auth.uid() and k.rol = 'admin'
    )
  );

-- =====================================================
-- İlk Admin Kullanıcı
-- Auth > Users'dan kullanıcı oluşturduktan sonra
-- aşağıdaki komutu kullanıcının UUID'siyle çalıştırın:
-- =====================================================
-- insert into public.kullanicilar (id, email, ad_soyad, rol)
-- values ('USER-UUID-BURAYA', 'admin@sirket.com', 'Admin Kullanıcı', 'admin');
