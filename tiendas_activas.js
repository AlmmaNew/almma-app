// Tiendas «activas» para los buscadores y desplegables de la OFICINA (petición de Arturo, 21-11-2026).
// Son las que han mandado alguna ORDEN en los últimos 3 meses, o se han dado de alta hace menos de 60 días
// (una tienda nueva que aún no tiene nada). Hoy salen unas 30 de las ~360 tiendas (muchas del programa antiguo).
// Las demás no salen en las listas, pero sus órdenes siguen ahí.
// Devuelve un Set de ids de tienda, o null si no se ha podido saber (entonces se enseñan todas).
// Se recuerda 30 minutos en el navegador para no repetir la consulta en cada pantalla.
// Solo para staff (las tiendas solo ven sus propias órdenes).
async function idsTiendasActivas(client) {
  const CLAVE = "almma_tiendas_activas_v2";
  try { const c = JSON.parse(sessionStorage.getItem(CLAVE) || "null"); if (c && Date.now() - c.t < 30 * 60e3) return new Set(c.ids); } catch (e) {}
  const hace = (meses, dias) => { const d = new Date(); if (meses) d.setMonth(d.getMonth() - meses); if (dias) d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10); };
  async function todas(fab) {
    let r = [], i = 0;
    for (;;) { const { data, error } = await fab().range(i, i + 999); if (error) throw error; r = r.concat(data || []); if (!data || data.length < 1000) return r; i += 1000; }
  }
  try {
    const [o, t] = await Promise.all([
      todas(() => client.from("ordenes").select("tienda_id").gte("fecha_creacion", hace(3)).not("tienda_id", "is", null).order("anyo").order("orden")),
      todas(() => client.from("tiendas").select("id").gte("created_at", hace(0, 60)))]);
    if (!o.length) return null;   // sin órdenes visibles (algo raro): mejor enseñar todas que una lista incompleta
    const ids = [...new Set([...o.map(x => x.tienda_id), ...t.map(x => x.id)])];
    try { sessionStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), ids })); } catch (e) {}
    return new Set(ids);
  } catch (e) { console.warn("No se han podido calcular las tiendas activas (se enseñan todas):", e.message); return null; }
}
// Deja en `lista` (objetos con .id) solo las activas; las de `siempre` (p. ej. la tienda ya puesta en la orden) se quedan aunque no lo sean.
function soloTiendasActivas(lista, act, ...siempre) {
  return act ? (lista || []).filter(t => act.has(t.id) || siempre.includes(t.id)) : (lista || []);
}
