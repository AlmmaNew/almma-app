-- ALMMA · SQL 151 · Valoraciones del cliente final (27-11-2026)
-- Después del montaje, la oficina manda por WhatsApp un enlace (valoracion.html?v=<código>) y el cliente puntúa de 1 a 5,
-- marca qué le gustó o qué falló y deja un comentario. Sin usuario: el enlace lleva un código imposible de adivinar.
-- Las de 1 o 2 estrellas avisan a la oficina en la campana (avisos tipo 'valoracion_baja') y quedan apuntadas en la orden.

create table if not exists public.valoraciones (
  id uuid primary key default gen_random_uuid(),
  anyo integer not null,
  orden integer not null,
  token uuid not null unique default gen_random_uuid(),
  tienda_id uuid,
  montadores uuid[] not null default '{}',
  fecha_montaje date,
  creado_at timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  enviado_at timestamptz,
  enviado_veces integer not null default 0,
  puntuacion smallint check (puntuacion between 1 and 5),
  aspectos text[],
  comentario text,
  respondido_at timestamptz,
  vista boolean not null default false,
  unique (anyo, orden),
  foreign key (anyo, orden) references public.ordenes (anyo, orden) on delete cascade
);
create index if not exists valoraciones_respondido_idx on public.valoraciones (respondido_at);
create index if not exists valoraciones_fecha_idx on public.valoraciones (fecha_montaje);

alter table public.valoraciones enable row level security;
drop policy if exists valoraciones_staff on public.valoraciones;
create policy valoraciones_staff on public.valoraciones for all
  using ((select is_staff())) with check ((select is_staff()));

-- avisos: nuevo tipo para la campana
alter table public.avisos drop constraint if exists avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check
  check (tipo = any (array['archivo', 'listo_agendar', 'orden_completa', 'valoracion_baja']));

-- Crea (o devuelve) el enlace de una orden. La oficina, o un montador de esa orden.
-- p_enviada = true: además apunta que se ha mandado (fecha y nº de veces).
create or replace function public.token_valoracion(p_anyo integer, p_orden integer, p_enviada boolean default false)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid; o ordenes;
begin
  if not (is_staff() or exists (select 1 from mis_montajes_lista() m(anyo, orden) where m.anyo = p_anyo and m.orden = p_orden)) then
    raise exception 'Solo la oficina o el montador de la orden';
  end if;
  select * into o from ordenes where anyo = p_anyo and orden = p_orden;
  if not found then raise exception 'Orden no encontrada'; end if;
  insert into valoraciones (anyo, orden, tienda_id, fecha_montaje, montadores)
  values (p_anyo, p_orden, o.tienda_id, o.fecha_montaje::date,
          coalesce((select array_agg(om.montador_id) from ordenes_montadores om join montadores m on m.id = om.montador_id and not coalesce(m.especial, false)
                    where om.anyo = p_anyo and om.orden = p_orden), '{}'))
  on conflict (anyo, orden) do update
     set tienda_id = excluded.tienda_id, fecha_montaje = excluded.fecha_montaje, montadores = excluded.montadores
   where valoraciones.respondido_at is null;
  if p_enviada then
    update valoraciones set enviado_at = now(), enviado_veces = enviado_veces + 1 where anyo = p_anyo and orden = p_orden;
  end if;
  select token into v from valoraciones where anyo = p_anyo and orden = p_orden;
  return v;
end; $$;

-- Lo que ve el cliente (página pública). Solo el nombre de pila, la tienda, el día y los artículos.
create or replace function public.valoracion_publica(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v valoraciones; o ordenes;
begin
  select * into v from valoraciones where token = p_token;
  if not found then return null; end if;
  select * into o from ordenes where anyo = v.anyo and orden = v.orden;
  if not found then return null; end if;
  if o.fecha_montaje is null and o.estado not in ('completado', 'terminado_incidencia') then
    return jsonb_build_object('valida', false, 'motivo', 'sin_montar');
  end if;
  if v.respondido_at is null and v.creado_at < now() - interval '90 days' then
    return jsonb_build_object('valida', false, 'motivo', 'caducada');
  end if;
  return jsonb_build_object(
    'valida', true,
    'nombre', initcap(split_part(trim(coalesce(o.nombre_cli, '')), ' ', 1)),
    'tienda', (select coalesce(nullif(trim(t.nombre_comercial), ''), t.nombre) from tiendas t where t.id = o.tienda_id),
    'logo', (select l.logo from tiendas_logo l where l.tienda_id = o.tienda_id and l.logo like 'data:image/%'),
    'fecha', coalesce(o.fecha_montaje::date, v.fecha_montaje),
    'articulos', coalesce((select jsonb_agg(x.d order by x.linea) from (
                   select l.linea, upper(left(trim(l.descripcion), 1)) || lower(substr(trim(l.descripcion), 2)) as d
                     from linorden l
                    where l.anyo = v.anyo and l.orden = v.orden and l.tipolinea = 1 and nullif(trim(l.descripcion), '') is not null
                    order by l.linea limit 6) x), '[]'::jsonb),
    'respondida', v.respondido_at is not null,
    'puede_cambiar', v.respondido_at is null or v.respondido_at > now() - interval '2 days',
    'puntuacion', v.puntuacion,
    'aspectos', to_jsonb(v.aspectos),
    'comentario', v.comentario
  );
end; $$;

-- Guarda la valoración. Se puede cambiar durante 2 días.
create or replace function public.responder_valoracion(p_token uuid, p_puntuacion integer, p_aspectos text[] default null, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v valoraciones; pub jsonb; asp text[]; com text; txt text;
begin
  select * into v from valoraciones where token = p_token for update;
  if not found then return null; end if;
  pub := valoracion_publica(p_token);
  if (pub ->> 'valida')::boolean is not true or (pub ->> 'puede_cambiar')::boolean is not true then return pub; end if;
  if p_puntuacion is null or p_puntuacion not between 1 and 5 then raise exception 'Puntuación no válida'; end if;
  asp := array(select left(trim(x), 40) from unnest(coalesce(p_aspectos, '{}')) x where nullif(trim(x), '') is not null limit 8);
  com := left(nullif(trim(p_comentario), ''), 1000);
  update valoraciones set puntuacion = p_puntuacion, aspectos = asp, comentario = com, respondido_at = now(), vista = false where id = v.id;
  txt := 'Valoración del cliente: ' || repeat('★', p_puntuacion) || repeat('☆', 5 - p_puntuacion) ||
         coalesce(' · ' || nullif(array_to_string(asp, ', '), ''), '') || coalesce(' · «' || com || '»', '');
  perform _apunte_llamada(v.anyo, v.orden, txt);
  if p_puntuacion <= 2 then
    insert into avisos (para, tipo, anyo, orden, tienda_id, texto)
    values ('staff', 'valoracion_baja', v.anyo, v.orden, v.tienda_id, txt);
  end if;
  return valoracion_publica(p_token);
end; $$;

revoke all on function public.token_valoracion(integer, integer, boolean) from public, anon;
revoke all on function public.valoracion_publica(uuid) from public;
revoke all on function public.responder_valoracion(uuid, integer, text[], text) from public;
grant execute on function public.token_valoracion(integer, integer, boolean) to authenticated;
grant execute on function public.valoracion_publica(uuid) to anon, authenticated;
grant execute on function public.responder_valoracion(uuid, integer, text[], text) to anon, authenticated;
