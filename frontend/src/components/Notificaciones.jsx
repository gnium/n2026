import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const CLASE_TIPO = { info: "toast-info", alerta: "toast-alerta", novedad: "toast-novedad" };

function Toast({ notif, onCerrar }) {
  useEffect(() => {
    const t = setTimeout(onCerrar, 8000);
    return () => clearTimeout(t);
  }, [onCerrar]);
  return (
    <div className={`toast ${CLASE_TIPO[notif.tipo] || "toast-info"}`} role="status">
      <div style={{ flex: 1 }}>
        <h4>{notif.titulo}</h4>
        <p>{notif.mensaje.length > 120 ? notif.mensaje.slice(0, 120) + "…" : notif.mensaje}</p>
      </div>
      <button type="button" onClick={onCerrar} aria-label="Cerrar"><Icono nombre="cruz" tamano={14} /></button>
    </div>
  );
}

export function ToastContainer({ toasts, onCerrar }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => <Toast key={t.id} notif={t} onCerrar={() => onCerrar(t.id)} />)}
    </div>
  );
}

function formatoTiempo(fecha) {
  const d = new Date(fecha);
  const ahora = new Date();
  const diff = ahora - d;
  if (diff < 60000) return "ahora";
  if (diff < 3600000) return `hace ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)} h`;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function CampanaNotificaciones({ usuario }) {
  const [sinLeer, setSinLeer] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const ultimoId = useRef(0);
  const ref = useRef(null);

  const sondear = useCallback(async () => {
    if (usuario?.esAdmin) return;
    try {
      const r = await api.notificacionesSinLeer();
      setSinLeer(r.sinLeer);
    } catch { /* silenciar */ }
  }, [usuario]);

  useEffect(() => {
    sondear();
    const iv = setInterval(sondear, 60000);
    return () => clearInterval(iv);
  }, [sondear]);

  useEffect(() => {
    if (usuario?.esAdmin) return;
    api.notificacionesListar().then((lista) => {
      setNotifs(lista);
      if (lista.length) ultimoId.current = Math.max(...lista.map((n) => n.id));
    }).catch(() => {});
  }, [usuario]);

  useEffect(() => {
    if (usuario?.esAdmin) return;
    const iv = setInterval(async () => {
      try {
        const lista = await api.notificacionesListar();
        const nuevas = lista.filter((n) => n.id > ultimoId.current);
        if (nuevas.length) {
          setToasts((prev) => [...prev, ...nuevas]);
          ultimoId.current = Math.max(...lista.map((n) => n.id));
        }
        setNotifs(lista);
      } catch { /* silenciar */ }
    }, 60000);
    return () => clearInterval(iv);
  }, [usuario]);

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const abrir = async () => {
    setAbierto(!abierto);
    if (!abierto) {
      try {
        const lista = await api.notificacionesListar();
        setNotifs(lista);
      } catch { /* silenciar */ }
    }
  };

  const leer = async (id) => {
    try {
      await api.notificacionMarcarLeida(id);
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, leida: true } : n));
      setSinLeer((c) => Math.max(0, c - 1));
    } catch { /* silenciar */ }
  };

  const leerTodas = async () => {
    try {
      await api.notificacionesMarcarTodasLeidas();
      setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
      setSinLeer(0);
    } catch { /* silenciar */ }
  };

  const cerrarToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  if (usuario?.esAdmin) return null;

  return (
    <>
      <ToastContainer toasts={toasts} onCerrar={cerrarToast} />
      <div className="notif-bell" ref={ref}>
        <button type="button" className="boton discreto chico" onClick={abrir} aria-label={`Notificaciones${sinLeer ? ` (${sinLeer} sin leer)` : ""}`} title="Notificaciones">
          <Icono nombre="chat" tamano={18} />
          {sinLeer > 0 && <span className="notif-badge">{sinLeer > 99 ? "99+" : sinLeer}</span>}
        </button>
        {abierto && (
          <div className="notif-panel">
            <div className="notif-panel-header">
              <strong>Notificaciones</strong>
              {sinLeer > 0 && <button type="button" className="enlace" onClick={leerTodas}>Marcar todas leídas</button>}
            </div>
            {notifs.length === 0 ? (
              <p className="notif-vacio">No hay notificaciones</p>
            ) : (
              notifs.map((n) => (
                <div key={n.id} className={`notif-item ${n.leida ? "" : "sin-leer"}`} onClick={() => !n.leida && leer(n.id)}>
                  <div className="notif-item-header">
                    <h4>{n.titulo}</h4>
                    <time>{formatoTiempo(n.creado_en)}</time>
                  </div>
                  <p>{n.mensaje.length > 140 ? n.mensaje.slice(0, 140) + "…" : n.mensaje}</p>
                  <span className={`notif-tipo notif-tipo-${n.tipo}`}>{n.tipo}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
