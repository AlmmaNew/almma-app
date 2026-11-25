/* ALMMA · subida común de fotos, vídeos y PDF (25-11-2026).
   La usan pedidos.html, mi-dia.html, montador.html e instrucciones.html.
   - Lo que pesa poco (hasta 6 MB) se sube de una vez, como siempre.
   - Lo grande (los vídeos) se sube A TROZOS de 6 MB (subida «reanudable» de Supabase): enseña el porcentaje y, si se
     corta la cobertura, sigue por donde iba en vez de empezar de cero.
   - El tope real lo pone Supabase (Storage → Settings → Global file size limit). Si se supera, el error lo dice claro. */
(function () {
  const TROZO = 6 * 1024 * 1024;   // Supabase exige exactamente 6 MB por trozo
  const MAX_MB = 200;
  const POR_EXT = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", pdf: "application/pdf" };
  const EXT = { "video/mp4": "mp4", "video/x-m4v": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
  const extDe = n => (String(n || "").match(/\.([a-z0-9]+)$/i) || ["", ""])[1].toLowerCase();

  // Tipo del archivo: el que dice el navegador y, si no lo dice (pasa en algunos móviles), el de su extensión
  function tipoArchivo(f) { return (EXT[f.type] ? f.type : "") || POR_EXT[extDe(f.name)] || f.type || ""; }
  function esVideoArchivo(f) { return tipoArchivo(f).startsWith("video/"); }
  function esFotoArchivo(f) { return tipoArchivo(f).startsWith("image/"); }
  function extArchivo(f) { const t = tipoArchivo(f); return EXT[t] || (t.startsWith("video/") ? "mp4" : t.startsWith("image/") ? "jpg" : extDe(f.name) || "dat"); }
  const megas = b => Math.round(b / 1048576);

  // Foto → JPG reducido (máx. «lado» px). Si el navegador no sabe abrirla (HEIC en un PC), devuelve el original
  async function reducirFoto(f, lado = 1600, calidad = 0.82) {
    try {
      const bmp = await createImageBitmap(f), k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(ok => c.toBlob(ok, "image/jpeg", calidad));
      return b || f;
    } catch (_) { return f; }
  }

  let cargaTus = null;
  function tusListo() {
    if (window.tus) return Promise.resolve();
    return cargaTus ||= new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/dist/tus.min.js";
      s.onload = ok; s.onerror = () => { cargaTus = null; s.remove(); ko(new Error("network error: no se pudo cargar la subida por trozos")); };
      document.head.appendChild(s);
    });
  }

  function errorTamano(bytes) {
    return new Error("El archivo pesa " + megas(bytes) + " MB y es más de lo que admite ahora mismo el servidor. Recorta el vídeo o grábalo con menos calidad, y avisa a la oficina.");
  }

  // Sube un archivo. alAvanzar(0-100) es opcional. Lanza un Error si no se puede (si ya estaba subido, no es un error).
  async function subirArchivo(client, bucket, ruta, blob, tipo, alAvanzar) {
    tipo = tipo || blob.type || "application/octet-stream";
    if (blob.size <= TROZO) {
      // sin el tipo dentro del propio archivo, Supabase lo guarda como «desconocido» y algunos móviles no lo abren
      const cuerpo = blob.type === tipo ? blob : new Blob([blob], { type: tipo });
      const { error } = await client.storage.from(bucket).upload(ruta, cuerpo, { contentType: tipo });
      if (error && !/already exists|duplicate|409/i.test(String(error.message) + String(error.statusCode))) throw error;
      if (alAvanzar) alAvanzar(100);
      return;
    }
    await tusListo();
    const base = client.supabaseUrl.replace(/^https:\/\/([a-z0-9]+)\.supabase\.co.*$/, "https://$1.storage.supabase.co");
    await new Promise((ok, ko) => {
      const up = new tus.Upload(blob, {
        endpoint: base + "/storage/v1/upload/resumable",
        retryDelays: [0, 2000, 5000, 10000],
        chunkSize: TROZO,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        fingerprint: () => Promise.resolve("almma-" + bucket + "-" + ruta),
        headers: { apikey: client.supabaseKey, "x-upsert": "false" },
        metadata: { bucketName: bucket, objectName: ruta, contentType: tipo, cacheControl: "3600" },
        // la sesión se mira en cada trozo: en una subida larga podría caducar
        onBeforeRequest: async req => {
          const { data } = await client.auth.getSession();
          req.setHeader("Authorization", "Bearer " + (data && data.session ? data.session.access_token : client.supabaseKey));
        },
        onShouldRetry: e => { const s = e.originalResponse ? e.originalResponse.getStatus() : 0; return s === 0 || s === 429 || s >= 500 || s === 423; },
        onProgress: (n, t) => { if (alAvanzar) alAvanzar(Math.round(n * 100 / t)); },
        onSuccess: () => ok(),
        onError: e => {
          const r = e.originalResponse, s = r ? r.getStatus() : 0, cuerpo = r ? String(r.getBody() || "") : "";
          if (s === 409 && /already exists|duplicate/i.test(cuerpo)) { ok(); return; }
          if (s === 413) { ko(errorTamano(blob.size)); return; }
          const err = new Error(s ? "Error " + s + " " + cuerpo.slice(0, 200) : "network error: se cortó la conexión"); err.status = s; ko(err);
        }
      });
      up.findPreviousUploads().then(a => { if (a.length) up.resumeFromPreviousUpload(a[0]); up.start(); }, () => up.start());
    });
  }

  Object.assign(window, { subirArchivo, tipoArchivo, esVideoArchivo, esFotoArchivo, extArchivo, reducirFoto, MAX_MB_ARCHIVO: MAX_MB });
})();
