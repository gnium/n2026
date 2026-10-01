import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const NOMBRE_ESTADO = { abierta: "abierta", respondida: "respondida", cerrada: "cerrada" };
const COLOR_ESTADO = { abierta: "", respondida: "ok", cerrada: "riesgo-alto" };
const cuando = (v) => (v ? new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function Consultas() {
  const [lista, setLista] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [form, setForm] = useState({ asunto: "", contenido: "" });
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    setError(null);
    try {
      setLista(await api.consultasListar());
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { cargar(); }, []);

  const abrir = async (id) => {
    setError(null);
    try {
      setDetalle(await api.consultaObtener(id));
      setNueva(false);
      setTimeout(() => document.getElementById("consulta-detalle")?.focus(), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  const crear = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      const r = await api.consultaCrear(form);
      setDetalle(r);
      setNueva(false);
      setForm({ asunto: "", contenido: "" });
      setAviso("Consulta enviada.");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const enviarRespuesta = async (e) => {
    e.preventDefault();
    if (!detalle || !respuesta.trim()) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await api.consultaResponder(detalle.id, respuesta);
      setDetalle(r);
      setRespuesta("");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!lista) return <div className="equipo"><h2>Soporte</h2><p className="vacio" role="status">Cargando...</p></div>;

  return (
    <div className="equipo">
      <div className="resultados-cabecera">
        <h2>Soporte</h2>
        <button type="button" className="boton primario" onClick={() => { setNueva(true); setDetalle(null); }}>
          <Icono nombre="mas" tamano={16} /> Nueva consulta
        </button>
      </div>
      <p className="nota">
        Envie sus dudas o pedidos de soporte. El equipo de Doy Fe responde desde aca.
      </p>

      {error && <p className="alerta error" role="alert">{error}</p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      {nueva && (
        <form className="bloque cert-form" onSubmit={crear}>
          <h3>Nueva consulta</h3>
          <label>
            Asunto
            <input type="text" required maxLength={200} value={form.asunto} onChange={(e) => setForm({ ...form, asunto: e.target.value })} placeholder="Resuma su consulta en una frase" />
          </label>
          <label>
            Mensaje
            <textarea required rows={4} maxLength={4000} value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })} placeholder="Describa su duda o pedido con el detalle que necesite" />
          </label>
          <div className="acciones">
            <button type="submit" className="boton primario" disabled={ocupado}><Icono nombre="chat" tamano={16} /> Enviar</button>
            <button type="button" className="boton" onClick={() => setNueva(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {lista.length === 0 && !nueva ? (
        <p className="vacio">Todavia no tiene consultas. Abra una para contactar al equipo de soporte.</p>
      ) : (
        !nueva && !detalle && (
          <div className="tabla-scroll">
            <table aria-label="Mis consultas de soporte">
              <thead>
                <tr>
                  <th scope="col">Asunto</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Ultima actividad</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      {c.asunto}
                      {c.sinLeer > 0 && <span className="etiqueta ok">{c.sinLeer} nuevo{c.sinLeer > 1 ? "s" : ""}</span>}
                    </th>
                    <td><span className={`etiqueta ${COLOR_ESTADO[c.estado]}`}>{NOMBRE_ESTADO[c.estado]}</span></td>
                    <td>{cuando(c.actualizadoEn)}</td>
                    <td><button type="button" className="enlace" onClick={() => abrir(c.id)}>ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {detalle && (
        <section className="bloque" aria-labelledby="consulta-detalle">
          <div className="protocolo-cabecera">
            <h3 id="consulta-detalle" tabIndex={-1}>
              {detalle.asunto} <span className={`etiqueta ${COLOR_ESTADO[detalle.estado]}`}>{NOMBRE_ESTADO[detalle.estado]}</span>
            </h3>
            <button type="button" className="boton discreto chico" onClick={() => { setDetalle(null); cargar(); }}>
              <Icono nombre="izquierda" tamano={16} /> Volver
            </button>
          </div>

          <div className="consulta-mensajes">
            {detalle.mensajes?.map((m) => (
              <div key={m.id} className={`consulta-mensaje ${m.esAdmin ? "admin" : "propio"}`}>
                <div className="consulta-mensaje-meta">
                  <strong>{m.esAdmin ? "Soporte Doy Fe" : (m.nombre || m.email)}</strong>
                  <span className="recaudo-meta">{cuando(m.creadoEn)}</span>
                </div>
                <p className="consulta-mensaje-texto">{m.contenido}</p>
              </div>
            ))}
          </div>

          {detalle.estado !== "cerrada" && (
            <form className="acciones agenda-toolbar" onSubmit={enviarRespuesta}>
              <textarea rows={3} maxLength={4000} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Escriba su respuesta..." required />
              <button type="submit" className="boton primario" disabled={ocupado || !respuesta.trim()}>
                <Icono nombre="chat" tamano={16} /> Enviar
              </button>
            </form>
          )}

          {detalle.estado === "cerrada" && (
            <p className="nota">Esta consulta fue cerrada. Si necesita seguir, abra una nueva.</p>
          )}
        </section>
      )}
    </div>
  );
}
