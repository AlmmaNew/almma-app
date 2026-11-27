// ALMMA · sesion.js (27-11-2026)
// Si se pierde la sesión (cerrada en otra pestaña, caducada, cuenta bloqueada…), lleva a «Iniciar sesión» y, al entrar,
// se vuelve a la misma pantalla (login.html?volver=…). Antes las pantallas enseñaban «permission denied for …».
// Va en todas las pantallas que piden usuario, justo DESPUÉS de la librería de Supabase y ANTES de crear el cliente
// (supabase.createClient), porque vigila las peticiones del navegador. NO va en las páginas públicas (login, cita,
// valoracion; factura_imprimir con ?t= se lo salta sola).
(function () {
  const CLAVE = "sb-uamgbtbsxbrgymhqalak-auth-token";   // donde guarda la sesión la librería de Supabase
  const SERVIDOR = "uamgbtbsxbrgymhqalak.supabase.co";
  const pagina = location.pathname.split("/").pop() || "";
  if (pagina === "factura_imprimir.html" && new URLSearchParams(location.search).get("t")) return;   // factura por QR: sin sesión a propósito

  let yendo = false;
  function irAlLogin() {
    if (yendo) return;
    yendo = true;
    let w = window;   // dentro de «Mi tienda» (pantalla metida en otra) se cambia la de fuera
    try { if (window.top !== window && window.top.location.origin === location.origin) w = window.top; } catch (e) {}
    const pag = w.location.pathname.split("/").pop() || "";
    const conDatos = pag + w.location.search;
    // mismo filtro que login.html: solo páginas .html de esta web
    const volver = /^[A-Za-z0-9_-]+\.html(\?[A-Za-z0-9=,&_-]*)?$/.test(conDatos) ? conDatos : /^[A-Za-z0-9_-]+\.html$/.test(pag) ? pag : "";
    w.location.replace("login.html" + (volver && pag !== "inicio.html" ? "?volver=" + encodeURIComponent(volver) : ""));
  }
  window.irAlLogin = irAlLogin;

  // 1) Una petición a la base de datos sale SIN usuario (la librería manda la clave pública como si fuera el usuario):
  //    la sesión se ha perdido. Las de inicio de sesión (/auth/v1/) no cuentan.
  const fetchOriginal = window.fetch;
  if (fetchOriginal) {
    window.fetch = function (entrada, opciones) {
      try {
        const url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || String(entrada || "");
        if (url.indexOf(SERVIDOR) >= 0 && url.indexOf("/auth/v1/") < 0) {
          const h = new Headers((opciones && opciones.headers) || (entrada && entrada.headers) || undefined);
          const clave = h.get("apikey"), autorizacion = h.get("Authorization");
          if (clave && autorizacion === "Bearer " + clave) irAlLogin();
        }
      } catch (e) { /* nunca estorbar a la petición */ }
      return fetchOriginal.apply(this, arguments);
    };
  }

  // 2) Se cierra la sesión en otra pestaña o ventana de ALMMA.
  window.addEventListener("storage", e => {
    if ((e.key === CLAVE || e.key === null) && !localStorage.getItem(CLAVE)) irAlLogin();
  });

  // 3) Al volver a la pestaña, si había sesión al abrirla y ya no está.
  let habia = false;
  try { habia = !!localStorage.getItem(CLAVE); } catch (e) {}
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    try {
      if (localStorage.getItem(CLAVE)) habia = true;
      else if (habia) irAlLogin();
    } catch (e) {}
  });
})();
