-- ============================================================
-- Phase 2A.10 - Material Code Standard v1
-- ============================================================
-- Scope:
--   * Add standardized Material Code config and history.
--   * Generate CATEGORY-TYPE-SPEC-SEQ codes safely.
--   * Keep existing mat_master.material_id unchanged.
--   * Do not rewrite BOM/BOQ references or BOQ price snapshots.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Category prefixes
-- ------------------------------------------------------------

ALTER TABLE public.mat_category
  ADD COLUMN IF NOT EXISTS code_prefix text;

CREATE OR REPLACE FUNCTION public.fn_material_code_sanitize_part(
  p_value text,
  p_fallback text DEFAULT 'GEN',
  p_max_len integer DEFAULT 12
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_value text;
  v_fallback text;
BEGIN
  v_value := regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9]', '', 'g');
  v_fallback := regexp_replace(upper(coalesce(p_fallback, 'GEN')), '[^A-Z0-9]', '', 'g');

  IF v_value = '' THEN
    v_value := nullif(v_fallback, '');
  END IF;

  IF v_value IS NULL OR v_value = '' THEN
    v_value := 'GEN';
  END IF;

  RETURN left(v_value, greatest(1, coalesce(p_max_len, 12)));
END;
$$;

UPDATE public.mat_category
SET code_prefix = left(public.fn_material_code_sanitize_part(
  CASE
    WHEN nullif(trim(code_prefix), '') IS NOT NULL THEN code_prefix
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(WOOD|BOARD|MDF|HMR|PLY|ไม้อัด|ไม้)' THEN 'WD'
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(LAM|LAMINATE|HPL|ผิว|ลามิ)' THEN 'LAM'
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(PAINT|CHEM|สี|เคมี)' THEN 'PT'
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(ELE|LIGHT|ไฟ|ไฟฟ้า)' THEN 'ELE'
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(HARDWARE|HINGE|SCREW|อุปกรณ์|บานพับ)' THEN 'HW'
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(METAL|STEEL|เหล็ก|โลหะ)' THEN 'MT'
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(PRINT|VINYL|GRAPHIC|พิมพ์|ป้าย)' THEN 'PRN'
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(ACRYLIC|GLASS|อะคริล|กระจก)' THEN 'ACR'
    WHEN upper(coalesce(cat_code, '') || ' ' || coalesce(cat_name_en, '') || ' ' || coalesce(cat_name_th, '')) ~ '(ADH|GLUE|TAPE|SILICONE|กาว|เทป|ซีล)' THEN 'ADH'
    ELSE coalesce(cat_code, cat_id, 'MISC')
  END,
  'MISC',
  5
), 5)
WHERE nullif(trim(code_prefix), '') IS NULL
   OR code_prefix !~ '^[A-Z0-9]{2,5}$';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mat_category_code_prefix_v1_check'
  ) THEN
    ALTER TABLE public.mat_category
      ADD CONSTRAINT mat_category_code_prefix_v1_check
      CHECK (code_prefix IS NULL OR code_prefix ~ '^[A-Z0-9]{2,5}$')
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mat_category_code_prefix_v1
  ON public.mat_category(code_prefix);

-- Optional seed categories for standard prefixes if the database has no
-- matching active category yet. Existing categories are never renamed.
WITH standard_category_seed(code_prefix, cat_code, cat_name_th, cat_name_en, sort_order) AS (
  VALUES
    ('WD', 'WD', 'Wood / Board', 'Wood / Board', 100),
    ('LAM', 'LAM', 'Laminate / Surface Finish', 'Laminate / Surface Finish', 110),
    ('PT', 'PT', 'Paint / Chemical', 'Paint / Chemical', 120),
    ('ELE', 'ELE', 'Electrical', 'Electrical', 130),
    ('HW', 'HW', 'Hardware', 'Hardware', 140),
    ('MT', 'MT', 'Metal', 'Metal', 150),
    ('PRN', 'PRN', 'Print / Graphic', 'Print / Graphic', 160),
    ('ACR', 'ACR', 'Acrylic / Glass', 'Acrylic / Glass', 170),
    ('ADH', 'ADH', 'Adhesive / Tape / Sealant', 'Adhesive / Tape / Sealant', 180),
    ('MISC', 'MISC', 'Miscellaneous', 'Miscellaneous', 999)
),
current_max AS (
  SELECT coalesce(max(nullif(regexp_replace(cat_id, '\D', '', 'g'), '')::integer), 0) AS max_no
  FROM public.mat_category
),
missing AS (
  SELECT
    s.*,
    row_number() OVER (ORDER BY s.sort_order) AS rn,
    current_max.max_no
  FROM standard_category_seed s
  CROSS JOIN current_max
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.mat_category c
    WHERE coalesce(c.is_deleted, false) = false
      AND (
        c.code_prefix = s.code_prefix
        OR upper(trim(c.cat_code)) = s.cat_code
      )
  )
)
INSERT INTO public.mat_category (
  cat_id,
  cat_code,
  cat_name_th,
  cat_name_en,
  code_prefix,
  is_active,
  sort_order
)
SELECT
  'C' || lpad((max_no + rn)::text, 2, '0'),
  cat_code,
  cat_name_th,
  cat_name_en,
  code_prefix,
  true,
  sort_order
FROM missing;

-- ------------------------------------------------------------
-- Material types
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.material_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.mat_category(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code_prefix text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_types_code_prefix_v1_check CHECK (code_prefix ~ '^[A-Z0-9]{2,8}$'),
  CONSTRAINT material_types_unique_category_prefix UNIQUE (category_id, code_prefix)
);

CREATE INDEX IF NOT EXISTS idx_material_types_category_id_v1
  ON public.material_types(category_id);

CREATE INDEX IF NOT EXISTS idx_material_types_code_prefix_v1
  ON public.material_types(code_prefix);

WITH type_seed(category_prefix, type_prefix, type_name) AS (
  VALUES
    ('WD', 'HMR', 'HMR board'),
    ('WD', 'MDF', 'MDF board'),
    ('WD', 'PLY', 'Plywood'),
    ('WD', 'PB', 'Particle board'),
    ('WD', 'OSB', 'OSB board'),
    ('LAM', 'HPL', 'High pressure laminate'),
    ('LAM', 'EDG', 'Edge banding'),
    ('LAM', 'FILM', 'Film'),
    ('LAM', 'MEL', 'Melamine'),
    ('LAM', 'WALL', 'Wall finish'),
    ('PT', 'ACR', 'Acrylic paint'),
    ('PT', 'OIL', 'Oil paint'),
    ('PT', 'SPR', 'Spray paint'),
    ('PT', 'PRM', 'Primer'),
    ('PT', 'THN', 'Thinner'),
    ('PT', 'PUT', 'Putty'),
    ('ELE', 'SPOT', 'Spot light'),
    ('ELE', 'STRIP', 'LED strip'),
    ('ELE', 'PSU', 'Power supply'),
    ('ELE', 'WIRE', 'Wire'),
    ('ELE', 'PLUG', 'Plug'),
    ('ELE', 'SW', 'Switch'),
    ('HW', 'HINGE', 'Hinge'),
    ('HW', 'HANDLE', 'Handle'),
    ('HW', 'SCREW', 'Screw'),
    ('HW', 'LOCK', 'Lock'),
    ('HW', 'RUNNER', 'Runner'),
    ('HW', 'BRKT', 'Bracket'),
    ('MT', 'BOX', 'Box tube'),
    ('MT', 'PLATE', 'Plate'),
    ('MT', 'ANGLE', 'Angle'),
    ('PRN', 'VIN', 'Vinyl print'),
    ('PRN', 'STK', 'Sticker'),
    ('ACR', 'ACR', 'Acrylic sheet'),
    ('ACR', 'GLS', 'Glass'),
    ('ADH', 'SIL', 'Silicone'),
    ('ADH', 'TAPE', 'Tape'),
    ('ADH', 'GLUE', 'Glue'),
    ('MISC', 'GEN', 'General')
)
INSERT INTO public.material_types (category_id, name, code_prefix, description)
SELECT c.id, s.type_name, s.type_prefix, 'Seeded by material code standard v1'
FROM public.mat_category c
JOIN type_seed s ON s.category_prefix = c.code_prefix
ON CONFLICT (category_id, code_prefix) DO NOTHING;

-- ------------------------------------------------------------
-- Material code sequencing and metadata
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.material_code_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_prefix text NOT NULL,
  type_prefix text NOT NULL,
  spec_key text NOT NULL,
  last_no integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_code_sequences_prefix_v1_check CHECK (
    category_prefix ~ '^[A-Z0-9]{2,5}$'
    AND type_prefix ~ '^[A-Z0-9]{2,8}$'
    AND spec_key ~ '^[A-Z0-9]{2,12}$'
    AND last_no >= 0
  ),
  CONSTRAINT material_code_sequences_unique_group UNIQUE (category_prefix, type_prefix, spec_key)
);

CREATE INDEX IF NOT EXISTS idx_material_code_sequences_group_v1
  ON public.material_code_sequences(category_prefix, type_prefix, spec_key);

ALTER TABLE public.mat_master
  ADD COLUMN IF NOT EXISTS material_type_id uuid,
  ADD COLUMN IF NOT EXISTS code_spec_key text,
  ADD COLUMN IF NOT EXISTS code_locked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS code_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_rule_version text NOT NULL DEFAULT 'v1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mat_master_material_type_id_v1_fkey'
  ) THEN
    ALTER TABLE public.mat_master
      ADD CONSTRAINT mat_master_material_type_id_v1_fkey
      FOREIGN KEY (material_type_id) REFERENCES public.material_types(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mat_master_material_code_standard_v1_check'
  ) THEN
    ALTER TABLE public.mat_master
      ADD CONSTRAINT mat_master_material_code_standard_v1_check
      CHECK (
        material_code IS NULL
        OR material_code ~ '^[A-Z0-9]{2,5}-[A-Z0-9]{2,8}-[A-Z0-9]{2,12}-[0-9]{4}$'
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mat_master_code_spec_key_v1_check'
  ) THEN
    ALTER TABLE public.mat_master
      ADD CONSTRAINT mat_master_code_spec_key_v1_check
      CHECK (code_spec_key IS NULL OR code_spec_key ~ '^[A-Z0-9]{2,12}$')
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mat_master_material_type_id_v1
  ON public.mat_master(material_type_id);

CREATE INDEX IF NOT EXISTS idx_mat_master_code_spec_key_v1
  ON public.mat_master(code_spec_key);

DO $$
DECLARE
  v_duplicate_count integer;
BEGIN
  SELECT count(*)
  INTO v_duplicate_count
  FROM (
    SELECT upper(trim(material_code))
    FROM public.mat_master
    WHERE coalesce(is_deleted, false) = false
      AND nullif(trim(material_code), '') IS NOT NULL
    GROUP BY upper(trim(material_code))
    HAVING count(*) > 1
  ) duplicates;

  IF v_duplicate_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mat_master_material_code_active_v1
      ON public.mat_master(upper(trim(material_code)))
      WHERE coalesce(is_deleted, false) = false
        AND nullif(trim(material_code), '') IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped uq_mat_master_material_code_active_v1 because duplicate active material_code values exist.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.material_code_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id text NOT NULL,
  old_code text,
  new_code text NOT NULL,
  change_reason text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_code_history_reason_check CHECK (length(trim(change_reason)) > 0)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'mat_master'
      AND c.contype IN ('p', 'u')
      AND c.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.mat_master'::regclass AND attname = 'material_id')
      ]::smallint[]
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'material_code_history_material_fk'
  ) THEN
    ALTER TABLE public.material_code_history
      ADD CONSTRAINT material_code_history_material_fk
      FOREIGN KEY (material_id) REFERENCES public.mat_master(material_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_material_code_history_material_id_v1
  ON public.material_code_history(material_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_code_history_old_code_v1
  ON public.material_code_history(old_code);

CREATE INDEX IF NOT EXISTS idx_material_code_history_new_code_v1
  ON public.material_code_history(new_code);

-- Ensure aliases can store old material codes safely.
ALTER TABLE public.mat_alias
  ADD COLUMN IF NOT EXISTS normalized_alias text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS material_uuid uuid,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Initialize sequence groups from active standard codes already in the system.
WITH standard_codes AS (
  SELECT regexp_match(material_code, '^([A-Z0-9]{2,5})-([A-Z0-9]{2,8})-([A-Z0-9]{2,12})-([0-9]{4})$') AS parts
  FROM public.mat_master
  WHERE material_code ~ '^[A-Z0-9]{2,5}-[A-Z0-9]{2,8}-[A-Z0-9]{2,12}-[0-9]{4}$'
    AND coalesce(is_deleted, false) = false
)
INSERT INTO public.material_code_sequences (category_prefix, type_prefix, spec_key, last_no)
SELECT parts[1], parts[2], parts[3], max((parts[4])::integer)
FROM standard_codes
WHERE parts IS NOT NULL
GROUP BY parts[1], parts[2], parts[3]
ON CONFLICT (category_prefix, type_prefix, spec_key)
DO UPDATE SET
  last_no = greatest(public.material_code_sequences.last_no, excluded.last_no),
  updated_at = now();

-- ------------------------------------------------------------
-- Code generation functions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_material_code_preview_v1(
  p_category_prefix text,
  p_type_prefix text,
  p_spec_key text DEFAULT 'GEN'
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_category_prefix text;
  v_type_prefix text;
  v_spec_key text;
  v_next_no integer;
BEGIN
  v_category_prefix := public.fn_material_code_sanitize_part(p_category_prefix, 'MISC', 5);
  v_type_prefix := public.fn_material_code_sanitize_part(p_type_prefix, 'GEN', 8);
  v_spec_key := public.fn_material_code_sanitize_part(p_spec_key, 'GEN', 12);

  IF length(v_category_prefix) < 2 THEN v_category_prefix := 'MISC'; END IF;
  IF length(v_type_prefix) < 2 THEN v_type_prefix := 'GEN'; END IF;
  IF length(v_spec_key) < 2 THEN v_spec_key := 'GEN'; END IF;

  SELECT coalesce(last_no, 0) + 1
  INTO v_next_no
  FROM public.material_code_sequences
  WHERE category_prefix = v_category_prefix
    AND type_prefix = v_type_prefix
    AND spec_key = v_spec_key;

  RETURN v_category_prefix || '-' || v_type_prefix || '-' || v_spec_key || '-' || lpad(coalesce(v_next_no, 1)::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_generate_material_code_v1(
  p_category_prefix text,
  p_type_prefix text,
  p_spec_key text DEFAULT 'GEN'
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_category_prefix text;
  v_type_prefix text;
  v_spec_key text;
  v_next_no integer;
BEGIN
  v_category_prefix := public.fn_material_code_sanitize_part(p_category_prefix, 'MISC', 5);
  v_type_prefix := public.fn_material_code_sanitize_part(p_type_prefix, 'GEN', 8);
  v_spec_key := public.fn_material_code_sanitize_part(p_spec_key, 'GEN', 12);

  IF length(v_category_prefix) < 2 THEN v_category_prefix := 'MISC'; END IF;
  IF length(v_type_prefix) < 2 THEN v_type_prefix := 'GEN'; END IF;
  IF length(v_spec_key) < 2 THEN v_spec_key := 'GEN'; END IF;

  INSERT INTO public.material_code_sequences (
    category_prefix,
    type_prefix,
    spec_key,
    last_no
  )
  VALUES (
    v_category_prefix,
    v_type_prefix,
    v_spec_key,
    1
  )
  ON CONFLICT (category_prefix, type_prefix, spec_key)
  DO UPDATE SET
    last_no = public.material_code_sequences.last_no + 1,
    updated_at = now()
  RETURNING last_no INTO v_next_no;

  RETURN v_category_prefix || '-' || v_type_prefix || '-' || v_spec_key || '-' || lpad(v_next_no::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_apply_material_code_change_v1(
  p_material_id text,
  p_material_type_id uuid,
  p_code_spec_key text DEFAULT 'GEN',
  p_change_reason text DEFAULT NULL,
  p_changed_by uuid DEFAULT auth.uid()
)
RETURNS TABLE(old_code text, new_code text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_material record;
  v_category_prefix text;
  v_type_prefix text;
  v_spec_key text;
  v_new_code text;
  v_try integer;
  v_alias_id text;
BEGIN
  IF nullif(trim(coalesce(p_change_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Code change reason is required.';
  END IF;

  SELECT
    m.material_id,
    m.id AS material_uuid,
    m.material_code,
    m.mat_name_th,
    mt.id AS material_type_id,
    mt.code_prefix AS type_prefix,
    c.id AS category_uuid,
    c.cat_id AS cat_id,
    c.code_prefix AS category_prefix
  INTO v_material
  FROM public.mat_master m
  JOIN public.material_types mt ON mt.id = p_material_type_id
  JOIN public.mat_category c ON c.id = mt.category_id
  WHERE m.material_id = p_material_id
    AND coalesce(m.is_deleted, false) = false
  FOR UPDATE OF m;

  IF v_material.material_id IS NULL THEN
    RAISE EXCEPTION 'Material or material type not found.';
  END IF;

  v_category_prefix := public.fn_material_code_sanitize_part(v_material.category_prefix, 'MISC', 5);
  v_type_prefix := public.fn_material_code_sanitize_part(v_material.type_prefix, 'GEN', 8);
  v_spec_key := public.fn_material_code_sanitize_part(p_code_spec_key, 'GEN', 12);

  IF length(v_category_prefix) < 2 THEN v_category_prefix := 'MISC'; END IF;
  IF length(v_type_prefix) < 2 THEN v_type_prefix := 'GEN'; END IF;
  IF length(v_spec_key) < 2 THEN v_spec_key := 'GEN'; END IF;

  FOR v_try IN 1..25 LOOP
    v_new_code := public.fn_generate_material_code_v1(v_category_prefix, v_type_prefix, v_spec_key);
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.mat_master m
      WHERE m.material_code = v_new_code
        AND m.material_id <> p_material_id
        AND coalesce(m.is_deleted, false) = false
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.mat_master m
    WHERE m.material_code = v_new_code
      AND m.material_id <> p_material_id
      AND coalesce(m.is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'Generated material code conflicts with an existing material.';
  END IF;

  old_code := v_material.material_code;
  new_code := v_new_code;

  UPDATE public.mat_master
  SET
    material_code = v_new_code,
    material_type_id = p_material_type_id,
    cat_id = v_material.cat_id,
    category_id = v_material.category_uuid,
    code_spec_key = v_spec_key,
    code_locked = true,
    code_generated_at = now(),
    code_rule_version = 'v1',
    normalized_name = regexp_replace(
      lower(trim(concat_ws(' ', v_new_code, mat_name_th, mat_name_en, brand, model, spec))),
      '\s+',
      ' ',
      'g'
    ),
    updated_at = now()
  WHERE material_id = p_material_id
    AND coalesce(is_deleted, false) = false;

  INSERT INTO public.material_code_history (
    material_id,
    old_code,
    new_code,
    change_reason,
    changed_by
  )
  VALUES (
    p_material_id,
    old_code,
    new_code,
    trim(p_change_reason),
    p_changed_by
  );

  IF nullif(trim(coalesce(old_code, '')), '') IS NOT NULL
     AND old_code IS DISTINCT FROM new_code
     AND NOT EXISTS (
      SELECT 1
      FROM public.mat_alias a
      WHERE a.material_id = p_material_id
        AND coalesce(a.is_deleted, false) = false
        AND lower(trim(coalesce(a.normalized_alias, a.alias_name))) = lower(trim(old_code))
     ) THEN
    v_alias_id := 'ALI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    INSERT INTO public.mat_alias (
      alias_id,
      material_id,
      material_uuid,
      alias_name,
      normalized_alias,
      alias_type,
      lang,
      note
    )
    VALUES (
      v_alias_id,
      p_material_id,
      v_material.material_uuid,
      old_code,
      lower(trim(old_code)),
      'COMMON',
      'EN',
      'Old material code kept for search after Material Code Standard v1 migration.'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.mat_audit_log (
    entity_type,
    entity_key,
    action,
    payload,
    created_by
  )
  VALUES (
    'mat_master',
    p_material_id,
    'UPDATE',
    jsonb_build_object(
      'kind', 'material_code_change',
      'old_code', old_code,
      'new_code', new_code,
      'change_reason', trim(p_change_reason)
    ),
    coalesce(p_changed_by::text, 'system')
  )
  ON CONFLICT DO NOTHING;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_apply_material_code_cleanup_v1(
  p_items jsonb,
  p_changed_by uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_item jsonb;
  v_old_code text;
  v_new_code text;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Cleanup items must be a JSON array.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF nullif(trim(coalesce(v_item->>'material_id', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Cleanup item is missing material_id.';
    END IF;

    IF nullif(trim(coalesce(v_item->>'material_type_id', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Cleanup item % is missing material_type_id.', v_item->>'material_id';
    END IF;

    SELECT result.old_code, result.new_code
    INTO v_old_code, v_new_code
    FROM public.fn_apply_material_code_change_v1(
      v_item->>'material_id',
      (v_item->>'material_type_id')::uuid,
      coalesce(v_item->>'code_spec_key', 'GEN'),
      coalesce(v_item->>'change_reason', 'Material Code Standard v1 cleanup'),
      p_changed_by
    ) AS result;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'material_id', v_item->>'material_id',
      'old_code', v_old_code,
      'new_code', v_new_code
    ));
  END LOOP;

  RETURN v_results;
END;
$$;
