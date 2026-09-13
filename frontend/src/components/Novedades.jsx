import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const ICONO = { alta: "alerta", media: "info", baja: "reloj" };
const NOMBRE_NIVEL = { alta: "Urgente", media: "Atención", baja: "Aviso" };
const VISIBLES = 4;

/**
 * Novedades de la cuenta: lo que vence o pide atención, reunido de la agenda,
 * las tareas, los presupuestos, el certificado de ARCA y la UIF. Si no hay
 * nada pendiente no ocupa lugar en la pantalla.
 */
export default function Novedades({ onIr, onAbrirExpediente }) {
  const [datos, setDatos] = useState(null);
  const [todas, setTodas] = useState(false);

  useEffect(() => {
    api.novedades().then(setDatos).catch(() => setDatos(null));
  }, []);

  if (!datos || datos.total === 0) return null;
  const lista = todas ? datos.alertas : datos.alertas.slice(0, VISIBLES);
  const restantes = datos.alertas.length - lista.length;

  const abrir = (a) => {
    if (a.pantalla === "expedientes" && a.referenciaId) onAbrirExpediente?.(a.referenciaId);
    else if (a.pantalla && a.pantalla !== "principal") onIr?.(a.pantalla);
  };

  return (
    <section className="novedades" aria-labelledby="novedades-titulo">
      <div className="protocolo-cabecera">
        <h3 id="novedades-titulo">
          Novedades{" "}
          <span className={`etiqueta ${datos.altas ? "riesgo-alto" : ""}`} role="status">
            {datos.altas ? `${datos.altas} urgente${datos.altas === 1 ? "" : "s"}` : `${datos.total}`}
          </span>
        </h3>
      </div>
      <ul className="alertas-uif">
        {lista.map((a, i) => (
          <li key={i} className={a.nivel}>
            <Icono nombre={ICONO[a.nivel] || "info"} tamano={16} titulo={NOMBRE_NIVEL[a.nivel]} />
            <span>{a.texto}</span>
            {a.pantalla && a.pantalla !== "principal" && (
              <button type="button" className="enlace" onClick={() => abrir(a)}>
                ver
              </button>
            )}
          </li>
        ))}
      </ul>
      {(restantes > 0 || todas) && (
        <button type="button" className="enlace" aria-expanded={todas} onClick={() => setTodas((v) => !v)}>
          {todas ? "Ver solo lo urgente" : `Ver ${restantes} más`}
        </button>
      )}
    </section>
  );
}
