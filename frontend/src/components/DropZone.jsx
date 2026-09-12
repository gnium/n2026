import { useRef, useState } from "react";
import Icono from "./Iconos.jsx";

const EXT = [".doc", ".docx"];

export default function DropZone({ onArchivo, onSinDocumento, deshabilitado }) {
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const aceptar = (archivo) => {
    if (!archivo) return;
    const nombre = archivo.name.toLowerCase();
    if (!EXT.some((e) => nombre.endsWith(e))) {
      setError("Solo se aceptan archivos de Word (.doc o .docx).");
      return;
    }
    setError(null);
    onArchivo(archivo);
  };

  return (
    <div className="dropzone-wrap">
      <div
        role="button"
        tabIndex={0}
        aria-label="Zona para arrastrar el documento. También puede presionar Enter para elegir un archivo."
        aria-disabled={deshabilitado}
        className={`dropzone ${arrastrando ? "activa" : ""} ${deshabilitado ? "deshabilitada" : ""}`}
        onClick={() => !deshabilitado && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !deshabilitado && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!deshabilitado) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (!deshabilitado) aceptar(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="dropzone-icono" aria-hidden="true"><Icono nombre="subir" tamano={22} /></div>
        <p className="dropzone-titulo">Arrastre aquí el borrador o los antecedentes</p>
        <p className="dropzone-sub">o haga clic para elegir un archivo de Word (.doc / .docx)</p>
        <input ref={inputRef} type="file" accept=".doc,.docx" hidden onChange={(e) => aceptar(e.target.files?.[0])} />
      </div>
      {error && (
        <p className="alerta error" role="alert">
          {error}
        </p>
      )}
      {onSinDocumento && (
        <p className="nota centrado">
          ¿No tiene un borrador en un archivo?{" "}
          <button type="button" className="enlace" disabled={deshabilitado} onClick={onSinDocumento}>
            Escribir los antecedentes
          </button>
        </p>
      )}
    </div>
  );
}
