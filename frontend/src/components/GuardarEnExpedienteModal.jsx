import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const esSociedad = (nombre) => /\b(S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?|S\.?C\.?A\.?|sociedad)\b/i.test(nombre);

/**
 * Vincula la sesion terminada a un expediente (existente o nuevo), opcionalmente
 * crea clientes a partir de los comparecientes (misma lectura que el protocolo)
 * y convierte el checklist previo a la firma en tareas.
 */
export default function GuardarEnExpedienteModal({ abierto, sesionId, tipoActo = "otro", onCerrar, onAbrirExpediente }) {
  const dialogo = useRef(null);
  const [expedientes, setExpedientes] = useState([]);
  const [comparecientes, setComparecientes] = useState([]);
  const [modo, setModo] = useState("nuevo"); // nuevo | existente
  const [expedienteId, setExpedienteId] = useState("");
  const [caratula, setCaratula] = useState("");
  const [crearClientes, setCrearClientes] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setResultado(null);
    setError(null);
    setCaratula(`${tipoActo.replace(/_/g, " ")} - ${new Date().toLocaleDateString("es-AR")}`);
    api.expedientesListar().then((l) => {
      setExpedientes(l.filter((e) => e.estado === "abierto" || e.estado === "en_firma"));
    }).catch(() => setExpedientes([]));
    api.protocoloDesdeSesion(sesionId).then((d) => setComparecientes(d.comparecientes || [])).catch(() => setComparecientes([]));
  }, [abierto, sesionId, tipoActo]);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      d.querySelector("input[type=text], select")?.focus();
    } else if (!abierto && d.open) d.close();
  }, [abierto]);

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      let exp = modo === "existente" ? await api.expedienteObtener(expedienteId) : await api.expedienteCrear({ caratula, tipoActo });
      if (crearClientes && comparecientes.length) {
        const partes = exp.partes.map((p) => ({ clienteId: p.clienteId, rol: p.rol }));
        for (const c of comparecientes) {
          const cliente = await api.clienteCrear({ nombre: c.nombre, tipo: esSociedad(c.nombre) ? "sociedad" : "persona" });
          partes.push({ clienteId: cliente.id, rol: c.rol || null });
        }
        exp = await api.expedientePartes(exp.id, partes);
      }
      const r = await api.tareasDesdeSesion(exp.id, sesionId);
      setResultado({ expediente: r.expediente, creadas: r.creadas });
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <dialog ref={dialogo} className="modal" aria-labelledby="guardar-exp-titulo" onClose={onCerrar} onClick={(e) => e.target === dialogo.current && onCerrar?.()}>
      <form className="cert-form modal-caja" onSubmit={guardar}>
        <div className="protocolo-cabecera">
          <h3 id="guardar-exp-titulo">Guardar en un expediente</h3>
          <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="cruz" tamano={16} /></button>
        </div>
        {error && <p className="alerta error" role="alert">{error}</p>}
        {resultado ? (
          <>
            <p className="alerta ok" role="status">
              Guardado en "{resultado.expediente.caratula}". {resultado.creadas} tarea{resultado.creadas === 1 ? "" : "s"} creada{resultado.creadas === 1 ? "" : "s"} a partir del checklist
              {resultado.expediente.partes.length ? ` · ${resultado.expediente.partes.length} parte${resultado.expediente.partes.length === 1 ? "" : "s"} vinculada${resultado.expediente.partes.length === 1 ? "" : "s"}` : ""}.
            </p>
            <div className="acciones">
              <button type="button" className="boton primario" onClick={() => onAbrirExpediente?.(resultado.expediente.id)}>Ver expediente</button>
              <button type="button" className="boton" onClick={onCerrar}>Seguir aquí</button>
            </div>
          </>
        ) : (
          <>
            <div className="segmentado" role="group" aria-label="Destino">
              <button type="button" className={modo === "nuevo" ? "activo" : ""} aria-pressed={modo === "nuevo"} onClick={() => setModo("nuevo")}>Expediente nuevo</button>
              <button type="button" className={modo === "existente" ? "activo" : ""} aria-pressed={modo === "existente"} onClick={() => setModo("existente")} disabled={!expedientes.length}>Uno existente</button>
            </div>
            {!expedientes.length && <p className="ayuda">No hay expedientes abiertos o en firma; se creará uno nuevo.</p>}
            {modo === "nuevo" ? (
              <label className="campo"><span className="campo-titulo">Carátula</span><input type="text" required maxLength={200} value={caratula} onChange={(e) => setCaratula(e.target.value)} /></label>
            ) : (
              <label className="campo"><span className="campo-titulo">Expediente</span>
                <select required value={expedienteId} onChange={(e) => setExpedienteId(e.target.value)}>
                  <option value="">Elegir…</option>
                  {expedientes.map((x) => <option key={x.id} value={x.id}>{x.caratula}</option>)}
                </select>
              </label>
            )}
            {comparecientes.length > 0 && (
              <label className="chequeo">
                <input type="checkbox" checked={crearClientes} onChange={(e) => setCrearClientes(e.target.checked)} />
                Crear {comparecientes.length} cliente{comparecientes.length === 1 ? "" : "s"} a partir de los comparecientes ({comparecientes.map((c) => c.nombre).join(", ")}) y vincularlos como partes
              </label>
            )}
            <p className="ayuda">Las tareas se crean desde el checklist previo a la firma y los requisitos previos del estudio de títulos. Si crea clientes, el nombre queda en texto plano y los demás datos podrá cargarlos cifrados después.</p>
            <div className="acciones">
              <button type="submit" className="boton primario" disabled={ocupado || (modo === "existente" && !expedienteId)}>{ocupado ? "Guardando…" : "Guardar"}</button>
              <button type="button" className="boton" onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
