import { useEffect, useState } from "react";
import { api } from "../api.js";

/** ABM de planes y parametros del fee por uso. Solo administradora. */
export default function PlanesFacturacion() {
  const [planes, setPlanes] = useState(null);
  const [factu, setFactu] = useState(null);
  const [editando, setEditando] = useState(null); // {clave, nombre, precioMensualArs, descripcion, activo} | null
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargar = async () => {
    setError(null);
    try {
      const [p, f] = await Promise.all([api.planesAdmin(), api.parametrosFacturacion()]);
      setPlanes(p);
      setFactu(f);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    cargar();
  }, []);

  const guardarPlan = async (e) => {
    e.preventDefault();
    try {
      const p = await api.guardarPlan({ ...editando, precioMensualArs: Number(editando.precioMensualArs) });
      setPlanes(p);
      setEditando(null);
      setAviso("Plan guardado.");
    } catch (err) {
      setError(err.message);
    }
  };

  const guardarFactu = async (e) => {
    e.preventDefault();
    try {
      const f = await api.guardarParametrosFacturacion({
        feeFijoArs: Number(factu.feeFijoArs),
        margenPct: Number(factu.margenPct),
        tipoCambio: Number(factu.tipoCambio),
        suscripcionRequerida: factu.suscripcionRequerida,
      });
      setFactu(f);
      setAviso("Parámetros de facturación guardados.");
    } catch (err) {
      setError(err.message);
    }
  };

  if (!planes || !factu) return <p className="vacio">Cargando planes…</p>;

  return (
    <div className="consumo form-inline">
      <h2>Planes y facturación de uso</h2>
      {error && (
        <p className="alerta error" role="alert">
          {error}
        </p>
      )}
      {aviso && <p className="alerta ok">{aviso}</p>}

      <h3>Planes</h3>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Clave</th>
              <th>Nombre</th>
              <th>Precio mensual</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {planes.map((p) => (
              <tr key={p.clave}>
                <td>{p.clave}</td>
                <td>{p.nombre}</td>
                <td>AR$ {Number(p.precioMensualArs).toLocaleString("es-AR")}</td>
                <td>{p.activo ? "sí" : "no"}</td>
                <td>
                  <button type="button" className="enlace" onClick={() => setEditando({ clave: p.clave, nombre: p.nombre, precioMensualArs: p.precioMensualArs, descripcion: p.descripcion || "", activo: Boolean(p.activo) })}>
                    editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="acciones">
        <button type="button" className="boton" onClick={() => setEditando({ clave: "", nombre: "", precioMensualArs: "", descripcion: "", activo: true })}>
          Agregar plan
        </button>
      </div>

      {editando && (
        <form className="cert-form form-inline" onSubmit={guardarPlan}>
          <div className="cert-grid">
            <input type="text" placeholder="Clave (minúscula, ej.: profesional)" value={editando.clave} onChange={(e) => setEditando({ ...editando, clave: e.target.value })} required />
            <input type="text" placeholder="Nombre visible" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} required />
            <input type="number" step="0.01" min="0" placeholder="Precio mensual (ARS)" value={editando.precioMensualArs} onChange={(e) => setEditando({ ...editando, precioMensualArs: e.target.value })} required />
            <label className="chequeo">
              <input type="checkbox" checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} /> Activo (visible para suscribirse)
            </label>
          </div>
          <textarea rows={2} placeholder="Descripción (opcional)" value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
          <div className="acciones">
            <button type="submit" className="boton primario">
              Guardar plan
            </button>
            <button type="button" className="boton" onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <h3>Fee por uso</h3>
      <p className="nota">Se cobra por documento procesado, además de la cuota del plan: un cargo fijo, más el costo real de la IA convertido a pesos, más un margen sobre ese costo.</p>
      <form className="cert-form" onSubmit={guardarFactu}>
        <div className="cert-grid">
          <label className="campo">
            <span className="campo-titulo">Cargo fijo por documento (ARS)</span>
            <input type="number" step="0.01" min="0" value={factu.feeFijoArs} onChange={(e) => setFactu({ ...factu, feeFijoArs: e.target.value })} />
          </label>
          <label className="campo">
            <span className="campo-titulo">Margen sobre el costo de IA (%)</span>
            <input type="number" step="0.1" min="0" value={factu.margenPct} onChange={(e) => setFactu({ ...factu, margenPct: e.target.value })} />
          </label>
          <label className="campo">
            <span className="campo-titulo">Tipo de cambio USD → ARS</span>
            <input type="number" step="0.01" min="0" value={factu.tipoCambio} onChange={(e) => setFactu({ ...factu, tipoCambio: e.target.value })} />
            <small className="ayuda">Manual: actualícelo periódicamente. En 0, el costo de IA no se convierte y el cargo queda solo con el fee fijo.</small>
          </label>
        </div>
        <label className="chequeo">
          <input type="checkbox" checked={factu.suscripcionRequerida} onChange={(e) => setFactu({ ...factu, suscripcionRequerida: e.target.checked })} />
          Exigir suscripción activa para procesar documentos nuevos (no afecta a la cuenta administradora)
        </label>
        <div className="acciones">
          <button type="submit" className="boton primario">
            Guardar parámetros
          </button>
        </div>
      </form>
    </div>
  );
}
