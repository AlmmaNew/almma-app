// ALMMA · Subir el pedido (PDF o foto) de un cliente que YA tiene una orden abierta (26-11-2026)
// Lo usan la tienda (mis-pedidos.html) y la oficina (pedidos.html: Nueva orden y «Completar con pedido»).
//   1) buscarAbiertas(): órdenes abiertas de esa tienda con un nombre de cliente parecido.
//   2) elegirOrden(): «crear una orden nueva» o «es la misma: completar la orden X».
//   3) comparar(): cabecera campo a campo (orden ↔ PDF; quien sube elige qué dato se queda) y mercancía con casillas
//      («ya está en la orden» sin marcar, «nueva» marcada).
//   4) aplicar(): lo elegido va a la base de datos con la función completar_orden_con_pedido (migracion/147).
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sinAc = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palabras = t => sinAc(t).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 1);
  const fecha = f => String(f || "").slice(0, 10).split("-").reverse().join("/");
  const TXT_ESTADO = { en_proceso: "En proceso", recepcionado_parcial: "Recepción parcial", recepcionado_total: "Recepcionado", agendado: "Agendado", incidencia: "Incidencia" };
  const CAMPOS = [["nombre_cli", "Cliente"], ["telefono_cli", "Teléfono"], ["domicilio_cli", "Dirección"], ["localidad_cli", "Localidad"], ["num_pedido", "Nº pedido / albarán"]];

  // dos valores «son el mismo» aunque cambien tildes, mayúsculas, espacios o signos (el teléfono, solo cifras)
  function igual(campo, a, b) {
    if (campo === "telefono_cli") { const d = x => String(x || "").replace(/\D/g, "").replace(/^(0034|34)(?=\d{9}$)/, ""); return d(a) === d(b); }
    const n = x => sinAc(x).replace(/[^a-z0-9]+/g, " ").trim();
    return n(a) === n(b);
  }
  // ¿la línea del PDF ya está en la orden? (misma regla que tenía «Completar con pedido»: palabras de 4 letras o más en común)
  const toks = t => new Set(sinAc(t).replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length >= 4));
  // devuelve la línea de la orden que se parece, o null
  function lineaParecida(desc, mercOrden) {
    const t = toks(desc);
    return mercOrden.find(l => { const e = toks(l.descripcion), comunes = [...t].filter(w => e.has(w)).length; return comunes > 0 && comunes >= Math.min(2, t.size, e.size); }) || null;
  }
  const recibida = l => !!(l && (l.recibido_at || l.recibido === "S"));

  function ventana(html) {
    const f = document.createElement("div");
    f.className = "emergente";   // mis-pedidos.html dentro de «Mi tienda» oculta todo lo demás (body.emb)
    f.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2430";
    f.innerHTML = '<div style="background:#fff;border-radius:10px;max-width:760px;width:100%;padding:18px 20px;margin:auto 0">' + html + "</div>";
    document.body.appendChild(f);
    return f;
  }

  async function buscarAbiertas(client, tiendaId, nombre) {
    const A = palabras(nombre);
    if (!A.length || !tiendaId) return [];
    const { data, error } = await client.from("ordenes")
      .select("anyo, orden, nombre_cli, num_pedido, estado, fecha_creacion")
      .eq("tienda_id", tiendaId).not("estado", "in", "(completado,terminado_incidencia)").is("fecha_montaje", null)
      .order("fecha_creacion", { ascending: false }).limit(2000);
    if (error || !data) return [];   // si falla la búsqueda no se bloquea nada: se crea la orden como siempre
    return data.filter(o => {
      const B = palabras(o.nombre_cli), com = A.filter(w => B.includes(w)).length;
      return com >= 1 && com >= Math.min(2, A.length, B.length);
    }).slice(0, 5);
  }

  // devuelve {anyo, orden} si es la misma mercancía, "nueva" si quiere crear otra, o null si cancela
  function elegirOrden(nombre, lista) {
    return new Promise(resolve => {
      const f = ventana(
        '<h3 style="margin:0 0 8px">«' + esc(nombre) + '» ya tiene ' + (lista.length === 1 ? "una orden abierta" : "órdenes abiertas") + "</h3>" +
        '<p style="margin:0 0 12px;color:#4b5563;font-size:14px">Si lo que has subido es <b>otra compra distinta</b>, crea una orden nueva. Si es <b>el mismo pedido</b>, elige su orden: ' +
        "en el paso siguiente verás qué datos coinciden, cuáles faltan y qué mercancía es nueva, y decides qué se añade.</p>" +
        '<button type="button" data-nueva="1" style="display:block;width:100%;margin-bottom:14px;padding:12px;font-size:15px;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer">Crear una orden nueva (otra compra)</button>' +
        '<div style="font-size:12px;color:#6b7280;margin-bottom:6px">Es el mismo pedido → revisar y completar la orden:</div>' +
        lista.map((o, i) => '<button type="button" data-i="' + i + '" style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:10px 12px;background:#fff;color:#1f2430;border:1px solid #e2e4eb;border-radius:6px;cursor:pointer;font-size:14px">Completar la orden <b>' + o.anyo + "/" + o.orden + '</b><br><span style="font-weight:400;font-size:12px">' +
          esc(o.nombre_cli) + (o.num_pedido ? " · pedido " + esc(o.num_pedido) : "") + " · " + esc(TXT_ESTADO[o.estado] || o.estado) + " · " + esc(fecha(o.fecha_creacion)) + "</span></button>").join("") +
        '<button type="button" data-cancel="1" style="display:block;width:100%;padding:8px 12px;background:#fff;color:#1f2430;border:1px solid #e2e4eb;border-radius:6px;cursor:pointer">Cancelar</button>');
      f.onclick = e => {
        const b = e.target.closest("button"); if (!b) return;
        f.remove();
        resolve(b.dataset.nueva ? "nueva" : b.dataset.cancel ? null : lista[+b.dataset.i]);
      };
    });
  }

  // pdf = { nombre_cli, telefono_cli, domicilio_cli, localidad_cli, num_pedido, lineas: [{descripcion, cantidad, fabricante?}] }
  // devuelve { cabecera: {campo: valor}, lineas: [...] } con lo elegido, o null si cancela
  // opciones.tienda = true en las pantallas de tienda: lo ya recibido en el almacén no se puede tocar y, si la orden
  // está agendada, se avisa de que la oficina recibirá un aviso del cambio
  async function comparar(client, anyo, orden, pdf, opciones = {}) {
    const esTienda = !!opciones.tienda;
    const [{ data: o, error: e1 }, { data: ls }] = await Promise.all([
      client.from("ordenes").select("nombre_cli, telefono_cli, domicilio_cli, localidad_cli, num_pedido, estado, fecha_prev_montaje, horamont").eq("anyo", anyo).eq("orden", orden).single(),
      client.from("linorden").select("linea, tipolinea, descripcion, cantidad, recibido, recibido_at").eq("anyo", anyo).eq("orden", orden).order("linea"),
    ]);
    if (e1 || !o) throw new Error("No se pudo leer la orden " + anyo + "/" + orden + (e1 ? ": " + e1.message : ""));
    const agendada = o.estado === "agendado" || !!o.fecha_prev_montaje;
    const mercOrden = (ls || []).filter(l => l.tipolinea !== 4 && (l.descripcion || "").trim());
    const lineasPdf = (pdf.lineas || []).filter(l => String(l.descripcion || "").trim()).map(l => {
      const par = lineaParecida(l.descripcion, mercOrden);
      return { ...l, repetida: !!par, recibida: recibida(par), bloqueada: esTienda && recibida(par) };
    });

    const filas = CAMPOS.map(([k, et]) => {
      const vo = String(o[k] || "").trim(), vp = String(pdf[k] || "").trim();
      let celda;
      if (!vp) celda = '<span style="color:#6b7280">El PDF no lo trae: se deja como está</span>';
      else if (!vo) celda = '<label style="cursor:pointer"><input type="checkbox" data-campo="' + k + '" checked> <b style="color:#15803d">Falta en la orden:</b> poner «' + esc(vp) + "»</label>";
      else if (igual(k, vo, vp)) celda = '<span style="color:#15803d">✓ Coincide</span>';
      else celda = '<div style="color:#b45309;font-weight:600;margin-bottom:2px">⚠ No coincide. ¿Cuál se queda?</div>' +
        '<label style="display:block;cursor:pointer"><input type="radio" name="cp_' + k + '" value="orden" checked> El de la orden: «' + esc(vo) + "»</label>" +
        '<label style="display:block;cursor:pointer"><input type="radio" name="cp_' + k + '" value="pdf" data-campo="' + k + '"> El del PDF: «' + esc(vp) + "»</label>";
      return '<tr><td style="padding:7px 8px 7px 0;font-weight:600;vertical-align:top;white-space:nowrap">' + et + '</td><td style="padding:7px 8px;vertical-align:top;color:#374151">' + (esc(vo) || '<i style="color:#9ca3af">vacío</i>') +
        '</td><td style="padding:7px 0;vertical-align:top">' + celda + "</td></tr>";
    }).join("");

    const nuevas = lineasPdf.filter(l => !l.repetida).length;
    const cita = o.fecha_prev_montaje ? fecha(o.fecha_prev_montaje) + (o.horamont ? " (" + o.horamont + ")" : "") : "";
    const html =
      '<h3 style="margin:0 0 4px">Completar la orden ' + anyo + "/" + orden + "</h3>" +
      '<p style="margin:0 0 14px;color:#4b5563;font-size:14px">Revisa lo que trae el pedido frente a lo que ya tiene la orden. El documento se guardará en la orden.</p>' +
      (agendada ? '<div style="margin:0 0 14px;padding:10px 12px;background:#fee2e2;border:2px solid #dc2626;border-radius:8px;color:#991b1b;font-size:14px"><b>⚠ Esta orden ya está agendada' + (cita ? " para el " + esc(cita) : "") + ".</b> " +
        (esTienda ? "Si cambias algún dato o añades mercancía, la oficina de ALMMA recibirá un aviso para revisar la cita." : "Si cambias algo, revisa la cita y avisa al equipo.") + "</div>" : "") +
      '<h4 style="margin:0 0 4px">1. Datos del cliente y del pedido</h4>' +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#6b7280;font-size:12px;text-align:left"><th style="padding:4px 8px 4px 0"></th><th style="padding:4px 8px">En la orden</th><th style="padding:4px 0">Según el PDF</th></tr>' + filas + "</table></div>" +
      '<h4 style="margin:16px 0 4px">2. Mercancía del pedido</h4>' +
      (lineasPdf.length
        ? '<p style="margin:0 0 6px;font-size:13px;color:#4b5563">' + (nuevas ? "Marcadas = se añadirán a la orden. " : "") + "Lo que parece estar ya en la orden sale sin marcar; márcalo solo si de verdad hay que añadirlo otra vez.</p>" +
          '<div style="font-size:13px;margin-bottom:6px"><a href="#" data-todas="1">Marcar todas</a> · <a href="#" data-ninguna="1">Ninguna (dejarlo así)</a></div>' +
          lineasPdf.map((l, i) => {
            const etq = l.bloqueada ? "🔒 Recibido en el almacén: no se puede modificar" : l.recibida ? "Ya está en la orden (recibido)" : l.repetida ? "Ya está en la orden" : "Nueva";
            const col = l.bloqueada ? "#6b7280" : l.repetida ? "#6b7280" : "#15803d";
            return '<label style="display:flex;gap:8px;align-items:flex-start;padding:7px 8px;border:1px solid ' + (l.repetida ? "#e2e4eb" : "#bbf7d0") + ";background:" + (l.bloqueada ? "#f3f4f6" : l.repetida ? "#f9fafb" : "#f0fdf4") + ";border-radius:6px;margin-bottom:5px;cursor:" + (l.bloqueada ? "not-allowed" : "pointer") + ';font-size:13px">' +
              '<input type="checkbox" data-linea="' + i + '"' + (l.repetida ? "" : " checked") + (l.bloqueada ? " disabled" : "") + ' style="margin-top:2px"><span style="flex:1' + (l.bloqueada ? ";color:#6b7280" : "") + '">' + esc(l.cantidad || 1) + " × " + esc(l.descripcion) + (l.fabricante ? ' <span style="color:#6b7280">(' + esc(l.fabricante) + ")</span>" : "") + "</span>" +
              '<span style="font-size:12px;font-weight:600;text-align:right;max-width:200px;color:' + col + '">' + etq + "</span></label>";
          }).join("")
        : '<p style="margin:0;font-size:13px;color:#6b7280">El documento no trae líneas de mercancía.</p>') +
      (mercOrden.length ? '<details style="margin-top:8px;font-size:13px"><summary style="cursor:pointer;color:#2563eb">Ver lo que ya tiene la orden (' + mercOrden.length + ")</summary><ul style=\"margin:6px 0 0 18px;padding:0\">" +
        mercOrden.map(l => "<li>" + esc(l.cantidad || 1) + " × " + esc(l.descripcion) + (recibida(l) ? ' <b style="color:#15803d">✓ recibido</b>' : "") + "</li>").join("") + "</ul></details>" : "") +
      (o.estado === "incidencia" && !agendada ? '<p id="cp_aviso_estado" style="display:none;margin:10px 0 0;padding:8px 10px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;font-size:13px;color:#92400e">La orden está en incidencia: si añades mercancía, revisadlo con ALMMA.</p>' : "") +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button type="button" data-ok="1" style="padding:10px 18px;font-size:15px;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer">💾 Guardar en la orden</button>' +
      '<button type="button" data-cancel="1" style="padding:10px 18px;background:#fff;color:#1f2430;border:1px solid #e2e4eb;border-radius:6px;cursor:pointer">Cancelar</button></div>';

    return new Promise(resolve => {
      const f = ventana(html);
      const avisoEstado = f.querySelector("#cp_aviso_estado");
      const refrescar = () => { if (avisoEstado) avisoEstado.style.display = f.querySelector("[data-linea]:checked") ? "block" : "none"; };
      refrescar();
      f.addEventListener("change", refrescar);
      f.onclick = e => {
        const a = e.target.closest("a[data-todas],a[data-ninguna]");
        if (a) { e.preventDefault(); f.querySelectorAll("[data-linea]:not(:disabled)").forEach(c => c.checked = !!a.dataset.todas); refrescar(); return; }
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.cancel) { f.remove(); resolve(null); return; }
        if (!b.dataset.ok) return;
        const cabecera = {};
        f.querySelectorAll("input[data-campo]:checked").forEach(c => { cabecera[c.dataset.campo] = String(pdf[c.dataset.campo] || "").trim(); });
        const lineas = [...f.querySelectorAll("[data-linea]:checked:not(:disabled)")].map(c => lineasPdf[+c.dataset.linea]);
        f.remove();
        resolve({ cabecera, lineas });
      };
    });
  }

  // manda lo elegido a la base de datos; devuelve {cabecera, lineas, estado}
  async function aplicar(client, anyo, orden, eleccion) {
    if (!Object.keys(eleccion.cabecera).length && !eleccion.lineas.length) return { cabecera: 0, lineas: 0 };
    const { data, error } = await client.rpc("completar_orden_con_pedido", {
      p_anyo: anyo, p_orden: orden, p_cabecera: eleccion.cabecera,
      p_lineas: eleccion.lineas.map(l => ({ descripcion: String(l.descripcion || "").trim(), cantidad: Math.max(1, Math.round(parseFloat(String(l.cantidad).replace(",", ".")) || 1)), proveedor: l.proveedor ?? null })),
    });
    if (error) {
      if (/completar_orden_con_pedido/.test(error.message || "") && /function|funci/i.test(error.message || "")) throw new Error("Falta preparar la base de datos para completar órdenes (SQL 147). Avisa a ALMMA.");
      throw new Error(error.message);
    }
    return data || {};
  }

  // frase para el aviso final: «se ha rellenado/cambiado 2 datos y añadido 1 línea»
  function resumen(r) {
    const p = [];
    if (r.cabecera) p.push(r.cabecera + (r.cabecera === 1 ? " dato del cliente actualizado" : " datos del cliente actualizados"));
    if (r.lineas) p.push(r.lineas + (r.lineas === 1 ? " línea de mercancía añadida" : " líneas de mercancía añadidas"));
    return (p.length ? p.join(" y ") : "sin cambios en los datos ni en la mercancía") +
      (r.aviso_oficina ? ". ⚠ La orden estaba agendada: se ha avisado a la oficina de ALMMA para que revise la cita" : "");
  }

  window.CompletarPedido = { buscarAbiertas, elegirOrden, comparar, aplicar, resumen };
})();
