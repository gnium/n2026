import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Notas() {
  const [notas, setNotas] = useState(null);
  const [error, setError] = useState(null);
  const [contenido, setContenido] = useState("");
  const [compartida, setCompartida] = useState(false);

  const cargar = async () => {
    setError(null);
    try {
      setNotas(await api.notasListar());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    if (!contenido.trim()) return;
    setError(null);
    try {
      await api.notaCrear({ contenido: contenido.trim(), compartida });
      setContenido("");
      setCompartida(false);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const borrar = async (id) => {
    setError(null);
    try {
      await api.notaBorrar(id);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="notas">
      <h2>Notas</h2>
      <p className="nota">Se guardan en texto plano en la base de datos. Una nota compartida la ven todas las cuentas de esta instalación; una nota propia solo la ve quien la escribió.</p>
      {error && <p className="alerta error" role="alert">{error}</p>}

      <form className="nota-composer" onSubmit={guardar}>
        <textarea rows={3} aria-label="Nueva nota" placeholder="Escribir una nota…" value={contenido} onChange={(e) => setContenido(e.target.value)} maxLength={4000} required />
        <div className="acciones">
          <label className="chequeo">
            <input type="checkbox" checked={compartida} onChange={(e) => setCompartida(e.target.checked)} />
            Compartir con el resto de la escribanía
          </label>
          <button type="submit" className="boton primario">Guardar</button>
        </div>
      </form>

      {notas === null ? (
        <p className="vacio">Cargando…</p>
      ) : notas.length === 0 ? (
        <p className="vacio">Todavía no hay notas.</p>
      ) : (
        <ul className="notas-lista">
          {notas.map((n) => (
            <li key={n.id} className={`nota-item ${n.compartida ? "compartida" : ""}`}>
              <div className="nota-item-cabecera">
                <span>{n.propia ? "Vos" : n.autor}{n.compartida && " · compartida"}</span>
                <span>{new Date(n.creadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
              <p className="nota-item-texto">{n.contenido}</p>
              {n.propia && (
                <div className="acciones">
                  <button type="button" className="enlace" onClick={() => borrar(n.id)}>borrar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
