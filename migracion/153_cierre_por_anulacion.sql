-- ALMMA · SQL 153 · Órdenes cerradas por anulación (27-11-2026). Aplicado en Supabase (153 + 153b).
-- No hay estado «anulada»: la orden pasa a «completado» y se marca con cierre_motivo, que las pantallas enseñan como «🚫 Cerrada por anulación».
-- cierre_motivo: 'anulada' (el pedido u observaciones lo dicen), 'sustituida' (otra orden la sustituye), 'antigua' (+5 años sin noticias), 'otro'.
-- Cada cierre guarda en ordenes_cierres el estado y las observaciones de antes, para poder deshacerlo.
-- Si alguien reabre la orden (cambia el estado a otro que no sea «completado»), la marca se quita sola (trigger ordenes_reabrir_cierre).
-- «Pendientes de facturar» (facturas_pendientes) ya no saca las órdenes cerradas así.

alter table public.ordenes add column if not exists cierre_motivo text;
alter table public.ordenes add column if not exists cierre_at timestamptz;
alter table public.ordenes add column if not exists cierre_por uuid;
alter table public.ordenes drop constraint if exists ordenes_cierre_motivo_check;
alter table public.ordenes add constraint ordenes_cierre_motivo_check check (cierre_motivo is null or cierre_motivo in ('anulada', 'sustituida', 'antigua', 'otro'));

create table if not exists public.ordenes_cierres (
  id bigserial primary key,
  anyo integer not null,
  orden integer not null,
  lote text not null,
  motivo text not null,
  detalle text,
  estado_anterior text,
  observaciones_anterior text,
  cerrada_at timestamptz not null default now(),
  cerrada_por uuid,
  deshecho_at timestamptz,
  foreign key (anyo, orden) references public.ordenes (anyo, orden) on delete cascade
);
create index if not exists ordenes_cierres_orden_idx on public.ordenes_cierres (anyo, orden);
alter table public.ordenes_cierres enable row level security;
drop policy if exists ordenes_cierres_staff on public.ordenes_cierres;
create policy ordenes_cierres_staff on public.ordenes_cierres for select using ((select is_staff()));

create or replace function public.facturas_pendientes()
returns jsonb language plpgsql stable security definer set search_path to 'public' set statement_timeout to '60s' as $function$
begin
  if not is_staff() then raise exception 'Solo el personal puede ver las líneas pendientes de facturar'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.fecha_montaje, x.anyo, x.orden, x.linea) from (
      select o.anyo, o.orden, o.num_pedido, o.nombre_cli, o.fecha_montaje, o.tienda_id, o.importe_cobrado, o.tipo_cobro, o.estado,
             l.linea, l.descripcion, l.importe, l.porcentaje, l.importe_cobrar
        from linorden l join ordenes o on o.anyo = l.anyo and o.orden = l.orden
       where l.tipolinea = 4 and not l.facturada and linea_a_facturar(l.importe_cobrar, o.facturada, o.fecha_montaje::date)
         and l.borrador_id is null and o.tipo_orden = 1 and o.estado in ('completado','terminado_incidencia','incidencia')
         and o.tienda_id is not null and o.cierre_motivo is null
    ) x), '[]'::jsonb);
end; $function$;

-- 153b: reabrir quita la marca
create or replace function public.trg_ordenes_reabrir_cierre()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if old.cierre_motivo is not null and new.estado is distinct from 'completado' then
    new.cierre_motivo := null; new.cierre_at := null; new.cierre_por := null;
    update ordenes_cierres set deshecho_at = now() where anyo = new.anyo and orden = new.orden and deshecho_at is null;
  end if;
  return new;
end; $$;
drop trigger if exists ordenes_reabrir_cierre on public.ordenes;
create trigger ordenes_reabrir_cierre before update of estado on public.ordenes
  for each row execute function public.trg_ordenes_reabrir_cierre();

-- CIERRE HECHO el 27-11-2026 (lote 'revision-2026-11-27', a nombre de Arturo): 938 órdenes
--   35 anuladas · 195 sustituidas · 708 antiguas (+5 años sin montar, sin pista de montaje con otra orden)
-- Nota añadida al final de observaciones: «[27/11/2026] 🚫 CERRADA POR ANULACIÓN (revisión de órdenes antiguas): <motivo>. Estado anterior: <estado>.»
--
-- PARA DESHACER UN LOTE ENTERO (devuelve estado y observaciones de antes):
--   update ordenes o set estado = c.estado_anterior, observaciones = c.observaciones_anterior, cierre_motivo = null, cierre_at = null, cierre_por = null
--     from ordenes_cierres c where c.lote = 'revision-2026-11-27' and c.deshecho_at is null and o.anyo = c.anyo and o.orden = c.orden;
--   update ordenes_cierres set deshecho_at = now() where lote = 'revision-2026-11-27' and deshecho_at is null;
