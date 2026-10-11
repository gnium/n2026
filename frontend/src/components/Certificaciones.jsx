import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import FormCertificacion, { DATOS_CERTIFICACION_INICIAL } from "./FormCertificacion.jsx";

const NOMBRE_ESTADO = { borrador: "Borrador", certificada: "Certificada", entregada: "Entregada" };
const fechaCorta = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";
const FILTROS = [["", "Todos"], ["borrador", "Borrador"], ["certificada", "Certificada"], ["entregada", "Entregada"]];

function formVacio() {
  return { id: null, ...DATOS_CERTIFICACION_INICIAL, observaciones: "", expedienteId: "" };
}

export default function Certificaciones() {
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [anios, setAnios] = useState([]);
  const [expedientes, setExpedientes] = useState([]);
  const [google, setGoogle] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const dialogo = useRef(null);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (formulario && !d.open) {
      d.showModal();
      d.querySelector("input, select")?.focus();
    } else if (!formulario && d.open) d.close();
  }, [formulario]);

  const cargar = async () => {
    setError(null);
    try {
      const [l, a] = await Promise.all([
        api.certificacionesListar({ estado: filtro || undefined, anio: anio || undefined }),
        api.certificacionAnios(),
      ]);
      setLista(l);
      setAnios(a.length ? a : [anio]);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { cargar(); }, [filtro, anio]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.expedientesListar().then(setExpedientes).catch(() => {});
    api.googleEstado().then(setGoogle).catch(() => setGoogle(null));
  }, []);

  const abrirNuevo = () => {
    setError(null);
    setAviso(null);
    setFormulario(formVacio());
  };

  const abrirEdicion = (c) => {
    if (c.estado !== "borrador") return;
    setError(null);
    setAviso(null);
    setFormulario({
      id: c.id,
      modalidad: c.modalidad,
      firmantes: c.firmantes?.length ? c.firmantes.map((f) => ({ nombre: f.nombre || "", dni: f.dni || "", domicilio: f.domicilio || "", caracter: f.caracter || "apoderado", clienteId: f.clienteId || null })) : DATOS_CERTIFICACION_INICIAL.firmantes,
      representada: c.representada || { ...DATOS_CERTIFICACION_INICIAL.representada },
      documento: c.documento || { ...DATOS_CERTIFICACION_INICIAL.documento },
      jurisdiccion: c.jurisdiccion || "",
      observaciones: c.observaciones || "",
      expedienteId: c.expedienteId || "",
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const datos = {
        modalidad: formulario.modalidad,
        firmantes: formulario.firmantes.filter((f) => f.nombre.trim()),
        representada: formulario.modalidad === "representacion" ? formulario.representada : null,
        documento: formulario.documento,
        jurisdiccion: formulario.jurisdiccion || null,
        observaciones: formulario.observaciones.trim() || null,
        expedienteId: formulario.expedienteId ? Number(formulario.expedienteId) : null,
      };
      if (formulario.id) await api.certificacionActualizar(formulario.id, datos);
      else await api.certificacionCrear(datos);
      setFormulario(null);
      cargar();
      setAviso(formulario.id ? "Certificación actualizada." : "Certificación creada.");
    } catch (e) {
      setError(e.message);
    }
  };

  const certificar = async (c) => {
    setError(null);
    try {
      await api.certificacionEstado(c.id, "certificada");
      cargar();
      window.open(api.certificacionUrlPdf(c.id), "_blank");
    } catch (e) {
      setError(e.message);
    }
  };

  const marcarEntregada = async (c) => {
    setError(null);
    try {
      await api.certificacionEstado(c.id, "entregada");
      cargar();
      setAviso(`Certificación N° ${c.numero}/${c.anio} marcada como entregada.`);
    } catch (e) {
      setError(e.message);
    }
  };

  const borrar = async (c) => {
    setError(null);
    try {
      await api.certificacionBorrar(c.id);
      cargar();
      setAviso(`Certificación N° ${c.numero}/${c.anio} eliminada.`);
    } catch (e) {
      setError(e.message);
    }
  };

  const aDrive = async (c) => {
    setError(null);
    try {
      const r = await api.googleSubirADrive({ tipo: "certificacion", id: c.id });
      setAviso(`Certificación N° ${c.numero}/${c.anio} copiada a Drive.`);
      if (r?.enlace) window.open(r.enlace, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="ddjj">
      <h2>Certificaciones de Firmas</h2>
      <p className="nota">Libro de Requerimientos — Registro de certificaciones de firmas realizadas. Cada certificación tiene su propia numeración anual correlativa, independiente del protocolo de escrituras.</p>
      {error && !formulario && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      <div className="acciones agenda-toolbar">
        <div className="segmentado" role="group" aria-label="Filtro por estado">
          {FILTROS.map(([v, t]) => (
            <button key={v} type="button" className={filtro === v ? "activo" : ""} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}</button>
          ))}
        </div>
        <label className="campo">
          <span className="campo-titulo">Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[...new Set([anio, ...anios])].sort((a, b) => b - a).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <button type="button" className="boton primario" onClick={abrirNuevo}><Icono nombre="mas" tamano={16} /> Nueva certificación</button>
      </div>

      {lista === null ? (
        <p className="vacio">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="vacio">No hay certificaciones{filtro ? ` en estado "${NOMBRE_ESTADO[filtro]}"` : ""} en {anio}.</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Fecha</th>
                <th>Modalidad</th>
                <th>Firmantes</th>
                <th>Documento</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>{c.numero}/{c.anio}</td>
                  <td>{fechaCorta(c.fechaCertificacion || c.creadoEn)}</td>
                  <td>{c.modalidad === "representacion" ? "Representación" : "Personal"}</td>
                  <td>{c.firmantesLegible ? c.firmantes.map((f) => f.nombre).join(", ") : "(no se pudo leer)"}</td>
                  <td>{c.documento?.naturaleza || "—"}</td>
                  <td><span className={`etiqueta etiqueta-estado-${c.estado}-cert`}>{NOMBRE_ESTADO[c.estado]}</span></td>
                  <td>
                    <div className="acciones" style={{ gap: "var(--s1)" }}>
                      {c.estado === "borrador" && (
                        <>
                          <button type="button" className="boton discreto chico" onClick={() => abrirEdicion(c)} title="Editar"><Icono nombre="pluma" tamano={14} /></button>
                          <button type="button" className="boton discreto chico" onClick={() => certificar(c)} title="Certificar y generar PDF"><Icono nombre="firma" tamano={14} /></button>
                          <button type="button" className="boton discreto chico" onClick={() => borrar(c)} title="Borrar"><Icono nombre="cruz" tamano={14} /></button>
                        </>
                      )}
                      {c.estado === "certificada" && (
                        <>
                          <a className="boton discreto chico" href={api.certificacionUrlPdf(c.id)} download title="Descargar PDF"><Icono nombre="descargar" tamano={14} /></a>
                          {google?.conectado && google?.subirDocumentos && (
                            <button type="button" className="boton discreto chico" onClick={() => aDrive(c)} title="Copiar a Drive"><Icono nombre="nube" tamano={14} /></button>
                          )}
                          <button type="button" className="boton discreto chico" onClick={() => marcarEntregada(c)} title="Marcar entregada"><Icono nombre="check" tamano={14} /></button>
                        </>
                      )}
                      {c.estado === "entregada" && (
                        <>
                          <a className="boton discreto chico" href={api.certificacionUrlPdf(c.id)} download title="Descargar PDF"><Icono nombre="descargar" tamano={14} /></a>
                          {google?.conectado && google?.subirDocumentos && (
                            <button type="button" className="boton discreto chico" onClick={() => aDrive(c)} title="Copiar a Drive"><Icono nombre="nube" tamano={14} /></button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dialog ref={dialogo} className="modal" aria-labelledby="cert-form-titulo" onClose={() => setFormulario(null)} onClick={(e) => e.target === dialogo.current && setFormulario(null)}>
        {formulario && (
          <form className="cert-form modal-caja" onSubmit={guardar}>
            <div className="protocolo-cabecera">
              <h3 id="cert-form-titulo">{formulario.id ? "Editar certificación" : "Nueva certificación"}</h3>
              <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={() => setFormulario(null)}><Icono nombre="cruz" tamano={16} /></button>
            </div>
            {error && <p className="alerta error" role="alert">{error}</p>}

            <FormCertificacion
              datos={formulario}
              onChange={(patch) => setFormulario({ ...formulario, ...patch })}
            />

            <fieldset className="cert-seccion">
              <legend><Icono nombre="carpeta" tamano={16} /> Expediente y observaciones</legend>
              <label className="campo-inline">
                <span>Vincular a expediente (opcional)</span>
                <select value={formulario.expedienteId} onChange={(e) => setFormulario({ ...formulario, expedienteId: e.target.value })}>
                  <option value="">Sin expediente</option>
                  {expedientes.map((ex) => <option key={ex.id} value={ex.id}>{ex.caratula}</option>)}
                </select>
              </label>
              <label className="campo-inline">
                <span>Observaciones</span>
                <textarea rows={2} placeholder="Notas internas (opcional)" value={formulario.observaciones} onChange={(e) => setFormulario({ ...formulario, observaciones: e.target.value })} />
              </label>
            </fieldset>

            <div className="acciones" style={{ justifyContent: "flex-end", gap: "var(--s2)" }}>
              <button type="button" className="boton" onClick={() => setFormulario(null)}>Cancelar</button>
              <button type="submit" className="boton primario">{formulario.id ? "Guardar cambios" : "Crear certificación"}</button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
