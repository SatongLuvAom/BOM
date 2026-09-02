-- ============================================================
-- Material list query RPC
-- ============================================================
-- Moves Material Master search, filters, sorting, counting, and pagination
-- into PostgreSQL. The function is SECURITY INVOKER so the caller's RLS
-- policies remain the authorization boundary.

CREATE OR REPLACE FUNCTION public.list_materials(
  p_search text DEFAULT NULL,
  p_cat_id text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_has_price text DEFAULT NULL,
  p_stale_price text DEFAULT NULL,
  p_supplier_id text DEFAULT NULL,
  p_sort_by text DEFAULT NULL,
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
params AS (
  SELECT
    nullif(
      regexp_replace(lower(trim(left(coalesce(p_search, ''), 120))), '\s+', ' ', 'g'),
      ''
    ) AS search_term,
    nullif(trim(p_cat_id), '') AS cat_id,
    nullif(trim(p_status), '') AS status,
    lower(nullif(trim(p_has_price), '')) AS has_price,
    lower(nullif(trim(p_stale_price), '')) AS stale_price,
    nullif(trim(p_supplier_id), '') AS supplier_id,
    CASE
      WHEN p_sort_by = ANY (ARRAY[
        'material_code', 'mat_name_th', 'brand', 'spec', 'category',
        'base_uom', 'latest_price', 'supplier', 'price_status',
        'quality_score', 'status', 'updated_at'
      ]) THEN p_sort_by
      ELSE 'updated_at'
    END AS sort_by,
    coalesce(p_sort_by = ANY (ARRAY[
      'material_code', 'mat_name_th', 'brand', 'spec', 'category',
      'base_uom', 'latest_price', 'supplier', 'price_status',
      'quality_score', 'status', 'updated_at'
    ]), false) AS explicit_sort,
    CASE WHEN lower(p_sort_dir) = 'asc' THEN 'asc' ELSE 'desc' END AS sort_dir,
    greatest(1, least(coalesce(p_limit, 20), 100)) AS page_limit,
    greatest(coalesce(p_offset, 0), 0) AS page_offset
),
search_params AS (
  SELECT
    p.*,
    CASE
      WHEN p.search_term IS NULL THEN NULL
      ELSE '%' || replace(
        replace(
          replace(p.search_term, chr(92), chr(92) || chr(92)),
          '%', chr(92) || '%'
        ),
        '_', chr(92) || '_'
      ) || '%'
    END AS contains_pattern,
    CASE
      WHEN p.search_term IS NULL THEN NULL
      ELSE replace(
        replace(
          replace(p.search_term, chr(92), chr(92) || chr(92)),
          '%', chr(92) || '%'
        ),
        '_', chr(92) || '_'
      ) || '%'
    END AS prefix_pattern
  FROM params p
),
supplier_summary AS (
  SELECT
    msm.material_id,
    count(*) FILTER (WHERE coalesce(msm.is_active, true)) AS active_supplier_count,
    coalesce(
      bool_or(coalesce(msm.is_preferred, false))
        FILTER (WHERE coalesce(msm.is_active, true)),
      false
    ) AS has_preferred_supplier
  FROM public.mat_supplier_map msm
  WHERE coalesce(msm.is_deleted, false) = false
  GROUP BY msm.material_id
),
alias_summary AS (
  SELECT a.material_id, count(*) AS alias_count
  FROM public.mat_alias a
  WHERE coalesce(a.is_deleted, false) = false
  GROUP BY a.material_id
),
candidate_values AS (
  SELECT
    m.id,
    m.material_id,
    m.material_code,
    m.cat_id,
    m.category_id,
    m.mat_name_th,
    m.mat_name_en,
    m.normalized_name,
    m.spec,
    m.brand,
    m.model,
    m.base_uom,
    m.base_uom_id,
    m.status,
    m.updated_at,
    c.cat_code,
    c.cat_name_th,
    lp.unit_price AS latest_price,
    (lp.material_id IS NOT NULL) AS has_latest_price,
    lp.supplier_name AS latest_supplier,
    lp.is_stale AS latest_price_is_stale,
    lp.valid_until AS latest_price_valid_until,
    sp.search_term,
    sp.contains_pattern,
    sp.prefix_pattern,
    sp.sort_by,
    sp.explicit_sort,
    sp.sort_dir,
    sp.page_limit,
    sp.page_offset,
    greatest(
      CASE
        WHEN lower(trim(coalesce(m.material_code, ''))) = sp.search_term
          OR lower(trim(coalesce(m.material_id, ''))) = sp.search_term
          THEN 120
        ELSE 0
      END,
      CASE
        WHEN lower(coalesce(m.material_code, '')) LIKE sp.prefix_pattern ESCAPE E'\\'
          OR lower(coalesce(m.material_id, '')) LIKE sp.prefix_pattern ESCAPE E'\\'
          THEN 110
        ELSE 0
      END,
      CASE
        WHEN lower(coalesce(m.mat_name_th, '')) LIKE sp.prefix_pattern ESCAPE E'\\'
          OR lower(coalesce(m.mat_name_en, '')) LIKE sp.prefix_pattern ESCAPE E'\\'
          THEN 100
        ELSE 0
      END,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.mat_alias a
          WHERE a.material_id = m.material_id
            AND coalesce(a.is_deleted, false) = false
            AND lower(coalesce(a.normalized_alias, a.alias_name, ''))
              LIKE sp.contains_pattern ESCAPE E'\\'
        ) THEN 95
        ELSE 0
      END,
      CASE
        WHEN lower(coalesce(m.mat_name_th, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          OR lower(coalesce(m.mat_name_en, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          THEN 90
        ELSE 0
      END,
      CASE
        WHEN lower(coalesce(m.normalized_name, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          THEN 85
        ELSE 0
      END,
      CASE
        WHEN lower(coalesce(m.brand, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          OR lower(coalesce(m.model, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          THEN 75
        ELSE 0
      END,
      CASE
        WHEN lower(coalesce(m.spec, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          THEN 70
        ELSE 0
      END,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.mat_supplier_map msm
          JOIN public.supplier s ON s.supplier_id = msm.supplier_id
          WHERE msm.material_id = m.material_id
            AND coalesce(msm.is_deleted, false) = false
            AND coalesce(s.is_deleted, false) = false
            AND (
              lower(coalesce(s.supplier_code, '')) LIKE sp.contains_pattern ESCAPE E'\\'
              OR lower(coalesce(s.supplier_name_th, '')) LIKE sp.contains_pattern ESCAPE E'\\'
              OR lower(coalesce(s.supplier_name_en, '')) LIKE sp.contains_pattern ESCAPE E'\\'
            )
        ) THEN 65
        ELSE 0
      END,
      CASE
        WHEN coalesce(c.is_deleted, false) = false
          AND (
            lower(coalesce(c.cat_code, '')) LIKE sp.contains_pattern ESCAPE E'\\'
            OR lower(coalesce(c.cat_name_th, '')) LIKE sp.contains_pattern ESCAPE E'\\'
            OR lower(coalesce(c.cat_name_en, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          ) THEN 60
        ELSE 0
      END,
      CASE
        WHEN lower(coalesce(m.material_code, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          OR lower(coalesce(m.material_id, '')) LIKE sp.contains_pattern ESCAPE E'\\'
          THEN 50
        ELSE 0
      END
    ) AS search_rank,
    (
      CASE WHEN nullif(trim(coalesce(m.material_code, m.material_id, '')), '') IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN nullif(trim(coalesce(m.mat_name_th, '')), '') IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN m.category_id IS NOT NULL OR m.cat_id IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN m.base_uom_id IS NOT NULL OR nullif(trim(coalesce(m.base_uom, '')), '') IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN coalesce(ss.active_supplier_count, 0) > 0 THEN 10 ELSE 0 END +
      CASE
        WHEN coalesce(ss.has_preferred_supplier, false)
          OR coalesce(ss.active_supplier_count, 0) = 1
          THEN 5
        ELSE 0
      END +
      CASE WHEN lp.material_id IS NOT NULL THEN 20 ELSE 0 END +
      CASE WHEN coalesce(a.alias_count, 0) > 0 THEN 10 ELSE 0 END +
      CASE
        WHEN nullif(concat_ws('',
          nullif(trim(coalesce(m.spec, '')), ''),
          nullif(trim(coalesce(m.brand, '')), ''),
          nullif(trim(coalesce(m.model, '')), '')
        ), '') IS NOT NULL THEN 10
        ELSE 0
      END +
      CASE
        WHEN lp.material_id IS NOT NULL
          AND coalesce(lp.is_stale, false) = false
          AND (lp.valid_until IS NULL OR lp.valid_until >= current_date)
          THEN 5
        ELSE 0
      END
    )::integer AS quality_score
  FROM public.mat_master m
  CROSS JOIN search_params sp
  LEFT JOIN public.mat_category c ON c.cat_id = m.cat_id
  LEFT JOIN public.material_latest_prices lp ON lp.material_id = m.material_id
  LEFT JOIN supplier_summary ss ON ss.material_id = m.material_id
  LEFT JOIN alias_summary a ON a.material_id = m.material_id
  WHERE coalesce(m.is_deleted, false) = false
    AND (sp.cat_id IS NULL OR m.cat_id = sp.cat_id)
    AND (sp.status IS NULL OR m.status = sp.status)
    AND (
      sp.supplier_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.mat_supplier_map filter_map
        WHERE filter_map.material_id = m.material_id
          AND filter_map.supplier_id = sp.supplier_id
          AND coalesce(filter_map.is_deleted, false) = false
      )
    )
    AND (
      (
        sp.stale_price = 'yes'
        AND coalesce(lp.is_stale, false) = true
      )
      OR (
        coalesce(sp.stale_price, '') <> 'yes'
        AND (
          sp.has_price IS NULL
          OR (sp.has_price = 'yes' AND lp.material_id IS NOT NULL)
          OR (sp.has_price = 'missing' AND lp.material_id IS NULL)
          OR sp.has_price NOT IN ('yes', 'missing')
        )
      )
    )
),
filtered AS (
  SELECT cv.*
  FROM candidate_values cv
  WHERE cv.search_term IS NULL OR cv.search_rank > 0
),
ordered AS (
  SELECT
    f.*,
    row_number() OVER (
      ORDER BY
        CASE WHEN f.search_term IS NOT NULL AND NOT f.explicit_sort THEN f.search_rank END DESC NULLS LAST,
        CASE WHEN f.search_term IS NOT NULL AND NOT f.explicit_sort THEN f.material_id END ASC NULLS LAST,

        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'material_code' AND f.sort_dir = 'asc' THEN nullif(f.material_code, '') END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'material_code' AND f.sort_dir = 'desc' THEN nullif(f.material_code, '') END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'mat_name_th' AND f.sort_dir = 'asc' THEN nullif(f.mat_name_th, '') END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'mat_name_th' AND f.sort_dir = 'desc' THEN nullif(f.mat_name_th, '') END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'brand' AND f.sort_dir = 'asc' THEN nullif(f.brand, '') END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'brand' AND f.sort_dir = 'desc' THEN nullif(f.brand, '') END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'spec' AND f.sort_dir = 'asc' THEN nullif(f.spec, '') END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'spec' AND f.sort_dir = 'desc' THEN nullif(f.spec, '') END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'category' AND f.sort_dir = 'asc' THEN nullif(CASE WHEN f.search_term IS NULL THEN f.cat_id ELSE f.cat_code END, '') END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'category' AND f.sort_dir = 'desc' THEN nullif(CASE WHEN f.search_term IS NULL THEN f.cat_id ELSE f.cat_code END, '') END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'base_uom' AND f.sort_dir = 'asc' THEN nullif(f.base_uom, '') END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'base_uom' AND f.sort_dir = 'desc' THEN nullif(f.base_uom, '') END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'latest_price' AND f.sort_dir = 'asc' THEN f.latest_price END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'latest_price' AND f.sort_dir = 'desc' THEN f.latest_price END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'supplier' AND f.sort_dir = 'asc' THEN nullif(f.latest_supplier, '') END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'supplier' AND f.sort_dir = 'desc' THEN nullif(f.latest_supplier, '') END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'price_status' AND f.sort_dir = 'asc' THEN CASE WHEN NOT f.has_latest_price THEN 0 WHEN f.latest_price_is_stale THEN 1 ELSE 2 END END ASC,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'price_status' AND f.sort_dir = 'desc' THEN CASE WHEN NOT f.has_latest_price THEN 0 WHEN f.latest_price_is_stale THEN 1 ELSE 2 END END DESC,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'quality_score' AND f.sort_dir = 'asc' THEN f.quality_score END ASC,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'quality_score' AND f.sort_dir = 'desc' THEN f.quality_score END DESC,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'status' AND f.sort_dir = 'asc' THEN nullif(f.status, '') END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'status' AND f.sort_dir = 'desc' THEN nullif(f.status, '') END DESC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'updated_at' AND f.sort_dir = 'asc' THEN f.updated_at END ASC NULLS LAST,
        CASE WHEN (f.search_term IS NULL OR f.explicit_sort) AND f.sort_by = 'updated_at' AND f.sort_dir = 'desc' THEN f.updated_at END DESC NULLS LAST,
        CASE WHEN f.search_term IS NULL OR f.explicit_sort THEN coalesce(nullif(f.material_code, ''), f.material_id) END ASC
    ) AS row_position
  FROM filtered f
),
page_rows AS (
  SELECT o.*
  FROM ordered o
  WHERE o.row_position > o.page_offset
    AND o.row_position <= o.page_offset + o.page_limit
)
SELECT jsonb_build_object(
  'materials', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', pr.id,
        'material_id', pr.material_id,
        'material_code', pr.material_code,
        'cat_id', pr.cat_id,
        'category_id', pr.category_id,
        'mat_name_th', pr.mat_name_th,
        'mat_name_en', pr.mat_name_en,
        'normalized_name', pr.normalized_name,
        'spec', pr.spec,
        'brand', pr.brand,
        'model', pr.model,
        'base_uom', pr.base_uom,
        'base_uom_id', pr.base_uom_id,
        'status', pr.status,
        'updated_at', pr.updated_at,
        'category', CASE
          WHEN pr.cat_id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'cat_id', pr.cat_id,
            'cat_code', pr.cat_code,
            'cat_name_th', pr.cat_name_th
          )
        END
      )
      ORDER BY pr.row_position
    )
    FROM page_rows pr
  ), '[]'::jsonb),
  'total', (SELECT count(*) FROM filtered)
);
$$;

REVOKE ALL ON FUNCTION public.list_materials(text, text, text, text, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_materials(text, text, text, text, text, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_materials(text, text, text, text, text, text, text, text, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_materials(text, text, text, text, text, text, text, text, integer, integer) IS
  'Returns one filtered, sorted, paginated Material Master result as JSON while preserving caller RLS.';

NOTIFY pgrst, 'reload schema';
