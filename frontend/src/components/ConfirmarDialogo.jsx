import { useEffect, useRef, useState } from "react";
import Icono from "./Iconos.jsx";

/**
 * Diálogo de confirmación propio (reemplaza window.confirm / window.prompt).
 * `conMotivo` agrega un campo obligatorio cuyo texto llega a onConfirmar(motivo).
 */
export default function ConfirmarDialogo({ abierto, titulo, texto, confirmar = "Confirmar", cancelar = "Cancelar", destructivo = false, conMotivo = false, etiquetaMotivo = "Motivo", onConfirmar, onCancelar }) {
  const dialogo = useRef(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      setMotivo("");
      setOcupado(false);
      d.showModal();
      setTimeout(() => (d.querySelector("textarea") || d.querySelector("button.boton.primario, button.boton.peligro"))?.focus(), 20);
    } else if (!abierto && d.open) d.close();
  }, [abierto]);

  const enviar = async (e) => {
    e.preventDefault();
    if (conMotivo && !motivo.trim()) return;
    setOcupado(true);
    try {
      await onConfirmar?.(conMotivo ? motivo.trim() : undefined);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <dialog ref={dialogo} className="modal" aria-labelledby="confirmar-titulo" aria-describedby="confirmar-texto" onClose={onCancelar} onClick={(e) => e.target === dialogo.current && onCancelar?.()}>
      <form className="cert-form modal-caja" onSubmit={enviar}>
        <div className="protocolo-cabecera">
          <h3 id="confirmar-titulo">{titulo}</h3>
          <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={onCancelar}><Icono nombre="cruz" tamano={16} /></button>
        </div>
        <p id="confirmar-texto" className="nota">{texto}</p>
        {conMotivo && (
          <label className="campo"><span className="campo-titulo">{etiquetaMotivo} <small>(obligatorio)</small></span>
            <textarea rows={2} maxLength={300} required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
        )}
        <div className="acciones">
          <button type="submit" className={`boton ${destructivo ? "peligro" : "primario"}`} aria-disabled={ocupado || (conMotivo && !motivo.trim())} onClick={(e) => (ocupado || (conMotivo && !motivo.trim())) && e.preventDefault()}>{ocupado ? "Un momento…" : confirmar}</button>
          <button type="button" className="boton" onClick={onCancelar}>{cancelar}</button>
        </div>
      </form>
    </dialog>
  );
}
