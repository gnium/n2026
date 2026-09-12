import { useEffect, useState } from "react";
import Icono from "./Iconos.jsx";

const CLAVE = "notarius-tema";
const OPCIONES = [
  { valor: "light", icono: "sol", texto: "Tema claro" },
  { valor: "system", icono: "monitor", texto: "Tema del sistema" },
  { valor: "dark", icono: "luna", texto: "Tema oscuro" },
];

function leer() {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === "dark" || t === "light" ? t : "system";
  } catch {
    return "system";
  }
}

export default function TemaToggle() {
  const [tema, setTema] = useState(leer);

  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === "system") raiz.removeAttribute("data-theme");
    else raiz.setAttribute("data-theme", tema);
    try {
      if (tema === "system") localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, tema);
    } catch {
      /* sin almacenamiento: el tema dura la sesión */
    }
  }, [tema]);

  return (
    <div className="tema-toggle" role="radiogroup" aria-label="Tema de la interfaz">
      {OPCIONES.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={tema === o.valor} aria-label={o.texto} title={o.texto} className={tema === o.valor ? "activo" : ""} onClick={() => setTema(o.valor)}>
          <Icono nombre={o.icono} tamano={16} />
        </button>
      ))}
    </div>
  );
}
