import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

export default function ConfigGoogle() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ clientId: "", clientSecret: "", redirectUri: "" });
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [verForm, setVerForm] = useState(false);

  const cargar = async () => {
    try {
      const c = await api.googleEstado();
      setCfg(c);
      setForm((f) => ({ ...f, clientId: c.clientId || "", redirectUri: c.redirectUri || "" }));
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    }
  };

  useEffect(() => { cargar(); }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setEstado(null);
    try {
      await api.googleGuardarConfiguracion(form);
      setForm((f) => ({ ...f, clientSecret: "" }));
      setEstado({ tipo: "ok", texto: "Credenciales guardadas. Los escribanos pueden conectar sus cuentas de Google." });
      await cargar();
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  if (!cfg) return null;

  return (
    <section className="config-seccion" aria-labelledby="cfg-google">
      <div className="protocolo-cabecera">
        <h2 id="cfg-google"><Icono nombre="nube" tamano={18} /> Google Calendar y Drive</h2>
        <span className={`etiqueta ${cfg.configurado ? "ok" : ""}`}>{cfg.configurado ? "Configurado" : "Sin configurar"}</span>
      </div>
      <p className="nota">
        Cargue las credenciales OAuth del proyecto de Google Cloud. Una vez configuradas, cada escribano podrá conectar su propia cuenta de Google desde Integraciones para sincronizar la agenda y guardar documentos en Drive.
      </p>
      {cfg.secretoIlegible && (
        <p className="alerta error" role="alert">El client_secret guardado está cifrado con otra JWT_SECRET y no se puede leer. Vuelva a cargarlo.</p>
      )}
      {cfg.origen === "entorno" && cfg.configurado && !verForm && (
        <p className="alerta ok" role="status">Las credenciales vienen del archivo .env del servidor. Si carga valores acá, estos tienen prioridad.</p>
      )}

      {!verForm && (
        <div className="acciones">
          <button type="button" className="boton chico" onClick={() => setVerForm(true)}>
            {cfg.configurado ? "Editar credenciales" : "Configurar credenciales"}
          </button>
        </div>
      )}

      {verForm && (
        <form className="cert-form" onSubmit={guardar}>
          <p className="ayuda">
            En <b>console.cloud.google.com</b>: cree un proyecto, active las APIs de Google Calendar y Google Drive, configure la pantalla de consentimiento y cree credenciales de tipo <b>ID de cliente de OAuth · Aplicación web</b>. Copie acá el ID y el secreto, y en Google pegue el URI de redirección que figura abajo.
          </p>
          <div className="cert-grid">
            <label className="campo"><span className="campo-titulo">Client ID</span>
              <input type="text" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} placeholder="123-abc.apps.googleusercontent.com" />
            </label>
            <label className="campo"><span className="campo-titulo">Client secret</span>
              <input type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} placeholder={cfg.configurado ? "Dejar vacío para conservar el actual" : ""} autoComplete="off" />
            </label>
            <label className="campo"><span className="campo-titulo">URI de redirección</span>
              <input type="text" value={form.redirectUri} onChange={(e) => setForm({ ...form, redirectUri: e.target.value })} placeholder={cfg.redirectUri} />
              <small className="ayuda">Debe coincidir exactamente con el que cargue en Google: <span className="mono">{cfg.redirectUri}</span></small>
            </label>
          </div>
          {estado && <p className={`alerta ${estado.tipo}`} role={estado.tipo === "error" ? "alert" : "status"}>{estado.texto}</p>}
          <div className="acciones">
            <button type="submit" className="boton primario" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar credenciales"}</button>
            <button type="button" className="boton chico" onClick={() => setVerForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {!verForm && estado && <p className={`alerta ${estado.tipo}`} role={estado.tipo === "error" ? "alert" : "status"}>{estado.texto}</p>}
    </section>
  );
}
