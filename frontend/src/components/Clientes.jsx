import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import { fechaCorta } from "./Expedientes.jsx";
import { formatoMonto } from "./PresupuestoModal.jsx";
import UifLegajo from "./UifLegajo.jsx";
import ConfirmarDialogo from "./ConfirmarDialogo.jsx";

const VACIO = { tipo: "persona", nombre: "", documento: "", cuit: "", domicilio: "", telefono: "", email: "", estadoCivil: "", estadoCivilObs: "", nacionalidad: "", observaciones: "" };
// Estados civiles del Código Civil y Comercial; la unión convivencial (arts. 509 y ss.) importa para el asentimiento del art. 522.
const ESTADOS_CIVILES = [["soltero", "Soltero/a"], ["casado", "Casado/a"], ["divorciado", "Divorciado/a"], ["viudo", "Viudo/a"], ["union_convivencial", "Unión convivencial"]];
const NOMBRE_ESTADO_CIVIL = Object.fromEntries(ESTADOS_CIVILES);
const estadoCivilTexto = (c) => [NOMBRE_ESTADO_CIVIL[c.estadoCivil] || c.estadoCivil, c.estadoCivilObs].filter(Boolean).join(", ");
const NOMBRE_ESTADO_EXP = { abierto: "abierto", en_firma: "en firma", cerrado: "cerrado", archivado: "archivado" };

export default function Clientes({ onAbrirExpediente }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [saldo, setSaldo] = useState([]);
  const [legajo, setLegajo] = useState(null);
  const [legajoAbierto, setLegajoAbierto] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const dialogo = useRef(null);

  const cargar = async (busqueda = q) => {
    setError(null);
    setAviso(null);
    try {
      setLista(await api.clientesListar(busqueda));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => cargar(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (formulario && !d.open) {
      d.showModal();
      d.querySelector("input[name=nombre]")?.focus();
    } else if (!formulario && d.open) d.close();
  }, [formulario]);

  const abrirDetalle = async (id) => {
    setError(null);
    try {
      const [d, s, l] = await Promise.all([api.clienteObtener(id), api.movimientosSaldo(id).catch(() => []), api.uifLegajo(id).catch(() => null)]);
      setDetalle(d);
      setSaldo(s);
      setLegajo(l);
      setTimeout(() => document.getElementById("cli-titulo")?.focus(), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const datos = { ...formulario };
      const guardado = formulario.id ? await api.clienteActualizar(formulario.id, datos) : await api.clienteCrear(datos);
      setFormulario(null);
      cargar();
      if (detalle && detalle.id === guardado.id) abrirDetalle(guardado.id);
      setAviso(formulario.id ? "Cliente actualizado." : "Cliente creado.");
    } catch (e) {
      setError(e.message);
    }
  };

  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const borrar = async (id) => {
    setConfirmarBorrado(false);
    setError(null);
    try {
      await api.clienteBorrar(id);
      setDetalle(null);
      cargar();
      setAviso("Cliente borrado.");
    } catch (e) {
      setError(e.message);
    }
  };

  const campo = (k) => ({ name: k, value: formulario?.[k] ?? "", onChange: (e) => setFormulario({ ...formulario, [k]: e.target.value }) });
  const idDoc = (c) => (c.tipo === "sociedad" ? c.cuit && `CUIT ${c.cuit}` : c.documento ? `DNI ${c.documento}` : c.cuit && `CUIT ${c.cuit}`) || (c.datosLegibles ? "—" : "(no legible)");

  return (
    <div className="clientes">
      <h2>Clientes</h2>
      <p className="nota">El nombre, el tipo y las observaciones se guardan en texto plano para poder buscar. DNI, CUIT, domicilio, teléfono y correo se guardan cifrados.</p>
      {error && !formulario && <p className="alerta error" role="alert">{error}</p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <div className="acciones agenda-toolbar">
        <label className="campo buscador">
          <span className="sr-only">Buscar por nombre</span>
          <input type="search" placeholder="Buscar por nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="boton primario" onClick={() => setFormulario({ ...VACIO })}><Icono nombre="mas" tamano={16} /> Nuevo cliente</button>
      </div>

      <p className="sr-only" role="status">{lista === null ? "Cargando clientes" : `${lista.length} cliente${lista.length === 1 ? "" : "s"}`}</p>
      {lista === null ? (
        <p className="vacio">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="vacio">{q ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes."}</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th scope="col">Nombre</th><th scope="col">Tipo</th><th scope="col">Documento</th><th scope="col">Teléfono</th><th scope="col" className="num">Expedientes</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td><button type="button" className="enlace" onClick={() => abrirDetalle(c.id)}>{c.nombre}</button></td>
                  <td>{c.tipo}</td>
                  <td>{idDoc(c)}</td>
                  <td>{c.telefono || "—"}</td>
                  <td className="num">{c.expedientes}</td>
                  <td><button type="button" className="enlace" aria-label={`Editar a ${c.nombre}`} onClick={() => setFormulario({ ...VACIO, ...c })}>editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <div className="agenda-dia-panel">
          <div className="protocolo-cabecera">
            <div>
              <h3 id="cli-titulo" tabIndex={-1}>{detalle.nombre} <span className="etiqueta">{detalle.tipo}</span></h3>
              <p className="nota">{[detalle.tipo === "sociedad" ? null : detalle.documento && `DNI ${detalle.documento}`, detalle.cuit && `CUIT ${detalle.cuit}`, detalle.domicilio, detalle.telefono, detalle.email, estadoCivilTexto(detalle), detalle.nacionalidad].filter(Boolean).join(" · ") || (detalle.datosLegibles ? "Sin datos de contacto." : "Los datos cifrados no se pudieron leer (¿cambió JWT_SECRET?).")}</p>
              {detalle.observaciones && <p className="nota">{detalle.observaciones}</p>}
              <p className="nota">
                {saldo.length ? saldo.map((s) => <span key={s.moneda} className={`saldo ${s.saldo > 0 ? "positivo" : ""}`}>Saldo {s.moneda}: {formatoMonto(s.saldo, s.moneda)}{s.saldo > 0 ? " pendiente" : ""} · </span>) : "Sin movimientos en cuenta corriente · "}
                {legajo && (legajo.existe ? <>Legajo UIF: <span className={`etiqueta riesgo-${legajo.nivelRiesgo}`}>riesgo {legajo.nivelRiesgo}</span>{legajo.vencido ? <span className="etiqueta riesgo-alto">revisión vencida</span> : ` · revisión ${fechaCorta(legajo.proximaRevision)}`}</> : "Sin legajo UIF")}
              </p>
            </div>
            <div className="acciones">
              <button type="button" className="boton chico" onClick={() => setLegajoAbierto(true)}><Icono nombre="escudo" tamano={14} /> Legajo UIF</button>
              <button type="button" className="boton chico" onClick={() => setFormulario({ ...VACIO, ...detalle, expedientes: undefined, presupuestos: undefined })}>Editar</button>
              <button type="button" className="boton chico" onClick={() => setConfirmarBorrado(true)}><Icono nombre="basura" tamano={14} /> Borrar</button>
              <button type="button" className="boton discreto chico" aria-label="Cerrar detalle" onClick={() => setDetalle(null)}><Icono nombre="cruz" tamano={14} /></button>
            </div>
          </div>
          <h4>Expedientes</h4>
          {detalle.expedientes.length === 0 ? (
            <p className="vacio">Sin expedientes.</p>
          ) : (
            <ul className="lista-simple">
              {detalle.expedientes.map((e) => (
                <li key={e.id}>
                  <button type="button" className="enlace" onClick={() => onAbrirExpediente?.(e.id)}>{e.caratula}</button>
                  <span className="nota">{e.tipoActo.replace(/_/g, " ")}{e.rol ? ` · ${e.rol}` : ""} · {NOMBRE_ESTADO_EXP[e.estado]}</span>
                </li>
              ))}
            </ul>
          )}
          <h4>Presupuestos</h4>
          {detalle.presupuestos.length === 0 ? (
            <p className="vacio">Sin presupuestos.</p>
          ) : (
            <ul className="lista-simple">
              {detalle.presupuestos.map((p) => (
                <li key={p.id}>
                  <span>N° {p.numero} · {fechaCorta(p.fecha)} · {formatoMonto(p.total, p.moneda)} · {p.estado}</span>
                  <a className="enlace" href={api.presupuestoUrlPdf(p.id)} download aria-label={`Descargar PDF del presupuesto ${p.numero}`}>PDF</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmarDialogo abierto={confirmarBorrado} titulo={detalle ? `Borrar a ${detalle.nombre}` : "Borrar cliente"} texto="Se quita de sus expedientes y se borran sus datos cifrados, su legajo UIF y sus movimientos de cuenta corriente. Los presupuestos y comprobantes quedan sin cliente asociado (el comprobante conserva el receptor)." confirmar="Borrar cliente" destructivo onConfirmar={() => borrar(detalle.id)} onCancelar={() => setConfirmarBorrado(false)} />
      <UifLegajo abierto={legajoAbierto} clienteId={detalle?.id} onCerrar={() => setLegajoAbierto(false)} onGuardado={(l) => { setLegajo(l); setAviso("Legajo UIF guardado."); }} />

      <dialog ref={dialogo} className="modal" aria-labelledby="cliente-form-titulo" onClose={() => setFormulario(null)} onClick={(e) => e.target === dialogo.current && setFormulario(null)}>
        {formulario && (
          <form className="cert-form modal-caja" onSubmit={guardar}>
            <div className="protocolo-cabecera">
              <h3 id="cliente-form-titulo">{formulario.id ? "Editar cliente" : "Nuevo cliente"}</h3>
              <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={() => setFormulario(null)}><Icono nombre="cruz" tamano={16} /></button>
            </div>
            {error && <p className="alerta error" role="alert">{error}</p>}
            <div className="cert-grid">
              <label className="campo"><span className="campo-titulo">Tipo</span>
                <select {...campo("tipo")}><option value="persona">Persona</option><option value="sociedad">Sociedad</option></select>
              </label>
              <label className="campo"><span className="campo-titulo">Nombre y apellido / razón social</span><input type="text" required maxLength={200} {...campo("nombre")} /></label>
              {formulario.tipo === "persona" && <label className="campo"><span className="campo-titulo">DNI</span><input type="text" {...campo("documento")} /></label>}
              <label className="campo"><span className="campo-titulo">CUIT / CUIL</span><input type="text" {...campo("cuit")} /></label>
              <label className="campo"><span className="campo-titulo">Domicilio</span><input type="text" {...campo("domicilio")} /></label>
              <label className="campo"><span className="campo-titulo">Teléfono (con código de área)</span><input type="tel" placeholder="11 5555 1234" {...campo("telefono")} /></label>
              <label className="campo"><span className="campo-titulo">Correo</span><input type="email" {...campo("email")} /></label>
              {formulario.tipo === "persona" && (
                <label className="campo"><span className="campo-titulo">Estado civil</span>
                  <select {...campo("estadoCivil")}>
                    <option value="">Sin indicar</option>
                    {ESTADOS_CIVILES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </label>
              )}
              {formulario.tipo === "persona" && <label className="campo"><span className="campo-titulo">Detalle del estado civil <small>(opcional)</small></span><input type="text" placeholder="en segundas nupcias con…" maxLength={200} {...campo("estadoCivilObs")} /></label>}
              {formulario.tipo === "persona" && <label className="campo"><span className="campo-titulo">Nacionalidad</span><input type="text" {...campo("nacionalidad")} /></label>}
            </div>
            <label className="campo"><span className="campo-titulo">Observaciones <small>(texto plano, sin identificadores)</small></span><textarea rows={2} maxLength={500} {...campo("observaciones")} /></label>
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
