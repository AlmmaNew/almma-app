/* ALMMA · festivos.js — añadir, cambiar y quitar festivos y puentes (26-11-2026, SQL 136 + SQL 150).
   Lo usan ausencias.html (cualquiera de la oficina) y admin.html (pestaña Festivos): montarFestivos(elemento).
   Un festivo / puente: no es laborable para el plazo de la entrega 24h–48h, sale en rojo en el calendario de las fechas (calendario.js)
   y Planificar no propone montajes ese día. Un puente de varios días se añade con «Hasta»: se apunta cada día entre semana.
   Necesita la variable global `client` (Supabase) de la pantalla. */
(function () {
  const TIPOS_F = { nacional: "Nacional", autonomico: "Autonómico (C. Valenciana)", local: "Local", puente: "Puente" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const deIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const diaLargo = f => deIso(f).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const opcTipo = t => '<option value="">Festivo</option>' + Object.entries(TIPOS_F).map(([k, v]) => '<option value="' + k + '"' + (k === t ? " selected" : "") + '>' + v + '</option>').join("");
  const invalidar = () => { if (window.Calendario) Calendario.invalidar(); if (window.onFestivosCambiados) window.onFestivosCambiados(); };

  window.montarFestivos = function (el) {
    el.innerHTML =
      '<div class="fsx-form" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:12px">' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#475569">Día<input type="date" class="fsx-d" style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px"></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#475569">Hasta (solo si son varios días)<input type="date" class="fsx-h" style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px"></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#475569">Tipo<select class="fsx-t" style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff">' + opcTipo("local") + '</select></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#475569">Nombre<input type="text" class="fsx-n" placeholder="San Vicente Mártir, puente de la Constitución…" maxlength="120" style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;min-width:260px"></label>' +
      '<button type="button" class="fsx-add" style="background:#2563eb;border:1px solid #2563eb;color:#fff;font-weight:700;border-radius:8px;padding:8px 14px;cursor:pointer">➕ Añadir</button></div>' +
      '<label style="font-size:13px;color:#64748b"><input type="checkbox" class="fsx-todo"> Ver también los ya pasados</label>' +
      '<div class="fsx-lista" style="margin-top:8px"><span style="color:#64748b">Cargando…</span></div>';
    const $ = c => el.querySelector(c);
    $(".fsx-d").addEventListener("change", () => { if ($(".fsx-h").value && $(".fsx-h").value < $(".fsx-d").value) $(".fsx-h").value = ""; });
    $(".fsx-t").addEventListener("change", () => { if ($(".fsx-t").value === "puente" && !$(".fsx-n").value) $(".fsx-n").placeholder = "Puente de…"; });
    $(".fsx-todo").addEventListener("change", cargar);

    async function cargar() {
      const desde = new Date(); desde.setMonth(desde.getMonth() - 1);
      let q = client.from("festivos").select("*").order("fecha");
      if (!$(".fsx-todo").checked) q = q.gte("fecha", iso(desde));
      const { data, error } = await q;
      if (error) { $(".fsx-lista").innerHTML = '<span style="color:#b91c1c">No se pudieron cargar los festivos: ' + esc(error.message) + '</span>'; return; }
      if (!data.length) { $(".fsx-lista").innerHTML = '<span style="color:#64748b">No hay festivos. Añade el primero arriba.</span>'; return; }
      const hoy = iso(new Date());
      $(".fsx-lista").innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:14px"><tr>' + ["Día", "Tipo", "Nombre", ""].map(t => '<th style="text-align:left;font-size:12px;color:#64748b;padding:6px 8px;border-bottom:1px solid #e2e8f0">' + t + '</th>').join("") + '</tr>' +
        data.map(f => '<tr style="' + (f.fecha < hoy ? "opacity:.55" : "") + '"><td style="padding:5px 8px;border-bottom:1px solid #f1f5f9">' + esc(diaLargo(f.fecha)) + '</td>' +
          '<td style="padding:5px 8px;border-bottom:1px solid #f1f5f9"><select data-f="' + f.fecha + '" data-c="tipo" style="padding:5px;border:1px solid #e2e8f0;border-radius:6px;background:#fff">' + opcTipo(f.tipo) + '</select></td>' +
          '<td style="padding:5px 8px;border-bottom:1px solid #f1f5f9"><input data-f="' + f.fecha + '" data-c="nombre" value="' + esc(f.nombre || "") + '" style="width:100%;min-width:200px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px"></td>' +
          '<td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right"><button type="button" data-q="' + f.fecha + '" style="border:1px solid #e2e8f0;background:#fff;color:#b91c1c;border-radius:8px;padding:5px 10px;cursor:pointer">🗑 Quitar</button></td></tr>').join("") + '</table>';
    }
    el.addEventListener("change", async e => {
      const t = e.target; if (!t.dataset.f) return;
      const r = await client.from("festivos").update({ [t.dataset.c]: t.value.trim() || null }).eq("fecha", t.dataset.f);
      if (r.error) alert("No se pudo guardar: " + r.error.message); else invalidar();
    });
    el.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.q) {
        if (!confirm("¿Quitar el festivo del " + diaLargo(b.dataset.q) + "?\n\nEse día vuelve a ser laborable: Planificar podrá proponer montajes y contará para el plazo de las entregas 24h–48h que se confirmen a partir de ahora.")) return;
        const r = await client.from("festivos").delete().eq("fecha", b.dataset.q);
        if (r.error) return alert("No se pudo quitar: " + r.error.message);
        invalidar(); return cargar();
      }
      if (b.classList.contains("fsx-add")) {
        const d = $(".fsx-d").value, h = $(".fsx-h").value || d;
        if (!d) return alert("Elige el día.");
        if (h < d) return alert("«Hasta» no puede ser antes que el día.");
        const dias = [];
        for (let x = deIso(d); iso(x) <= h; x.setDate(x.getDate() + 1)) if (x.getDay() !== 0 && x.getDay() !== 6) dias.push(iso(x));
        if (!dias.length) return alert("Esos días son sábado o domingo: ya no se trabajan, no hace falta apuntarlos.");
        if (dias.length > 31) return alert("Son demasiados días de golpe (" + dias.length + "). Para vacaciones de una persona usa Ausencias y vacaciones.");
        if (dias.length > 1 && !confirm("Se apuntan " + dias.length + " días entre semana (sin sábados ni domingos):\n\n" + dias.map(diaLargo).join("\n") + "\n\n¿Seguir?")) return;
        const tipo = $(".fsx-t").value || null, nombre = $(".fsx-n").value.trim() || null;
        const r = await client.from("festivos").upsert(dias.map(fecha => ({ fecha, nombre, tipo })));
        if (r.error) return alert("No se pudo añadir: " + r.error.message);
        $(".fsx-d").value = ""; $(".fsx-h").value = ""; $(".fsx-n").value = "";
        invalidar(); cargar();
      }
    });
    cargar();
  };
  window.TIPOS_FESTIVO = TIPOS_F;
})();
