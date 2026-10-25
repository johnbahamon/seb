-- ---------------------------------------------------------------------------
-- Ensamblado del catálogo completo dentro de Postgres.
--
-- Lo arma la base y no el Worker por una razón dura: el plan gratuito de
-- Cloudflare da 10 ms de CPU por request, y construir 1.8 MB de JSON a partir
-- de ~8.000 filas no cabe ahí. Postgres no tiene ese límite, y el Worker queda
-- como tubería: recibe el JSON ya hecho y lo escribe en R2 sin parsearlo.
--
-- El resultado debe satisfacer exactamente el contrato de
-- src/app/models/catalog.models.ts.
-- ---------------------------------------------------------------------------

create or replace function catalog_json() returns jsonb
language sql
stable
as $$
with
-- Primera imagen subida por entidad; v_image ya viene ordenada.
img as (
  select distinct on (entity_type, entity_id)
         entity_type, entity_id, storage_key, alt_text
  from v_image
  order by entity_type, entity_id, sort_order, id
),
model_rows as (
  select mp.model_id,
         jsonb_agg(
           jsonb_build_object('rowId', mp.row_id, 'code', mp.code, 'hotspot', mp.hotspot)
           order by mp.position
         ) as rows
  from model_part mp
  group by mp.model_id
),
model_diagrams as (
  select d.model_id,
         jsonb_agg(
           jsonb_build_object('image', d.image, 'width', d.width,
                              'height', d.height, 'part', d.plate)
           order by d.position
         ) as diagrams
  from diagram d
  group by d.model_id
),
part_models as (
  select mp.code, jsonb_agg(distinct mp.model_id) as models
  from model_part mp
  group by mp.code
),
models as (
  select m.id, m.name, m.brand, m.family,
         jsonb_build_object(
           'id', m.id,
           'name', m.name,
           'brand', m.brand,
           'family', m.family,
           'ref', m.ref,
           'brandOrigin', m.brand_origin,
           'sources', to_jsonb(coalesce(m.sources, '{}')),
           'diagrams', coalesce(md.diagrams, '[]'::jsonb),
           'parts', coalesce(mr.rows, '[]'::jsonb),
           'equivalentRefs', to_jsonb(coalesce(m.equivalent_refs, '{}')),
           -- Ruta pública servida por el Worker desde R2, relativa para que
           -- respete el <base href> de la app.
           'photo', case when i.storage_key is null then null
                         else 'img/' || i.storage_key end,
           'photoAlt', i.alt_text
         ) as doc
  from v_model m
  left join model_rows     mr on mr.model_id = m.id
  left join model_diagrams md on md.model_id = m.id
  left join img            i  on i.entity_type = 'model' and i.entity_id = m.id
),
parts as (
  select p.code,
         jsonb_build_object(
           'code', p.code,
           'cmmf', p.cmmf,
           'description', p.description,
           'ean', p.ean,
           'ue', p.ue,
           'ucMaster', p.uc_master,
           'family', p.family,
           'productLine', p.product_line,
           'brand', p.brand,
           'sources', to_jsonb(coalesce(p.sources, '{}')),
           'models', coalesce(pm.models, '[]'::jsonb),
           -- Una foto subida a mano gana sobre la que extrajo el pipeline.
           'photo', case when i.storage_key is not null then 'img/' || i.storage_key
                         else p.photo end,
           'photoWidth',  case when i.storage_key is not null then null else p.photo_width end,
           'photoHeight', case when i.storage_key is not null then null else p.photo_height end,
           'photoAlt', i.alt_text,
           'priceRegular', p.price_regular,
           'priceGross', p.price_gross,
           'currency', p.currency
         ) as doc
  from v_part p
  left join part_models pm on pm.code = p.code
  left join img         i  on i.entity_type = 'part' and i.entity_id = p.code
)
select jsonb_build_object(
  'generatedFrom', coalesce((select to_jsonb(generated_from) from catalog_meta limit 1), '[]'::jsonb),
  -- brands y families se derivan de los MODELOS, no de las tablas de catálogo:
  -- familySummaries en catalog-store.ts pinta una tarjeta por entrada y cuenta
  -- modelos, así que incluir las tres familias que sólo existen en repuestos
  -- añadiría tarjetas en cero.
  'brands',   coalesce((select jsonb_agg(distinct brand  order by brand)  from models where brand  is not null), '[]'::jsonb),
  'families', coalesce((select jsonb_agg(distinct family order by family) from models where family is not null), '[]'::jsonb),
  'models',   coalesce((select jsonb_agg(doc order by id) from models), '[]'::jsonb),
  'parts',    coalesce((select jsonb_object_agg(code, doc) from parts), '{}'::jsonb)
);
$$;

grant execute on function catalog_json() to service_role;
revoke execute on function catalog_json() from anon, authenticated;
