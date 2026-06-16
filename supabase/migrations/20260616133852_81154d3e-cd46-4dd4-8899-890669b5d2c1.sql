
DO $$
DECLARE
  v_updated   integer := 0;
  v_suspect   integer := 0;
  v_row       record;
  v_digits    text;
  v_has_plus  boolean;
  v_new       text;
BEGIN
  -- Pass 1: normalize what we can confidently normalize.
  FOR v_row IN
    SELECT id, email, full_name, phone
      FROM public.profiles
     WHERE phone IS NOT NULL AND btrim(phone) <> ''
  LOOP
    v_has_plus := left(btrim(v_row.phone), 1) = '+';
    v_digits   := regexp_replace(v_row.phone, '[^0-9]', '', 'g');
    v_new      := NULL;

    IF length(v_digits) = 11 AND left(v_digits, 3) = '965' THEN
      v_new := '+' || v_digits;
    ELSIF length(v_digits) = 13 AND left(v_digits, 5) = '00965' THEN
      v_new := '+965' || right(v_digits, 8);
    ELSIF length(v_digits) = 8 AND NOT v_has_plus THEN
      v_new := '+965' || v_digits;
    END IF;

    IF v_new IS NOT NULL THEN
      IF v_new IS DISTINCT FROM v_row.phone THEN
        UPDATE public.profiles SET phone = v_new WHERE id = v_row.id;
        v_updated := v_updated + 1;
        RAISE NOTICE 'normalized: % (%) % -> %',
          v_row.full_name, v_row.email, v_row.phone, v_new;
      END IF;
    ELSE
      v_suspect := v_suspect + 1;
      RAISE NOTICE 'SUSPECT (left unchanged): % (%) phone=%',
        v_row.full_name, v_row.email, v_row.phone;
    END IF;
  END LOOP;

  RAISE NOTICE 'phone normalization complete: % rows updated, % rows left as suspect',
    v_updated, v_suspect;
END $$;
