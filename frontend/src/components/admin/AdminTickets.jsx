import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api.js";
import Icono from "../Iconos.jsx";
import { cuando } from "./constants.js";
import AdminNav from "./AdminNav.jsx";

export default function AdminTickets() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();

  const [consultas, setConsultas] = useState([]);
  const [consultaDetalle, setConsultaDetalle] = useState(null);
  const [respuestaConsulta, setRespuestaConsulta] = useState("");
  const [filtroConsultas, setFiltroConsultas] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setError(null);
    try {
      const cs = await api.soporteConsultas({ estado: filtroConsultas || undefined });
      setConsultas(cs);
    } catch (e) {
      setError(`No se pudieron cargar las consultas: ${e.message}`);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroConsultas]);

  // Open ticket from URL param
  useEffect(() => {
    if (paramId) {
      abrirConsulta(Number(paramId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId]);

  const abrirConsulta = async (id) => {
    setError(null);
    try {
      setConsultaDetalle(await api.soporteConsulta(id));
      setRespuestaConsulta("");
      navigate(`/admin/tickets/${id}`, { replace: true });
      setTimeout(() => document.getElementById("soporte-consulta-titulo")?.focus(), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  const cerrarDetalleConsulta = () => {
    setConsultaDetalle(null);
    navigate("/admin/tickets", { replace: true });
  };

  const responderConsulta = async (e) => {
    e.preventDefault();
    if (!consultaDetalle || !respuestaConsulta.trim()) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await api.soporteConsultaResponder(consultaDetalle.id, respuestaConsulta);
      setConsultaDetalle(r);
      setRespuestaConsulta("");
      setAviso("Respuesta enviada.");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const cerrarConsulta = async (id) => {
    setError(null);
    try {
      await api.soporteConsultaCerrar(id);
      setConsultaDetalle(null);
      navigate("/admin/tickets", { replace: true });
      setAviso("Consulta cerrada.");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const reabrirConsulta = async (id) => {
    setError(null);
    try {
      await api.soporteConsultaReabrir(id);
      setAviso("Consulta reabierta.");
      await abrirConsulta(id);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { if (aviso) { const t = setTimeout(() => setAviso(""), 6000); return () => clearTimeout(t); } }, [aviso]);

  return (
    <div className="equipo">
      <h2>Panel general</h2>
      <AdminNav />
      {error && <p className="alerta error" role="alert"><strong>Error:</strong> {error} <button type="button" className="enlace" onClick={() => setError(null)} aria-label="Cerrar error">{"✕"}</button></p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <section className="bloque" aria-labelledby="soporte-consultas-titulo">
        <h3 id="soporte-consultas-titulo">
          Consultas de soporte{" "}
          <span className="etiqueta">{consultas.filter((c) => c.estado === "abierta").length} abiertas</span>
        </h3>
        <p className="nota">
          Canal de comunicacion con las cuentas suscriptoras. Los suscriptores envian consultas desde su panel; el operador responde desde aca.
        </p>

        <div className="acciones agenda-toolbar">
          <div className="segmentado" role="group" aria-label="Filtro de consultas">
            {[["", "Todas"], ["abierta", "Abiertas"], ["respondida", "Respondidas"], ["cerrada", "Cerradas"]].map(([v, t]) => (
              <button type="button" key={v} className={filtroConsultas === v ? "activo" : ""} aria-pressed={filtroConsultas === v} onClick={() => { setFiltroConsultas(v); }}>{t}</button>
            ))}
          </div>
        </div>

        {consultaDetalle ? (
          <div className="bloque">
            <div className="protocolo-cabecera">
              <h4 id="soporte-consulta-titulo" tabIndex={-1}>
                {consultaDetalle.asunto}{" "}
                <span className={`etiqueta ${consultaDetalle.estado === "respondida" ? "ok" : consultaDetalle.estado === "cerrada" ? "riesgo-alto" : ""}`}>{consultaDetalle.estado}</span>
              </h4>
              <div className="acciones">
                {consultaDetalle.estado !== "cerrada" && (
                  <button type="button" className="boton chico" onClick={() => cerrarConsulta(consultaDetalle.id)}>Cerrar consulta</button>
                )}
                {consultaDetalle.estado === "cerrada" && (
                  <button type="button" className="boton chico" onClick={() => reabrirConsulta(consultaDetalle.id)}>Reabrir</button>
                )}
                <button type="button" className="boton discreto chico" onClick={cerrarDetalleConsulta}>
                  <Icono nombre="izquierda" tamano={16} /> Volver
                </button>
              </div>
            </div>
            <p className="ayuda">{consultaDetalle.nombre || consultaDetalle.email}{consultaDetalle.equipo ? ` · ${consultaDetalle.equipo}` : ""} {"·"} {cuando(consultaDetalle.creadoEn)}</p>

            <div className="consulta-mensajes">
              {consultaDetalle.mensajes?.map((m) => (
                <div key={m.id} className={`consulta-mensaje ${m.esAdmin ? "admin" : "propio"}`}>
                  <div className="consulta-mensaje-meta">
                    <strong>{m.esAdmin ? "Operador" : (m.nombre || m.email)}</strong>
                    <span className="recaudo-meta">{cuando(m.creadoEn)}</span>
                  </div>
                  <p className="consulta-mensaje-texto">{m.contenido}</p>
                </div>
              ))}
            </div>

            {consultaDetalle.estado !== "cerrada" && (
              <form className="acciones agenda-toolbar" onSubmit={responderConsulta}>
                <textarea rows={3} maxLength={4000} value={respuestaConsulta} onChange={(e) => setRespuestaConsulta(e.target.value)} placeholder="Escriba la respuesta..." required />
                <button type="submit" className="boton primario" disabled={ocupado || !respuestaConsulta.trim()}>
                  <Icono nombre="chat" tamano={16} /> Responder
                </button>
              </form>
            )}
          </div>
        ) : consultas.length === 0 ? (
          <p className="vacio">No hay consultas{filtroConsultas ? ` ${filtroConsultas}s` : ""}.</p>
        ) : (
          <div className="tabla-scroll">
            <table aria-labelledby="soporte-consultas-titulo">
              <thead>
                <tr>
                  <th scope="col">De</th>
                  <th scope="col">Asunto</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Ultima actividad</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {consultas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.nombre || c.email}
                      {c.equipo && <span className="recaudo-meta">{c.equipo}</span>}
                    </td>
                    <th scope="row">
                      {c.asunto}
                      {c.sinLeer > 0 && <span className="etiqueta">{c.sinLeer} sin leer</span>}
                    </th>
                    <td><span className={`etiqueta ${c.estado === "respondida" ? "ok" : c.estado === "cerrada" ? "riesgo-alto" : ""}`}>{c.estado}</span></td>
                    <td>{cuando(c.actualizadoEn)}</td>
                    <td><button type="button" className="enlace" onClick={() => abrirConsulta(c.id)}>ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
