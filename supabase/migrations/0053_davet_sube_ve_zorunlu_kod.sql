-- ===========================================================================
-- 0053 — Davet şube taşısın + davetsiz kayıt tümüyle reddedilsin
-- ===========================================================================
-- NASIL ÇIKTI
--   Kullanıcı, PWA canlıya alındıktan sonra: "hesap oluştur kısmı sıkıntılı
--   olmuş, sadece kulüp davet kodu olan veliler o hesabı oluşturabilsin" ve
--   "antrenörler için de kulüp davet kodu olsun, şubelere dağıtabilsin
--   antrenörleri".
--
--   ÖLÇÜLDÜ — antrenör davet kodu ZATEN VARDI: davet.rol kısıtı
--   ('veli','antrenor','muhasebeci','yonetici') dördünü de kabul ediyor ve
--   panelin davet formunda rol seçici mevcut. Eksik olan iki şey vardı:
--     1) davet SATIRINDA şube yok → antrenör davet edilirken şubeye
--        atanamıyordu; profiles.sube_id kolonu var ama hiçbir yerde yazılmıyordu.
--     2) Kayıt ekranında davet kodu ZORUNLU DEĞİLDİ.
--
-- BU DOSYA İKİSİNİ DE ÇÖZÜYOR.
--
-- ---------------------------------------------------------------------------
-- 1) davet.sube_id
-- ---------------------------------------------------------------------------
-- Bileşik FK (sube_id, kulup_id) → sube(id, kulup_id): bir kulübün daveti
-- BAŞKA kulübün şubesine işaret edemesin. Basit FK yazılsaydı, A kulübünün
-- yöneticisi B kulübünün şube kimliğini geçirebilir ve antrenör yanlış kiracının
-- şubesine bağlanabilirdi.
--
-- ⚠ `on delete set null (sube_id)` — KOLON LİSTESİ ŞART.
--   Kolon listesi olmadan yazılan bileşik SET NULL, kulup_id'yi de NULL yapar;
--   kulup_id NOT NULL olduğu için şube silme işlemi tümden patlar. 0039'da tam
--   olarak bu yaşandı ve ölçülerek yakalandı.
alter table public.davet
  add column if not exists sube_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'davet_sube_kulup_fkey' and conrelid = 'public.davet'::regclass
  ) then
    alter table public.davet
      add constraint davet_sube_kulup_fkey
      foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
      on delete set null (sube_id);
  end if;
end $$;

create index if not exists davet_sube_idx on public.davet (sube_id) where sube_id is not null;

comment on column public.davet.sube_id is
  '0053: davet edilen kişinin atanacağı şube. Kayıt anında profiles.sube_id''ye '
  'yazılıyor. Bileşik FK ile başka kulübün şubesi seçilemiyor.';


-- ---------------------------------------------------------------------------
-- 2) handle_new_user — şubeyi yaz, davetsiz kaydı REDDET
-- ---------------------------------------------------------------------------
-- ⚠ 0052 davetsiz kaydı "kulübe bağlama ama kabul et" yapmıştı; bu, IBAN
--   sızıntısını kapatıyordu ama auth.users'da işe yaramaz hesaplar birikiyordu
--   ve kullanıcı bunu istemedi. Artık davetsiz kayıt AÇIKÇA reddediliyor.
--
-- ⚠ BOOTSTRAP NASIL KORUNUYOR — BU DOSYANIN EN KRİTİK YERİ
--   Platform sahibinin ve bir kulübün ilk yöneticisinin hesabı Supabase
--   panelinden ya da SQL ile açılıyor, SONRA 04/05 dosyalarıyla
--   yetkilendiriliyor. Kayıt koşulsuz reddedilseydi o ilk hesap hiç açılamaz ve
--   SİSTEM KURULAMAZ hâle gelirdi.
--
--   Ayrım `session_user` ile yapılıyor, `current_user` ile DEĞİL:
--   bu fonksiyon SECURITY DEFINER ve içinde `current_user` ÇAĞIRANI DEĞİL
--   SAHİBİ (postgres) verir — 0036'da bu tuzağa düşülmüştü. `session_user`
--   ise SECURITY DEFINER'dan etkilenmez, oturumu gerçekten açan rolü verir:
--     · GoTrue üzerinden kayıt (uygulama)     → supabase_auth_admin
--     · SQL Editor / migration (kurulum)      → postgres / supabase_admin
--   Yani uygulamadan davetsiz kayıt reddediliyor, kurulum yolu açık kalıyor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token  text;
  v_ad     text;
  v_kulup  uuid;
  v_rol    app_role;
  v_sporcu uuid;
  v_sube   uuid;
  v_satir  int;
begin
  v_ad    := coalesce(new.raw_user_meta_data ->> 'ad', '');
  v_token := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'davet_token', '')), '');

  -- --- (a) DAVETLİ KAYIT ------------------------------------------------
  if v_token is not null then
    select c.kulup_id, c.rol, c.sporcu_id
      into v_kulup, v_rol, v_sporcu
      from private.davet_coz(v_token, new.email) c;

    if v_kulup is null then
      raise exception 'Davet linki geçersiz, süresi dolmuş, daha önce kullanılmış veya başka bir e-posta adresine düzenlenmiş.';
    end if;

    -- Şube davet satırından okunuyor. davet_coz'a eklenmedi çünkü o fonksiyon
    -- OTURUMSUZ çağrılabiliyor (private şemada, token doğrulama amaçlı) ve
    -- döndürdüğü her alan token'ı eline geçiren birine sızar. Şube kimliği
    -- kayıt anında, token zaten doğrulandıktan SONRA okunuyor.
    select d.sube_id into v_sube from public.davet d where d.token = v_token;

    insert into public.profiles (id, role, ad, kulup_id, sube_id)
    values (new.id, v_rol, v_ad, v_kulup, v_sube);

    update public.davet
       set kullanildi_at = now(),
           kullanan_id   = new.id
     where token = v_token
       and kullanildi_at is null
       and son_kullanma  > now();

    get diagnostics v_satir = row_count;
    if v_satir <> 1 then
      raise exception 'Davet linki az önce başka bir kayıtta kullanıldı. Kulüp yöneticinizden yeni bir davet isteyin.';
    end if;

    if v_sporcu is not null then
      insert into public.veli_sporcu (veli_id, sporcu_id, kulup_id)
      values (new.id, v_sporcu, v_kulup)
      on conflict do nothing;
    end if;

    return new;
  end if;

  -- --- (b) DAVETSİZ KAYIT ------------------------------------------------
  -- Uygulamadan geliyorsa reddet; kurulum yolundan geliyorsa kulüpsüz aç.
  if session_user in ('postgres', 'supabase_admin') then
    insert into public.profiles (id, role, ad, kulup_id)
    values (new.id, 'veli', v_ad, null);
    raise notice 'Kurulum kaydı: % kulüpsüz açıldı (04/05 ile yetkilendirilecek).', new.email;
    return new;
  end if;

  raise exception 'Hesap oluşturmak için kulübünüzden aldığınız davet kodu gerekli. Kodunuz yoksa kulüp yöneticinizle görüşün.';
end;
$$;

comment on function public.handle_new_user() is
  '0053: davetsiz kayıt uygulamadan REDDEDİLİYOR (session_user ile ayrım; '
  'kurulum yolu açık). Davetli kayıt şubeyi de profiles.sube_id''ye yazıyor.';


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare v_govde text; v_fk int;
begin
  select prosrc into v_govde from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_new_user';

  if position('session_user in' in v_govde) = 0 then
    raise exception '0053: session_user ayrımı gövdede yok — bootstrap kırılır.';
  end if;
  if position('sube_id' in v_govde) = 0 then
    raise exception '0053: şube ataması gövdede yok.';
  end if;

  -- Bileşik FK kolon listesiyle mi yazılmış? Yazılmamışsa şube silme patlar.
  select count(*) into v_fk from pg_constraint
   where conname = 'davet_sube_kulup_fkey'
     and confdeltype = 'n'
     and array_length(confdelsetcols, 1) = 1;

  if v_fk <> 1 then
    raise exception '0053: davet_sube_kulup_fkey kolon listeli SET NULL değil — şube silinemez hale gelir.';
  end if;

  raise notice '0053 doğrulandı: davet şube taşıyor, davetsiz kayıt reddediliyor, bootstrap açık.';
end $$;
