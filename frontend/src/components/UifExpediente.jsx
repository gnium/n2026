import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import { formatoMonto, parseMonto } from "./PresupuestoModal.jsx";
import { formatoUsd } from "./Pipeline.jsx";

export const ACTIVIDADES_UIF = [
  ["no_alcanzada", "No alcanzada por la UIF"],
  ["compraventa_inmueble", "Compraventa de inmueble"],
  ["persona_juridica", "Constitución / aportes a persona jurídica"],
  ["estructura_juridica", "Estructura jurídica (fideicomiso u otra)"],
  ["compraventa_negocio", "Compraventa de negocio o participaciones"],
  ["otra", "Otra actividad alcanzada"],
];
const NOMBRE_ACTIVIDAD = Object.fromEntries(ACTIVIDADES_UIF);
export const NOMBRE_NIVEL_ALERTA = { alta: "Alerta alta", media: "Alerta media", baja: "Aviso" };

/** Bloque UIF dentro del detalle del expediente: actividad, monto/umbral, recaudos (IA + manuales), diligencia sugerida y alertas. */
export default function UifExpediente({ expedienteId }) {
  const [ficha, setFicha] = useState(null);
  const [form, setForm] = useState(null);
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");
  const [guardado, setGuardado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const aForm = (f) => ({ actividad: f.actividad, monto: f.monto == null ? "" : String(f.monto).replace(".", ","), moneda: f.moneda || "ARS", notas: f.notas || "", estado: f.estado });
  const cargar = async () => {
    setError(null);
    try {
      const f = await api.uifExpediente(expedienteId);
      setFicha(f);
      setForm(aForm(f));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId]);

  const guardar = async (parche = {}) => {
    setError(null);
    try {
      const f = await api.uifGuardarExpediente(expedienteId, { actividad: form.actividad, monto: form.monto === "" ? null : parseMonto(form.monto), moneda: form.moneda, notas: form.notas, estado: form.estado, ...parche });
      setFicha(f);
      setForm(aForm(f));
      setGuardado(`Guardado ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}.`);
      return f;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };

  const generar = async () => {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    setAviso("");
    try {
      const g = await guardar();
      if (!g) return;
      const r = await api.uifGenerarRecaudos(expedienteId);
      setFicha(r.ficha);
      setAviso(`${r.creados} recaudo${r.creados === 1 ? "" : "s"} nuevo${r.creados === 1 ? "" : "s"}${r.simulado ? " (modo simulado)" : ` · costo ${r.costoAproximado ? "~" : ""}${formatoUsd(r.costoUsd)}`}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const setRecaudo = (i, parche) => guardar({ recaudos: ficha.recaudos.map((r, j) => (j === i ? { ...r, ...parche } : r)) });
  const quitarRecaudo = (i) => guardar({ recaudos: ficha.recaudos.filter((_, j) => j !== i) });
  const agregarRecaudo = (e) => {
    e.preventDefault();
    if (!nuevo.trim()) return;
    guardar({ recaudos: [...ficha.recaudos, { item: nuevo.trim(), fundamento: "", obligatorio: false, estado: "pendiente", origen: "manual" }] }).then(() => setNuevo(""));
  };

  if (!ficha || !form) return <p className="vacio" role="status">Cargando UIF…</p>;
  const alcanzada = form.actividad !== "no_alcanzada";
  const montoInvalido = form.monto !== "" && !(parseMonto(form.monto) >= 0);

  return (
    <section className="bloque" aria-labelledby="uif-bloque-titulo">
      <div className="protocolo-cabecera">
        <h4 id="uif-bloque-titulo">UIF {ficha.existe && alcanzada && <span className={`etiqueta ${ficha.estado === "completo" ? "ok" : ""}`}>{ficha.estado === "completo" ? "completo" : `${ficha.pendientes} pendiente${ficha.pendientes === 1 ? "" : "s"}`}</span>}</h4>
        {alcanzada && <button type="button" className="boton chico primario" onClick={generar} aria-disabled={ocupado} aria-busy={ocupado}><Icono nombre="escudo" tamano={14} /> {ocupado ? "Generando…" : "Generar recaudos con IA"}</button>}
      </div>
      {error && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>
      <div className="cert-grid">
        <label className="campo"><span className="campo-titulo">Actividad específica (Res. UIF 242/2023)</span>
          <select value={form.actividad} onChange={(e) => setForm({ ...form, actividad: e.target.value })} onBlur={() => guardar()} aria-describedby="uif-autoguardado">{ACTIVIDADES_UIF.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        {alcanzada && (
          <div className="campo"><span className="campo-titulo" id="uif-monto-titulo">Monto de la operación</span>
            <div className="fila">
              <input type="text" inputMode="decimal" placeholder="0,00" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} onBlur={() => !montoInvalido && guardar()} aria-labelledby="uif-monto-titulo" aria-invalid={montoInvalido || undefined} aria-describedby={montoInvalido ? "uif-monto-error" : "uif-umbral uif-autoguardado"} className={montoInvalido ? "invalido" : ""} />
              <select className="moneda" aria-label="Moneda del monto de la operación" value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} onBlur={() => guardar()}><option value="ARS">ARS</option><option value="USD">USD</option></select>
              {ficha.superaUmbral && <span className="etiqueta riesgo-alto">supera el umbral</span>}
            </div>
            {montoInvalido && <small id="uif-monto-error" className="ayuda error">Ingresá un importe válido (por ejemplo 12.500,00).</small>}
            {form.actividad === "compraventa_inmueble" && <small id="uif-umbral" className="ayuda">Umbral vigente: {ficha.umbralArs ? formatoMonto(ficha.umbralArs, "ARS") : "cargar el SMVM en Configuración"}.</small>}
          </div>
        )}
      </div>
      <small id="uif-autoguardado" className="ayuda" role="status">{guardado || "Los campos se guardan al salir de cada uno."}</small>
      {alcanzada && (
        <>
          {(ficha.alertas.length > 0 || ficha.nivelDiligenciaSugerido) && (
            <ul className="alertas-uif">
              {ficha.nivelDiligenciaSugerido && <li className="media"><Icono nombre="escudo" tamano={16} titulo="Sugerencia" /><span>Diligencia sugerida: <b>{ficha.nivelDiligenciaSugerido}</b></span></li>}
              {ficha.alertas.map((a, i) => <li key={i} className="alta"><Icono nombre="alerta" tamano={16} titulo={NOMBRE_NIVEL_ALERTA.alta} /><span>{a}</span></li>)}
            </ul>
          )}
          <form className="fila-alta simple" onSubmit={agregarRecaudo}>
            <label className="sr-only" htmlFor="uif-nuevo-recaudo">Nuevo recaudo</label>
            <input id="uif-nuevo-recaudo" type="text" placeholder="Agregar recaudo a mano" value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={300} />
            <button type="submit" className="boton chico" disabled={!nuevo.trim()}>Agregar</button>
          </form>
          {ficha.recaudos.length === 0 ? (
            <p className="vacio">Sin recaudos todavía: generalos con IA o cargalos a mano.</p>
          ) : (
            <ul className="recaudos" aria-label="Recaudos del expediente">
              {ficha.recaudos.map((r, i) => (
                <li className={`recaudo ${r.estado}`} key={i}>
                  <input type="checkbox" id={`recaudo-${i}`} checked={r.estado === "hecho"} disabled={r.estado === "no_aplica"} onChange={(e) => setRecaudo(i, { estado: e.target.checked ? "hecho" : "pendiente" })} />
                  <label htmlFor={`recaudo-${i}`}>
                    <span className="recaudo-texto">{r.item}</span>{r.obligatorio && <span className="etiqueta">obligatorio</span>}{r.estado === "no_aplica" && <span className="etiqueta">no aplica</span>}
                    {(r.fundamento || r.origen === "ia") && <span className="recaudo-meta">{[r.origen === "ia" ? "Sugerido por IA" : null, r.fundamento].filter(Boolean).join(" · ")}</span>}
                  </label>
                  <div className="acciones">
                    <button type="button" className="enlace" onClick={() => setRecaudo(i, { estado: r.estado === "no_aplica" ? "pendiente" : "no_aplica" })} aria-label={`${r.estado === "no_aplica" ? "Volver a pendiente" : "Marcar como no aplica"}: ${r.item}`}>{r.estado === "no_aplica" ? "reactivar" : "no aplica"}</button>
                    <button type="button" className="boton discreto chico" aria-label={`Quitar recaudo: ${r.item}`} onClick={() => quitarRecaudo(i)}><Icono nombre="basura" tamano={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="acciones">
            <label className="chequeo"><input type="checkbox" checked={form.estado === "completo"} onChange={(e) => guardar({ estado: e.target.checked ? "completo" : "pendiente" })} /> Recaudos completos para este expediente</label>
          </div>
          <label className="campo"><span className="campo-titulo">Notas UIF <small>(opcional)</small></span><textarea rows={2} maxLength={1000} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} onBlur={() => guardar()} aria-describedby="uif-autoguardado" /></label>
          <p className="ayuda">Orientativo: verificar contra la resolución UIF vigente y el manual de procedimientos de la escribanía. Actividad: {NOMBRE_ACTIVIDAD[form.actividad]}.</p>
        </>
      )}
    </section>
  );
}
