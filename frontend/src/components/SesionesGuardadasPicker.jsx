import { useState } from "react";
import { api } from "../api.js";

const NOMBRE_MODO = { completo: "análisis completo", escritura: "redacción de escritura", estudio_titulos: "estudio de títulos", certificacion_firmas: "certificación de firmas" };

/** Lista compacta de sesiones guardadas (ver "Guardar y continuar después"), para reanudar o descartar. */
export default function SesionesGuardadasPicker({ onReanudar }) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);

  const cargar = async () => {
    setError(null);
    try {
      setLista(await api.listarSesionesGuardadas());
    } catch (e) {
      setError(e.message);
    }
  };

  const alternar = () => {
    setAbierto((v) => !v);
    if (!abierto) cargar();
  };

  const descartar = async (id) => {
    await api.borrarSesionGuardada(id).catch(() => {});
    cargar();
  };

  return (
    <div className="sesiones-guardadas">
      <button type="button" className="enlace" onClick={alternar}>
        {abierto ? "Ocultar sesiones guardadas" : "Reanudar sesión guardada"}
      </button>
      {abierto && (
        <div className="sesiones-guardadas-lista">
          {error && <p className="alerta error">{error}</p>}
          {lista && lista.length === 0 && <p className="vacio">No hay sesiones guardadas.</p>}
          {lista?.map((s) => {
            const dias = Math.max(0, Math.ceil((new Date(s.expiraEn) - Date.now()) / 86400000));
            return (
              <div className="sesion-guardada" key={s.id}>
                <span>
                  {NOMBRE_MODO[s.modo] || s.modo} · {s.estadoOriginal} · vence en {dias} día(s)
                </span>
                <div className="acciones">
                  <button type="button" className="boton primario" onClick={() => onReanudar(s.id)}>Reanudar</button>
                  <button type="button" className="enlace" onClick={() => descartar(s.id)}>descartar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
