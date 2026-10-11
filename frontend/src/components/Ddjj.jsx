import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const TIPOS_ACTO = [["compraventa","Compraventa"],["donacion","Donación"],["hipoteca","Hipoteca"],["permuta","Permuta"],["cesion","Cesión"],["sucesion","Sucesión"],["poder","Poder"],["certificacion_firmas","Certificación de firmas"],["otro","Otro"]];
const NOMBRE_TIPO = Object.fromEntries(TIPOS_ACTO);
const moneda = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(Number(n) || 0);
const fechaCorta = (d) => d ? new Date(d).toLocaleDateString("es-AR") : "—";
const NOMBRE_ESTADO = { borrador: "Borrador", generada: "Generada", presentada: "Presentada" };
const hoyISO = () => new Date().toLocaleDateString("sv-SE");

const PARTE_VACIA = { nombre: "", documento: "", cuit: "", rol: "comprador" };

function formVacio() {
  return {
    id: null,
    jurisdiccion: "salta",
    tipoActo: "",
    fechaActo: hoyISO(),
    montoOperacion: "",
    alicuotaSellos: "2.5",
    montoSellos: "",
    datosPartes: [{ ...PARTE_VACIA }],
    datosInmueble: { matricula: "", nomenclatura: "", domicilio: "" },
    datosEscribano: { nombre: "", matricula: "", cuit: "" },
    expedienteId: "",
    presupuestoId: "",
    notas: "",
  };
}

export default function Ddjj({ onActualizar }) {
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [expedientes, setExpedientes] = useState([]);
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
      setLista(await api.ddijListar(filtro || undefined));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { cargar(); }, [filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.expedientesListar().then(setExpedientes).catch(() => {});
  }, []);

  const abrirNuevo = () => {
    setError(null);
    setAviso(null);
    setFormulario(formVacio());
  };

  const abrirEdicion = (d) => {
    if (d.estado !== "borrador") return;
    setError(null);
    setAviso(null);
    setFormulario({
      id: d.id,
      jurisdiccion: d.jurisdiccion,
      tipoActo: d.tipoActo,
      fechaActo: String(d.fechaActo).slice(0, 10),
      montoOperacion: String(d.montoOperacion),
      alicuotaSellos: String(d.alicuotaSellos),
      montoSellos: String(d.montoSellos),
      datosPartes: d.datosPartes?.length ? d.datosPartes : [{ ...PARTE_VACIA }],
      datosInmueble: d.datosInmueble || { matricula: "", nomenclatura: "", domicilio: "" },
      datosEscribano: d.datosEscribano || { nombre: "", matricula: "", cuit: "" },
      expedienteId: d.expedienteId || "",
      presupuestoId: d.presupuestoId || "",
      notas: d.notas || "",
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const datos = {
        jurisdiccion: formulario.jurisdiccion,
        tipoActo: formulario.tipoActo,
        fechaActo: formulario.fechaActo,
        montoOperacion: Number(formulario.montoOperacion) || 0,
        alicuotaSellos: Number(formulario.alicuotaSellos) || 0,
        montoSellos: Number(formulario.montoSellos) || 0,
        datosPartes: formulario.datosPartes.filter((p) => p.nombre.trim()),
        datosInmueble: formulario.datosInmueble.matricula || formulario.datosInmueble.nomenclatura || formulario.datosInmueble.domicilio ? formulario.datosInmueble : null,
        datosEscribano: formulario.datosEscribano.nombre ? formulario.datosEscribano : null,
        expedienteId: formulario.expedienteId ? Number(formulario.expedienteId) : null,
        presupuestoId: formulario.presupuestoId ? Number(formulario.presupuestoId) : null,
        notas: formulario.notas.trim() || null,
      };
      if (formulario.id) await api.ddijActualizar(formulario.id, datos);
      else await api.ddijCrear(datos);
      setFormulario(null);
      cargar();
      onActualizar?.();
      setAviso(formulario.id ? "DDJJ actualizada." : "DDJJ creada.");
    } catch (e) {
      setError(e.message);
    }
  };

  const generarPdf = async (d) => {
    setError(null);
    try {
      await api.ddijEstado(d.id, "generada");
      cargar();
      onActualizar?.();
      window.open(api.ddijUrlPdf(d.id), "_blank");
    } catch (e) {
      setError(e.message);
    }
  };

  const marcarPresentada = async (d) => {
    setError(null);
    try {
      await api.ddijEstado(d.id, "presentada");
      cargar();
      onActualizar?.();
      setAviso(`DDJJ N° ${d.numero} marcada como presentada.`);
    } catch (e) {
      setError(e.message);
    }
  };

  const borrar = async (d) => {
    setError(null);
    try {
      await api.ddijBorrar(d.id);
      cargar();
      onActualizar?.();
      setAviso(`DDJJ N° ${d.numero} eliminada.`);
    } catch (e) {
      setError(e.message);
    }
  };

  const actualizarMonto = (campo, valor) => {
    const f = { ...formulario, [campo]: valor };
    const monto = Number(campo === "montoOperacion" ? valor : f.montoOperacion) || 0;
    const alicuota = Number(campo === "alicuotaSellos" ? valor : f.alicuotaSellos) || 0;
    f.montoSellos = (monto * alicuota / 100).toFixed(2);
    setFormulario(f);
  };

  const setParte = (i, parche) => setFormulario({ ...formulario, datosPartes: formulario.datosPartes.map((p, j) => j === i ? { ...p, ...parche } : p) });
  const agregarParte = () => setFormulario({ ...formulario, datosPartes: [...formulario.datosPartes, { ...PARTE_VACIA }] });
  const quitarParte = (i) => setFormulario({ ...formulario, datosPartes: formulario.datosPartes.filter((_, j) => j !== i) });

  const FILTROS = [["", "Todos"], ["borrador", "Borrador"], ["generada", "Generada"], ["presentada", "Presentada"]];

  return (
    <div className="ddjj">
      <h2>Declaraciones Juradas</h2>
      <p className="nota">Formulario F06W — Impuesto de Sellos, Provincia de Salta. Las DDJJ se generan como PDF para presentar en la Dirección General de Rentas.</p>
      {error && !formulario && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      <div className="acciones">
        <div className="segmentado" role="group" aria-label="Filtro por estado">
          {FILTROS.map(([v, t]) => (
            <button key={v} type="button" className={filtro === v ? "activo" : ""} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}</button>
          ))}
        </div>
        <button type="button" className="boton primario" onClick={abrirNuevo}><Icono nombre="mas" tamano={16} /> Nueva DDJJ</button>
      </div>

      {lista === null ? (
        <p className="vacio">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="vacio">No hay declaraciones juradas{filtro ? ` en estado "${NOMBRE_ESTADO[filtro]}"` : ""}.</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Fecha acto</th>
                <th>Tipo de acto</th>
                <th>Monto operación</th>
                <th>Monto sellos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.id}>
                  <td>{d.numero}</td>
                  <td>{fechaCorta(d.fechaActo)}</td>
                  <td>{NOMBRE_TIPO[d.tipoActo] || d.tipoActo}</td>
                  <td style={{ textAlign: "right" }}>{moneda(d.montoOperacion)}</td>
                  <td style={{ textAlign: "right" }}>{moneda(d.montoSellos)}</td>
                  <td><span className={`etiqueta etiqueta-estado-${d.estado}`}>{NOMBRE_ESTADO[d.estado]}</span></td>
                  <td>
                    <div className="acciones" style={{ gap: "var(--s1)" }}>
                      {d.estado === "borrador" && (
                        <>
                          <button type="button" className="boton discreto chico" onClick={() => abrirEdicion(d)} title="Editar"><Icono nombre="editar" tamano={14} /></button>
                          <button type="button" className="boton discreto chico" onClick={() => generarPdf(d)} title="Generar PDF"><Icono nombre="descargar" tamano={14} /></button>
                          <button type="button" className="boton discreto chico" onClick={() => borrar(d)} title="Borrar"><Icono nombre="cruz" tamano={14} /></button>
                        </>
                      )}
                      {d.estado === "generada" && (
                        <>
                          <a className="boton discreto chico" href={api.ddijUrlPdf(d.id)} download title="Descargar PDF"><Icono nombre="descargar" tamano={14} /></a>
                          <button type="button" className="boton discreto chico" onClick={() => marcarPresentada(d)} title="Marcar presentada"><Icono nombre="ok" tamano={14} /></button>
                        </>
                      )}
                      {d.estado === "presentada" && (
                        <a className="boton discreto chico" href={api.ddijUrlPdf(d.id)} download title="Descargar PDF"><Icono nombre="descargar" tamano={14} /></a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dialog ref={dialogo} className="modal" aria-labelledby="ddjj-form-titulo" onClose={() => setFormulario(null)} onClick={(e) => e.target === dialogo.current && setFormulario(null)}>
        {formulario && (
          <form className="cert-form modal-caja" onSubmit={guardar}>
            <div className="protocolo-cabecera">
              <h3 id="ddjj-form-titulo">{formulario.id ? `Editar DDJJ` : "Nueva DDJJ"}</h3>
              <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={() => setFormulario(null)}><Icono nombre="cruz" tamano={16} /></button>
            </div>
            {error && <p className="alerta error" role="alert">{error}</p>}

            <div className="cert-grid">
              <label className="campo">
                <span className="campo-titulo">Jurisdicción</span>
                <select value={formulario.jurisdiccion} onChange={(e) => setFormulario({ ...formulario, jurisdiccion: e.target.value })}>
                  <option value="salta">Salta</option>
                </select>
              </label>
              <label className="campo">
                <span className="campo-titulo">Tipo de acto</span>
                <select value={formulario.tipoActo} onChange={(e) => setFormulario({ ...formulario, tipoActo: e.target.value })} required>
                  <option value="">Seleccionar…</option>
                  {TIPOS_ACTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <label className="campo">
                <span className="campo-titulo">Fecha del acto</span>
                <input type="date" value={formulario.fechaActo} onChange={(e) => setFormulario({ ...formulario, fechaActo: e.target.value })} required />
              </label>
              <label className="campo">
                <span className="campo-titulo">Expediente (opcional)</span>
                <select value={formulario.expedienteId} onChange={(e) => setFormulario({ ...formulario, expedienteId: e.target.value })}>
                  <option value="">Sin expediente</option>
                  {expedientes.map((exp) => <option key={exp.id} value={exp.id}>{exp.caratula}</option>)}
                </select>
              </label>
            </div>

            <div className="cert-grid">
              <label className="campo">
                <span className="campo-titulo">Monto de la operación</span>
                <input type="number" step="0.01" min="0" value={formulario.montoOperacion} onChange={(e) => actualizarMonto("montoOperacion", e.target.value)} required />
              </label>
              <label className="campo">
                <span className="campo-titulo">Alícuota de sellos (%)</span>
                <input type="number" step="0.01" min="0" max="100" value={formulario.alicuotaSellos} onChange={(e) => actualizarMonto("alicuotaSellos", e.target.value)} required />
              </label>
              <label className="campo">
                <span className="campo-titulo">Monto del impuesto</span>
                <input type="number" step="0.01" min="0" value={formulario.montoSellos} onChange={(e) => setFormulario({ ...formulario, montoSellos: e.target.value })} required />
              </label>
            </div>

            <div className="campo">
              <span className="campo-titulo">Datos del escribano</span>
              <div className="cert-grid">
                <input type="text" placeholder="Nombre" value={formulario.datosEscribano.nombre} onChange={(e) => setFormulario({ ...formulario, datosEscribano: { ...formulario.datosEscribano, nombre: e.target.value } })} />
                <input type="text" placeholder="Matrícula" value={formulario.datosEscribano.matricula} onChange={(e) => setFormulario({ ...formulario, datosEscribano: { ...formulario.datosEscribano, matricula: e.target.value } })} />
                <input type="text" placeholder="CUIT" value={formulario.datosEscribano.cuit} onChange={(e) => setFormulario({ ...formulario, datosEscribano: { ...formulario.datosEscribano, cuit: e.target.value } })} />
              </div>
            </div>

            <div className="campo">
              <span className="campo-titulo">Partes</span>
              {formulario.datosPartes.map((p, i) => (
                <div key={i} className="presupuesto-item" style={{ gridTemplateColumns: "1fr 120px 120px 100px auto" }}>
                  <input type="text" placeholder="Nombre" value={p.nombre} onChange={(e) => setParte(i, { nombre: e.target.value })} />
                  <input type="text" placeholder="Documento" value={p.documento} onChange={(e) => setParte(i, { documento: e.target.value })} />
                  <input type="text" placeholder="CUIT" value={p.cuit} onChange={(e) => setParte(i, { cuit: e.target.value })} />
                  <select value={p.rol} onChange={(e) => setParte(i, { rol: e.target.value })}>
                    <option value="comprador">Comprador</option>
                    <option value="vendedor">Vendedor</option>
                    <option value="otro">Otro</option>
                  </select>
                  <button type="button" className="boton discreto chico" onClick={() => quitarParte(i)} aria-label="Quitar parte"><Icono nombre="cruz" tamano={14} /></button>
                </div>
              ))}
              <button type="button" className="boton chico" onClick={agregarParte}><Icono nombre="mas" tamano={14} /> Agregar parte</button>
            </div>

            <div className="campo">
              <span className="campo-titulo">Datos del inmueble (opcional)</span>
              <div className="cert-grid">
                <input type="text" placeholder="Matrícula" value={formulario.datosInmueble.matricula} onChange={(e) => setFormulario({ ...formulario, datosInmueble: { ...formulario.datosInmueble, matricula: e.target.value } })} />
                <input type="text" placeholder="Nomenclatura catastral" value={formulario.datosInmueble.nomenclatura} onChange={(e) => setFormulario({ ...formulario, datosInmueble: { ...formulario.datosInmueble, nomenclatura: e.target.value } })} />
                <input type="text" placeholder="Domicilio" value={formulario.datosInmueble.domicilio} onChange={(e) => setFormulario({ ...formulario, datosInmueble: { ...formulario.datosInmueble, domicilio: e.target.value } })} />
              </div>
            </div>

            <label className="campo">
              <span className="campo-titulo">Notas (opcional)</span>
              <textarea rows={2} value={formulario.notas} onChange={(e) => setFormulario({ ...formulario, notas: e.target.value })} maxLength={500} />
            </label>

            <div className="acciones">
              <button type="submit" className="boton primario">Guardar</button>
              <button type="button" className="boton" onClick={() => setFormulario(null)}>Cancelar</button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
