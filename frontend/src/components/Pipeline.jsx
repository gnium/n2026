import Icono from "./Iconos.jsx";

const ICONO = { pendiente: "circulo", completado: "check", fallido: "cruz", omitido: "menos" };
const ETIQUETA = { pendiente: "Pendiente", en_curso: "En curso", completado: "Listo", fallido: "Error", omitido: "Omitido" };

export function formatoUsd(n) {
  if (n == null) return "N/D";
  if (n === 0) return "gratis";
  return n < 0.01 ? `US$ ${n.toFixed(6)}` : `US$ ${n.toFixed(4)}`;
}

export default function Pipeline({ skills }) {
  if (!skills?.length) return null;
  return (
    <ol className="pipeline" aria-label="Progreso del análisis">
      {skills.map((s, i) => (
        <li key={s.clave} className={`paso ${s.estado}`} aria-current={s.estado === "en_curso" ? "step" : undefined}>
          <span className="paso-icono" aria-hidden="true">
            {s.estado === "en_curso" ? <span className="spinner" /> : <Icono nombre={ICONO[s.estado]} tamano={14} />}
          </span>
          <div className="paso-cuerpo">
            <div className="paso-titulo">
              <span className="paso-num">{i + 1}</span> {s.nombre}
            </div>
            <div className="paso-desc">{s.descripcion}</div>
            <div className="paso-estado">
              <span className="sr-only">Estado: </span>
              {ETIQUETA[s.estado]}
              {s.mensaje && s.estado !== "completado" ? ` · ${s.mensaje}` : ""}
              {s.duracionMs != null && s.estado === "completado" ? ` · ${(s.duracionMs / 1000).toFixed(0)} s` : ""}
              {s.estado === "completado" && (
                <>
                  {" · "}
                  <span className="paso-costo" title={s.modelo ? `${s.proveedor || ""} ${s.modelo}`.trim() : undefined}>
                    {s.costoAproximado ? "~" : ""}
                    {formatoUsd(s.costoUsd)}
                  </span>
                </>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
