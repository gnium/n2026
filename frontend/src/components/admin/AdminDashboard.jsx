import { useEffect, useRef, useState } from "react";
import { Chart, registerables } from "chart.js";
import { api } from "../../api.js";
import Icono from "../Iconos.jsx";
import { formatoMonto } from "../PresupuestoModal.jsx";
import { PERIODOS, NOMBRE_SUSCRIPCION, soloFecha, usd, plural, pct } from "./constants.js";
import AdminNav from "./AdminNav.jsx";

Chart.register(...registerables);

const MESES_CORTOS = { "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May", "06": "Jun", "07": "Jul", "08": "Ago", "09": "Sep", 10: "Oct", 11: "Nov", 12: "Dic" };
const etiquetaMes = (m) => { const [, mm] = m.split("-"); return MESES_CORTOS[mm] || mm; };

function useCssVar(nombre) {
  const [val, setVal] = useState("");
  useEffect(() => { setVal(getComputedStyle(document.documentElement).getPropertyValue(nombre).trim()); }, [nombre]);
  return val;
}

function GraficoLinea({ datos, titulo }) {
  const ref = useRef(null);
  const chart = useRef(null);
  const accent = useCssVar("--accent");
  const ok = useCssVar("--ok");
  const error = useCssVar("--error");
  const ink2 = useCssVar("--ink-2");
  const border = useCssVar("--border");

  useEffect(() => {
    if (!ref.current || !accent || !datos) return;
    const ctx = ref.current.getContext("2d");
    if (chart.current) chart.current.destroy();
    const labels = datos.registrosMensuales.map((r) => etiquetaMes(r.mes));
    chart.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Registros",
            data: datos.registrosMensuales.map((r) => r.total),
            borderColor: accent,
            backgroundColor: accent + "22",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
          },
          {
            label: "Docs completados",
            data: datos.documentosMensuales.map((r) => r.completados),
            borderColor: ok,
            backgroundColor: ok + "22",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
          },
          {
            label: "Docs fallidos",
            data: datos.documentosMensuales.map((r) => r.fallidos),
            borderColor: error,
            backgroundColor: error + "22",
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            borderDash: [4, 4],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: ink2, font: { size: 12 } } } },
        scales: {
          x: { ticks: { color: ink2 }, grid: { color: border + "66" } },
          y: { beginAtZero: true, ticks: { color: ink2, precision: 0 }, grid: { color: border + "66" } },
        },
      },
    });
    return () => { if (chart.current) chart.current.destroy(); };
  }, [datos, accent, ok, error, ink2, border]);

  return (
    <div className="grafico-contenedor">
      <h4>{titulo}</h4>
      <div style={{ position: "relative", height: 260 }}>
        <canvas ref={ref} />
      </div>
    </div>
  );
}

function GraficoDona({ datos, titulo }) {
  const ref = useRef(null);
  const chart = useRef(null);
  const accent = useCssVar("--accent");
  const ok = useCssVar("--ok");
  const warn = useCssVar("--warn");
  const error = useCssVar("--error");
  const ink2 = useCssVar("--ink-2");

  useEffect(() => {
    if (!ref.current || !accent || !datos) return;
    const ctx = ref.current.getContext("2d");
    if (chart.current) chart.current.destroy();
    const estados = Object.entries(datos);
    const colores = {
      activa: ok,
      prueba: accent,
      sin_suscripcion: ink2,
      pendiente: warn,
      pausada: warn,
      cancelada: error,
      vencida: error,
    };
    chart.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: estados.map(([e]) => NOMBRE_SUSCRIPCION[e] || e),
        datasets: [{
          data: estados.map(([, n]) => n),
          backgroundColor: estados.map(([e]) => colores[e] || ink2),
          borderWidth: 2,
          borderColor: "transparent",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: ink2, font: { size: 12 }, padding: 12 } },
        },
      },
    });
    return () => { if (chart.current) chart.current.destroy(); };
  }, [datos, accent, ok, warn, error, ink2]);

  return (
    <div className="grafico-contenedor">
      <h4>{titulo}</h4>
      <div style={{ position: "relative", height: 220 }}>
        <canvas ref={ref} />
      </div>
    </div>
  );
}

function GraficoBarras({ datos, titulo }) {
  const ref = useRef(null);
  const chart = useRef(null);
  const accent = useCssVar("--accent");
  const ink2 = useCssVar("--ink-2");
  const border = useCssVar("--border");

  useEffect(() => {
    if (!ref.current || !accent || !datos?.length) return;
    const ctx = ref.current.getContext("2d");
    if (chart.current) chart.current.destroy();
    chart.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: datos.map((r) => etiquetaMes(r.mes)),
        datasets: [{
          label: "Facturado (ARS)",
          data: datos.map((r) => r.totalArs),
          backgroundColor: accent + "99",
          borderColor: accent,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: ink2, font: { size: 12 } } } },
        scales: {
          x: { ticks: { color: ink2 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: ink2 }, grid: { color: border + "66" } },
        },
      },
    });
    return () => { if (chart.current) chart.current.destroy(); };
  }, [datos, accent, ink2, border]);

  return (
    <div className="grafico-contenedor">
      <h4>{titulo}</h4>
      <div style={{ position: "relative", height: 220 }}>
        <canvas ref={ref} />
      </div>
    </div>
  );
}

function PanelNotificaciones() {
  const [notifs, setNotifs] = useState([]);
  const [form, setForm] = useState({ titulo: "", mensaje: "", tipo: "info" });
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");

  const cargarNotifs = () => api.notificacionesAdmin().then(setNotifs).catch(() => {});
  useEffect(() => { cargarNotifs(); }, []);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setMsg("");
    try {
      await api.notificacionCrear(form);
      setForm({ titulo: "", mensaje: "", tipo: "info" });
      setMsg("Notificación enviada");
      cargarNotifs();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const eliminar = async (id) => {
    try {
      await api.notificacionBorrar(id);
      setNotifs((prev) => prev.filter((n) => n.id !== id));
    } catch { /* silenciar */ }
  };

  return (
    <section className="bloque" aria-labelledby="admin-notifs-titulo">
      <h3 id="admin-notifs-titulo">Notificaciones a escribanos</h3>
      <form onSubmit={enviar} className="admin-notif-form">
        <label>
          Título
          <input type="text" required maxLength={200} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
        </label>
        <label>
          Mensaje
          <textarea required rows={3} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} />
        </label>
        <label>
          Tipo
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="info">Información</option>
            <option value="alerta">Alerta</option>
            <option value="novedad">Novedad</option>
          </select>
        </label>
        <div className="acciones">
          <button type="submit" className="boton primario chico" disabled={enviando}>{enviando ? "Enviando…" : "Enviar a todos"}</button>
          {msg && <span className="nota">{msg}</span>}
        </div>
      </form>
      {notifs.length > 0 && (
        <div className="tabla-scroll">
          <table aria-label="Notificaciones enviadas">
            <thead><tr><th scope="col">Título</th><th scope="col">Tipo</th><th scope="col">Destino</th><th scope="col">Fecha</th><th scope="col"></th></tr></thead>
            <tbody>
              {notifs.map((n) => (
                <tr key={n.id}>
                  <th scope="row">{n.titulo}</th>
                  <td><span className={`etiqueta ${n.tipo === "alerta" ? "warn" : n.tipo === "novedad" ? "ok" : ""}`}>{n.tipo}</span></td>
                  <td>{n.destinatario_email || "Todos"}</td>
                  <td>{new Date(n.creado_en).toLocaleDateString("es-AR")}</td>
                  <td><button type="button" className="boton discreto chico" onClick={() => eliminar(n.id)} title="Eliminar"><Icono nombre="basura" tamano={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminDashboard() {
  const [dias, setDias] = useState("30");
  const [resumen, setResumen] = useState(null);
  const [ventas, setVentas] = useState(null);
  const [tendencias, setTendencias] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setError(null);
    try {
      const [r, v, t] = await Promise.all([
        api.soporteResumen(dias),
        api.soporteSuscripciones(dias),
        api.soporteTendencias(),
      ]);
      setResumen(r);
      setVentas(v);
      setTendencias(t);
    } catch (e) {
      setError(`No se pudieron cargar los datos: ${e.message}`);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const revisarVencimientos = async () => {
    setError(null);
    setOcupado(true);
    try {
      const r = await api.soporteRevisarPruebas();
      setAviso(`Revision hecha: ${r.avisos} aviso(s), ${r.vencidas} prueba(s) vencida(s), ${r.eliminadas} cuenta(s) eliminada(s).`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  useEffect(() => { if (aviso) { const t = setTimeout(() => setAviso(""), 6000); return () => clearTimeout(t); } }, [aviso]);

  if (!resumen) return <div className="equipo"><h2>Panel general</h2><AdminNav /><p className="vacio" role="status">Cargando...</p>{error && <p className="alerta error" role="alert">{error}</p>}</div>;

  const f = resumen.embudo;

  return (
    <div className="equipo">
      <h2>Panel general</h2>
      <AdminNav />
      <p className="nota">
        Metricas y gestion de la plataforma. Muestra <b>solo metadatos y agregados</b>: altas, uso, facturacion y errores. Nunca los clientes, expedientes, protocolo ni documentos de una escribania — de esas tablas solo se leen conteos.
      </p>
      {error && <p className="alerta error" role="alert"><strong>Error:</strong> {error} <button type="button" className="enlace" onClick={() => setError(null)} aria-label="Cerrar error">{"✕"}</button></p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <div className="acciones agenda-toolbar">
        <div className="segmentado" role="group" aria-label="Periodo">
          {PERIODOS.map(([v, t]) => (
            <button type="button" key={v} className={dias === v ? "activo" : ""} aria-pressed={dias === v} onClick={() => setDias(v)}>{t}</button>
          ))}
        </div>
        <button type="button" className="boton discreto chico" disabled={ocupado} onClick={revisarVencimientos}>
          Revisar vencimientos ahora
        </button>
      </div>

      {tendencias && (tendencias.alertas.invitacionesPorVencer > 0 || tendencias.alertas.pruebasPorVencer > 0) && (
        <div className="dashboard-alertas">
          {tendencias.alertas.invitacionesPorVencer > 0 && (
            <div className="alerta warn" role="status">
              <strong>{tendencias.alertas.invitacionesPorVencer}</strong> invitacion{tendencias.alertas.invitacionesPorVencer === 1 ? "" : "es"} vence{tendencias.alertas.invitacionesPorVencer === 1 ? "" : "n"} en los proximos 7 dias
            </div>
          )}
          {tendencias.alertas.pruebasPorVencer > 0 && (
            <div className="alerta warn" role="status">
              <strong>{tendencias.alertas.pruebasPorVencer}</strong> cuenta{tendencias.alertas.pruebasPorVencer === 1 ? "" : "s"} en prueba vence{tendencias.alertas.pruebasPorVencer === 1 ? "" : "n"} esta semana
            </div>
          )}
        </div>
      )}

      <div className="consumo-cards">
        <div className="consumo-card">
          <span className="consumo-card-valor">{resumen.cuentas.total}</span>
          <span className="consumo-card-etiqueta">cuentas {"·"} {resumen.escribanias} escribania{resumen.escribanias === 1 ? "" : "s"}</span>
          <span className="nota">{resumen.cuentas.altas} alta{resumen.cuentas.altas === 1 ? "" : "s"} y {resumen.cuentas.conAccesoEnPeriodo} con actividad en el periodo</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{resumen.uso.completadas}</span>
          <span className="consumo-card-etiqueta">documentos procesados</span>
          <span className="nota">{plural(resumen.uso.fallidas, "fallido")} {"·"} costo de IA {usd(resumen.uso.costoIaUsd)}</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{resumen.prueba.enPrueba}</span>
          <span className="consumo-card-etiqueta">en periodo de prueba</span>
          <span className="nota">
            {resumen.prueba.porVencer} vence{resumen.prueba.porVencer === 1 ? "" : "n"} en 7 dias {"·"} {plural(resumen.prueba.vencidas, "vencida", "vencidas")}
            {resumen.prueba.aEliminar > 0 && <> {"·"} <b>{resumen.prueba.aEliminar} a eliminar</b></>}
          </span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{formatoMonto(resumen.facturacion.montoArs, "ARS")}</span>
          <span className="consumo-card-etiqueta">facturado por uso</span>
          <span className="nota">{resumen.facturacion.cargos} cargos {"·"} suscripciones activas: {resumen.suscripciones.activa || 0}</span>
        </div>
      </div>

      {tendencias && (
        <section className="bloque" aria-labelledby="dashboard-graficos">
          <h3 id="dashboard-graficos">Tendencias (ultimos 6 meses)</h3>
          <div className="dashboard-graficos-grid">
            <GraficoLinea datos={tendencias} titulo="Registros y documentos" />
            <GraficoDona datos={tendencias.suscripciones} titulo="Estado de suscripciones" />
          </div>
          {tendencias.ingresosMensuales.length > 0 && (
            <GraficoBarras datos={tendencias.ingresosMensuales} titulo="Facturacion mensual (ARS)" />
          )}
        </section>
      )}

      <section className="bloque" aria-labelledby="soporte-embudo-titulo">
        <h3 id="soporte-embudo-titulo">Embudo de las cuentas creadas en el periodo</h3>
        <div className="tabla-scroll">
          <table aria-labelledby="soporte-embudo-titulo">
            <thead><tr><th scope="col">Etapa</th><th scope="col" className="num">Cuentas</th><th scope="col" className="num">Conversion desde el alta</th></tr></thead>
            <tbody>
              <tr><th scope="row">Se registraron</th><td className="num">{f.registradas}</td><td className="num">{"—"}</td></tr>
              <tr><th scope="row">Subieron un documento</th><td className="num">{f.probaron}</td><td className="num">{pct(f.probaron, f.registradas)}</td></tr>
              <tr><th scope="row">Completaron uno</th><td className="num">{f.completaronUno}</td><td className="num">{pct(f.completaronUno, f.registradas)}</td></tr>
              <tr><th scope="row">Se suscribieron</th><td className="num">{f.suscribieron}</td><td className="num">{pct(f.suscribieron, f.registradas)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {ventas && (
        <section className="bloque" aria-labelledby="soporte-ventas-titulo">
          <h3 id="soporte-ventas-titulo">Ventas de suscripciones</h3>
          <div className="consumo-cards">
            <div className="consumo-card">
              <span className="consumo-card-valor">{formatoMonto(ventas.mrr, "ARS")}</span>
              <span className="consumo-card-etiqueta">MRR (ingreso recurrente mensual)</span>
              <span className="nota">{ventas.activas.filter((s) => s.estado === "activa").length} suscripcion{ventas.activas.filter((s) => s.estado === "activa").length === 1 ? "" : "es"} activa{ventas.activas.filter((s) => s.estado === "activa").length === 1 ? "" : "s"}</span>
            </div>
            <div className="consumo-card">
              <span className="consumo-card-valor">{formatoMonto(ventas.activas.reduce((s, r) => s + r.usoArs, 0), "ARS")}</span>
              <span className="consumo-card-etiqueta">uso acumulado en el periodo</span>
              <span className="nota">{formatoMonto(ventas.activas.reduce((s, r) => s + r.cobradoArs, 0), "ARS")} ya cobrado</span>
            </div>
          </div>
          {ventas.activas.length > 0 && (
            <div className="tabla-scroll">
              <table aria-labelledby="soporte-ventas-titulo">
                <thead>
                  <tr>
                    <th scope="col">Cuenta</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="num">Cuota</th>
                    <th scope="col" className="num">Uso periodo</th>
                    <th scope="col">Proximo cobro</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.activas.map((s) => (
                    <tr key={s.id}>
                      <th scope="row">
                        {s.nombre || s.email}
                        {s.equipo && <span className="recaudo-meta">{s.equipo}</span>}
                      </th>
                      <td>{s.plan || "—"}</td>
                      <td><span className={`etiqueta ${s.estado === "activa" ? "ok" : ""}`}>{NOMBRE_SUSCRIPCION[s.estado] || s.estado}</span></td>
                      <td className="num">{formatoMonto(s.precioArs, "ARS")}</td>
                      <td className="num">{formatoMonto(s.usoArs, "ARS")}</td>
                      <td>{soloFecha(s.proximoCobro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <PanelNotificaciones />
    </div>
  );
}
