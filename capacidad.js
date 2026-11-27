// ALMMA · Carga y capacidad de montaje (27-11-2026). Lo usan el Panel de dirección (direccion.html) y los avisos (alertas_direccion.js).
// No guarda nada: lee órdenes, montadores, ausencias y festivos y calcula:
//  - Ritmo de las últimas 8 semanas: montajes por día laborable y por montador y día. Solo cuentan los montadores de verdad;
//    las cuentas especiales («Sin montador», «Recoge Menut», «Recoge fábrica»…) quedan fuera.
//  - Presencia de cada montador: en qué parte de los días laborables ha montado. Sirve para prever cuántos habrá cada día.
//  - Próximas semanas: días laborables (sin sábados, domingos, festivos ni puentes) × montadores esperados (sin los que
//    tengan ausencias o vacaciones) × montajes por montador y día = capacidad estimada; frente a lo ya agendado.
//  - Bolsa: órdenes con la mercancía completa y sin cita, y cuántos días de trabajo son al ritmo actual.
(function () {
  const SEMANAS_HIST = 8, SEMANAS_FUT = 4, BOLSA_VIEJA = 90;
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const d10 = s => s ? String(s).slice(0, 10) : "";
  const sumar = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  async function todo(fabrica) {
    let out = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await fabrica().range(desde, desde + 999);
      if (error) throw error;
      out = out.concat(data || []);
      if (!data || data.length < 1000) return out;
    }
  }

  window.calcularCapacidad = async function (client) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const lunes = sumar(hoy, -((hoy.getDay() + 6) % 7));                 // lunes de esta semana
    const hIni = sumar(lunes, -7 * SEMANAS_HIST), fFin = sumar(lunes, 7 * SEMANAS_FUT);
    const hace1a = iso(new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate()));
    const [monts, hist, fest, aus, agend, bolsa] = await Promise.all([
      todo(() => client.from("montadores").select("id, nombre, especial, activo, staff_user_id").order("id")),
      todo(() => client.from("ordenes").select("anyo, orden, fecha_montaje, ordenes_montadores(montador_id)").gte("fecha_montaje", iso(hIni)).lt("fecha_montaje", iso(lunes)).order("anyo").order("orden")),
      todo(() => client.from("festivos").select("fecha, nombre, tipo").gte("fecha", iso(hIni)).lt("fecha", iso(fFin)).order("fecha")),
      todo(() => client.from("ausencias").select("montador_id, staff_user_id, tipo, desde, hasta").lte("desde", iso(fFin)).gte("hasta", iso(hoy)).order("desde")).catch(() => []),   // sin el SQL 149, sin ausencias
      todo(() => client.from("ordenes").select("anyo, orden, fecha_prev_montaje").gte("fecha_prev_montaje", iso(hoy)).lt("fecha_prev_montaje", iso(fFin)).is("fecha_montaje", null).order("anyo").order("orden")),
      todo(() => client.from("ordenes").select("anyo, orden, tienda_id, fecha_creacion, fecha_recepcion").eq("estado", "recepcionado_total").is("fecha_prev_montaje", null).is("fecha_montaje", null)
        .or("fecha_creacion.gte." + hace1a + ",fecha_recepcion.gte." + hace1a).order("anyo").order("orden")),
    ]);
    const festivos = new Map(fest.map(f => [f.fecha, f.nombre || "Festivo"]));
    const laborable = d => d.getDay() >= 1 && d.getDay() <= 5 && !festivos.has(iso(d));
    const reales = new Map(monts.filter(m => !m.especial).map(m => [m.id, m]));

    // --- histórico ---
    let diasLab = 0; for (let d = new Date(hIni); d < lunes; d = sumar(d, 1)) if (laborable(d)) diasLab++;
    const porDia = new Map(), diasDe = new Map();
    let ordenesReales = 0;
    hist.forEach(o => {
      const ids = (o.ordenes_montadores || []).map(x => x.montador_id).filter(id => reales.has(id));
      if (!ids.length) return;                          // recogidas y órdenes sin montador de verdad: fuera
      ordenesReales++;
      const dia = d10(o.fecha_montaje);
      if (!porDia.has(dia)) porDia.set(dia, new Set());
      ids.forEach(id => { porDia.get(dia).add(id); if (!diasDe.has(id)) diasDe.set(id, new Set()); diasDe.get(id).add(dia); });
    });
    const montadorDias = [...porDia.values()].reduce((s, x) => s + x.size, 0);
    const porMontadorDia = montadorDias ? ordenesReales / montadorDias : 0;   // montajes por montador y día trabajado
    const montDia = diasLab ? ordenesReales / diasLab : 0;                    // montajes por día laborable
    const presencia = [...diasDe.entries()].map(([id, s]) => ({ id, nombre: reales.get(id).nombre, activo: reales.get(id).activo !== false, staff: reales.get(id).staff_user_id, dias: s.size, p: diasLab ? Math.min(1, s.size / diasLab) : 0 }))
      .filter(m => m.activo).sort((a, b) => b.p - a.p);

    // --- ausencias por montador y día ---
    const ausente = (m, dia) => aus.some(a => (a.montador_id === m.id || (a.staff_user_id && a.staff_user_id === m.staff)) && a.desde <= dia && a.hasta >= dia);

    // --- próximas semanas ---
    const agPorDia = new Map(); agend.forEach(o => { const k = d10(o.fecha_prev_montaje); agPorDia.set(k, (agPorDia.get(k) || 0) + 1); });
    const semanas = [];
    for (let w = 0; w < SEMANAS_FUT; w++) {
      const ini = sumar(lunes, 7 * w), s = { ini: iso(ini), fin: iso(sumar(ini, 4)), dias: 0, montEsperados: 0, montNormal: 0, capacidad: 0, agendado: 0, festivos: [], ausentes: new Map(), pasados: 0 };
      for (let i = 0; i < 5; i++) {
        const d = sumar(ini, i), k = iso(d);
        s.agendado += agPorDia.get(k) || 0;
        if (festivos.has(k)) { s.festivos.push(festivos.get(k)); continue; }
        if (d < hoy) { s.pasados++; continue; }        // de esta semana solo cuentan los días que quedan
        s.dias++;
        presencia.forEach(m => { s.montNormal += m.p; if (ausente(m, k)) s.ausentes.set(m.nombre, (s.ausentes.get(m.nombre) || 0) + 1); else s.montEsperados += m.p; });
      }
      s.capacidad = Math.round(s.montEsperados * porMontadorDia);
      s.perdida = s.montNormal ? 1 - s.montEsperados / s.montNormal : 0;   // parte de la capacidad que se pierde por ausencias
      s.libre = s.capacidad - s.agendado;
      semanas.push(s);
    }

    // --- bolsa lista para montar ---
    const ref = o => d10(o.fecha_recepcion) || d10(o.fecha_creacion);
    const dias = s => Math.round((hoy - new Date(s)) / 86400000);
    const activa = bolsa.filter(o => dias(ref(o)) <= BOLSA_VIEJA), vieja = bolsa.length - activa.length;
    return {
      semanasHist: SEMANAS_HIST, diasLab, ordenesReales, montDia, porMontadorDia,
      montadoresDia: diasLab ? montadorDias / diasLab : 0,
      presencia, semanas,
      bolsa: { activa: activa.length, vieja, diasVieja: BOLSA_VIEJA, diasTrabajo: montDia ? activa.length / montDia : null },
    };
  };
})();
