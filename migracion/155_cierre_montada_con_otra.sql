-- ALMMA · SQL 155 · Motivo de cierre «montada_otra» (27-11-2026). Aplicado en Supabase.
alter table public.ordenes drop constraint if exists ordenes_cierre_motivo_check;
alter table public.ordenes add constraint ordenes_cierre_motivo_check check (cierre_motivo is null or cierre_motivo in ('anulada', 'sustituida', 'antigua', 'montada_otra', 'otro'));

-- CIERRE HECHO el 27-11-2026 (lote 'revision-2026-11-27-telefono', a nombre de Arturo): 343 órdenes abiertas de hace más de 90 días
-- en las que el mismo cliente (mismo teléfono, 9 cifras o más) tiene otra orden de la misma tienda montada después.
-- Se dejaron SIN cerrar, para revisarlas a mano: teléfono igual al de la tienda, teléfono usado por 4 o más clientes distintos,
-- o nombre del cliente distinto en las dos órdenes.
-- Nota en observaciones: «[27/11/2026] 🚫 CERRADA POR ANULACIÓN (revisión de órdenes antiguas): el cliente (mismo teléfono) tiene la orden X/Y montada el dd/mm/aaaa. Estado anterior: …»
-- Para deshacer: como en 153, con lote = 'revision-2026-11-27-telefono'.

-- CIERRE HECHO el 27-11-2026 (lote 'revision-2026-11-27-nombre', a nombre de Arturo): 483 órdenes
-- en las que el mismo cliente (mismo nombre, 2 palabras o más) tiene otra orden de la misma tienda montada después.
-- Se dejaron SIN cerrar: nombre de una sola palabra, nombre que en esa tienda usan clientes con teléfonos distintos,
-- teléfonos distintos en las dos órdenes, o la otra orden montada más de un año después.
-- Para deshacer: como en 153, con lote = 'revision-2026-11-27-nombre'.

-- CIERRE HECHO el 27-11-2026 (lote 'revision-2026-11-27-2anyos', a nombre de Arturo): 207 órdenes
-- abiertas con la mercancía recibida (o creadas) hace más de 2 años y SIN ninguna pista (ni anulada, ni sustituida, ni cliente montado con otra orden).
-- cierre_motivo = 'antigua'. Para deshacer: como en 153, con lote = 'revision-2026-11-27-2anyos'.
-- Total cerradas por anulación tras los 5 lotes: 1.971. Quedan 255 abiertas de más de 90 días (50 del último año).

-- CIERRE HECHO el 27-11-2026 (lote 'revision-2026-11-27-1anyo', a nombre de Arturo): 82 órdenes
-- abiertas con la mercancía recibida (o creadas) hace entre 1 y 2 años y SIN ninguna pista. cierre_motivo = 'antigua'.
-- Para deshacer: como en 153, con lote = 'revision-2026-11-27-1anyo'.
-- Total cerradas por anulación tras los 6 lotes: 2.053. Quedan 173 abiertas de más de 90 días (128 con pista dudosa + 45 sin pista del último año).
