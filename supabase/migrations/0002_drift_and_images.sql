-- ---------------------------------------------------------------------------
-- Correcciones halladas al revisar el /admin contra los datos reales.
--
-- 1. v_drift ignoraba la familia de un repuesto. part_override.base_family_id
--    se escribía y no lo leía nadie, así que una reclasificación del pipeline
--    sobre un repuesto que alguien había recategorizado a mano no llegaba
--    nunca a la cola de revisión: el valor humano ganaba en silencio para
--    siempre. recategorize.py reclasifica de forma rutinaria, así que este
--    caso no es hipotético.
--
-- 2. v_image no exponía el id, de modo que una foto subida no se podía borrar
--    ni reordenar: sólo acumular.
-- ---------------------------------------------------------------------------

create or replace view v_image
with (security_invoker = true) as
select id, entity_type, entity_id, bucket, storage_key,
       width, height, alt_text, sort_order, uploaded_at
from image
where deleted_at is null
order by entity_type, entity_id, sort_order, id;

create or replace view v_drift
with (security_invoker = true) as
-- Modelo: el pipeline movió un nombre editado a mano.
select 'model' as entity, m.id as entity_id, 'name' as field,
       o.base_name as value_at_edit, m.name as pipeline_now, o.name as human_value,
       o.edited_at, null::timestamptz as retired_at
from model_override o join model m on m.id = o.model_id
where o.name is not null and o.base_name is distinct from m.name and m.retired_at is null
union all
-- Modelo: el pipeline reclasificó una familia editada a mano.
select 'model', m.id, 'family',
       fb.name, f.name, fo.name, o.edited_at, null::timestamptz
from model_override o
join model m on m.id = o.model_id
left join family fb on fb.id = o.base_family_id
left join family f  on f.id  = m.family_id
left join family fo on fo.id = o.family_id
where o.family_id is not null and o.base_family_id is distinct from m.family_id and m.retired_at is null
union all
-- Repuesto: el pipeline movió una descripción editada a mano.
select 'part', p.code, 'description',
       o.base_description, p.description, o.description, o.edited_at, null::timestamptz
from part_override o join part p on p.code = o.code
where o.description is not null and o.base_description is distinct from p.description and p.retired_at is null
union all
-- Repuesto: el pipeline reclasificó una familia editada a mano. FALTABA.
select 'part', p.code, 'family',
       fb.name, f.name, fo.name, o.edited_at, null::timestamptz
from part_override o
join part p on p.code = o.code
left join family fb on fb.id = o.base_family_id
left join family f  on f.id  = p.family_id
left join family fo on fo.id = o.family_id
where o.family_id is not null and o.base_family_id is distinct from p.family_id and p.retired_at is null
union all
-- Dado de baja en el origen con trabajo humano encima. El retiro es un UPDATE,
-- así que no dispara el ON DELETE RESTRICT y la fila desaparecería del export
-- sin avisar.
select 'model', m.id, 'retired', o.base_name, null, o.name, o.edited_at, m.retired_at
from model_override o join model m on m.id = o.model_id
where m.retired_at is not null
union all
select 'part', p.code, 'retired', o.base_description, null, o.description, o.edited_at, p.retired_at
from part_override o join part p on p.code = o.code
where p.retired_at is not null;

revoke all on v_image, v_drift from anon, authenticated;
grant all privileges on v_image, v_drift to service_role;
