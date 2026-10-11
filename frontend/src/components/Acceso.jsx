import { useEffect, useState } from "react";
import { api } from "../api.js";

/**
 * Pantallas de acceso: ingresar, crear cuenta, olvide mi contrasena y
 * restablecer (cuando la URL trae ?token=...).
 */
export default function Acceso({ onIngreso, invitacion = null, alta = null }) {
  const tokenUrl = new URLSearchParams(window.location.search).get("token");
  // Con una invitacion de la plataforma se entra directo a crear la cuenta:
  // quien llega por ese enlace todavia no tiene ninguna.
  const [vista, setVista] = useState(tokenUrl ? "restablecer" : alta ? "registro" : "login");
  const [form, setForm] = useState({ email: "", password: "", password2: "", nombre: "", codigo: "", otp: "" });
  const [inv, setInv] = useState(null);
  const [altaInv, setAltaInv] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setError(null);
    setAviso(null);
  }, [vista]);

  // Con una invitacion vigente se prellena el correo: la acepta la app apenas ingresa.
  useEffect(() => {
    if (!invitacion) return;
    api
      .invitacionVer(invitacion)
      .then((i) => {
        setInv(i);
        setForm((f) => ({ ...f, email: i.email }));
      })
      .catch((e) => setError(e.message));
  }, [invitacion]);

  // Invitacion de la plataforma (alta de una escribania nueva, con prueba).
  useEffect(() => {
    if (!alta) return;
    api
      .altaVer(alta)
      .then((i) => {
        setAltaInv(i);
        setForm((f) => ({ ...f, email: i.email, nombre: f.nombre || i.nombre || "" }));
      })
      .catch((e) => setError(e.message));
  }, [alta]);

  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setCargando(true);
    try {
      if (vista === "login") {
        const r = await api.login(form.email, form.password);
        onIngreso(r.usuario);
      } else if (vista === "registro") {
        if (form.password !== form.password2) throw new Error("Las contraseñas no coinciden.");
        const r = await api.registro({ email: form.email, password: form.password, nombre: form.nombre, codigo: form.codigo, invitacion: invitacion || undefined, alta: alta || undefined });
        onIngreso(r.usuario);
      } else if (vista === "recuperar") {
        const r = await api.recuperar(form.email);
        setAviso(r.mensaje);
      } else if (vista === "otp") {
        const r = await api.otpSolicitar(form.email);
        setAviso(r.mensaje);
        setVista("otp_verificar");
      } else if (vista === "otp_verificar") {
        const r = await api.otpVerificar(form.email, form.otp);
        onIngreso(r.usuario);
      } else if (vista === "restablecer") {
        if (form.password !== form.password2) throw new Error("Las contraseñas no coinciden.");
        const r = await api.restablecer(tokenUrl, form.password);
        window.history.replaceState({}, "", window.location.pathname);
        onIngreso(r.usuario);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const titulo = { login: "Ingresar", registro: "Crear cuenta", recuperar: "Recuperar contraseña", restablecer: "Elegir nueva contraseña", otp: "Ingresar con código", otp_verificar: "Verificar código" }[vista];
  const textoBoton = { login: "Ingresar", registro: "Crear cuenta", recuperar: "Enviar enlace", restablecer: "Guardar contraseña", otp: "Enviar código", otp_verificar: "Verificar e ingresar" }[vista];

  return (
    <div className="acceso">
      <div className="acceso-caja">
        <div className="sidebar-marca">
          <img className="marca-sello" src="/favicon.svg" width="34" height="34" alt="" />
          <strong>Doy Fe</strong>
        </div>
        <p className="subtitulo">IA para escribanías: la escritura lista para revisar, los datos en tu escribanía.</p>
        <h2>{titulo}</h2>

        {altaInv && (
          <p className="alerta ok" role="status">
            Su acceso a Doy Fe está listo{altaInv.escribania ? ` para ${altaInv.escribania}` : ""}. Cree la cuenta con <b>{altaInv.email}</b> y empieza un período de prueba de <b>{altaInv.diasPrueba} días</b> sin cargo. Al terminar, si no activa una suscripción, la cuenta y todos sus datos se eliminan de forma definitiva.
          </p>
        )}

        {inv && (
          <p className="alerta ok" role="status">
            Lo invitaron a <b>{inv.equipo}</b> como <b>{inv.rol === "escribano" ? "Escribano/a" : "Empleado/a"}</b>. Ingrese con <b>{inv.email}</b> (o cree la cuenta con ese correo) y la invitación se acepta sola.
          </p>
        )}

        <form onSubmit={enviar} className="acceso-form">
          {vista !== "restablecer" && (
            <label>
              Correo electrónico
              <input type="email" autoComplete="email" required readOnly={Boolean(altaInv) || vista === "otp_verificar"} {...campo("email")} />
            </label>
          )}
          {vista === "registro" && (
            <label>
              Nombre <small>(opcional)</small>
              <input type="text" autoComplete="name" {...campo("nombre")} />
            </label>
          )}
          {vista === "otp_verificar" && (
            <label>
              Código de 6 dígitos
              <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required placeholder="000000" {...campo("otp")} style={{ letterSpacing: "0.3em", fontSize: "1.3rem", textAlign: "center", fontFamily: "monospace" }} />
              <small className="ayuda">Revise su bandeja de entrada. El código vence en 10 minutos.</small>
            </label>
          )}
          {vista !== "recuperar" && vista !== "otp" && vista !== "otp_verificar" && (
            <label>
              {vista === "restablecer" ? "Nueva contraseña" : "Contraseña"}
              <input type="password" autoComplete={vista === "login" ? "current-password" : "new-password"} required minLength={vista === "login" ? 1 : 10} {...campo("password")} />
              {vista !== "login" && <small className="ayuda">Mínimo 10 caracteres.</small>}
            </label>
          )}
          {(vista === "registro" || vista === "restablecer") && (
            <label>
              Repetir contraseña
              <input type="password" autoComplete="new-password" required {...campo("password2")} />
            </label>
          )}
          {vista === "registro" && !altaInv && (
            <label>
              Código de invitación <small>(solo si la administradora lo configuró)</small>
              <input type="text" {...campo("codigo")} />
            </label>
          )}

          {error && (
            <p className="alerta error" role="alert">
              {error}
            </p>
          )}
          <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

          <button type="submit" className="boton primario" disabled={cargando}>
            {cargando ? "Un momento…" : textoBoton}
          </button>
        </form>

        <nav className="acceso-enlaces" aria-label="Otras opciones">
          {vista !== "login" && vista !== "otp" && vista !== "otp_verificar" && (
            <button className="enlace" onClick={() => setVista("login")}>
              Ya tengo cuenta
            </button>
          )}
          {(vista === "otp" || vista === "otp_verificar") && (
            <button className="enlace" onClick={() => setVista("login")}>
              Ingresar con contraseña
            </button>
          )}
          {vista !== "registro" && vista !== "restablecer" && vista !== "otp" && vista !== "otp_verificar" && (
            <button className="enlace" onClick={() => setVista("registro")}>
              Crear cuenta
            </button>
          )}
          {vista === "login" && (
            <button className="enlace" onClick={() => setVista("recuperar")}>
              Olvidé mi contraseña
            </button>
          )}
          {vista === "login" && (
            <button className="enlace" onClick={() => setVista("otp")}>
              Ingresar con código por email
            </button>
          )}
          {vista === "otp_verificar" && (
            <button className="enlace" onClick={() => { setForm((f) => ({ ...f, otp: "" })); setVista("otp"); }}>
              Reenviar código
            </button>
          )}
        </nav>
        <p className="acceso-legal">
          <a href="/">Volver al inicio</a> · <a href="/privacidad.html">Privacidad</a> · <a href="/condiciones.html">Condiciones</a>
          <br />© {new Date().getFullYear()} Doy Fe · Cumbre Tech S.R.L.
        </p>
      </div>
    </div>
  );
}
