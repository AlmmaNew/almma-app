-- ALMMA · SQL 152 · Lista para revisar órdenes abiertas antiguas (27-11-2026). Solo lectura: no cambia ningún dato.
-- La usa revisar_ordenes.html. Órdenes sin montar ni cerrar con la mercancía recibida (o creadas) hace más de p_dias días, con pistas:
--   anulada_txt:    el nº de pedido, las observaciones o los textos dicen «anul», «devol» o «abono»
--   sustituida_por: otra orden la cita como anterior (anyo_ant/orden_ant)
--   montada_con:    el mismo cliente (teléfono o nombre) tiene otra orden de la misma tienda montada después
--   ubicacion:      dónde consta en la nave (linubicaciones; puede ser un apunte viejo: no se borra al montar)
-- Aplicado en Supabase como 152 + 152b (versión rápida: cruza todo de una vez, ~4 s) + 152c (pista «anulada» y observaciones).

create or replace function public.revision_ordenes_viejas(p_dias integer default 90)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_staff() then raise exception 'Solo la oficina'; end if;
  return coalesce((
    with v as (
      select o.anyo, o.orden, o.estado, o.tienda_id, o.num_pedido, o.nombre_cli, o.localidad_cli, o.telefono_cli, o.bultos,
             coalesce(o.fecha_recepcion, o.fecha_creacion)::date as ref, (o.fecha_recepcion is not null) as recibida, o.fecha_prev_montaje::date as prev_montaje,
             regexp_replace(coalesce(o.telefono_cli, ''), '\D', '', 'g') as tel, upper(trim(coalesce(o.nombre_cli, ''))) as nom,
             left(nullif(trim(concat_ws(' · ', nullif(trim(o.observaciones), ''), nullif(trim(o.obs_albaran), ''))), ''), 160) as obs,
             concat_ws(' ', o.num_pedido, o.observaciones, o.obs_albaran, o.texto1, o.textofactura) ~* 'anul|devol|abono' as anulada_txt
        from ordenes o
       where o.estado in ('en_proceso', 'recepcionado_parcial', 'recepcionado_total', 'agendado', 'incidencia')
         and o.fecha_montaje is null
         and coalesce(o.fecha_recepcion, o.fecha_creacion) < now() - make_interval(days => greatest(p_dias, 1))),
    m as (
      select anyo, orden, tienda_id, fecha_montaje::date as fm,
             regexp_replace(coalesce(telefono_cli, ''), '\D', '', 'g') as tel, upper(trim(coalesce(nombre_cli, ''))) as nom
        from ordenes where fecha_montaje is not null and tienda_id in (select distinct tienda_id from v)),
    cand as (
      select v.anyo va, v.orden vo, m.anyo, m.orden, m.fm, 'teléfono' as por from v join m on m.tienda_id = v.tienda_id and v.tel <> '' and length(v.tel) >= 9 and m.tel = v.tel
       where (m.anyo, m.orden) <> (v.anyo, v.orden) and m.fm >= v.ref - 30
      union all
      select v.anyo, v.orden, m.anyo, m.orden, m.fm, 'nombre' from v join m on m.tienda_id = v.tienda_id and length(v.nom) > 5 and m.nom = v.nom
       where (m.anyo, m.orden) <> (v.anyo, v.orden) and m.fm >= v.ref - 30),
    mc as (select distinct on (va, vo) va, vo, jsonb_build_object('anyo', anyo, 'orden', orden, 'fecha_montaje', fm, 'por', por) j from cand order by va, vo, fm, por desc),
    sus as (select distinct on (s.anyo_ant, s.orden_ant) s.anyo_ant, s.orden_ant, jsonb_build_object('anyo', s.anyo, 'orden', s.orden, 'estado', s.estado, 'fecha_montaje', s.fecha_montaje::date) j
              from ordenes s join v on v.anyo = s.anyo_ant and v.orden = s.orden_ant order by s.anyo_ant, s.orden_ant, s.anyo desc, s.orden desc),
    ub as (select t.id tienda_id, trim(l.num_pedido) np, string_agg(distinct l.ubicacion, ', ') u
             from linubicaciones l join tiendas t on t.codigo = l.tienda
            where nullif(trim(l.num_pedido), '') is not null group by 1, 2),
    art as (select lo.anyo, lo.orden, string_agg(left(trim(lo.descripcion), 40), ' · ' order by lo.linea) a
              from (select l.*, row_number() over (partition by l.anyo, l.orden order by l.linea) rn from linorden l join v on v.anyo = l.anyo and v.orden = l.orden
                     where l.tipolinea = 1 and nullif(trim(l.descripcion), '') is not null) lo where rn <= 3 group by 1, 2)
    select jsonb_agg(jsonb_build_object('anyo', v.anyo, 'orden', v.orden, 'estado', v.estado, 'tienda_id', v.tienda_id, 'num_pedido', v.num_pedido, 'nombre_cli', v.nombre_cli,
             'localidad_cli', v.localidad_cli, 'telefono_cli', v.telefono_cli, 'bultos', v.bultos, 'ref', v.ref, 'recibida', v.recibida, 'prev_montaje', v.prev_montaje,
             'obs', v.obs, 'anulada_txt', v.anulada_txt,
             'sustituida_por', sus.j, 'montada_con', mc.j, 'ubicacion', ub.u, 'articulos', art.a) order by v.ref desc)
      from v
      left join mc on mc.va = v.anyo and mc.vo = v.orden
      left join sus on sus.anyo_ant = v.anyo and sus.orden_ant = v.orden
      left join ub on ub.tienda_id = v.tienda_id and ub.np = trim(v.num_pedido)
      left join art on art.anyo = v.anyo and art.orden = v.orden
  ), '[]'::jsonb);
end; $$;
revoke all on function public.revision_ordenes_viejas(integer) from public, anon;
grant execute on function public.revision_ordenes_viejas(integer) to authenticated;
