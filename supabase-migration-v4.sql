-- =====================================================
-- Migration v4: Otomatik kullanıcı kaydı + trigger
-- =====================================================

-- Yeni auth kullanıcısı oluştuğunda otomatik kullanicilar kaydı aç
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.kullanicilar (id, email, ad_soyad, rol, aktif)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'ad_soyad', split_part(new.email, '@', 1)),
    'calisan',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mevcut auth kullanıcıları için eksik kullanicilar kaydı oluştur
insert into public.kullanicilar (id, email, ad_soyad, rol, aktif)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'ad_soyad', split_part(u.email, '@', 1)),
  'calisan',
  true
from auth.users u
where not exists (select 1 from public.kullanicilar k where k.id = u.id)
on conflict (id) do nothing;
