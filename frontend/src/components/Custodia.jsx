import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import ClientePicker from "./ClientePicker.jsx";
import Icono from "./Iconos.jsx";

const ESTADOS = { en_custodia: "En custodia", devuelto: "Devuelto", entregado: "Entregado" };

export default function Custodia() {
  const [registros, setRegistros] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState("");

  const cargar = useCallback(() => {
    setCargando(true);
    api.custodiaListar(filtroEstado ? { estado: filtroEstado } : {})
      .then(setRegistros)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [filtroEstado]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="custodia">
      <div className="custodia-header">
        <h2>Custodia de documentación</h2>
        <div className="acciones">
          <button className="boton primario" onClick={() => setModal("recibir")}>
            <Icono nombre="archivo" tamano={16} /> Recibir documentación
          </button>
          <button className="boton" onClick={() => setModal("entregar")}>
            <Icono nombre="enviar" tamano={16} /> Entregar documentación
          </button>
        </div>
      </div>

      <div className="custodia-filtros">
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="en_custodia">En custodia</option>
          <option value="devuelto">Devueltos</option>
          <option value="entregado">Entregados</option>
        </select>
      </div>

      {error && <p className="alerta error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : registros.length === 0 ? (
        <p className="vacio">No hay registros de custodia. Use "Recibir documentación" para registrar la primera entrega.</p>
      ) : (
        <div className="custodia-lista">
          {registros.map((r) => (
            <div key={r.id} className={`custodia-card ${r.estado}`} onClick={() => setDetalle(r)}>
              <div className="custodia-card-header">
                <span className={`custodia-estado ${r.estado}`}>{ESTADOS[r.estado]}</span>
                <span className="custodia-codigo">{r.codigo}</span>
              </div>
              <div className="custodia-card-body">
                <strong>{r.clienteNombre}</strong>
                <p>{r.descripcion}</p>
              </div>
              <div className="custodia-card-footer">
                {r.recibidoEn && <small>Recibido: {new Date(r.recibidoEn).toLocaleDateString("es-AR")}</small>}
                {r.devueltoEn && <small>Devuelto: {new Date(r.devueltoEn).toLocaleDateString("es-AR")}</small>}
                {r.entregadoEn && <small>Entregado: {new Date(r.entregadoEn).toLocaleDateString("es-AR")}</small>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === "recibir" && <ModalRecibir onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />}
      {modal === "entregar" && <ModalEntregar onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />}
      {detalle && <ModalDetalle registro={detalle} onCerrar={() => setDetalle(null)} onActualizado={() => { setDetalle(null); cargar(); }} />}
    </div>
  );
}

function ModalRecibir({ onCerrar, onGuardado }) {
  const [clientes, setClientes] = useState([]);
  const [descripcion, setDescripcion] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    if (!clientes.length) return setError("Seleccione un cliente.");
    if (!descripcion.trim()) return setError("Describa la documentación recibida.");
    setGuardando(true);
    setError("");
    try {
      await api.custodiaRecibir({ clienteId: clientes[0].id, descripcion, notas, enviarEmail: true });
      onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal custodia-modal">
        <h3>Recibir documentación</h3>

        <label className="campo">
          <span className="campo-titulo">Cliente</span>
          <ClientePicker seleccionados={clientes} onChange={setClientes} />
        </label>

        <label className="campo">
          <span className="campo-titulo">Descripción de la documentación</span>
          <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Escritura N° 450, boleto de compraventa, plano de mensura..." maxLength={500} />
        </label>

        <label className="campo">
          <span className="campo-titulo">Notas internas <small>(opcional)</small></span>
          <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas para uso interno..." maxLength={2000} />
        </label>

        <div className="custodia-aviso-envio">
          <Icono nombre="chat" tamano={14} />
          <small>Se enviará comprobante por email al cliente y una copia al escribano como constancia de fecha cierta.</small>
        </div>

        {error && <p className="alerta error">{error}</p>}

        <div className="acciones">
          <button className="boton primario" onClick={guardar} disabled={guardando}>{guardando ? "Guardando..." : "Registrar recepción"}</button>
          <button className="boton" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModalEntregar({ onCerrar, onGuardado }) {
  const [clientes, setClientes] = useState([]);
  const [descripcion, setDescripcion] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    if (!clientes.length) return setError("Seleccione un cliente.");
    if (!descripcion.trim()) return setError("Describa la documentación a entregar.");
    setGuardando(true);
    setError("");
    try {
      await api.custodiaEntregar({ clienteId: clientes[0].id, descripcion, notas, enviarEmail: true });
      onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal custodia-modal">
        <h3>Entregar documentación</h3>

        <label className="campo">
          <span className="campo-titulo">Cliente</span>
          <ClientePicker seleccionados={clientes} onChange={setClientes} />
        </label>

        <label className="campo">
          <span className="campo-titulo">Descripción de la documentación</span>
          <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Escritura original, certificados, copias certificadas..." maxLength={500} />
        </label>

        <label className="campo">
          <span className="campo-titulo">Notas internas <small>(opcional)</small></span>
          <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas para uso interno..." maxLength={2000} />
        </label>

        <div className="custodia-aviso-envio">
          <Icono nombre="chat" tamano={14} />
          <small>Se enviará comprobante de entrega por email al cliente y una copia al escribano como constancia de fecha cierta.</small>
        </div>

        {error && <p className="alerta error">{error}</p>}

        <div className="acciones">
          <button className="boton primario" onClick={guardar} disabled={guardando}>{guardando ? "Guardando..." : "Registrar entrega"}</button>
          <button className="boton" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModalDetalle({ registro: r, onCerrar, onActualizado }) {
  const [devolviendo, setDevolviendo] = useState(false);
  const [notasDevolucion, setNotasDevolucion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const devolver = async () => {
    setGuardando(true);
    setError("");
    try {
      await api.custodiaDevolver(r.id, { notas: notasDevolucion, enviarEmail: true });
      onActualizado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal custodia-modal">
        <div className="custodia-detalle-header">
          <h3>Custodia #{r.codigo}</h3>
          <span className={`custodia-estado ${r.estado}`}>{ESTADOS[r.estado]}</span>
        </div>

        <div className="custodia-detalle-info">
          <div className="campo-inline"><strong>Cliente:</strong> {r.clienteNombre}</div>
          <div className="campo-inline"><strong>Documentación:</strong> {r.descripcion}</div>
          {r.notas && <div className="campo-inline"><strong>Notas:</strong> {r.notas}</div>}
          {r.recibidoEn && <div className="campo-inline"><strong>Recibido:</strong> {new Date(r.recibidoEn).toLocaleString("es-AR")}</div>}
          {r.devueltoEn && <div className="campo-inline"><strong>Devuelto:</strong> {new Date(r.devueltoEn).toLocaleString("es-AR")}</div>}
          {r.entregadoEn && <div className="campo-inline"><strong>Entregado:</strong> {new Date(r.entregadoEn).toLocaleString("es-AR")}</div>}
        </div>

        <div className="custodia-acciones-pdf">
          {r.recibidoEn && (
            <a className="boton" href={api.custodiaUrlPdfRecepcion(r.id)} target="_blank" rel="noreferrer">
              <Icono nombre="archivo" tamano={14} /> Comprobante de recepción (PDF)
            </a>
          )}
          {r.estado === "devuelto" && (
            <a className="boton" href={api.custodiaUrlPdfDevolucion(r.id)} target="_blank" rel="noreferrer">
              <Icono nombre="archivo" tamano={14} /> Comprobante de devolución (PDF)
            </a>
          )}
          {r.estado === "entregado" && (
            <a className="boton" href={api.custodiaUrlPdfEntrega(r.id)} target="_blank" rel="noreferrer">
              <Icono nombre="archivo" tamano={14} /> Comprobante de entrega (PDF)
            </a>
          )}
        </div>

        {r.estado === "en_custodia" && !devolviendo && (
          <button className="boton primario" onClick={() => setDevolviendo(true)}>Registrar devolución</button>
        )}

        {devolviendo && (
          <div className="custodia-devolucion">
            <label className="campo">
              <span className="campo-titulo">Notas de devolución <small>(opcional)</small></span>
              <textarea rows={2} value={notasDevolucion} onChange={(e) => setNotasDevolucion(e.target.value)} placeholder="Observaciones sobre la devolución..." maxLength={2000} />
            </label>

            <div className="custodia-aviso-envio">
              <Icono nombre="chat" tamano={14} />
              <small>Se enviará comprobante por email al cliente y una copia al escribano como constancia de fecha cierta.</small>
            </div>

            {error && <p className="alerta error">{error}</p>}

            <div className="acciones">
              <button className="boton primario" onClick={devolver} disabled={guardando}>{guardando ? "Procesando..." : "Confirmar devolución"}</button>
              <button className="boton" onClick={() => setDevolviendo(false)}>Cancelar</button>
            </div>
          </div>
        )}

        <div className="acciones" style={{ marginTop: "1rem" }}>
          <button className="boton" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
