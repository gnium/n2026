import { useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const VACIO = { tipo: "persona", nombre: "", documento: "", cuit: "", domicilio: "", telefono: "", email: "", estadoCivil: "", estadoCivilObs: "", actaPresentada: false, sentenciaPresentada: false, nacionalidad: "", observaciones: "" };
const ESTADOS_CIVILES = [["soltero", "Soltero/a"], ["casado", "Casado/a"], ["divorciado", "Divorciado/a"], ["viudo", "Viudo/a"], ["union_convivencial", "Unión convivencial"]];
const REQUIERE_DOCUMENTACION = new Set(["divorciado", "union_convivencial"]);

export default function ModalNuevoCliente({ onCreado, onCerrar }) {
  const [form, setForm] = useState({ ...VACIO });
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const campo = (k) => ({ name: k, value: form[k] ?? "", onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const creado = await api.clienteCrear({ ...form });
      onCreado(creado);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal custodia-modal">
        <form className="cert-form" onSubmit={guardar}>
          <div className="protocolo-cabecera">
            <h3>Nuevo cliente</h3>
            <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="cruz" tamano={16} /></button>
          </div>
          {error && <p className="alerta error" role="alert">{error}</p>}
          <div className="cert-grid">
            <label className="campo"><span className="campo-titulo">Tipo</span>
              <select {...campo("tipo")}><option value="persona">Persona</option><option value="sociedad">Sociedad</option></select>
            </label>
            <label className="campo"><span className="campo-titulo">Nombre y apellido / razón social</span><input type="text" required maxLength={200} autoFocus {...campo("nombre")} /></label>
            {form.tipo === "persona" && <label className="campo"><span className="campo-titulo">DNI</span><input type="text" {...campo("documento")} /></label>}
            <label className="campo"><span className="campo-titulo">CUIT / CUIL</span><input type="text" {...campo("cuit")} /></label>
            <label className="campo"><span className="campo-titulo">Domicilio</span><input type="text" {...campo("domicilio")} /></label>
            <label className="campo"><span className="campo-titulo">Teléfono</span><input type="tel" placeholder="11 5555 1234" {...campo("telefono")} /></label>
            <label className="campo"><span className="campo-titulo">Correo</span><input type="email" {...campo("email")} /></label>
            {form.tipo === "persona" && (
              <label className="campo"><span className="campo-titulo">Estado civil</span>
                <select {...campo("estadoCivil")}>
                  <option value="">Sin indicar</option>
                  {ESTADOS_CIVILES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
            )}
            {form.tipo === "persona" && REQUIERE_DOCUMENTACION.has(form.estadoCivil) && (
              <div className="campo">
                <span className="campo-titulo">Documentación presentada</span>
                <label className="campo-check"><input type="checkbox" checked={Boolean(form.actaPresentada)} onChange={(e) => setForm({ ...form, actaPresentada: e.target.checked })} /> Presenta acta {form.estadoCivil === "divorciado" ? "de divorcio" : "de unión convivencial"}</label>
                <label className="campo-check"><input type="checkbox" checked={Boolean(form.sentenciaPresentada)} onChange={(e) => setForm({ ...form, sentenciaPresentada: e.target.checked })} /> Presenta sentencia {form.estadoCivil === "divorciado" ? "de divorcio" : "de inscripción"}</label>
              </div>
            )}
            {form.tipo === "persona" && <label className="campo"><span className="campo-titulo">Nacionalidad</span><input type="text" {...campo("nacionalidad")} /></label>}
          </div>
          <label className="campo"><span className="campo-titulo">Observaciones <small>(opcional)</small></span><textarea rows={2} maxLength={500} {...campo("observaciones")} /></label>
          <div className="acciones">
            <button type="submit" className="boton primario" disabled={guardando}>{guardando ? "Guardando…" : "Crear cliente"}</button>
            <button type="button" className="boton" onClick={onCerrar}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
