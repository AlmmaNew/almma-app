/* ALMMA · recortar y reducir un vídeo ANTES de subirlo (25-11-2026, petición de Arturo).
   prepararVideo(archivo, { maxSeg }) → devuelve el vídeo listo para subir (File), o null si la persona cancela.
   Lanza un Error con el motivo en castellano si no se puede usar.
   - Si dura más de maxSeg, pregunta si se queda con el principio (los primeros maxSeg segundos).
   - Lo pasa a HD (lado corto 720), 30 imágenes por segundo como mucho y unos 2,5 Mbps en MP4: 20 s ≈ 6 MB.
   - Lo hace el propio móvil u ordenador (WebCodecs, con la librería mediabunny.min.js, licencia MPL-2.0, que va en la misma carpeta).
     Si el aparato no puede, se usa el original mientras cumpla los segundos y el peso.
   - Un vídeo que ya es pequeño se deja como está. */
(function () {
  const LADO = 720, MBPS = 2.5, FPS = 30, MAX_MB = 200;
  const MARGEN = 0.5;            // medio segundo de cortesía
  const PARADO_MS = 25000;       // si no avanza en este tiempo, se da por atascado
  const CANCELADO = { cancelado: true };

  let carga = null;
  function libreria() {
    if (window.Mediabunny) return Promise.resolve(window.Mediabunny);
    return carga ||= new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "mediabunny.min.js"; s.onload = () => ok(window.Mediabunny);
      s.onerror = () => { carga = null; s.remove(); ko(new Error("no se pudo cargar la librería de vídeo")); };
      document.head.appendChild(s);
    });
  }

  function duracionSimple(f) {
    return new Promise(ok => {
      const v = document.createElement("video"), u = URL.createObjectURL(f);
      let hecho = false;
      const fin = d => { if (hecho) return; hecho = true; URL.revokeObjectURL(u); ok(d); };
      v.preload = "metadata"; v.muted = true; v.playsInline = true;
      v.onloadedmetadata = () => {
        if (isFinite(v.duration)) return fin(v.duration);
        v.ondurationchange = () => { if (isFinite(v.duration)) fin(v.duration); };   // algunos webm no traen la duración al principio
        v.currentTime = 1e7;
      };
      v.onerror = () => fin(NaN); setTimeout(() => fin(NaN), 8000); v.src = u;
    });
  }

  /* ---------- ventana de «Preparando vídeo» ---------- */
  function ventana() {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;z-index:21000;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;padding:20px";
    d.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:16px;padding:22px;max-width:380px;width:100%;text-align:center;font:16px -apple-system,Segoe UI,Arial,sans-serif">' +
      '<div data-t style="font-weight:700;margin-bottom:12px">🎥 Preparando vídeo…</div><div style="height:10px;background:#e2e8f0;border-radius:6px;overflow:hidden"><div data-b style="height:100%;width:0;background:#2563eb"></div></div>' +
      '<div data-s style="font-size:13px;color:#64748b;margin-top:10px">Se hace más pequeño para que suba antes. No cierres la pantalla.</div><div data-c style="display:flex;gap:10px;margin-top:16px"></div></div>';
    document.body.appendChild(d);
    const q = a => d.querySelector("[" + a + "]");
    return {
      avance: p => { q("data-b").style.width = Math.round(p * 100) + "%"; q("data-t").textContent = "🎥 Preparando vídeo… " + Math.round(p * 100) + "%"; },
      botones(lista) {
        q("data-c").innerHTML = "";
        lista.forEach(([t, fn, fuerte]) => {
          const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = fn;
          b.style.cssText = "flex:1;border:none;border-radius:12px;padding:13px 8px;font-size:15px;font-weight:700;cursor:pointer;" + (fuerte ? "background:#2563eb;color:#fff" : "background:#e2e8f0;color:#334155");
          q("data-c").appendChild(b);
        });
      },
      texto: (t, s) => { q("data-t").textContent = t; q("data-s").textContent = s || ""; },
      preguntar(t, s, si, no) {
        return new Promise(ok => { this.texto(t, s); this.botones([[no, () => ok(false)], [si, () => ok(true), true]]); });
      },
      cerrar: () => d.remove()
    };
  }
  const enTexto = s => s >= 60 ? Math.floor(s / 60) + " min" + (Math.round(s % 60) ? " " + Math.round(s % 60) + " s" : "") : Math.round(s) + " s";

  /* ---------- conversión ---------- */
  async function convertir(MB, f, opciones, alAvanzar, alCrear) {
    const input = new MB.Input({ source: new MB.BlobSource(f), formats: MB.ALL_FORMATS });
    const destino = new MB.BufferTarget();
    const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }), target: destino });
    const c = await MB.Conversion.init({ input, output, tracks: "primary", showWarnings: false, ...opciones });
    const fuera = t => c.discardedTracks.some(d => d.track.type === t);
    if (!c.isValid || fuera("video")) return { ok: false };
    alCrear(c);
    let reloj, vivo;
    const parado = new Promise((_, ko) => { vivo = () => { clearTimeout(reloj); reloj = setTimeout(() => ko(new Error("atascado")), PARADO_MS); }; vivo(); });
    c.onProgress = p => { vivo(); alAvanzar(p); };
    const trabajo = c.execute();
    trabajo.catch(() => {});       // si gana «parado», el fallo de la cancelación no debe salir suelto
    try { await Promise.race([trabajo, parado]); }
    catch (e) { c.cancel().catch(() => {}); throw e; }
    finally { clearTimeout(reloj); }
    return { ok: true, sinAudio: fuera("audio"), blob: new Blob([destino.buffer], { type: "video/mp4" }) };
  }

  async function prepararVideo(f, o = {}) {
    const maxSeg = o.maxSeg || 20, v = ventana();
    const corte = new Promise((_, ko) => { v.cancelar = () => ko(CANCELADO); });
    corte.catch(() => {});
    let enCurso = null, MB = null, dur = NaN, ancho = 0, alto = 0, fps = 0;
    const cancelable = p => Promise.race([p, corte]);
    const ponerCancelar = () => v.botones([["Cancelar", () => v.cancelar()]]);
    ponerCancelar();
    const correr = async op => { const r = await cancelable(convertir(MB, f, op, p => v.avance(p), c => { enCurso = c; })); enCurso = null; return r; };
    try {
      try {
        MB = await cancelable(libreria());
        const input = new MB.Input({ source: new MB.BlobSource(f), formats: MB.ALL_FORMATS });
        dur = await cancelable(input.computeDuration());
        const t = await cancelable(input.getPrimaryVideoTrack());
        if (t) {
          ancho = await t.getDisplayWidth(); alto = await t.getDisplayHeight();
          try { fps = (await cancelable(t.computePacketStats(120))).averagePacketRate || 0; } catch (e) { if (e === CANCELADO) throw e; }
        }
      } catch (e) { if (e === CANCELADO) throw e; MB = ancho ? MB : null; }
      if (!isFinite(dur) || dur <= 0) dur = await cancelable(duracionSimple(f));
      if (!isFinite(dur) || dur <= 0) throw new Error("No se ha podido leer el vídeo. Prueba con otro o grábalo otra vez.");

      const largo = dur > maxSeg + MARGEN;
      if (largo) {
        const si = await v.preguntar("🎥 El vídeo dura " + enTexto(dur), "El máximo es " + enTexto(maxSeg) + ". ¿Subir solo los primeros " + enTexto(maxSeg) + "? Si lo importante está más adelante, recórtalo antes en el móvil.",
          "Subir los primeros " + enTexto(maxSeg), "No subirlo");
        if (!si) return null;
        v.texto("🎥 Preparando vídeo…", "Se hace más pequeño para que suba antes. No cierres la pantalla."); ponerCancelar();
      }
      const mbps = f.size * 8 / dur / 1e6, lado = Math.min(ancho, alto);
      const grande = !ancho || lado > LADO * 1.1 || mbps > MBPS * 1.6;
      const recorte = largo ? { trim: { start: 0, end: maxSeg } } : {};
      let listo = null;

      if (MB && (largo || grande) && "VideoEncoder" in window && "VideoDecoder" in window) {
        const par = n => Math.max(2, Math.round(n / 2) * 2), k = Math.min(1, LADO / (lado || LADO));
        const video = { codec: "avc", bitrate: MBPS * 1e6, width: par(ancho * k), height: par(alto * k), fit: "fill", forceTranscode: true, allowTransformationMetadata: false, ...(fps > FPS + 2 ? { frameRate: FPS } : {}) };
        for (const audio of [{ codec: "aac" }, {}]) {   // AAC si se puede; si no, el sonido tal como viene
          try {
            const r = await correr({ video, audio, ...recorte });
            if (!r.ok) break;
            listo = r.blob;
            if (!r.sinAudio) break;
          } catch (e) { enCurso = null; if (e === CANCELADO) throw e; break; }
        }
        if (listo && !largo && listo.size >= f.size) listo = null;   // no compensa
      }
      // El aparato no sabe reducirlo, pero sí se puede cortar sin tocar la imagen
      if (!listo && largo && MB) {
        try { const r = await correr({ copy: { mode: "forced", boundaryPolicy: "shrink", shiftTolerance: Infinity }, ...recorte }); if (r.ok) listo = r.blob; }
        catch (e) { enCurso = null; if (e === CANCELADO) throw e; }
      }
      if (!listo && largo) throw new Error("El vídeo dura " + enTexto(dur) + " y este aparato no puede recortarlo. Recórtalo a " + enTexto(maxSeg) + " y vuelve a elegirlo.");
      const fin = listo ? new File([listo], (f.name || "video").replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4" }) : f;
      if (fin.size > MAX_MB * 1048576) throw new Error("El vídeo pesa " + Math.round(fin.size / 1048576) + " MB (máximo " + MAX_MB + " MB). Grábalo más corto o con menos calidad.");
      return fin;
    } catch (e) {
      if (enCurso) enCurso.cancel().catch(() => {});
      if (e === CANCELADO) return null;
      throw e;
    } finally { v.cerrar(); }
  }

  window.prepararVideo = prepararVideo;
  window.MAX_SEG_VIDEO_ORDEN = 20;
  window.MAX_SEG_VIDEO_INSTRUCCIONES = 300;
})();
