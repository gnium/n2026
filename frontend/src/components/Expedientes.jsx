import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import PresupuestoModal, { enlaceWhatsApp, formatoMonto } from "./PresupuestoModal.jsx";
import ComprobanteModal from "./ComprobanteModal.jsx";
import UifExpediente from "./UifExpediente.jsx";
import ConfirmarDialogo from "./ConfirmarDialogo.jsx";

const TIPOS_ACTO = ["compraventa", "donacion", "hipoteca", "permuta", "cesion", "sucesion", "poder", "certificacion_firmas", "otro"];
const ESTADOS = [["abierto", "Abierto"], ["en_firma", "En firma"], ["cerrado", "Cerrado"], ["archivado", "Archivado"]];
const NOMBRE_ESTADO = Object.fromEntries(ESTADOS);
const ESTADOS_PRESUPUESTO = ["borrador", "enviado", "aceptado", "rechazado"];
/** DATE ("YYYY-MM-DD") y DATETIME/ISO; las fechas sin hora no pasan por Date para no correrse un dia. */
export const fechaCorta = (d) => {
  if (!d) return "—";
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return new Date(s).toLocaleDateString("es-AR");
};

export default function Expedientes({ inicialId = null, onConsumirInicial }) {
  const [filtro, setFiltro] = useState("");
  const [lista, setLista] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [formulario, setFormulario] = useState(null);
  const [nuevaTarea, setNuevaTarea] = useState("");
  const [nuevaParte, setNuevaParte] = useState({ clienteId: "", rol: "" });
  const [presupuesto, setPresupuesto] = useState(null); // { abierto, presupuesto? }
  const [comprobante, setComprobante] = useState(null); // { abierto, presupuesto? }
  const [comprobantes, setComprobantes] = useState([]);
  const [configFiscal, setConfigFiscal] = useState(null);
  const [companeros, setCompaneros] = useState([]);
  const [nuevoColaborador, setNuevoColaborador] = useState({ usuarioId: "", permiso: "lectura" });
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const dialogo = useRef(null);

  const cargarLista = async () => {
    setError(null);
    try {
      setLista(await api.expedientesListar(filtro));
    } catch (e) {
      setError(e.message);
    }
  };
  const cargarDetalle = async (id, enfocar = true) => {
    setError(null);
    try {
      const [d, cs] = await Promise.all([api.expedienteObtener(id), api.comprobantesListar({ expedienteId: id }).catch(() => [])]);
      setDetalle(d);
      setComprobantes(cs);
      if (enfocar) setTimeout(() => document.getElementById("exp-titulo")?.focus(), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  useEffect(() => {
    api.clientesListar().then(setClientes).catch(() => setClientes([]));
    api.configuracionFiscal().then(setConfigFiscal).catch(() => setConfigFiscal({ arcaEntorno: "apagado" }));
    api.equipoCompaneros().then(setCompaneros).catch(() => setCompaneros([]));
  }, []);

  useEffect(() => {
    if (inicialId) {
      cargarDetalle(inicialId);
      onConsumirInicial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicialId]);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (formulario && !d.open) {
      d.showModal();
      d.querySelector("input")?.focus();
    } else if (!formulario && d.open) d.close();
  }, [formulario]);

  const refrescar = async () => {
    await cargarLista();
    if (detalle) await cargarDetalle(detalle.id, false);
  };

  const guardarExpediente = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const datos = { caratula: formulario.caratula, tipoActo: formulario.tipoActo, observaciones: formulario.observaciones };
      const r = formulario.id ? await api.expedienteActualizar(formulario.id, datos) : await api.expedienteCrear(datos);
      setFormulario(null);
      await cargarLista();
      setDetalle(r);
      setAviso(formulario.id ? "Expediente actualizado." : "Expediente creado.");
    } catch (e) {
      setError(e.message);
    }
  };

  const accion = async (fn, mensaje) => {
    setError(null);
    setAviso(null);
    try {
      await fn();
      await refrescar();
      if (mensaje) setAviso(mensaje);
    } catch (e) {
      setError(e.message);
    }
  };

  const agregarParte = (e) => {
    e.preventDefault();
    if (!nuevaParte.clienteId) return;
    const partes = [...detalle.partes.map((p) => ({ clienteId: p.clienteId, rol: p.rol })), { clienteId: Number(nuevaParte.clienteId), rol: nuevaParte.rol }];
    accion(() => api.expedientePartes(detalle.id, partes)).then(() => setNuevaParte({ clienteId: "", rol: "" }));
  };
  const quitarParte = (clienteId) => accion(() => api.expedientePartes(detalle.id, detalle.partes.filter((p) => p.clienteId !== clienteId).map((p) => ({ clienteId: p.clienteId, rol: p.rol }))));

  const compartirCon = (e) => {
    e.preventDefault();
    if (!nuevoColaborador.usuarioId) return;
    accion(
      () => api.expedienteCompartir(detalle.id, { conUsuarioId: Number(nuevoColaborador.usuarioId), permiso: nuevoColaborador.permiso }),
      "Expediente compartido.",
    ).then(() => setNuevoColaborador({ usuarioId: "", permiso: "lectura" }));
  };

  const agregarTarea = (e) => {
    e.preventDefault();
    if (!nuevaTarea.trim()) return;
    accion(() => api.tareaCrear(detalle.id, { descripcion: nuevaTarea.trim() })).then(() => setNuevaTarea(""));
  };

  const [confirmar, setConfirmar] = useState(null); // { tipo: "expediente" } | { tipo: "presupuesto", p }
  const borrarExpediente = () => {
    setConfirmar(null);
    accion(async () => {
      await api.expedienteBorrar(detalle.id);
      setDetalle(null);
    }, "Expediente borrado.");
  };

  const clientesDelExpediente = detalle ? clientes.filter((c) => detalle.partes.some((p) => p.clienteId === c.id)) : [];
  // Un expediente compartido por otra cuenta del equipo: se ve, y se edita solo con permiso de edicion.
  const esPropio = !detalle || detalle.esPropio !== false;
  const puedeEditar = esPropio || detalle.permiso === "edicion";
  const pendientes = detalle?.tareas.filter((t) => t.estado === "pendiente") || [];
  const hechas = detalle?.tareas.filter((t) => t.estado === "hecha") || [];

  return (
    <div className="expedientes">
      {!detalle && (
        <>
          <h2>Expedientes</h2>
          <p className="nota">Una carpeta por operación: partes, tareas, presupuestos y el vínculo con el análisis de IA y con el protocolo. Carátula y observaciones se guardan en texto plano; evite poner en ellas datos que no hagan falta.</p>
        </>
      )}
      {error && !formulario && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      {!detalle ? (
        <>
          <div className="acciones agenda-toolbar">
            <div className="segmentado" role="group" aria-label="Estado">
              <button type="button" className={filtro === "" ? "activo" : ""} aria-pressed={filtro === ""} onClick={() => setFiltro("")}>Todos</button>
              {ESTADOS.map(([v, t]) => (
                <button type="button" key={v} className={filtro === v ? "activo" : ""} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}</button>
              ))}
            </div>
            <button type="button" className="boton primario" onClick={() => setFormulario({ caratula: "", tipoActo: "compraventa", observaciones: "" })}><Icono nombre="mas" tamano={16} /> Nuevo expediente</button>
          </div>
          {lista === null ? (
            <p className="vacio">Cargando…</p>
          ) : lista.length === 0 ? (
            <p className="vacio">No hay expedientes{filtro ? " en este estado" : ""}.</p>
          ) : (
            <div className="tabla-scroll">
              <table>
                <thead><tr><th scope="col">Carátula</th><th scope="col">Tipo de acto</th><th scope="col">Partes</th><th scope="col" className="num">Tareas pendientes</th><th scope="col">Estado</th><th scope="col">Actualizado</th></tr></thead>
                <tbody>
                  {lista.map((e) => (
                    <tr key={e.id}>
                      <td><button type="button" className="enlace" onClick={() => cargarDetalle(e.id)}>{e.caratula}</button></td>
                      <td>{e.tipoActo.replace(/_/g, " ")}</td>
                      <td>{e.partes || "—"}</td>
                      <td className="num">{e.tareasPendientes}</td>
                      <td><span className={`etiqueta ${e.estado === "abierto" || e.estado === "en_firma" ? "ok" : ""}`}>{NOMBRE_ESTADO[e.estado]}</span></td>
                      <td>{fechaCorta(e.actualizadoEn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="expediente-detalle">
          <button type="button" className="enlace" onClick={() => setDetalle(null)}><Icono nombre="izquierda" tamano={14} /> Volver a la lista</button>
          <div className="protocolo-cabecera">
            <div>
              <h3 id="exp-titulo" tabIndex={-1}>{detalle.caratula}</h3>
              <p className="nota">
                {detalle.tipoActo.replace(/_/g, " ")}
                {detalle.ejecucion && ` · análisis de IA del ${fechaCorta(detalle.ejecucion.iniciadoEn)} (${detalle.ejecucion.estado})`}
                {detalle.protocolo && ` · protocolo N° ${detalle.protocolo.numeroOrden}/${detalle.protocolo.anio}`}
              </p>
              {detalle.observaciones && <p className="nota">{detalle.observaciones}</p>}
              {!esPropio && (
                <p className="nota">
                  <span className="etiqueta">compartido</span> por {detalle.duenoNombre || "otra cuenta del equipo"} · {detalle.permiso === "edicion" ? "puede editar tareas y estado" : "solo lectura"}
                </p>
              )}
            </div>
            <div className="acciones">
              <label className="campo"><span className="sr-only">Estado</span>
                <select value={detalle.estado} disabled={!puedeEditar} onChange={(e) => accion(() => api.expedienteEstado(detalle.id, e.target.value), "Estado del expediente actualizado.")}>
                  {ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              {puedeEditar && <button type="button" className="boton chico" onClick={() => setFormulario({ id: detalle.id, caratula: detalle.caratula, tipoActo: detalle.tipoActo, observaciones: detalle.observaciones || "" })}>Editar</button>}
              {esPropio && <button type="button" className="boton chico" onClick={() => setConfirmar({ tipo: "expediente" })}><Icono nombre="basura" tamano={14} /> Borrar</button>}
            </div>
          </div>

          <section className="bloque">
            <h4>Partes</h4>
            {detalle.partes.length === 0 ? <p className="vacio">Sin partes vinculadas.</p> : (
              <ul className="chips">
                {detalle.partes.map((p) => (
                  <li key={p.clienteId} className="chip">{p.nombre}{p.rol ? <span> · {p.rol}</span> : null}{esPropio && <button type="button" className="enlace" aria-label={`Quitar a ${p.nombre}`} onClick={() => quitarParte(p.clienteId)}><Icono nombre="cruz" tamano={12} /></button>}</li>
                ))}
              </ul>
            )}
            {esPropio && (
              <form className="fila-alta" onSubmit={agregarParte}>
                <select aria-label="Cliente" value={nuevaParte.clienteId} onChange={(e) => setNuevaParte({ ...nuevaParte, clienteId: e.target.value })}>
                  <option value="">Agregar cliente…</option>
                  {clientes.filter((c) => !detalle.partes.some((p) => p.clienteId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <input type="text" aria-label="Rol" placeholder="Rol (vendedor, comprador…)" value={nuevaParte.rol} onChange={(e) => setNuevaParte({ ...nuevaParte, rol: e.target.value })} />
                <button type="submit" className="boton chico" disabled={!nuevaParte.clienteId}>Agregar</button>
              </form>
            )}
          </section>

          <section className="bloque">
            <h4>Tareas <span className="nota">{pendientes.length} pendientes · {hechas.length} hechas</span></h4>
            {puedeEditar && (
              <form className="fila-alta simple" onSubmit={agregarTarea}>
                <input type="text" aria-label="Nueva tarea" aria-describedby="ayuda-tarea" placeholder="Nueva tarea" value={nuevaTarea} onChange={(e) => setNuevaTarea(e.target.value)} maxLength={300} />
                <span id="ayuda-tarea" className="sr-only">Presione Enter o el botón Agregar para crear la tarea.</span>
                <button type="submit" className="boton chico" disabled={!nuevaTarea.trim()}>Agregar</button>
              </form>
            )}
            <div className="tareas">
              <div>
                <span className="eyebrow-mini">Pendientes</span>
                {pendientes.length === 0 && <p className="vacio">Nada pendiente.</p>}
                {pendientes.map((t) => <Tarea key={t.id} t={t} expedienteId={detalle.id} accion={accion} companeros={companeros} puedeEditar={puedeEditar} />)}
              </div>
              <div>
                <span className="eyebrow-mini">Hechas</span>
                {hechas.length === 0 && <p className="vacio">Todavía ninguna.</p>}
                {hechas.map((t) => <Tarea key={t.id} t={t} expedienteId={detalle.id} accion={accion} companeros={companeros} puedeEditar={puedeEditar} />)}
              </div>
            </div>
          </section>

          {esPropio && companeros.length > 0 && (
            <section className="bloque">
              <h4>Compartido con el equipo {detalle.colaboradores?.length ? <span className="etiqueta">{detalle.colaboradores.length}</span> : null}</h4>
              {!detalle.colaboradores?.length ? (
                <p className="vacio">Este expediente lo ve solo su cuenta.</p>
              ) : (
                <ul className="chips">
                  {detalle.colaboradores.map((c) => (
                    <li key={c.usuarioId} className="chip">
                      {c.nombre || c.email} · <span className="nota">{c.permiso === "edicion" ? "puede editar tareas y estado" : "solo lectura"}</span>
                      <button type="button" className="enlace" aria-label={`Dejar de compartir con ${c.nombre || c.email}`} onClick={() => accion(() => api.expedienteDejarDeCompartir(detalle.id, c.usuarioId), "Se dejó de compartir el expediente.")}><Icono nombre="cruz" tamano={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="fila-alta" onSubmit={compartirCon}>
                <select aria-label="Integrante del equipo" value={nuevoColaborador.usuarioId} onChange={(e) => setNuevoColaborador({ ...nuevoColaborador, usuarioId: e.target.value })}>
                  <option value="">Compartir con…</option>
                  {companeros.filter((c) => !detalle.colaboradores?.some((x) => x.usuarioId === c.usuarioId)).map((c) => <option key={c.usuarioId} value={c.usuarioId}>{c.nombre || c.email}</option>)}
                </select>
                <select aria-label="Permiso" value={nuevoColaborador.permiso} onChange={(e) => setNuevoColaborador({ ...nuevoColaborador, permiso: e.target.value })}>
                  <option value="lectura">Solo lectura</option>
                  <option value="edicion">Puede editar tareas y estado</option>
                </select>
                <button type="submit" className="boton chico" disabled={!nuevoColaborador.usuarioId}>Compartir</button>
              </form>
              <p className="ayuda">Quien lo recibe ve la carátula, las partes (solo el nombre), las tareas y el estado. Los presupuestos, los comprobantes, la ficha UIF y el protocolo siguen siendo suyos.</p>
            </section>
          )}

          {esPropio ? (<>
          <section className="bloque">
            <div className="protocolo-cabecera">
              <h4>Presupuestos</h4>
              <button type="button" className="boton chico" onClick={() => setPresupuesto({ abierto: true })}><Icono nombre="mas" tamano={14} /> Nuevo presupuesto</button>
            </div>
            {detalle.presupuestos.length === 0 ? <p className="vacio">Sin presupuestos.</p> : (
              <div className="tabla-scroll">
                <table>
                  <thead><tr><th scope="col">N°</th><th scope="col">Fecha</th><th scope="col">Cliente</th><th scope="col" className="num">Total</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                  <tbody>
                    {detalle.presupuestos.map((p) => (
                      <tr key={p.id}>
                        <td>{p.numero}</td>
                        <td>{fechaCorta(p.fecha)}</td>
                        <td>{p.clienteNombre || "—"}</td>
                        <td className="num">{formatoMonto(p.total, p.moneda)}</td>
                        <td>
                          <select aria-label={`Estado del presupuesto ${p.numero}`} value={p.estado} onChange={(e) => accion(() => api.presupuestoEstado(p.id, e.target.value), `Presupuesto N° ${p.numero}: estado actualizado.`)}>
                            {ESTADOS_PRESUPUESTO.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>
                          <div className="acciones">
                            <a className="enlace" href={api.presupuestoUrlPdf(p.id)} download aria-label={`Descargar PDF del presupuesto ${p.numero}`}>PDF</a>
                            <a className="enlace" href={enlaceWhatsApp({ ...p, validezDias: p.validezDias ?? 15 }, clientes.find((c) => c.id === p.clienteId))} target="_blank" rel="noreferrer" aria-label={`Enviar por WhatsApp el presupuesto ${p.numero}`}>WhatsApp</a>
                            {p.estado === "aceptado" && <button type="button" className="enlace" aria-label={`Emitir comprobante del presupuesto ${p.numero}`} onClick={async () => { try { setComprobante({ abierto: true, presupuesto: await api.presupuestoObtener(p.id) }); } catch (e) { setError(e.message); } }}>facturar</button>}
                            <button type="button" className="enlace" aria-label={`Editar presupuesto ${p.numero}`} onClick={async () => { try { setPresupuesto({ abierto: true, presupuesto: await api.presupuestoObtener(p.id) }); } catch (e) { setError(e.message); } }}>editar</button>
                            <button type="button" className="enlace" aria-label={`Borrar presupuesto ${p.numero}`} onClick={() => setConfirmar({ tipo: "presupuesto", p })}>borrar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bloque">
            <div className="protocolo-cabecera">
              <h4>Comprobantes</h4>
              <button type="button" className="boton chico" onClick={() => setComprobante({ abierto: true, presupuesto: { expedienteId: detalle.id, clienteId: detalle.partes[0]?.clienteId || "" } })}><Icono nombre="mas" tamano={14} /> Emitir comprobante</button>
            </div>
            {comprobantes.length === 0 ? <p className="vacio">Sin comprobantes.</p> : (
              <div className="tabla-scroll">
                <table>
                  <thead><tr><th scope="col">Fecha</th><th scope="col">Comprobante</th><th scope="col">Receptor</th><th scope="col" className="num">Total</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                  <tbody>
                    {comprobantes.map((c) => (
                      <tr key={c.id}>
                        <td>{fechaCorta(c.fecha)}</td>
                        <td>{c.tipoNombre} <span className="mono">{c.numeroCompleto}</span>{c.cae && <span className="nota"> · CAE {c.cae}</span>}</td>
                        <td>{c.receptorNombre || "—"}</td>
                        <td className="num">{formatoMonto(c.total, c.moneda)}</td>
                        <td><span className={`etiqueta ${c.estado === "emitido" ? "ok" : ""}`}>{c.estado}</span></td>
                        <td><a className="enlace" href={api.comprobanteUrlPdf(c.id)} download aria-label={`Descargar PDF de ${c.tipoNombre} ${c.numeroCompleto}`}>PDF</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <UifExpediente expedienteId={detalle.id} />
          </>) : (
            <p className="nota">Los presupuestos, los comprobantes y la ficha UIF de este expediente los gestiona {detalle.duenoNombre || "su dueño"}.</p>
          )}
        </div>
      )}

      <ConfirmarDialogo
        abierto={Boolean(confirmar)}
        titulo={confirmar?.tipo === "presupuesto" ? `Borrar presupuesto N° ${confirmar.p.numero}` : "Borrar expediente"}
        texto={confirmar?.tipo === "presupuesto" ? "Se borra el presupuesto y, si estaba aceptado, su cargo en la cuenta corriente." : "Se borran sus tareas, vínculos y ficha UIF. Los presupuestos y comprobantes quedan sin expediente asociado."}
        confirmar="Borrar"
        destructivo
        onConfirmar={() => (confirmar?.tipo === "presupuesto" ? (setConfirmar(null), accion(() => api.presupuestoBorrar(confirmar.p.id), `Presupuesto N° ${confirmar.p.numero} borrado.`)) : borrarExpediente())}
        onCancelar={() => setConfirmar(null)}
      />
      <ComprobanteModal
        abierto={Boolean(comprobante?.abierto)}
        presupuesto={comprobante?.presupuesto || null}
        clientes={clientesDelExpediente.length ? clientesDelExpediente : clientes}
        expedientes={detalle ? [{ id: detalle.id, caratula: detalle.caratula }] : []}
        config={configFiscal}
        onCerrar={() => setComprobante(null)}
        onEmitido={() => refrescar()}
      />

      <dialog ref={dialogo} className="modal" aria-labelledby="expediente-form-titulo" onClose={() => setFormulario(null)} onClick={(e) => e.target === dialogo.current && setFormulario(null)}>
        {formulario && (
          <form className="cert-form modal-caja" onSubmit={guardarExpediente}>
            <div className="protocolo-cabecera">
              <h3 id="expediente-form-titulo">{formulario.id ? "Editar expediente" : "Nuevo expediente"}</h3>
              <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={() => setFormulario(null)}><Icono nombre="cruz" tamano={16} /></button>
            </div>
            {error && <p className="alerta error" role="alert">{error}</p>}
            <label className="campo"><span className="campo-titulo">Carátula</span><input type="text" required maxLength={200} placeholder="Compraventa - Av. Siempreviva 742" value={formulario.caratula} onChange={(e) => setFormulario({ ...formulario, caratula: e.target.value })} /></label>
            <label className="campo"><span className="campo-titulo">Tipo de acto</span>
              <select value={formulario.tipoActo} onChange={(e) => setFormulario({ ...formulario, tipoActo: e.target.value })}>
                {TIPOS_ACTO.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="campo"><span className="campo-titulo">Observaciones <small>(opcional)</small></span><textarea rows={2} maxLength={1000} value={formulario.observaciones} onChange={(e) => setFormulario({ ...formulario, observaciones: e.target.value })} /></label>
            <div className="acciones">
              <button type="submit" className="boton primario">Guardar</button>
              <button type="button" className="boton" onClick={() => setFormulario(null)}>Cancelar</button>
            </div>
          </form>
        )}
      </dialog>

      <PresupuestoModal
        abierto={Boolean(presupuesto?.abierto)}
        presupuesto={presupuesto?.presupuesto || null}
        expedienteId={detalle?.id || null}
        clientes={clientesDelExpediente.length ? clientesDelExpediente : clientes}
        onCerrar={() => setPresupuesto(null)}
        onGuardado={() => refrescar()}
      />
    </div>
  );
}

function Tarea({ t, expedienteId, accion, companeros = [], puedeEditar = true }) {
  const hecha = t.estado === "hecha";
  const asignar = (usuarioId) =>
    accion(
      () => api.tareaActualizar(expedienteId, t.id, { descripcion: t.descripcion, responsable: t.responsable, venceEn: t.venceEn, responsableUsuarioId: usuarioId || null }),
      usuarioId ? "Tarea asignada." : "Tarea sin responsable.",
    );
  return (
    <div className={`tarea ${hecha ? "hecha" : ""}`}>
      <input type="checkbox" id={`tarea-${t.id}`} checked={hecha} disabled={!puedeEditar} onChange={() => accion(() => api.tareaEstado(expedienteId, t.id, hecha ? "pendiente" : "hecha"), hecha ? "Tarea marcada como pendiente." : "Tarea marcada como hecha.").then(() => document.getElementById(`tarea-${t.id}`)?.focus())} />
      <label htmlFor={`tarea-${t.id}`}>
        {t.descripcion}
        <span className="tarea-meta">
          {t.origen === "checklist" && <span className="etiqueta">checklist</span>}
          {[t.responsableNombre, t.responsable, t.venceEn && `vence ${fechaCorta(t.venceEn)}`].filter(Boolean).join(" · ")}
        </span>
      </label>
      {puedeEditar && companeros.length > 0 && (
        <select className="tarea-responsable" aria-label={`Responsable de: ${t.descripcion}`} value={t.responsableUsuarioId || ""} onChange={(e) => asignar(e.target.value)}>
          <option value="">Sin asignar</option>
          {companeros.map((c) => <option key={c.usuarioId} value={c.usuarioId}>{c.nombre || c.email}</option>)}
        </select>
      )}
      {puedeEditar && <button type="button" className="boton discreto chico" aria-label={`Borrar tarea: ${t.descripcion}`} onClick={() => accion(() => api.tareaBorrar(expedienteId, t.id), "Tarea borrada.")}><Icono nombre="basura" tamano={14} /></button>}
    </div>
  );
}
