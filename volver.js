/* ALMMA · botón «← Volver» común (22-11-2026, petición de Arturo: «volver a la página anterior en todas las pantallas»).
   Se carga con <script src="volver.js" defer></script> en el <head> de cada pantalla.
   - Vuelve a la pantalla anterior de ALMMA (como la flecha del navegador). Si no la hay (pestaña nueva, enlace directo,
     app instalada recién abierta), va a Inicio.
   - Lo coloca solo: en la barra de botones de arriba (#toolbar, #topbar, #menubar, header, .top, #barra) justo antes
     del primer botón; si la pantalla no tiene barra, añade una franja fina arriba del todo.
   - No se pone en las pantallas que ya tienen su propio «Volver» (botón con onclick="volver()"), ni al imprimir.
   - No se carga en login.html ni en inicio.html (Inicio es la pantalla de partida). */
(function () {
  function hayAnteriorDeAlmma() {
    try { return !!document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1; }
    catch (e) { return false; }
  }
  function volverAtras() {
    if (hayAnteriorDeAlmma()) history.back();
    else location.href = "inicio.html";
  }
  window.almmaVolverAtras = volverAtras;

  function poner() {
    if (document.getElementById("btn_volver_comun")) return;
    // la pantalla ya trae su propio «Volver»
    if (document.querySelector('[onclick^="volver("]')) return;
    // factura abierta desde el QR, sin sesión: no hay pantalla anterior de ALMMA
    if (/factura_imprimir\.html$/.test(location.pathname) && new URLSearchParams(location.search).has("t")) return;

    const est = document.createElement("style");
    est.textContent =
      "#btn_volver_comun{cursor:pointer;font-weight:600;white-space:nowrap}" +
      "#franja_volver{display:flex;padding:8px 16px;background:#fff;border-bottom:1px solid #e2e8f0}" +
      "#franja_volver #btn_volver_comun{background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:8px;padding:7px 14px;font-size:14px}" +
      "#franja_volver #btn_volver_comun:hover{background:#f1f5f9}" +
      "@media print{#btn_volver_comun,#franja_volver{display:none !important}}";
    document.head.appendChild(est);

    const b = document.createElement("button");
    b.id = "btn_volver_comun";
    b.type = "button";
    b.className = "secondary";
    b.textContent = "← Volver";
    b.title = "Volver a la pantalla anterior";
    b.addEventListener("click", volverAtras);

    // primera barra que exista, por este orden de preferencia
    const sitio = ["#toolbar", "#topbar", "header", "#menubar", ".top", "#barra"]
      .map(s => document.querySelector(s)).find(Boolean);
    if (sitio) {
      // justo antes del primer botón o enlace de la barra (aunque esté dentro de un grupo)
      const antes = sitio.querySelector("button, a");
      if (antes) antes.parentNode.insertBefore(b, antes);
      else sitio.insertBefore(b, sitio.firstChild);
    } else {
      const franja = document.createElement("div");
      franja.id = "franja_volver";
      franja.className = "noprint";
      franja.appendChild(b);
      document.body.insertBefore(franja, document.body.firstChild);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poner);
  else poner();
})();
