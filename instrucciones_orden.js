/* ALMMA · qué instrucciones del buzón sirven para una orden (25-11-2026).
   Lo usan mi-dia.html, pedidos.html e instrucciones.html.
   instruccionesPara({ anyo, orden, proveedor }, lineas, lista) → { deOrden: [...], generales: [...], fabricantes: ["TETRIS", …] }
   - deOrden: las subidas para esa misma orden.
   - generales: las que no son de ninguna orden y son de un fabricante de sus artículos: por el código de fabricante (de la línea o de la
     orden) o porque el nombre del fabricante aparece en la descripción (muchas líneas vienen sin fabricante o con «Varios»). */
(function () {
  const norm = t => " " + String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  window.instruccionesPara = function (o, lineas, lista) {
    const ls = (lineas || []).filter(l => l.tipolinea !== 4);
    const codigos = new Set([o.proveedor, ...ls.map(l => l.proveedor)].filter(Boolean).map(Number));
    const textos = ls.map(l => norm(l.descripcion));
    const deOrden = [], generales = [];
    (lista || []).forEach(i => {
      if (i.orden) { if (i.anyo === o.anyo && i.orden === o.orden) deOrden.push(i); return; }
      const nombre = norm(i.fabricante);
      if ((i.fabricante_codigo && codigos.has(Number(i.fabricante_codigo))) || (nombre.trim().length >= 4 && textos.some(t => t.includes(nombre)))) generales.push(i);
    });
    const vistos = new Map();
    generales.forEach(i => { if (i.fabricante && !vistos.has(norm(i.fabricante))) vistos.set(norm(i.fabricante), i.fabricante); });
    return { deOrden, generales, fabricantes: [...vistos.values()].sort((a, b) => a.localeCompare(b, "es")) };
  };
})();
