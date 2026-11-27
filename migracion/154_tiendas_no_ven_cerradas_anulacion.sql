-- ALMMA · SQL 154 · Las tiendas no ven las órdenes cerradas por anulación (27-11-2026). Aplicado en Supabase.
-- Misma regla de antes («tienda ve sus ordenes») + «cierre_motivo is null» (SQL 153).
-- Si la oficina reabre una de esas órdenes, el trigger de SQL 153 quita la marca y la tienda la vuelve a ver.
-- La oficina (is_staff) y los montadores siguen viéndolas como antes.
drop policy if exists "tienda ve sus ordenes" on public.ordenes;
create policy "tienda ve sus ordenes" on public.ordenes for select to authenticated
  using (anyo >= anyo_minimo_tienda()
     and cierre_motivo is null
     and tienda_id in (select unnest(mis_tiendas()))
     and ((select soy_admin_tienda()) or dependiente_id = (select mi_dependiente_id()) or tienda_comparte_ordenes(tienda_id)));
