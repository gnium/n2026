import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

/**
 * Pantallas de acceso: ingresar, crear cuenta, olvide mi contrasena y
 * restablecer (cuando la URL trae ?token=...).
 */
export default function Acceso({ onIngreso, invitacion = null }) {
  const tokenUrl = new URLSearchParams(window.location.search).get("token");
  const [vista, setVista] = useState(tokenUrl ? "restablecer" : "login");
  const [form, setForm] = useState({ email: "", password: "", password2: "", nombre: "", codigo: "" });
  const [inv, setInv] = useState(null);
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
        const r = await api.registro({ email: form.email, password: form.password, nombre: form.nombre, codigo: form.codigo, invitacion: invitacion || undefined });
        onIngreso(r.usuario);
      } else if (vista === "recuperar") {
        const r = await api.recuperar(form.email);
        setAviso(r.mensaje);
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

  const titulo = { login: "Ingresar", registro: "Crear cuenta", recuperar: "Recuperar contraseña", restablecer: "Elegir nueva contraseña" }[vista];

  return (
    <div className="acceso">
      <div className="acceso-caja">
        <div className="sidebar-marca">
          <span className="marca-sello" aria-hidden="true"><Icono nombre="sello" tamano={20} /></span>
          <strong>Doy Fe</strong>
        </div>
        <p className="subtitulo">IA para escribanías: la escritura lista para revisar, los datos en tu escribanía.</p>
        <h2>{titulo}</h2>

        {inv && (
          <p className="alerta ok" role="status">
            Lo invitaron a <b>{inv.equipo}</b> como <b>{inv.rol === "escribano" ? "Escribano/a" : "Empleado/a"}</b>. Ingrese con <b>{inv.email}</b> (o cree la cuenta con ese correo) y la invitación se acepta sola.
          </p>
        )}

        <form onSubmit={enviar} className="acceso-form">
          {vista !== "restablecer" && (
            <label>
              Correo electrónico
              <input type="email" autoComplete="email" required {...campo("email")} />
            </label>
          )}
          {vista === "registro" && (
            <label>
              Nombre <small>(opcional)</small>
              <input type="text" autoComplete="name" {...campo("nombre")} />
            </label>
          )}
          {vista !== "recuperar" && (
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
          {vista === "registro" && (
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
            {cargando ? "Un momento…" : titulo}
          </button>
        </form>

        <nav className="acceso-enlaces" aria-label="Otras opciones">
          {vista !== "login" && (
            <button className="enlace" onClick={() => setVista("login")}>
              Ya tengo cuenta
            </button>
          )}
          {vista !== "registro" && vista !== "restablecer" && (
            <button className="enlace" onClick={() => setVista("registro")}>
              Crear cuenta
            </button>
          )}
          {vista === "login" && (
            <button className="enlace" onClick={() => setVista("recuperar")}>
              Olvidé mi contraseña
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}
