import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import { fechaCorta } from "./Expedientes.jsx";

export const NIVELES = [["bajo", "Bajo"], ["medio", "Medio"], ["alto", "Alto"]];
export const DILIGENCIAS = [["simplificada", "Simplificada"], ["media", "Media"], ["reforzada", "Reforzada"]];
const DOC_PERSONA = ["Documento de identidad vigente", "Constancia de CUIT/CUIL", "Declaración jurada PEP", "Declaración de origen y licitud de fondos", "Constancia de domicilio"];
const DOC_SOCIEDAD = ["Estatuto o contrato social e inscripción", "Constancia de CUIT", "Acta de designación de autoridades", "Declaración de beneficiario final", "Declaración jurada PEP de autoridades", "Declaración de origen y licitud de fondos", "Último balance o estados contables"];

/** Legajo UIF del cliente (KYC). Los datos sensibles se guardan cifrados; el riesgo y las fechas, en claro para las alertas. */
export default function UifLegajo({ abierto, clienteId, onCerrar, onGuardado }) {
  const dialogo = useRef(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!abierto || !clienteId) return;
    setError(null);
    setForm(null);
    api.uifLegajo(clienteId).then((l) => {
      const base = l.clienteTipo === "sociedad" ? DOC_SOCIEDAD : DOC_PERSONA;
      const documentacion = base.map((item) => l.documentacion.find((d) => d.item === item) || { item, presentado: false, fecha: null });
      for (const d of l.documentacion) if (!base.includes(d.item)) documentacion.push(d);
      setForm({ ...l, documentacion, beneficiariosFinales: l.beneficiariosFinales.length ? l.beneficiariosFinales : l.clienteTipo === "sociedad" ? [{ nombre: "", documento: "", porcentaje: "" }] : [] });
      setTimeout(() => dialogo.current?.querySelector("select")?.focus(), 30);
    }).catch((e) => setError(e.message));
  }, [abierto, clienteId]);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    else if (!abierto && d.open) d.close();
  }, [abierto]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const setDoc = (i, parche) => setForm({ ...form, documentacion: form.documentacion.map((d, j) => (j === i ? { ...d, ...parche } : d)) });
  const setBen = (i, parche) => setForm({ ...form, beneficiariosFinales: form.beneficiariosFinales.map((b, j) => (j === i ? { ...b, ...parche } : b)) });

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const r = await api.uifGuardarLegajo(clienteId, {
        nivelRiesgo: form.nivelRiesgo,
        diligencia: form.diligencia,
        esPep: form.esPep,
        jurisdiccionRiesgo: form.jurisdiccionRiesgo,
        actividad: form.actividad,
        origenFondos: form.origenFondos,
        pepDetalle: form.pepDetalle,
        nacionalidad: form.nacionalidad,
        observaciones: form.observaciones,
        beneficiariosFinales: form.beneficiariosFinales.filter((b) => b.nombre?.trim()),
        documentacion: form.documentacion,
        actualizadoEn: new Date().toLocaleDateString("sv-SE"),
      });
      onGuardado?.(r);
      onCerrar?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <dialog ref={dialogo} className="modal ancho" aria-labelledby="uif-legajo-titulo" onClose={onCerrar} onClick={(e) => e.target === dialogo.current && onCerrar?.()}>
      <form className="cert-form modal-caja" onSubmit={guardar}>
        <div className="protocolo-cabecera">
          <h3 id="uif-legajo-titulo">Legajo UIF{form ? ` · ${form.clienteNombre}` : ""} {form?.vencido && <span className="etiqueta riesgo-alto">revisión vencida</span>}</h3>
          <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="cruz" tamano={16} /></button>
        </div>
        {error && <p className="alerta error" role="alert">{error}</p>}
        {!form ? (
          <p className="vacio" role="status">Cargando legajo…</p>
        ) : (
          <>
            <p className="nota">{form.existe ? `Actualizado el ${fechaCorta(form.actualizadoEn)} · próxima revisión ${fechaCorta(form.proximaRevision)}.` : "Sin legajo cargado todavía."} Actividad, origen de fondos, PEP y beneficiarios finales se guardan cifrados.</p>
            <div className="cert-grid">
              <label className="campo"><span className="campo-titulo">Nivel de riesgo</span>
                <select value={form.nivelRiesgo} onChange={set("nivelRiesgo")}>{NIVELES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              </label>
              <div className="campo">
                <label className="campo"><span className="campo-titulo">Debida diligencia</span>
                  <select value={form.diligencia} onChange={set("diligencia")} aria-describedby="legajo-dilig-ayuda">{DILIGENCIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                </label>
                <small id="legajo-dilig-ayuda" className="ayuda">Define la próxima revisión: reforzada cada año, media cada 3, simplificada cada 5 (orientativo).</small>
              </div>
              <label className="campo"><span className="campo-titulo">Actividad económica</span><input type="text" maxLength={200} value={form.actividad} onChange={set("actividad")} /></label>
              <label className="campo"><span className="campo-titulo">Nacionalidad / residencia</span><input type="text" maxLength={100} value={form.nacionalidad} onChange={set("nacionalidad")} /></label>
              <label className="campo"><span className="campo-titulo">Origen de fondos declarado</span><input type="text" maxLength={300} placeholder="ahorros, venta de inmueble, herencia…" value={form.origenFondos} onChange={set("origenFondos")} /></label>
              <fieldset className="campo">
                <legend className="campo-titulo">Condición</legend>
                <label className="chequeo"><input type="checkbox" checked={form.esPep} onChange={set("esPep")} /> Persona expuesta políticamente</label>
                <label className="chequeo"><input type="checkbox" checked={form.jurisdiccionRiesgo} onChange={set("jurisdiccionRiesgo")} /> Jurisdicción de alto riesgo (GAFI)</label>
              </fieldset>
              {form.esPep && <label className="campo"><span className="campo-titulo">Detalle PEP (cargo, vínculo)</span><input type="text" maxLength={300} value={form.pepDetalle} onChange={set("pepDetalle")} /></label>}
            </div>

            {form.clienteTipo === "sociedad" && (
              <fieldset className="campo">
                <legend className="campo-titulo">Beneficiarios finales</legend>
                <div className="fila-alta beneficiarios-cabecera" aria-hidden="true"><span className="ayuda">Nombre y apellido</span><span className="ayuda">DNI / CUIT</span><span className="ayuda">%</span></div>
                {form.beneficiariosFinales.map((b, i) => (
                  <div className="fila-alta" key={i}>
                    <input type="text" aria-label={`Beneficiario ${i + 1}: nombre y apellido`} value={b.nombre} onChange={(e) => setBen(i, { nombre: e.target.value })} />
                    <input type="text" aria-label={`Beneficiario ${i + 1}: DNI o CUIT`} value={b.documento || ""} onChange={(e) => setBen(i, { documento: e.target.value })} />
                    <input type="number" className="porcentaje" aria-label={`Beneficiario ${i + 1}: porcentaje de participación`} min="0" max="100" value={b.porcentaje ?? ""} onChange={(e) => setBen(i, { porcentaje: e.target.value })} />
                  </div>
                ))}
                <div><button type="button" className="boton chico" onClick={() => setForm({ ...form, beneficiariosFinales: [...form.beneficiariosFinales, { nombre: "", documento: "", porcentaje: "" }] })}><Icono nombre="mas" tamano={14} /> Agregar beneficiario</button></div>
              </fieldset>
            )}

            <fieldset className="campo">
              <legend className="campo-titulo">Documentación presentada</legend>
              <ul className="recaudos sin-acciones">
                {form.documentacion.map((d, i) => (
                  <li className={`recaudo ${d.presentado ? "hecho" : ""}`} key={i}>
                    <input type="checkbox" id={`doc-${i}`} checked={d.presentado} onChange={(e) => setDoc(i, { presentado: e.target.checked, fecha: e.target.checked ? new Date().toLocaleDateString("sv-SE") : null })} />
                    <label htmlFor={`doc-${i}`}><span className="recaudo-texto">{d.item}</span>{d.presentado && d.fecha && <span className="recaudo-meta">presentado {fechaCorta(d.fecha)}</span>}</label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <label className="campo"><span className="campo-titulo">Observaciones</span><textarea rows={2} maxLength={500} value={form.observaciones} onChange={set("observaciones")} /></label>
            <div className="acciones fijas">
              <button type="submit" className="boton primario" aria-disabled={ocupado} aria-busy={ocupado} onClick={(e) => ocupado && e.preventDefault()}>{ocupado ? "Guardando…" : "Guardar legajo"}</button>
              <button type="button" className="boton" onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
