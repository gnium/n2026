import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

export default function ClientePicker({ seleccionados = [], onChange, onAutoFill }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!q.trim()) { setResultados([]); return; }
    const t = setTimeout(async () => {
      try {
        const lista = await api.clientesListar(q);
        setResultados(lista.filter((c) => !seleccionados.some((s) => s.id === c.id)));
      } catch { setResultados([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, seleccionados]);

  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const agregar = (cliente) => {
    onChange([...seleccionados, cliente]);
    onAutoFill?.(cliente);
    setQ("");
    setAbierto(false);
  };

  const quitar = (id) => onChange(seleccionados.filter((c) => c.id !== id));

  return (
    <div className="cliente-picker" ref={ref}>
      <div className="picker-chips">
        {seleccionados.map((c) => (
          <span key={c.id} className="chip">
            <Icono nombre={c.tipo === "sociedad" ? "edificio" : "persona"} tamano={14} />
            {c.nombre}
            <button type="button" className="chip-quitar" onClick={() => quitar(c.id)} aria-label={`Quitar ${c.nombre}`}>&times;</button>
          </span>
        ))}
        <input
          type="text"
          className="picker-input"
          placeholder={seleccionados.length ? "Agregar otro cliente…" : "Buscar cliente por nombre…"}
          value={q}
          onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
          onFocus={() => { if (q.trim()) setAbierto(true); }}
        />
      </div>
      {abierto && resultados.length > 0 && (
        <ul className="picker-lista">
          {resultados.slice(0, 8).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => agregar(c)}>
                <Icono nombre={c.tipo === "sociedad" ? "edificio" : "persona"} tamano={16} />
                <span className="picker-nombre">{c.nombre}</span>
                {c.documento && <span className="picker-detalle">DNI {c.documento}</span>}
                {c.cuit && <span className="picker-detalle">CUIT {c.cuit}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
