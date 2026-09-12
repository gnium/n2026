import { useEffect, useRef } from "react";

export default function ChatLog({ mensajes }) {
  const fin = useRef(null);
  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [mensajes]);

  return (
    <div className="chat" role="log" aria-live="polite" aria-label="Mensajes del asistente">
      {mensajes.map((m, i) => (
        <div key={i} className={`burbuja ${m.autor} ${m.nivel || ""}`}>
          <div className="burbuja-texto">{m.texto}</div>
          <time className="burbuja-hora">{new Date(m.ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
      ))}
      <div ref={fin} />
    </div>
  );
}
