import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const TIPOS_ACTO = ["compraventa", "donacion", "hipoteca", "permuta", "cesion", "sucesion", "poder", "certificacion_firmas", "otro"];
const hoyISO = () => new Date().toLocaleDateString("sv-SE");

/** Indice de protocolo: la unica pantalla que muestra nombres reales de comparecientes (cifrados en la base). */
export default function Protocolo() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [anios, setAnios] = useState([]);
  const [entradas, setEntradas] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [nuevo, setNuevo] = useState(null); // borrador del formulario manual | null

  const cargar = async (a) => {
    setError(null);
    setAviso(null);
    try {
      const [lista, listaAnios] = await Promise.all([api.protocoloListar(a), api.protocoloAnios()]);
      setEntradas(lista);
      setAnios(listaAnios.length ? listaAnios : [a]);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargar(anio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio]);

  const abrirNuevo = async () => {
    setError(null);
    setAviso(null);
    try {
      const sugerido = await api.protocoloSugerido(anio);
      setNuevo({
        naturaleza: "escritura",
        tipoActo: "otro",
        fechaOtorgamiento: hoyISO(),
        folioDesde: sugerido.folioDesdeSugerido,
        folioHasta: sugerido.folioDesdeSugerido,
        comparecientes: [{ rol: "", nombre: "" }],
        observaciones: "",
      });
    } catch (e) {
      setError(e.message);
    }
  };

  const cambiarCompareciente = (i, campo, valor) => setNuevo((d) => ({ ...d, comparecientes: d.comparecientes.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)) }));
  const agregarCompareciente = () => setNuevo((d) => ({ ...d, comparecientes: [...d.comparecientes, { rol: "", nombre: "" }] }));
  const quitarCompareciente = (i) => setNuevo((d) => ({ ...d, comparecientes: d.comparecientes.filter((_, idx) => idx !== i) }));

  const guardarNuevo = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const comparecientes = nuevo.comparecientes.map((c) => ({ rol: c.rol?.trim() || null, nombre: c.nombre?.trim() })).filter((c) => c.nombre);
      await api.protocoloCrear({
        anio: new Date(nuevo.fechaOtorgamiento).getFullYear(),
        naturaleza: nuevo.naturaleza,
        tipoActo: nuevo.tipoActo,
        fechaOtorgamiento: nuevo.fechaOtorgamiento,
        folioDesde: nuevo.folioDesde ? Number(nuevo.folioDesde) : null,
        folioHasta: nuevo.folioHasta ? Number(nuevo.folioHasta) : null,
        comparecientes,
        observaciones: nuevo.observaciones || null,
      });
      setNuevo(null);
      cargar(anio);
      setAviso("Entrada agregada al protocolo.");
    } catch (e) {
      setError(e.message);
    }
  };

  const cambiarEstado = async (id, estado) => {
    setError(null);
    try {
      await api.protocoloEstado(id, estado);
      cargar(anio);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="protocolo">
      <h2>Índice de protocolo</h2>
      <p className="nota">
        Cada escritura o acta firmada e impresa se registra aquí, en orden correlativo y con su foliatura, para poder imprimir el índice anual. Los nombres de los comparecientes se guardan cifrados: es la única excepción a la regla de no guardar datos de partes.
      </p>
      {error && (
        <p className="alerta error" role="alert">{error}</p>
      )}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <div className="acciones">
        <label className="campo">
          <span className="campo-titulo">Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[...new Set([anio, ...anios])].sort((a, b) => b - a).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <a className="boton" href={api.protocoloUrlExportar(anio)} download><Icono nombre="descargar" tamano={16} /> Exportar índice (.docx)</a>
        <button type="button" className="boton primario" onClick={abrirNuevo}><Icono nombre="mas" tamano={16} /> Agregar entrada</button>
      </div>

      {entradas === null ? (
        <p className="vacio">Cargando…</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>N°</th><th>Fecha</th><th>Folios</th><th>Naturaleza</th><th>Tipo de acto</th><th>Comparecientes</th><th>Estado</th><th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {entradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="vacio">Sin entradas para este año.</td>
                </tr>
              )}
              {entradas.map((f) => (
                <tr key={f.id}>
                  <td>{f.numeroOrden}</td>
                  <td>{String(f.fechaOtorgamiento).slice(0, 10).split("-").reverse().join("/")}</td>
                  <td>{f.folioDesde && f.folioHasta ? `${f.folioDesde}-${f.folioHasta}` : ""}</td>
                  <td>{f.naturaleza}</td>
                  <td>{f.tipoActo.replace(/_/g, " ")}</td>
                  <td>{f.comparecientesLegible ? f.comparecientes.map((c) => `${c.rol ? c.rol + ": " : ""}${c.nombre}`).join("; ") : "(no se pudo leer)"}</td>
                  <td>
                    <select value={f.estado} onChange={(e) => cambiarEstado(f.id, e.target.value)}>
                      <option value="vigente">vigente</option>
                      <option value="revocada">revocada</option>
                      <option value="anulada">anulada</option>
                    </select>
                  </td>
                  <td>{f.observaciones}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nuevo && (
        <form className="cert-form form-inline" onSubmit={guardarNuevo}>
          <div className="cert-grid">
            <label className="campo">
              <span className="campo-titulo">Naturaleza</span>
              <select value={nuevo.naturaleza} onChange={(e) => setNuevo({ ...nuevo, naturaleza: e.target.value })}>
                <option value="escritura">Escritura</option>
                <option value="acta">Acta</option>
              </select>
            </label>
            <label className="campo">
              <span className="campo-titulo">Tipo de acto</span>
              <select value={nuevo.tipoActo} onChange={(e) => setNuevo({ ...nuevo, tipoActo: e.target.value })}>
                {TIPOS_ACTO.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span className="campo-titulo">Fecha de otorgamiento</span>
              <input type="date" value={nuevo.fechaOtorgamiento} onChange={(e) => setNuevo({ ...nuevo, fechaOtorgamiento: e.target.value })} required />
            </label>
            <label className="campo">
              <span className="campo-titulo">Folio desde</span>
              <input type="number" min="1" value={nuevo.folioDesde ?? ""} onChange={(e) => setNuevo({ ...nuevo, folioDesde: e.target.value })} />
            </label>
            <label className="campo">
              <span className="campo-titulo">Folio hasta</span>
              <input type="number" min="1" value={nuevo.folioHasta ?? ""} onChange={(e) => setNuevo({ ...nuevo, folioHasta: e.target.value })} />
            </label>
          </div>

          <h4>Comparecientes</h4>
          {nuevo.comparecientes.map((c, i) => (
            <div className="compareciente-fila" key={i}>
              <input type="text" aria-label={`Compareciente ${i + 1}: nombre y apellido o razón social`} placeholder="Nombre y apellido / razón social" value={c.nombre} onChange={(e) => cambiarCompareciente(i, "nombre", e.target.value)} required />
              <input type="text" aria-label={`Compareciente ${i + 1}: rol`} placeholder="Rol (vendedor, comprador...)" value={c.rol || ""} onChange={(e) => cambiarCompareciente(i, "rol", e.target.value)} />
              <button type="button" className="enlace" onClick={() => quitarCompareciente(i)}>quitar</button>
            </div>
          ))}
          <button type="button" className="boton" onClick={agregarCompareciente}>+ agregar compareciente</button>

          <textarea rows={2} aria-label="Observaciones (opcional)" placeholder="Observaciones (opcional)" value={nuevo.observaciones} onChange={(e) => setNuevo({ ...nuevo, observaciones: e.target.value })} />

          <div className="acciones">
            <button type="submit" className="boton primario">Guardar</button>
            <button type="button" className="boton" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
