// ALMMA · Avisos de dirección (27-11-2026). Solo para quien tiene staff.acceso_finanzas (Arturo y José).
// Uso: alertasDireccion(client, elementoContenedor)  →  pinta un recuadro con lo que pide atención HOY.
// Se calcula al momento con los mismos criterios que el Panel de dirección (direccion.html). No guarda nada en la base de datos.
// «Ocultar hasta mañana» solo se recuerda en ese navegador (localStorage).
(function () {
  // ---- umbrales (cambiar aquí) ----
  const U = {
    cobroDias: 90,          // facturas pendientes de cobro con más de X días
    cobroAvisoDias: 60,     // … y aviso suave entre 60 y 90
    sinFacturarDias: 30,    // montado hace más de X días y aún sin facturar
    sinCitaDias: 15,        // mercancía completa en almacén y sin cita desde hace más de X días
    incidenciaDias: 7,      // incidencias abiertas desde hace más de X días
    caidaFacturacion: 0.15, // facturado este mes un X % por debajo del mismo periodo del año pasado…
    caidaDesdeDia: 10,      // …solo a partir del día X del mes (antes es muy pronto para comparar)
    bolsaDias: 15,          // órdenes listas para montar y sin cita que suman más de X días de trabajo (rojo si el doble)
    perdidaCapacidad: 0.2,  // en las próximas 3 semanas, una semana pierde más del X % de capacidad por ausencias
    bolsaViejaMax: 20,      // más de X órdenes sin cita con la mercancía recibida hace más de 90 días
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const eur = x => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(x || 0));
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const d10 = s => s ? String(s).slice(0, 10) : "";
  const HOY = new Date(); HOY.setHours(0, 0, 0, 0);
  const HOYS = iso(HOY);
  const dias = a => Math.round((new Date(HOYS) - new Date(a)) / 86400000);
  const CLAVE = "alertas_dir_oculto";

  async function todo(fabrica) {
    let out = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await fabrica().range(desde, desde + 999);
      if (error) throw error;
      out = out.concat(data || []);
      if (!data || data.length < 1000) return out;
    }
  }

  async function calcular(client) {
    const hace1a = iso(new Date(HOY.getFullYear() - 1, HOY.getMonth(), HOY.getDate()));
    const ini = new Date(HOY.getFullYear(), HOY.getMonth(), 1), man = new Date(HOY); man.setDate(man.getDate() + 1);
    const iniLY = new Date(ini), manLY = new Date(man); iniLY.setFullYear(iniLY.getFullYear() - 1); manLY.setFullYear(manLY.getFullYear() - 1);
    const seguro = p => p.catch(e => { console.warn("alertas:", e); return null; });   // si una parte falla, las demás siguen
    const [contF, contC, pend, sinCita, inc, fMes, fLY, tiendas] = await Promise.all([
      seguro(todo(() => client.from("cont_facturas").select("id, cliente, fecha, total, retencion").order("id"))),
      seguro(todo(() => client.from("cont_cobros").select("factura_id, importe").order("id"))),
      seguro(client.rpc("facturas_pendientes").then(r => { if (r.error) throw r.error; return r.data || []; })),
      seguro(todo(() => client.from("ordenes").select("anyo, orden, tienda_id, fecha_creacion, fecha_recepcion").eq("estado", "recepcionado_total")
        .is("fecha_prev_montaje", null).is("fecha_montaje", null).or("fecha_creacion.gte." + hace1a + ",fecha_recepcion.gte." + hace1a).order("anyo").order("orden"))),
      seguro(todo(() => client.from("incidencias").select("anyo, orden, tipo, estado, created_at, resuelto_at").order("created_at"))),
      seguro(todo(() => client.from("cabfacturas").select("impbruto").neq("serie", 5).gte("ffactura", iso(ini)).lt("ffactura", iso(man)).order("factura"))),
      seguro(todo(() => client.from("cabfacturas").select("impbruto").neq("serie", 5).gte("ffactura", iso(iniLY)).lt("ffactura", iso(manLY)).order("factura"))),
      seguro(todo(() => client.from("tiendas").select("id, nombre, nombre_comercial").order("id"))),
    ]);
    const tN = new Map((tiendas || []).map(t => [t.id, t.nombre_comercial || t.nombre]));
    const A = [];   // { nivel: "r" | "a", ico, titulo, detalle, href, clave }

    // 1. Cobros vencidos
    if (contF && contC) {
      const cob = {}; contC.forEach(c => { cob[c.factura_id] = (cob[c.factura_id] || 0) + (+c.importe || 0); });
      const p = contF.map(f => ({ ...f, pend: Math.round(((+f.total || 0) - (+f.retencion || 0) - (cob[f.id] || 0)) * 100) / 100, d: dias(f.fecha) })).filter(f => f.pend > 0.5);
      const rojo = p.filter(f => f.d > U.cobroDias), amb = p.filter(f => f.d > U.cobroAvisoDias && f.d <= U.cobroDias);
      if (rojo.length) {
        const porC = new Map(); rojo.forEach(f => porC.set(f.cliente, (porC.get(f.cliente) || 0) + f.pend));
        const top = [...porC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => esc(c) + " " + eur(v)).join(" · ");
        A.push({ nivel: "r", ico: "💶", titulo: eur(rojo.reduce((s, f) => s + f.pend, 0)) + " sin cobrar con más de " + U.cobroDias + " días (" + rojo.length + " facturas)", detalle: "Más deben: " + top, href: "contabilidad.html", clave: "cobro90" });
      }
      if (amb.length) A.push({ nivel: "a", ico: "💶", titulo: eur(amb.reduce((s, f) => s + f.pend, 0)) + " sin cobrar entre " + U.cobroAvisoDias + " y " + U.cobroDias + " días (" + amb.length + " facturas)", detalle: "Pasarán a vencidas pronto si no se reclaman.", href: "contabilidad.html", clave: "cobro60" });
    }
    // 2. Montado sin facturar
    if (pend) {
      const v = pend.filter(l => l.fecha_montaje && dias(d10(l.fecha_montaje)) > U.sinFacturarDias);
      if (v.length) {
        const ords = new Set(v.map(l => l.anyo + "/" + l.orden)).size;
        A.push({ nivel: "r", ico: "🧾", titulo: eur(v.reduce((s, l) => s + (+l.importe_cobrar || 0), 0)) + " montado hace más de " + U.sinFacturarDias + " días y sin facturar", detalle: ords + " órdenes. La más antigua se montó hace " + Math.max(...v.map(l => dias(d10(l.fecha_montaje)))) + " días.", href: "facturas.html?tab=pendiente", clave: "sinfact" });
      }
    }
    // 3. Recepcionadas sin cita
    if (sinCita) {
      const ref = o => d10(o.fecha_recepcion) || d10(o.fecha_creacion);
      const v = sinCita.filter(o => dias(ref(o)) > U.sinCitaDias);
      if (v.length) {
        const porT = new Map(); v.forEach(o => porT.set(o.tienda_id, (porT.get(o.tienda_id) || 0) + 1));
        const top = [...porT.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => esc(tN.get(t) || "¿?") + " (" + n + ")").join(" · ");
        A.push({ nivel: v.length > 20 ? "r" : "a", ico: "📦", titulo: v.length + " órdenes con la mercancía en almacén y sin cita desde hace más de " + U.sinCitaDias + " días", detalle: "Más en: " + top + ". Ocupan almacén y retrasan el cobro.", href: "planificar.html", clave: "sincita" });
      }
    }
    // 4. Incidencias viejas
    if (inc) {
      const v = inc.filter(i => i.estado !== "resuelta" && i.estado !== "cerrada" && !i.resuelto_at && dias(d10(i.created_at)) > U.incidenciaDias);
      if (v.length) A.push({ nivel: "a", ico: "⚠️", titulo: v.length + " incidencias abiertas desde hace más de " + U.incidenciaDias + " días", detalle: "La más antigua, hace " + dias(d10(v[0].created_at)) + " días. Si ya están resueltas, ciérralas en Incidencias.", href: "incidencias.html", clave: "incid" });
    }
    // 5. Facturación del mes por debajo del año pasado
    if (fMes && fLY && HOY.getDate() >= U.caidaDesdeDia) {
      const a = fMes.reduce((s, f) => s + (+f.impbruto || 0), 0), b = fLY.reduce((s, f) => s + (+f.impbruto || 0), 0);
      if (b > 0 && (a - b) / b <= -U.caidaFacturacion)
        A.push({ nivel: "a", ico: "📉", titulo: "Este mes se ha facturado un " + Math.round((b - a) / b * 100) + " % menos que el año pasado a estas alturas", detalle: eur(a) + " frente a " + eur(b) + " (hasta el día " + HOY.getDate() + "). Puede ser solo facturación con retraso: mira «Montado sin facturar».", href: "direccion.html", clave: "caida" });
    }
    // 6. Carga y capacidad (capacidad.js): bolsa grande, semanas con poca gente y órdenes viejas sin cerrar
    if (window.calcularCapacidad) {
      const c = await seguro(calcularCapacidad(client));
      if (c) {
        const b = c.bolsa, f1 = x => x.toFixed(1).replace(".", ",");
        if (b.diasTrabajo !== null && b.diasTrabajo > U.bolsaDias)
          A.push({ nivel: b.diasTrabajo > 2 * U.bolsaDias ? "r" : "a", ico: "🚚", titulo: b.activa + " órdenes listas para montar y sin cita: unos " + Math.round(b.diasTrabajo) + " días de trabajo al ritmo actual", detalle: "Ritmo de las últimas semanas: " + f1(c.montDia) + " montajes al día. Si la bolsa sigue creciendo, hace falta más gente o más horas.", href: "direccion.html", clave: "bolsa" });
        const corta = c.semanas.slice(0, 3).find(s => s.perdida > U.perdidaCapacidad);
        if (corta)
          A.push({ nivel: "a", ico: "🏖", titulo: "Semana del " + corta.ini.slice(8, 10) + "/" + corta.ini.slice(5, 7) + ": un " + Math.round(corta.perdida * 100) + " % menos de capacidad por ausencias", detalle: "Fuera: " + esc([...corta.ausentes.keys()].join(", ")) + ". Capacidad estimada " + corta.capacidad + " montajes, agendados " + corta.agendado + ".", href: "direccion.html", clave: "ausencias" });
        if (b.vieja > U.bolsaViejaMax)
          A.push({ nivel: "a", ico: "🗂", titulo: b.vieja + " órdenes con la mercancía recibida hace más de " + b.diasVieja + " días y sin cita ni montaje", detalle: "Seguramente ya se montaron o se anularon y no se cerraron. Revisarlas en Órdenes deja los números limpios.", href: "pedidos.html", clave: "viejas" });
      }
    }
    return A.sort((x, y) => (x.nivel === "r" ? 0 : 1) - (y.nivel === "r" ? 0 : 1));
  }

  function leerOcultos() { try { const o = JSON.parse(localStorage.getItem(CLAVE) || "{}"); return o.dia === HOYS ? o.claves || [] : []; } catch (e) { return []; } }
  function guardarOcultos(claves) { try { localStorage.setItem(CLAVE, JSON.stringify({ dia: HOYS, claves })); } catch (e) {} }

  window.alertasDireccion = async function (client, cont) {
    if (!cont) return;
    if (!document.getElementById("alertas_dir_css")) {
      const st = document.createElement("style"); st.id = "alertas_dir_css";
      st.textContent = ".adir{background:#fff;border:1px solid #fecaca;border-left:5px solid #dc2626;border-radius:12px;padding:14px 16px;margin:0 0 20px;box-shadow:0 6px 14px -10px rgba(30,41,59,.3);font-family:inherit}" +
        ".adir.ok{border-color:#bbf7d0;border-left-color:#16a34a}.adir h2{font-size:16px;margin:0 0 8px;display:flex;align-items:center;gap:8px}.adir h2 span{flex:1}" +
        ".adir h2 button,.adir .x{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;color:#475569;font-weight:500}" +
        ".adir .al{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid #f1f5f9}.adir .al:first-of-type{border-top:0}" +
        ".adir .ico{font-size:20px;line-height:1.2}.adir .tx{flex:1;min-width:0}.adir .tx a{color:#0f172a;font-weight:700;text-decoration:none;font-size:14px}.adir .tx a:hover{color:#2563eb;text-decoration:underline}" +
        ".adir .tx div{color:#64748b;font-size:13px;margin-top:2px}.adir .r .tx a{color:#b91c1c}.adir .muted{color:#64748b;font-size:13px}";
      document.head.appendChild(st);
    }
    cont.innerHTML = '<div class="adir ok"><span class="muted">Comprobando avisos de dirección…</span></div>';
    let A;
    try { A = await calcular(client); } catch (e) { console.warn(e); cont.innerHTML = ""; return; }
    const pintar = () => {
      const ocultos = leerOcultos(), vis = A.filter(a => !ocultos.includes(a.clave)), nOcultos = A.length - vis.length;
      if (!A.length) { cont.innerHTML = '<div class="adir ok"><h2><span>✅ Avisos de dirección</span></h2><span class="muted">Nada urgente hoy: cobros, facturación, citas e incidencias al día.</span></div>'; return; }
      cont.innerHTML = '<div class="adir' + (vis.length ? "" : " ok") + '"><h2><span>' + (vis.length ? "⚠ Avisos de dirección (" + vis.length + ")" : "✅ Avisos de dirección") + "</span>" +
        (nOcultos ? '<button data-ver="1">Ver ' + nOcultos + " oculto" + (nOcultos > 1 ? "s" : "") + "</button>" : "") + "</h2>" +
        (vis.map(a => '<div class="al ' + a.nivel + '"><div class="ico">' + a.ico + '</div><div class="tx"><a href="' + a.href + '">' + a.titulo + "</a><div>" + a.detalle + '</div></div><button class="x" data-ocultar="' + a.clave + '" title="Ocultar hasta mañana">Hasta mañana</button></div>').join("") ||
          '<span class="muted">Has ocultado todos los avisos de hoy.</span>') + "</div>";
    };
    cont.onclick = ev => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.ocultar) guardarOcultos([...leerOcultos(), b.dataset.ocultar]);
      if (b.dataset.ver) guardarOcultos([]);
      pintar();
    };
    pintar();
  };
})();
