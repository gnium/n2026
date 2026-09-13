import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import ConfirmarDialogo from "./ConfirmarDialogo.jsx";

const AVISOS = {
  conectado: { tipo: "ok", texto: "Cuenta de Google conectada. Elija abajo qué quiere sincronizar." },
  cancelado: { tipo: "error", texto: "Se canceló la conexión con Google: no se guardó nada." },
  estado_invalido: { tipo: "error", texto: "El enlace de vuelta de Google venció. Probá conectar de nuevo." },
  error: { tipo: "error", texto: "No se pudo completar la conexión con Google. Revisá las credenciales en Configuración." },
};

const OPCIONES = [
  { clave: "sincronizarAgenda", titulo: "Agenda en Google Calendar", detalle: "Cada turno que cree o edite se copia a su calendario. Viaja el título, la fecha y la duración; nada más." },
  { clave: "subirComprobantes", titulo: "Copiar comprobantes y presupuestos a Drive", detalle: "Guarda el PDF en una carpeta \"Doy Fe\" de su Drive, cuando usted lo pide desde el comprobante o el presupuesto." },
  { clave: "subirEscrituras", titulo: "Copiar escrituras a Drive", detalle: "Guarda el .docx generado. Atención: el documento final tiene los datos reales de las partes." },
];

export default function Integraciones({ usuario, aviso: avisoUrl = null }) {
  const [g, setG] = useState(null);
  const [cfg, setCfg] = useState({ clientId: "", clientSecret: "", redirectUri: "" });
  const [verConfig, setVerConfig] = useState(false);
  const [confirmarDesconexion, setConfirmarDesconexion] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(avisoUrl ? AVISOS[avisoUrl]?.texto || "" : "");

  const cargar = async () => {
    setError(null);
    try {
      const e = await api.googleEstado();
      setG(e);
      setCfg((c) => ({ ...c, clientId: e.clientId || c.clientId, redirectUri: e.redirectUri || c.redirectUri }));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const conectar = async () => {
    setError(null);
    try {
      const { url } = await api.googleAutorizar();
      window.location.href = url;
    } catch (err) {
      setError(err.message);
    }
  };

  const cambiar = async (clave, valor) => {
    setError(null);
    try {
      setG(await api.googlePreferencias({ ...g, [clave]: valor }));
      setAviso(`${OPCIONES.find((o) => o.clave === clave)?.titulo || "Preferencia"}: ${valor ? "activado" : "desactivado"}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const guardarConfig = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.googleGuardarConfiguracion(cfg);
      setCfg({ ...cfg, clientSecret: "" });
      setAviso("Credenciales de Google guardadas.");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!g) return <div className="equipo"><h2>Integraciones</h2><p className="vacio" role="status">Cargando…</p>{error && <p className="alerta error" role="alert">{error}</p>}</div>;

  return (
    <div className="equipo">
      <h2>Integraciones</h2>
      <p className="nota">
        Conecte su cuenta de Google para llevar la agenda a Calendar y guardar copias de los documentos en Drive. Hasta que no conecte una cuenta, no sale nada de la escribanía. Al conectar quedan activas la agenda y la copia de comprobantes; subir la escritura final —que sí tiene los datos reales de las partes— se activa aparte. El correo se maneja fuera de la app.
      </p>
      {error && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ${avisoUrl && AVISOS[avisoUrl]?.tipo === "error" ? "error" : "ok"} ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      <section className="bloque primero" aria-labelledby="google-cuenta-titulo">
        <div className="protocolo-cabecera">
          <h3 id="google-cuenta-titulo">
            Cuenta de Google {g.conectado ? <span className="etiqueta ok">conectada</span> : <span className="etiqueta">sin conectar</span>}
          </h3>
          {g.conectado ? (
            <button type="button" className="boton chico" onClick={() => setConfirmarDesconexion(true)}>Desconectar</button>
          ) : (
            <button type="button" className="boton primario" disabled={!g.configurado} onClick={conectar}><Icono nombre="nube" tamano={16} /> Conectar con Google</button>
          )}
        </div>
        {g.conectado ? (
          <p className="nota">Conectada como <b>{g.email}</b>. Permisos otorgados: crear y editar eventos en su calendario, y ver solo los archivos que esta app crea en su Drive. No puede leer su calendario completo ni el resto de su Drive, y no tiene ningún acceso a su correo.</p>
        ) : !g.configurado ? (
          <p className="alerta">Falta que la titular cargue las credenciales del proyecto de Google Cloud (abajo) antes de poder conectar cuentas.</p>
        ) : (
          <p className="nota">Al conectar, Google le va a pedir permiso para crear y editar eventos en su calendario y para los archivos que esta app cree en su Drive. No pide ningún permiso sobre su correo.</p>
        )}
      </section>

      {g.conectado && (
        <section className="bloque" aria-labelledby="google-opciones-titulo">
          <h3 id="google-opciones-titulo">Qué sincronizar</h3>
          <ul className="recaudos">
            {OPCIONES.map((o) => (
              <li className="recaudo" key={o.clave}>
                <input type="checkbox" id={`g-${o.clave}`} checked={Boolean(g[o.clave])} onChange={(e) => cambiar(o.clave, e.target.checked)} />
                <label htmlFor={`g-${o.clave}`}>
                  <span className="recaudo-texto">{o.titulo}</span>
                  <span className="recaudo-meta">{o.detalle}</span>
                </label>
                <span />
              </li>
            ))}
          </ul>
          {g.driveCarpetaNombre && <p className="ayuda">Carpeta de Drive: {g.driveCarpetaNombre}.</p>}
        </section>
      )}

      {usuario?.esAdmin && (
        <section className="bloque" aria-labelledby="google-config-titulo">
          <div className="protocolo-cabecera">
            <h3 id="google-config-titulo">
              Credenciales de Google Cloud {g.configurado && <span className="etiqueta ok">{g.origen === "entorno" ? "desde el .env" : "cargadas"}</span>}
              {g.secretoIlegible && <span className="etiqueta riesgo-alto">ilegibles</span>}
            </h3>
            <button type="button" className="boton chico" aria-expanded={verConfig} aria-controls="google-config" onClick={() => setVerConfig((v) => !v)}>{verConfig ? "Ocultar" : "Editar"}</button>
          </div>
          {g.origen === "entorno" && <p className="nota">Vienen del archivo <span className="mono">.env</span> del servidor (<span className="mono">GOOGLE_CLIENT_ID</span> y <span className="mono">GOOGLE_CLIENT_SECRET</span>). Si carga valores acá, estos tienen prioridad sobre los del archivo.</p>}
          {g.secretoIlegible && <p className="alerta error" role="alert">El client_secret guardado está cifrado con otra JWT_SECRET y no se puede leer. Vuelva a cargarlo acá o definalo en el .env del servidor.</p>}
          {verConfig && (
            <form id="google-config" className="cert-form" onSubmit={guardarConfig}>
              <p className="ayuda">
                En console.cloud.google.com: cree un proyecto, active las APIs de <b>Google Calendar</b> y <b>Google Drive</b>, configure la pantalla de consentimiento y cree credenciales de tipo <b>ID de cliente de OAuth · Aplicación web</b>. Copie acá el ID y el secreto, y en Google pegue el URI de redirección que figura abajo. Si la escribanía tiene Google Workspace, elija tipo de usuario <b>Interno</b>: evita la verificación de Google y el permiso no vence.
              </p>
              <div className="cert-grid">
                <label className="campo"><span className="campo-titulo">Client ID</span>
                  <input type="text" value={cfg.clientId} onChange={(e) => setCfg({ ...cfg, clientId: e.target.value })} placeholder="123-abc.apps.googleusercontent.com" />
                </label>
                <label className="campo"><span className="campo-titulo">Client secret</span>
                  <input type="password" value={cfg.clientSecret} onChange={(e) => setCfg({ ...cfg, clientSecret: e.target.value })} placeholder={g.configurado ? "Dejar vacío para conservar el actual" : ""} autoComplete="off" />
                </label>
                <label className="campo"><span className="campo-titulo">URI de redirección</span>
                  <input type="text" value={cfg.redirectUri} onChange={(e) => setCfg({ ...cfg, redirectUri: e.target.value })} placeholder={g.redirectUri} />
                  <small className="ayuda">Debe coincidir exactamente con el que cargue en Google: <span className="mono">{g.redirectUri}</span></small>
                </label>
              </div>
              <div className="acciones"><button type="submit" className="boton primario">Guardar credenciales</button></div>
            </form>
          )}
        </section>
      )}

      <section className="bloque" aria-labelledby="google-privacidad-titulo">
        <h3 id="google-privacidad-titulo">Qué sale de la escribanía</h3>
        <p className="ayuda">
          Con la agenda activada viajan el título, la fecha y la duración del turno. Con Drive, solo el documento que usted manda a copiar: si activa las escrituras, tenga presente que el .docx final ya tiene los datos reales de las partes. El pipeline de IA no cambia: sigue anonimizando antes de analizar. Está detallado en docs/PRIVACIDAD.md.
        </p>
      </section>

      <ConfirmarDialogo
        abierto={confirmarDesconexion}
        titulo="Desconectar Google"
        texto="Se borran los permisos y los tokens guardados, y la agenda deja de sincronizar. Los eventos y archivos que ya están en Google no se tocan."
        confirmar="Desconectar"
        destructivo
        onConfirmar={async () => {
          setConfirmarDesconexion(false);
          setError(null);
          try {
            setG(await api.googleDesconectar());
            setAviso("Cuenta de Google desconectada.");
          } catch (err) {
            setError(err.message);
          }
        }}
        onCancelar={() => setConfirmarDesconexion(false)}
      />
    </div>
  );
}
