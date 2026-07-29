-- 0016: Güvenlik yamaları — kapsamlı denetim (2026-07-29) bulgularının DB tarafı.
-- Bu dosya 0003_protect_profile_role.sql'in içeriğini de KAPSAR (0003 canlıda hiç
-- çalıştırılmamıştı) — yalnızca bu dosyayı çalıştırmak yeterli, 0003'e geri dönme.

-- ---------------------------------------------------------------------------
-- 0) Ön koşul: private şeması 0006'da yalnızca 'create schema' ile oluşturulmuştu,
--    USAGE izni hiç verilmemişti. Mevcut RLS politikaları fonksiyona OID ile
--    bağlandığı için bugüne dek sorun çıkmadı; ama aşağıdaki SECURITY INVOKER
--    trigger'lar (4 ve 7) isim çözümlemesini ÇAĞIRANIN yetkileriyle runtime'da
--    yapar — USAGE olmadan her authenticated UPDATE 'permission denied for
--    schema private' hatasıyla patlardı.

grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) profiles: rol yükseltme koruması (0003'ün güncellenmiş hali).
--    0001'deki UPDATE politikasında WITH CHECK yoktu ve role sütununu koruyan
--    trigger hiç kurulmamıştı — her kullanıcı kendi satırında role='yonetici'
--    yazabiliyordu. Trigger bilinçli olarak SECURITY INVOKER: current_user,
--    isteği yapan gerçek DB rolüdür — son kullanıcı (authenticated) kısıtlanır;
--    SQL Editor (postgres) ve service_role (admin-panel davet akışı) serbest
--    kalır, yani test için rol flip'lerken trigger disable etmek artık gerekmez.

drop policy if exists "profiles: kullanıcı kendi profilini günceller" on profiles;
create policy "profiles: kullanıcı kendi profilini günceller"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if new.role is distinct from old.role then
      raise exception 'role alanı bu şekilde değiştirilemez';
    end if;
    if new.sube_id is distinct from old.sube_id then
      raise exception 'sube_id alanı bu şekilde değiştirilemez';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_role_protect on public.profiles;
create trigger on_profile_role_protect
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- 2) handle_new_user: rol artık istemci kontrollü user_metadata'dan OKUNMUYOR.
--    Eski hali coalesce(metadata.role, 'veli') idi — register ekranı 'veli'
--    sabitlese de doğrudan /auth/v1/signup çağrısına data:{role:'yonetici'}
--    koyan herkes yönetici hesabı açabiliyordu. Self-signup HER ZAMAN 'veli';
--    antrenör/yönetici/muhasebeci rolleri yalnızca admin-panel davet route'ları
--    tarafından atanır (service_role ile davet sonrası profiles.role update'i —
--    1 no'lu trigger service_role'ü engellemez).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, ad)
  values (new.id, 'veli', coalesce(new.raw_user_meta_data ->> 'ad', ''));
  return new;
end;
$$;

-- 0002'deki sertleştirmeyi (idempotent) tazele:
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- ---------------------------------------------------------------------------
-- 3) etkinlik: SELECT politikalarındaki `grup_id is null` dalı auth kontrolü
--    içermiyordu — girişsiz, yalnızca anon key ile
--    GET /rest/v1/etkinlik?grup_id=is.null tüm genel etkinlikleri döndürüyordu.

drop policy if exists "etkinlik: antrenör kendi grubunu görür" on etkinlik;
create policy "etkinlik: antrenör kendi grubunu görür" on etkinlik for select
  using (
    auth.uid() is not null
    and (
      grup_id is null
      or exists (
        select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
        where s.grup_id = etkinlik.grup_id and sa.antrenor_id = auth.uid()
      )
    )
  );

drop policy if exists "etkinlik: veli kendi grubunu görür" on etkinlik;
create policy "etkinlik: veli kendi grubunu görür" on etkinlik for select
  using (
    auth.uid() is not null
    and (
      grup_id is null
      or exists (
        select 1 from sporcular s join veli_sporcu vs on vs.sporcu_id = s.id
        where s.grup_id = etkinlik.grup_id and vs.veli_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) bireysel_paket: veli UPDATE politikası yalnızca sahipliğe bakıyordu — veli
--    kalan=999 yazarak sınırsız ders hakkı üretebilirdi. Yönetici dışındaki
--    kullanıcılar için tek izinli değişiklik: kalan'ın tam 1 azalması
--    (rezervasyon anındaki düşüm, bkz. bireyselRepo.rezervasyonOlustur).

-- Not: ileride "antrenör reddetti → ders hakkı iade" akışı eklenirse trigger'a
-- kontrollü bir kalan+1 istisnası gerekecek — bugün uygulamada iade akışı yok.
create or replace function public.protect_bireysel_paket()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and coalesce(private.current_profile_role()::text, '') <> 'yonetici' then
    if new.id         is distinct from old.id
       or new.antrenor_id is distinct from old.antrenor_id
       or new.sporcu_id   is distinct from old.sporcu_id
       or new.toplam      is distinct from old.toplam
       or new.tutar       is distinct from old.tutar
       or new.created_at  is distinct from old.created_at
       or new.kalan       is distinct from old.kalan - 1 then
      raise exception 'paket yalnızca 1 ders düşülerek güncellenebilir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_bireysel_paket_protect on public.bireysel_paket;
create trigger on_bireysel_paket_protect
  before update on public.bireysel_paket
  for each row execute procedure public.protect_bireysel_paket();

-- ---------------------------------------------------------------------------
-- 5) konusma: UPDATE WITH CHECK karşı tarafı sabitlemiyordu — veli/antrenör,
--    kendi thread'inin karşı tarafını (antrenor_id/veli_id) herhangi bir
--    kullanıcıyla değiştirip istenmeyen mesaj kanalı açabilirdi. Meşru istemci
--    güncellemeleri yalnızca son_mesaj*/okundu* alanları (bkz. mesajRepo.ts).

create or replace function public.protect_konusma_taraflar()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if new.veli_id is distinct from old.veli_id
       or new.antrenor_id is distinct from old.antrenor_id then
      raise exception 'konuşmanın tarafları değiştirilemez';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_konusma_taraflar_protect on public.konusma;
create trigger on_konusma_taraflar_protect
  before update on public.konusma
  for each row execute procedure public.protect_konusma_taraflar();

-- ---------------------------------------------------------------------------
-- 6) yoklama: veli izin INSERT'inde antrenman↔sporcu grup eşleşmesi yoktu —
--    veli, çocuğunun grubuna ait olmayan herhangi bir antrenmana satır
--    ekleyip yabancı grupların yoklama listesini kirletebiliyordu.

drop policy if exists "yoklama: veli kendi sporcusu için izin bildirir (ekler)" on yoklama;
create policy "yoklama: veli kendi sporcusu için izin bildirir (ekler)" on yoklama for insert
  with check (
    durum is null
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid())
    and exists (
      select 1 from antrenman a join sporcular s on s.grup_id = a.grup_id
      where a.id = yoklama.antrenman_id and s.id = yoklama.sporcu_id
    )
  );

-- ---------------------------------------------------------------------------
-- 7) bireysel_rezervasyon: antrenörün UPDATE'i WITH CHECK'te yalnızca sahipliğe
--    bakıyordu — durum değiştirirken tutar/sporcu/paket de değiştirilebilir,
--    hakediş/ciro şişirilebilirdi. Politika izinli hedef durumlara daraltıldı +
--    kolon donduran trigger eklendi (veli 'iptal' politikası zaten dar; trigger
--    her iki rolü de kapsıyor — yönetici serbest).

drop policy if exists "bireysel_rezervasyon: antrenör onaylar/reddeder/sonuçlandırır" on bireysel_rezervasyon;
create policy "bireysel_rezervasyon: antrenör onaylar/reddeder/sonuçlandırır" on bireysel_rezervasyon for update
  using (antrenor_id = auth.uid() and durum in ('onay_bekliyor', 'onaylandi'))
  with check (antrenor_id = auth.uid() and durum in ('onaylandi', 'reddedildi', 'tamamlandi', 'gelmedi'));

create or replace function public.protect_bireysel_rezervasyon()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and coalesce(private.current_profile_role()::text, '') <> 'yonetici' then
    if new.id         is distinct from old.id
       or new.antrenor_id is distinct from old.antrenor_id
       or new.sporcu_id   is distinct from old.sporcu_id
       or new.paket_id    is distinct from old.paket_id
       or new.tutar       is distinct from old.tutar
       or new.odeme_tipi  is distinct from old.odeme_tipi
       or new.odeme_notu  is distinct from old.odeme_notu
       or new.tarih       is distinct from old.tarih
       or new.saat        is distinct from old.saat
       or new.sure_dk     is distinct from old.sure_dk
       or new.tesis       is distinct from old.tesis
       or new.created_at  is distinct from old.created_at then
      raise exception 'rezervasyonda yalnızca durum/sonuç alanları güncellenebilir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_bireysel_rezervasyon_protect on public.bireysel_rezervasyon;
create trigger on_bireysel_rezervasyon_protect
  before update on public.bireysel_rezervasyon
  for each row execute procedure public.protect_bireysel_rezervasyon();

-- ---------------------------------------------------------------------------
-- Doğrulama (migration'dan sonra elle çalıştırılabilir):
--   select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--     → on_profile_role_protect görünmeli.
--   Kendi hesabınla (authenticated) PATCH /rest/v1/profiles?id=eq.<uid> {"role":"yonetici"}
--     → 'role alanı bu şekilde değiştirilemez' hatası dönmeli.
--   Authorization header'ı OLMADAN (yalnızca apikey) GET /rest/v1/etkinlik?grup_id=is.null
--     → artık VERİ DÖNMEMELİ. (Boş dizi değil, büyük olasılıkla 'permission denied for
--       function current_profile_role' hatası dönecek — 0009'daki yönetici politikası
--       anon için değerlendirilmeye çalışılınca. İkisi de güvenli sonuçtur; kritik olan
--       eskisi gibi etkinlik satırlarının dönmemesi.)
