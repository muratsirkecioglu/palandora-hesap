-- =====================================================
-- Migration v2: Ödeme takibi + Stok entegrasyonu
-- =====================================================

-- 1. islemler tablosuna yeni alanlar
alter table public.islemler
  add column if not exists odeme_durumu text not null default 'odendi'
    check (odeme_durumu in ('odendi', 'kismi_odendi', 'beklemede')),
  add column if not exists odenen_tutar numeric(12,2) not null default 0,
  add column if not exists vade_tarihi date,
  add column if not exists notlar text;

-- Mevcut kayıtlar için odenen_tutar = tutar (hepsi ödenmiş kabul et)
update public.islemler set odenen_tutar = tutar;

-- 2. Ödeme kayıtları tablosu
create table if not exists public.odemeler (
  id uuid default gen_random_uuid() primary key,
  islem_id uuid references public.islemler(id) on delete cascade not null,
  tarih date not null default current_date,
  tutar numeric(12,2) not null check (tutar > 0),
  aciklama text,
  kullanici_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- 3. İşlem-stok bağlantısı tablosu
create table if not exists public.islem_stok (
  id uuid default gen_random_uuid() primary key,
  islem_id uuid references public.islemler(id) on delete cascade not null,
  malzeme_id uuid references public.malzemeler(id) on delete restrict not null,
  miktar numeric(12,3) not null check (miktar > 0),
  tur text not null check (tur in ('giris', 'cikis')),
  birim_fiyat numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- 4. Trigger: odemeler değişince islemler.odenen_tutar güncelle
create or replace function public.sync_odenen_tutar()
returns trigger language plpgsql security definer as $$
declare
  v_islem_id uuid;
  v_sum numeric;
  v_tutar numeric;
begin
  v_islem_id := coalesce(new.islem_id, old.islem_id);

  select coalesce(sum(o.tutar), 0)
  into v_sum
  from public.odemeler o
  where o.islem_id = v_islem_id;

  select i.tutar into v_tutar
  from public.islemler i
  where i.id = v_islem_id;

  update public.islemler set
    odenen_tutar = v_sum,
    odeme_durumu = case
      when v_sum <= 0             then 'beklemede'
      when v_sum >= v_tutar       then 'odendi'
      else                             'kismi_odendi'
    end
  where id = v_islem_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists odemeler_sync on public.odemeler;
create trigger odemeler_sync
  after insert or update or delete on public.odemeler
  for each row execute function public.sync_odenen_tutar();

-- 5. Trigger: islem_stok değişince malzemeler.miktar güncelle
create or replace function public.sync_stok_miktari()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    if new.tur = 'giris' then
      update public.malzemeler set miktar = miktar + new.miktar, updated_at = now() where id = new.malzeme_id;
    else
      update public.malzemeler set miktar = greatest(0, miktar - new.miktar), updated_at = now() where id = new.malzeme_id;
    end if;
    return new;
  elsif TG_OP = 'DELETE' then
    if old.tur = 'giris' then
      update public.malzemeler set miktar = greatest(0, miktar - old.miktar), updated_at = now() where id = old.malzeme_id;
    else
      update public.malzemeler set miktar = miktar + old.miktar, updated_at = now() where id = old.malzeme_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists islem_stok_sync on public.islem_stok;
create trigger islem_stok_sync
  after insert or delete on public.islem_stok
  for each row execute function public.sync_stok_miktari();

-- 6. RLS politikaları
alter table public.odemeler enable row level security;
alter table public.islem_stok enable row level security;

-- odemeler
create policy "odemeler_select" on public.odemeler for select
  using (
    kullanici_id = auth.uid() or
    exists (select 1 from public.kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
  );
create policy "odemeler_insert" on public.odemeler for insert
  with check (auth.uid() is not null);
create policy "odemeler_delete" on public.odemeler for delete
  using (
    kullanici_id = auth.uid() or
    exists (select 1 from public.kullanicilar k where k.id = auth.uid() and k.rol = 'admin')
  );

-- islem_stok
create policy "islem_stok_select" on public.islem_stok for select
  using (auth.uid() is not null);
create policy "islem_stok_insert" on public.islem_stok for insert
  with check (auth.uid() is not null);
create policy "islem_stok_delete" on public.islem_stok for delete
  using (auth.uid() is not null);
