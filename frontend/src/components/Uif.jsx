import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import ConfirmarDialogo from "./ConfirmarDialogo.jsx";
import { fechaCorta } from "./Expedientes.jsx";
import { formatoMonto } from "./PresupuestoModal.jsx";
import { ACTIVIDADES_UIF, NOMBRE_NIVEL_ALERTA } from "./UifExpediente.jsx";

const NOMBRE_ACTIVIDAD = Object.fromEntries(ACTIVIDADES_UIF);
const TIPOS_EVENTO = [["reporte_mensual", "Reporte sistemático mensual"], ["reporte_anual", "Reporte sistemático anual"], ["ros", "Reporte de operación sospechosa"], ["autoevaluacion", "Autoevaluación de riesgos"], ["revision_externa", "Revisión externa independiente"], ["capacitacion", "Capacitación"], ["otro", "Otro"]];
const NOMBRE_EVENTO = Object.fromEntries(TIPOS_EVENTO);
const hoyISO = () => new Date().toLocaleDateString("sv-SE");
const mesAnterior = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function Uif({ onAbrirExpediente, esAdmin }) {
  const [alertas, setAlertas] = useState(null);
  const [expedientes, setExpedientes] = useState(null);
  const [eventos, setEventos] = useState(null);
  const [params, setParams] = useState(null);
  const [evento, setEvento] = useState({ tipo: "reporte_mensual", periodo: mesAnterior(), fecha: hoyISO(), referencia: "", notas: "" });
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargar = async () => {
    setError(null);
    try {
      const [a, e, ev, p] = await Promise.all([api.uifAlertas(), api.uifExpedientes(), api.uifEventos(), api.uifParametros()]);
      setAlertas(a);
      setExpedientes(e);
      setEventos(ev);
      setParams(p);
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => {
    cargar();
  }, []);

  const registrar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.uifCrearEvento({ ...evento, periodo: evento.tipo === "reporte_mensual" || evento.tipo === "reporte_anual" ? evento.periodo : null });
      await cargar();
      setAviso("Evento registrado.");
    } catch (err) {
      setError(err.message);
    }
  };

  const [aBorrar, setABorrar] = useState(null);
  const borrar = (ev) => setABorrar(ev);
  const confirmarBorrado = async () => {
    const ev = aBorrar;
    setABorrar(null);
    try {
      await api.uifBorrarEvento(ev.id);
      await cargar();
      setAviso("Evento borrado.");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="uif">
      <h2>UIF</h2>
      <p className="nota">Prevención de lavado de activos (Ley 25.246, Res. UIF 242/2023). Legajos por cliente, recaudos por expediente y registro de reportes. Todo lo que muestra esta pantalla es <b>orientativo</b>: la escribanía lo contrasta con la resolución vigente y su manual de procedimientos.</p>
      {error && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      <ConfirmarDialogo abierto={Boolean(aBorrar)} titulo="Borrar evento de cumplimiento" texto={aBorrar ? `${NOMBRE_EVENTO[aBorrar.tipo]} del ${fechaCorta(aBorrar.fecha)}${aBorrar.referencia ? ` (${aBorrar.referencia})` : ""}. Es la constancia interna del reporte: borrala solo si se cargó por error.` : ""} confirmar="Borrar" destructivo onConfirmar={confirmarBorrado} onCancelar={() => setABorrar(null)} />
      <section className="bloque primero" aria-labelledby="uif-alertas-titulo">
        <h3 id="uif-alertas-titulo">Alertas {alertas && <span className={`etiqueta ${alertas.length ? "" : "ok"}`}>{alertas.length ? alertas.length : "sin pendientes"}</span>}</h3>
        {alertas === null ? <p className="vacio" role="status">Cargando…</p> : alertas.length === 0 ? <p className="vacio">Nada pendiente.</p> : (
          <ul className="alertas-uif">
            {alertas.map((a, i) => (
              <li key={i} className={a.nivel}>
                <Icono nombre={a.nivel === "alta" ? "alerta" : "info"} tamano={16} titulo={NOMBRE_NIVEL_ALERTA[a.nivel]} />
                <span>{a.texto}</span>
                {a.expedienteId && <button type="button" className="enlace" onClick={() => onAbrirExpediente?.(a.expedienteId)}>ver expediente</button>}
              </li>
            ))}
          </ul>
        )}
        {params && <p className="ayuda">Umbral compraventa de inmuebles: {params.umbralSmvm} SMVM{params.smvmArs ? ` = ${formatoMonto(params.umbralArs, "ARS")} (SMVM ${formatoMonto(params.smvmArs, "ARS")})` : " (SMVM sin cargar)"}.{esAdmin ? " Se edita en Configuración." : ""}</p>}
      </section>

      <section className="bloque" aria-labelledby="uif-exp-titulo">
        <h3 id="uif-exp-titulo">Expedientes alcanzados</h3>
        {expedientes === null ? <p className="vacio" role="status">Cargando…</p> : expedientes.length === 0 ? <p className="vacio">Ningún expediente marcado con actividad UIF. Se marca desde el bloque UIF de cada expediente.</p> : (
          <div className="tabla-scroll">
            <table aria-labelledby="uif-exp-titulo">
              <thead><tr><th scope="col">Expediente</th><th scope="col" className="col-sec">Actividad</th><th scope="col" className="num">Monto</th><th scope="col">Umbral</th><th scope="col" className="col-sec">Diligencia</th><th scope="col" className="num">Recaudos</th><th scope="col">Estado</th></tr></thead>
              <tbody>
                {expedientes.map((x) => (
                  <tr key={x.expedienteId}>
                    <td><button type="button" className="enlace" onClick={() => onAbrirExpediente?.(x.expedienteId)}>{x.caratula}</button></td>
                    <td className="col-sec">{NOMBRE_ACTIVIDAD[x.actividad]}</td>
                    <td className="num">{x.monto != null ? formatoMonto(x.monto, x.moneda || "ARS") : "—"}</td>
                    <td>{x.superaUmbral ? <span className="etiqueta riesgo-alto">supera</span> : x.actividad === "compraventa_inmueble" ? "no" : "—"}</td>
                    <td className="col-sec">{x.nivelDiligenciaSugerido || "—"}</td>
                    <td className="num">{x.recaudos.length - x.pendientes}/{x.recaudos.length}</td>
                    <td><span className={`etiqueta ${x.estado === "completo" ? "ok" : ""}`}>{x.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bloque" aria-labelledby="uif-ev-titulo">
        <h3 id="uif-ev-titulo">Reportes y eventos de cumplimiento</h3>
        <form className="cert-form" onSubmit={registrar}>
          <div className="cert-grid">
            <label className="campo"><span className="campo-titulo">Tipo</span>
              <select value={evento.tipo} onChange={(e) => setEvento({ ...evento, tipo: e.target.value, periodo: e.target.value === "reporte_anual" ? String(new Date().getFullYear() - 1) : mesAnterior() })}>{TIPOS_EVENTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            </label>
            {(evento.tipo === "reporte_mensual" || evento.tipo === "reporte_anual") && <label className="campo"><span className="campo-titulo">Período <small>({evento.tipo === "reporte_anual" ? "año, AAAA" : "mes, AAAA-MM"})</small></span><input type="text" pattern="\d{4}(-\d{2})?" placeholder={evento.tipo === "reporte_anual" ? "AAAA" : "AAAA-MM"} value={evento.periodo} onChange={(e) => setEvento({ ...evento, periodo: e.target.value })} /></label>}
            <label className="campo"><span className="campo-titulo">Fecha de presentación</span><input type="date" required value={evento.fecha} onChange={(e) => setEvento({ ...evento, fecha: e.target.value })} /></label>
            <label className="campo"><span className="campo-titulo">Referencia / N° de acuse <small>(opcional)</small></span><input type="text" maxLength={120} value={evento.referencia} onChange={(e) => setEvento({ ...evento, referencia: e.target.value })} /></label>
          </div>
          <div className="acciones"><button type="submit" className="boton primario">Registrar evento</button></div>
        </form>
        {eventos === null ? <p className="vacio" role="status">Cargando…</p> : eventos.length === 0 ? <p className="vacio">Sin eventos registrados.</p> : (
          <div className="tabla-scroll">
            <table aria-label="Eventos registrados">
              <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th><th scope="col">Período</th><th scope="col">Referencia</th><th scope="col">Expediente</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {eventos.map((ev) => (
                  <tr key={ev.id}>
                    <td>{fechaCorta(ev.fecha)}</td>
                    <td>{NOMBRE_EVENTO[ev.tipo]}</td>
                    <td>{ev.periodo || "—"}</td>
                    <td>{ev.referencia || "—"}</td>
                    <td>{ev.caratula || "—"}</td>
                    <td><button type="button" className="enlace" aria-label={`Borrar evento ${NOMBRE_EVENTO[ev.tipo]} del ${fechaCorta(ev.fecha)}`} onClick={() => borrar(ev)}>borrar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
