/* ALMMA · calendario.js — calendario propio para TODAS las casillas de fecha (<input type="date">) de la web (26-11-2026).
   El calendario que trae el navegador no se puede colorear, así que al pinchar una casilla de fecha sale este:
   · festivos en rojo (tabla `festivos`, Administración → Festivos), sábados y domingos en gris;
   · ausencias y vacaciones del personal (tabla `ausencias`, SQL 149, pantalla ausencias.html): un puntito en el día y, debajo,
     la lista del mes. Solo la oficina las ve (RLS); las tiendas y los montadores ven solo los festivos.
   La casilla sigue siendo la misma (mismo valor aaaa-mm-dd, mismos onchange), así que las pantallas no cambian: basta enlazar
   este fichero. Se puede seguir escribiendo la fecha a mano en el ordenador (con el tabulador). Para no usarlo en una casilla:
   data-calendario="no". Necesita la variable global `client` (Supabase) de la pantalla; sin ella, sale sin festivos. */
(function () {
  if (window.Calendario) return;
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const TIPOS = { vacaciones: { t: "Vacaciones", i: "🏖", c: "#0284c7" }, ausencia: { t: "Ausencia", i: "🚫", c: "#d97706" }, baja: { t: "Baja", i: "🩺", c: "#7c3aed" } };
  const CLAVE = "almma_calendario_v1", DURA = 10 * 60 * 1000;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const deIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const corta = s => { const d = deIso(s); return d ? d.getDate() + " " + MESES[d.getMonth()].slice(0, 3).toLowerCase() : ""; };

  /* ---------- datos: festivos + ausencias, guardados 10 min en la pestaña ---------- */
  let datos = null, cargando = null;
  function cli() { try { return typeof client !== "undefined" ? client : null; } catch (e) { return null; } }
  async function cargar(forzar) {
    if (!forzar && datos) return datos;
    if (!forzar) try { const c = JSON.parse(sessionStorage.getItem(CLAVE) || "null"); if (c && Date.now() - c.t < DURA) return datos = c.d; } catch (e) {}
    if (cargando) return cargando;
    const c = cli(); if (!c) return datos = { festivos: {}, ausencias: [] };
    cargando = (async () => {
      const desde = new Date(); desde.setFullYear(desde.getFullYear() - 2);
      const [f, a] = await Promise.all([
        c.from("festivos").select("fecha, nombre").then(r => r, () => ({ data: [] })),
        c.from("ausencias").select("tipo, desde, hasta, motivo, montadores(nombre), staff(nombre)").gte("hasta", iso(desde)).order("desde").limit(5000).then(r => r, () => ({ data: [] }))]);
      const d = { festivos: {}, ausencias: [] };
      (f.data || []).forEach(x => d.festivos[x.fecha] = x.nombre || "Festivo");
      (a.data || []).forEach(x => d.ausencias.push({ tipo: x.tipo, desde: x.desde, hasta: x.hasta, motivo: x.motivo || "", nombre: (x.montadores && x.montadores.nombre) || (x.staff && x.staff.nombre) || "?" }));
      try { sessionStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
      cargando = null; return datos = d;
    })();
    return cargando;
  }
  function invalidar() { datos = null; try { sessionStorage.removeItem(CLAVE); } catch (e) {} }
  const ausentesDel = (d, dia) => d.ausencias.filter(a => a.desde <= dia && a.hasta >= dia);
  const esLaborable = (d, dia) => { const x = deIso(dia); return x && x.getDay() !== 0 && x.getDay() !== 6 && !d.festivos[dia]; };

  /* ---------- estilo ---------- */
  const css = document.createElement("style");
  css.textContent = `
input[type=date]:not([data-calendario=no])::-webkit-calendar-picker-indicator{display:none}
input[type=date]:not([data-calendario=no]):not(:disabled):not([readonly]:not([data-cal-ro])){cursor:pointer;padding-right:26px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M3 10h18M8 3v4M16 3v4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 6px center;background-size:15px}
#almcal{position:fixed;z-index:100000;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 18px 40px -12px rgba(15,23,42,.35);padding:10px;width:300px;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2430;user-select:none}
#almcal .cb{display:flex;align-items:center;gap:4px;margin-bottom:6px}
#almcal .cb button{border:0;background:#f1f5f9;border-radius:8px;width:32px;height:32px;font-size:18px;cursor:pointer;color:#1e3a8a;padding:0}
#almcal .cb select{flex:1;min-width:0;padding:5px 4px;border:1px solid #e2e4eb;border-radius:8px;font-size:14px;background:#fff;color:#1f2430}
#almcal .cb select.an{flex:0 0 76px}
#almcal table{border-collapse:collapse;width:100%;table-layout:fixed}
#almcal th{font-size:11px;color:#6b7280;font-weight:600;padding:2px 0}
#almcal td{padding:1px}
#almcal td button{position:relative;width:100%;height:34px;border:1px solid transparent;border-radius:8px;background:none;cursor:pointer;font-size:14px;color:#1f2430;padding:0}
#almcal td button:hover{background:#eff6ff;border-color:#bfdbfe}
#almcal td button.fuera{color:#cbd5e1}
#almcal td button.finde{background:#f8fafc;color:#94a3b8}
#almcal td button.fest{background:#fee2e2;color:#b91c1c;font-weight:700}
#almcal td button.hoy{border-color:#2563eb}
#almcal td button.sel{background:#2563eb!important;color:#fff!important;font-weight:700}
#almcal td button:disabled{opacity:.3;cursor:not-allowed;background:none}
#almcal td button i{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);display:flex;gap:2px}
#almcal td button i b{width:5px;height:5px;border-radius:50%;display:block}
#almcal .pie{display:flex;gap:6px;margin-top:8px}
#almcal .pie button{flex:1;border:1px solid #e2e4eb;background:#fff;border-radius:8px;padding:7px 4px;cursor:pointer;font-size:13px;color:#1e3a8a}
#almcal .lista{margin-top:8px;border-top:1px solid #e2e4eb;padding-top:6px;max-height:140px;overflow:auto;font-size:12px;line-height:1.45}
#almcal .lista div{padding:1px 0} #almcal .lista .f{color:#b91c1c} #almcal .lista .nada{color:#6b7280}
#almcal .ley{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:#6b7280;margin-top:6px}
#almcal .ley span::before{content:"";display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:3px;vertical-align:-1px;background:var(--c)}
#almcal-fondo{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.35)}
@media (max-width:600px){#almcal{left:50%!important;top:auto!important;bottom:12px!important;transform:translateX(-50%);width:min(340px,calc(100vw - 16px))}#almcal td button{height:40px}}
@media print{#almcal,#almcal-fondo{display:none!important}}`;
  (document.head || document.documentElement).appendChild(css);

  /* ---------- el calendario ---------- */
  let pop = null, fondo = null, input = null, vista = null;
  function cerrar() {
    if (pop) pop.remove(); if (fondo) fondo.remove(); pop = fondo = null;
    if (input && input.dataset.calRo) { input.readOnly = false; delete input.dataset.calRo; }
    input = null;
  }
  function elegir(v) {
    const el = input; cerrar(); if (!el) return;
    if (el.value !== v) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
    try { el.focus({ preventScroll: true }); } catch (e) {}
  }
  function pintar() {
    if (!pop) return;
    const d = datos || { festivos: {}, ausencias: [] };
    const y = vista.getFullYear(), m = vista.getMonth(), hoy = iso(new Date()), sel = input.value;
    const min = input.min || "", max = input.max || "";
    const primero = new Date(y, m, 1), ini = new Date(y, m, 1 - ((primero.getDay() + 6) % 7));
    const anyoAct = new Date().getFullYear(); let anyos = "";
    for (let a = Math.min(2004, y); a <= Math.max(anyoAct + 3, y); a++) anyos += '<option' + (a === y ? " selected" : "") + '>' + a + '</option>';
    let filas = "";
    for (let s = 0; s < 6; s++) {
      filas += "<tr>";
      for (let k = 0; k < 7; k++) {
        const dia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + s * 7 + k), v = iso(dia);
        const fest = d.festivos[v], aus = ausentesDel(d, v);
        const cls = [dia.getMonth() !== m ? "fuera" : "", (k >= 5) ? "finde" : "", fest ? "fest" : "", v === hoy ? "hoy" : "", v === sel ? "sel" : ""].join(" ");
        const tit = [fest ? "🎉 " + fest : "", ...aus.map(a => (TIPOS[a.tipo] || TIPOS.ausencia).i + " " + a.nombre + " · " + (TIPOS[a.tipo] || TIPOS.ausencia).t + (a.motivo ? ": " + a.motivo : ""))].filter(Boolean).join("\n");
        const puntos = aus.length ? '<i>' + [...new Set(aus.map(a => a.tipo))].map(t => '<b style="background:' + (TIPOS[t] || TIPOS.ausencia).c + '"></b>').join("") + '</i>' : "";
        filas += '<td><button type="button" data-v="' + v + '" class="' + cls + '"' + (tit ? ' title="' + esc(tit) + '"' : "") + ((min && v < min) || (max && v > max) ? " disabled" : "") + '>' + dia.getDate() + puntos + '</button></td>';
      }
      filas += "</tr>";
    }
    // lo del mes, debajo (en el móvil no hay «pasar el ratón»)
    const ini_m = iso(primero), fin_m = iso(new Date(y, m + 1, 0));
    const fes = Object.keys(d.festivos).filter(f => f >= ini_m && f <= fin_m).sort().map(f => '<div class="f">🎉 ' + corta(f) + ' · ' + esc(d.festivos[f]) + '</div>');
    const aus = d.ausencias.filter(a => a.desde <= fin_m && a.hasta >= ini_m).map(a => {
      const T = TIPOS[a.tipo] || TIPOS.ausencia;
      return '<div><span style="color:' + T.c + '">' + T.i + '</span> <b>' + esc(a.nombre) + '</b> · ' + T.t + (a.motivo ? ': ' + esc(a.motivo) : '') + ' · ' + (a.desde === a.hasta ? corta(a.desde) : corta(a.desde) + ' → ' + corta(a.hasta)) + '</div>';
    });
    const hayAus = d.ausencias.length > 0;
    pop.innerHTML =
      '<div class="cb"><button type="button" data-n="-1" title="Mes anterior">‹</button><select class="me">' + MESES.map((n, i) => '<option value="' + i + '"' + (i === m ? " selected" : "") + '>' + n + '</option>').join("") +
      '</select><select class="an">' + anyos + '</select><button type="button" data-n="1" title="Mes siguiente">›</button></div>' +
      '<table><tr>' + ["L", "M", "X", "J", "V", "S", "D"].map(x => "<th>" + x + "</th>").join("") + '</tr>' + filas + '</table>' +
      '<div class="ley"><span style="--c:#fee2e2">Festivo</span>' + (hayAus ? Object.values(TIPOS).map(T => '<span style="--c:' + T.c + '">' + T.t + '</span>').join("") : "") + '</div>' +
      '<div class="lista">' + ((fes.length || aus.length) ? fes.join("") + aus.join("") : '<div class="nada">Este mes no hay festivos' + (hayAus ? ' ni ausencias' : '') + '.</div>') + '</div>' +
      '<div class="pie"><button type="button" data-a="hoy">Hoy</button>' + (input.required ? "" : '<button type="button" data-a="borrar">Borrar</button>') + '<button type="button" data-a="cerrar">Cerrar</button></div>';
    colocar();
  }
  function colocar() {
    if (!pop || !input || window.innerWidth <= 600) return;
    const r = input.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;
    let top = r.bottom + 4; if (top + h > window.innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
    pop.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + "px";
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
  }
  function abrir(el) {
    cerrar(); input = el;
    vista = deIso(el.value) || deIso(el.min && el.min > iso(new Date()) ? el.min : "") || new Date(); vista.setDate(1);
    if (window.innerWidth <= 600) { fondo = document.createElement("div"); fondo.id = "almcal-fondo"; fondo.onclick = cerrar; document.body.appendChild(fondo); }
    pop = document.createElement("div"); pop.id = "almcal"; pop.setAttribute("role", "dialog");
    pop.addEventListener("mousedown", e => { if (e.target.tagName !== "SELECT") e.preventDefault(); }); // que la casilla no pierda el foco
    pop.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.v) return elegir(b.dataset.v);
      if (b.dataset.n) { vista = new Date(vista.getFullYear(), vista.getMonth() + +b.dataset.n, 1); return pintar(); }
      if (b.dataset.a === "hoy") return elegir(iso(new Date()));
      if (b.dataset.a === "borrar") return elegir("");
      if (b.dataset.a === "cerrar") return cerrar();
    });
    pop.addEventListener("change", e => {
      if (e.target.classList.contains("me")) vista = new Date(vista.getFullYear(), +e.target.value, 1);
      if (e.target.classList.contains("an")) vista = new Date(+e.target.value, vista.getMonth(), 1);
      pintar();
    });
    document.body.appendChild(pop); pintar();
    if (!datos) cargar().then(() => { if (pop && input === el) pintar(); });
  }
  const valeLa = el => el && el.tagName === "INPUT" && el.type === "date" && el.dataset.calendario !== "no" && !el.disabled && (!el.readOnly || el.dataset.calRo);
  // pointerdown: se pone la casilla en «solo lectura» un momento para que el navegador NO saque su propio calendario (móvil, Safari, Firefox)
  document.addEventListener("pointerdown", e => {
    const el = e.target;
    if (pop && !pop.contains(el) && el !== input) cerrar();
    if (valeLa(el) && !el.readOnly) { el.readOnly = true; el.dataset.calRo = "1"; }
  }, true);
  document.addEventListener("click", e => {
    const el = e.target; if (!valeLa(el)) return;
    e.preventDefault();
    if (pop && input === el) return cerrar();
    abrir(el);
    // en el ordenador se puede seguir escribiendo la fecha a mano
    if (el.dataset.calRo && !matchMedia("(pointer: coarse)").matches) setTimeout(() => { if (el.dataset.calRo) { el.readOnly = false; delete el.dataset.calRo; } }, 0);
  }, true);
  document.addEventListener("keydown", e => { if (pop && e.key === "Escape") { e.stopPropagation(); cerrar(); } }, true);
  window.addEventListener("resize", () => { if (pop) colocar(); });
  document.addEventListener("scroll", e => { if (pop && !pop.contains(e.target)) colocar(); }, true);

  window.Calendario = { cargar, invalidar, ausentesDel, esLaborable, TIPOS, iso, deIso };
})();
