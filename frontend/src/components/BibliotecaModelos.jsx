import { useEffect, useState } from "react";
import { api } from "../api.js";

const TIPOS_ACTO = ["compraventa", "donacion", "hipoteca", "permuta", "cesion", "sucesion", "poder", "certificacion_firmas", "otro"];

export default function BibliotecaModelos() {
  const [modelos, setModelos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [nombre, setNombre] = useState("");
  const [tipoActo, setTipoActo] = useState("otro");
  const [subiendo, setSubiendo] = useState(false);

  const cargar = async () => {
    setError(null);
    setAviso(null);
    try {
      setModelos(await api.bibliotecaListar());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const subir = async (e) => {
    e.preventDefault();
    if (!archivo || !nombre.trim()) return;
    setError(null);
    setSubiendo(true);
    try {
      await api.bibliotecaSubir({ archivo, nombre: nombre.trim(), tipoActo });
      setArchivo(null);
      setNombre("");
      setTipoActo("otro");
      e.target.reset();
      cargar();
      setAviso("Modelo guardado en la biblioteca.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const borrar = async (id) => {
    setError(null);
    try {
      await api.bibliotecaBorrar(id);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="biblioteca">
      <h2>Biblioteca de modelos</h2>
      <p className="nota importante">
        El texto completo de cada modelo se guarda sin cifrar en la base de datos, porque suele ser una escritura real de otro cliente. Al usarlo en una nueva sesión pasa por la misma anonimización que un archivo recién subido, pero acá queda en texto plano: no suba nada que no esté dispuesto a tener así.
      </p>
      {error && <p className="alerta error" role="alert">{error}</p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <form className="biblioteca-form" onSubmit={subir}>
        <div className="cert-grid">
          <label className="campo">
            <span className="campo-titulo">Nombre</span>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Compraventa - estilo propio" required maxLength={160} />
          </label>
          <label className="campo">
            <span className="campo-titulo">Tipo de acto</span>
            <select value={tipoActo} onChange={(e) => setTipoActo(e.target.value)}>
              {TIPOS_ACTO.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span className="campo-titulo">Archivo (.doc/.docx)</span>
          <input type="file" accept=".doc,.docx" onChange={(e) => setArchivo(e.target.files?.[0] || null)} required />
        </label>
        <div className="acciones">
          <button type="submit" className="boton primario" disabled={subiendo}>{subiendo ? "Guardando…" : "Guardar en mi biblioteca"}</button>
        </div>
      </form>

      {modelos === null ? (
        <p className="vacio">Cargando…</p>
      ) : modelos.length === 0 ? (
        <p className="vacio">Todavía no hay modelos guardados.</p>
      ) : (
        <ul className="biblioteca-lista">
          {modelos.map((m) => (
            <li key={m.id} className="biblioteca-item">
              <div>
                <div className="biblioteca-item-nombre">{m.nombre}</div>
                <div className="biblioteca-item-meta">{(m.tipoActo || "otro").replace(/_/g, " ")} · guardado el {new Date(m.creadoEn).toLocaleDateString("es-AR")}</div>
              </div>
              <button type="button" className="enlace" onClick={() => borrar(m.id)}>borrar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
