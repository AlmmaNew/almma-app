/* ALMMA · descargar las fotos y vídeos de un montaje (25-11-2026).
   Lo usan galeria.html, tienda.html, montajes_tienda.html, orden_tienda.html y pedidos.html.
   - Una foto: se baja tal cual. Varias: un ZIP con todas, numeradas y con el nº de orden en el nombre.
   - En el móvil sale «📲 Guardar en el móvil» (hoja de compartir: guardar en Fotos, WhatsApp, correo…) además de la descarga.
   - Qué se puede descargar lo decide la seguridad de Supabase: solo lo que esa persona ya puede ver.
   Uso:  botonBajarFotos(anyo, orden, fotos, opciones)  → HTML del botón «⬇ Descargar todas»
         botonBajarUna(anyo, orden, fotos, i, opciones)  → HTML del botón de una foto
   fotos = [{ storage_path, categoria }]; opciones = { clase, estilo, texto }. Usa la variable «client» de la pantalla. */
(function () {
  const BUCKET = "ordenes-adjuntos";
  const TIPOS = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
    mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp" };
  const CAT = { entrega_ok: "entrega", incidencia: "incidencia" };
  const esMovil = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const ext = r => (String(r).match(/\.([a-z0-9]+)$/i) || ["", "jpg"])[1].toLowerCase();
  const grupos = new Map();   // "anyo/orden" → fotos, para que los botones lleven solo la clave
  let turno = 0;              // cerrar la ventana cancela lo que se estuviera preparando

  const nombreDe = (anyo, orden, f, i, total) => "orden-" + anyo + "-" + orden + "-" + String(i + 1).padStart(total > 99 ? 3 : 2, "0") + (CAT[f.categoria] ? "-" + CAT[f.categoria] : "") + "." + ext(f.storage_path);

  function ventana() {
    let v = document.getElementById("bajar_fotos");
    if (!v) {
      v = document.createElement("div"); v.id = "bajar_fotos";
      v.style.cssText = "position:fixed;inset:0;z-index:20000;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:20px";
      v.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:16px;padding:22px;max-width:400px;width:100%;text-align:center;font:16px -apple-system,Segoe UI,Arial,sans-serif"><div id="bf_txt" style="font-weight:700;margin-bottom:14px;white-space:pre-line"></div><div id="bf_bot" style="display:flex;flex-direction:column;gap:10px"></div></div>';
      document.body.appendChild(v);
    }
    return v;
  }
  function cerrar() { turno++; document.getElementById("bajar_fotos")?.remove(); }
  function pintar(texto, botones) {
    ventana();
    document.getElementById("bf_txt").textContent = texto;
    const c = document.getElementById("bf_bot"); c.innerHTML = "";
    botones.forEach(([t, fn, fuerte]) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = fn;
      b.style.cssText = "border:none;border-radius:12px;padding:13px;font-size:16px;font-weight:700;cursor:pointer;" + (fuerte ? "background:#2563eb;color:#fff" : "background:#e2e8f0;color:#334155");
      c.appendChild(b);
    });
  }

  function guardarBlob(blob, nombre) {
    const a = document.createElement("a"), u = URL.createObjectURL(blob);
    a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 5 * 60 * 1000);
  }
  let cargaZip = null;
  function zipListo() {
    if (window.JSZip) return Promise.resolve();
    return cargaZip ||= new Promise((ok, ko) => {
      const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      s.onload = ok; s.onerror = () => { cargaZip = null; s.remove(); ko(new Error("sin conexión")); };
      document.head.appendChild(s);
    });
  }
  async function guardarEnPc(files, nombreZip) {
    if (files.length === 1) { guardarBlob(files[0], files[0].name); return; }
    await zipListo();
    const z = new JSZip(); files.forEach(f => z.file(f.name, f));
    guardarBlob(await z.generateAsync({ type: "blob", compression: "STORE" }), nombreZip);   // fotos y vídeos ya vienen comprimidos
  }

  async function bajar(anyo, orden, lista) {   // lista = [{ f, nombre }]
    const mio = ++turno, files = [];
    let fallos = 0;
    for (const [n, x] of lista.entries()) {
      pintar(lista.length > 1 ? "Preparando " + (n + 1) + " de " + lista.length + "…" : "Preparando…", [["Cancelar", cerrar]]);
      try {
        const { data, error } = await client.storage.from(BUCKET).download(x.f.storage_path);
        if (error) throw error;
        files.push(new File([data], x.nombre, { type: TIPOS[ext(x.f.storage_path)] || data.type || "application/octet-stream" }));
      } catch (_) { fallos++; }
      if (mio !== turno) return;
    }
    if (!files.length) { pintar("No se ha podido descargar. Comprueba la conexión y vuelve a intentarlo.", [["Cerrar", cerrar]]); return; }
    const falta = fallos ? "\n⚠ " + fallos + (fallos === 1 ? " no se ha podido bajar." : " no se han podido bajar.") : "";
    const nombreZip = "fotos-orden-" + anyo + "-" + orden + ".zip";
    const aPc = async () => {
      try { await guardarEnPc(files, nombreZip); if (mio !== turno) return; if (falta) pintar("Descargado." + falta, [["Cerrar", cerrar]]); else cerrar(); }
      catch (e) { if (mio === turno) pintar("No se ha podido preparar la descarga (" + (e.message || e) + ").", [["Reintentar", aPc, true], ["Cerrar", cerrar]]); }
    };
    if (!esMovil()) { await aPc(); return; }
    let comparte = false; try { comparte = !!(navigator.canShare && navigator.canShare({ files })); } catch (_) {}
    // en el móvil hace falta una pulsación nueva: si no, el navegador bloquea la hoja de compartir
    pintar("✔ " + (files.length === 1 ? "Lista para guardar" : files.length + " archivos listos para guardar") + falta, [
      ...(comparte ? [["📲 Guardar en el móvil / enviar", async () => { try { await navigator.share({ files }); cerrar(); } catch (e) { if (!e || e.name !== "AbortError") aPc(); } }, true]] : []),
      [files.length === 1 ? "⬇ Descargar archivo" : "⬇ Descargar en un ZIP", aPc, !comparte],
      ["Cerrar", cerrar]
    ]);
  }

  const preparar = (anyo, orden, fotos) => fotos.map((f, i) => ({ f, nombre: nombreDe(anyo, orden, f, i, fotos.length) }));
  window.bajarFotosDe = (anyo, orden, fotos) => bajar(anyo, orden, preparar(anyo, orden, fotos));
  window.bajarFotoDe = (anyo, orden, fotos, i) => bajar(anyo, orden, [preparar(anyo, orden, fotos)[i]]);
  window.almmaBajar = (clave, i) => {   // lo llaman los botones
    const g = grupos.get(clave); if (!g) return;
    if (i === undefined) bajarFotosDe(g.anyo, g.orden, g.fotos); else bajarFotoDe(g.anyo, g.orden, g.fotos, i);
  };
  const boton = (clave, i, texto, o) => '<button type="button" class="' + (o.clase || "secondary") + '"' + (o.estilo ? ' style="' + o.estilo + '"' : "") +
    ' onclick="event.preventDefault();event.stopPropagation();almmaBajar(\'' + clave + '\'' + (i === undefined ? "" : "," + i) + ')">' + texto + '</button>';
  window.botonBajarFotos = (anyo, orden, fotos, o = {}) => {
    if (!fotos || !fotos.length) return "";
    const clave = anyo + "/" + orden; grupos.set(clave, { anyo, orden, fotos });
    return boton(clave, undefined, o.texto || (fotos.length === 1 ? "⬇ Descargar la foto" : "⬇ Descargar todas (" + fotos.length + ")"), o);
  };
  window.botonBajarUna = (anyo, orden, fotos, i, o = {}) => {
    const clave = anyo + "/" + orden; grupos.set(clave, { anyo, orden, fotos });
    return boton(clave, i, o.texto || "⬇ Descargar", o);
  };
})();
