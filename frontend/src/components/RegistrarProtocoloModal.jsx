import { useEffect, useState } from "react";
import { api } from "../api.js";

const TIPOS_ACTO = ["compraventa", "donacion", "hipoteca", "permuta", "cesion", "sucesion", "poder", "certificacion_firmas", "otro"];
const hoyISO = () => new Date().toLocaleDateString("sv-SE");

/**
 * Panel para registrar la escritura recien generada en el indice de
 * protocolo: es la confirmacion de que se firmo e imprimio. Se abre ANTES
 * de descargar (una vez descargada, la sesion se destruye y los nombres
 * reales ya no se pueden recuperar; queda como respaldo la carga manual
 * desde la pantalla "Protocolo").
 */
export default function RegistrarProtocoloModal({ sesionId, onRegistrado, onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [datos, setDatos] = useState(null); // { tipoActo, naturaleza, fechaOtorgamiento, folioDesde, folioHasta, comparecientes, observaciones, ejecucionId }

  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const anio = new Date().getFullYear();
        const [desdeSesion, sugerido] = await Promise.all([api.protocoloDesdeSesion(sesionId), api.protocoloSugerido(anio)]);
        setDatos({
          tipoActo: desdeSesion.tipoActo || "otro",
          naturaleza: desdeSesion.tipoActo === "certificacion_firmas" ? "acta" : "escritura",
          fechaOtorgamiento: hoyISO(),
          folioDesde: sugerido.folioDesdeSugerido,
          folioHasta: sugerido.folioDesdeSugerido,
          comparecientes: desdeSesion.comparecientes.length ? desdeSesion.comparecientes : [{ rol: "", nombre: "" }],
          observaciones: "",
          ejecucionId: desdeSesion.ejecucionId,
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setCargando(false);
      }
    })();
  }, [sesionId]);

  const cambiarCompareciente = (i, campo, valor) => setDatos((d) => ({ ...d, comparecientes: d.comparecientes.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)) }));
  const agregarCompareciente = () => setDatos((d) => ({ ...d, comparecientes: [...d.comparecientes, { rol: "", nombre: "" }] }));
  const quitarCompareciente = (i) => setDatos((d) => ({ ...d, comparecientes: d.comparecientes.filter((_, idx) => idx !== i) }));

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const comparecientes = datos.comparecientes.map((c) => ({ rol: c.rol?.trim() || null, nombre: c.nombre?.trim() })).filter((c) => c.nombre);
      const entrada = await api.protocoloCrear({
        anio: new Date(datos.fechaOtorgamiento).getFullYear(),
        naturaleza: datos.naturaleza,
        tipoActo: datos.tipoActo,
        fechaOtorgamiento: datos.fechaOtorgamiento,
        folioDesde: datos.folioDesde ? Number(datos.folioDesde) : null,
        folioHasta: datos.folioHasta ? Number(datos.folioHasta) : null,
        comparecientes,
        observaciones: datos.observaciones || null,
        ejecucionId: datos.ejecucionId,
      });
      setAviso(`Registrada en el protocolo con el N° ${entrada.numeroOrden} del año ${entrada.anio}.`);
      onRegistrado?.(entrada);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="registrar-protocolo">
      <div className="registrar-protocolo-cabecera">
        <h3>Registrar en el protocolo</h3>
        <button type="button" className="enlace" onClick={onCerrar}>cerrar</button>
      </div>
      {cargando && <p className="vacio">Cargando datos de la sesión…</p>}
      {error && (
        <p className="alerta error" role="alert">
          {error} {error.includes("no existe") && "Puede cargar esta escritura manualmente desde la pantalla \"Protocolo\"."}
        </p>
      )}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}
      {datos && !aviso && (
        <form className="cert-form" onSubmit={enviar}>
          <div className="cert-grid">
            <label className="campo">
              <span className="campo-titulo">Naturaleza</span>
              <select value={datos.naturaleza} onChange={(e) => setDatos({ ...datos, naturaleza: e.target.value })}>
                <option value="escritura">Escritura</option>
                <option value="acta">Acta</option>
              </select>
            </label>
            <label className="campo">
              <span className="campo-titulo">Tipo de acto</span>
              <select value={datos.tipoActo} onChange={(e) => setDatos({ ...datos, tipoActo: e.target.value })}>
                {TIPOS_ACTO.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span className="campo-titulo">Fecha de otorgamiento</span>
              <input type="date" value={datos.fechaOtorgamiento} onChange={(e) => setDatos({ ...datos, fechaOtorgamiento: e.target.value })} required />
            </label>
            <label className="campo">
              <span className="campo-titulo">Folio desde</span>
              <input type="number" min="1" value={datos.folioDesde ?? ""} onChange={(e) => setDatos({ ...datos, folioDesde: e.target.value })} />
            </label>
            <label className="campo">
              <span className="campo-titulo">Folio hasta</span>
              <input type="number" min="1" value={datos.folioHasta ?? ""} onChange={(e) => setDatos({ ...datos, folioHasta: e.target.value })} />
            </label>
          </div>

          <h4>Comparecientes</h4>
          {datos.comparecientes.map((c, i) => (
            <div className="compareciente-fila" key={i}>
              <input type="text" aria-label={`Compareciente ${i + 1}: nombre y apellido o razón social`} placeholder="Nombre y apellido / razón social" value={c.nombre} onChange={(e) => cambiarCompareciente(i, "nombre", e.target.value)} required />
              <input type="text" aria-label={`Compareciente ${i + 1}: rol`} placeholder="Rol (vendedor, comprador...)" value={c.rol || ""} onChange={(e) => cambiarCompareciente(i, "rol", e.target.value)} />
              <button type="button" className="enlace" onClick={() => quitarCompareciente(i)}>quitar</button>
            </div>
          ))}
          <button type="button" className="boton" onClick={agregarCompareciente}>+ agregar compareciente</button>

          <textarea rows={2} aria-label="Observaciones (opcional)" placeholder="Observaciones (opcional)" value={datos.observaciones} onChange={(e) => setDatos({ ...datos, observaciones: e.target.value })} />

          <p className="nota">Estos nombres se guardan cifrados en la base, solo para el índice de protocolo (única excepción a la regla de no guardar datos de partes).</p>

          <div className="acciones">
            <button type="submit" className="boton primario" disabled={enviando}>
              {enviando ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
