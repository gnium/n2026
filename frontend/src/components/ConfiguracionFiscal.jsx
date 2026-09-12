import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const COND_IVA = [["monotributo", "Responsable Monotributo"], ["responsable_inscripto", "IVA Responsable Inscripto"], ["exento", "IVA Exento"]];
const ENTORNOS = [["apagado", "Apagado (solo comprobantes internos)"], ["homologacion", "Homologación (pruebas de ARCA)"], ["produccion", "Producción"]];

const leerArchivo = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); });

/** Datos del emisor y credenciales ARCA de la cuenta. El certificado y la clave se cifran en el servidor y nunca vuelven. */
export default function ConfiguracionFiscal({ onCambio }) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [cert, setCert] = useState(null);
  const [clave, setClave] = useState(null);
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    const c = await api.configuracionFiscal();
    setCfg(c);
    setForm({ cuit: c.cuit, razonSocial: c.razonSocial, domicilioFiscal: c.domicilioFiscal, condicionIva: c.condicionIva, inicioActividades: c.inicioActividades ? String(c.inicioActividades).slice(0, 10) : "", puntoVenta: c.puntoVenta, arcaEntorno: c.arcaEntorno });
  };
  useEffect(() => {
    cargar().catch((e) => setEstado({ tipo: "error", texto: e.message }));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setEstado(null);
    try {
      const datos = { ...form, puntoVenta: Number(form.puntoVenta) };
      if (cert && clave) {
        datos.certificadoPem = await leerArchivo(cert);
        datos.clavePem = await leerArchivo(clave);
      }
      const c = await api.guardarConfiguracionFiscal(datos);
      setCfg(c);
      setCert(null);
      setClave(null);
      await cargar();
      setEstado({ tipo: "ok", texto: "Datos fiscales guardados." });
      onCambio?.(c);
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  const probar = async () => {
    setOcupado(true);
    setEstado({ tipo: "info", texto: "Consultando ARCA…" });
    try {
      const r = await api.probarArca();
      setEstado({ tipo: r.ok ? "ok" : "error", texto: r.mensaje });
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  const borrarCred = async () => {
    if (!window.confirm("¿Borrar el certificado y la clave de ARCA? Se apaga la factura electrónica.")) return;
    try {
      const c = await api.borrarCredencialesArca();
      setCfg(c);
      setForm({ ...form, arcaEntorno: "apagado" });
      setEstado({ tipo: "ok", texto: "Credenciales borradas." });
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    }
  };

  if (!form) return <p className="vacio" role="status">Cargando datos fiscales…</p>;

  return (
    <form id="config-fiscal" className="configuracion form-inline" onSubmit={guardar}>
      <h3>Datos fiscales y factura electrónica (ARCA)</h3>
      <p className="nota">Se imprimen en los comprobantes. Para facturas electrónicas se necesita el certificado y la clave privada generados en ARCA (homologación primero, vía WSASS); se guardan cifrados y no se vuelven a mostrar.</p>
      <div className="cert-grid">
        <label className="campo"><span className="campo-titulo">CUIT</span><input type="text" inputMode="numeric" placeholder="20-12345678-9" value={form.cuit} onChange={set("cuit")} /></label>
        <label className="campo"><span className="campo-titulo">Razón social / nombre</span><input type="text" maxLength={200} value={form.razonSocial} onChange={set("razonSocial")} /></label>
        <label className="campo"><span className="campo-titulo">Domicilio fiscal</span><input type="text" maxLength={300} value={form.domicilioFiscal} onChange={set("domicilioFiscal")} /></label>
        <label className="campo"><span className="campo-titulo">Condición frente al IVA</span>
          <select value={form.condicionIva} onChange={set("condicionIva")}>{COND_IVA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        <label className="campo"><span className="campo-titulo">Inicio de actividades</span><input type="date" value={form.inicioActividades} onChange={set("inicioActividades")} /></label>
        <label className="campo"><span className="campo-titulo">Punto de venta</span><input type="number" min="1" max="99999" value={form.puntoVenta} onChange={set("puntoVenta")} /></label>
        <label className="campo"><span className="campo-titulo">ARCA</span>
          <select value={form.arcaEntorno} onChange={set("arcaEntorno")}>{ENTORNOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        <div className="campo"><span className="campo-titulo">Credenciales</span>
          <span className="nota">{cfg.tieneCredenciales ? `Certificado cargado el ${new Date(cfg.arcaCargadoEn).toLocaleDateString("es-AR")}.` : "Sin certificado cargado."}</span>
        </div>
        <div className="campo"><span className="campo-titulo">Certificado (.crt / .pem)</span>
          <label className="boton archivo-boton"><Icono nombre="subir" tamano={14} /> {cert ? "Cambiar certificado" : "Elegir certificado"}<input type="file" className="sr-only" accept=".crt,.pem,.cer" onChange={(e) => setCert(e.target.files?.[0] || null)} /></label>
          {cert && <span className="nota">{cert.name}</span>}
        </div>
        <div className="campo"><span className="campo-titulo">Clave privada (.key / .pem)</span>
          <label className="boton archivo-boton"><Icono nombre="subir" tamano={14} /> {clave ? "Cambiar clave" : "Elegir clave privada"}<input type="file" className="sr-only" accept=".key,.pem" onChange={(e) => setClave(e.target.files?.[0] || null)} /></label>
          {clave && <span className="nota">{clave.name}</span>}
        </div>
      </div>
      {estado && <p className={`alerta ${estado.tipo === "ok" ? "ok" : estado.tipo === "error" ? "error" : ""}`} role={estado.tipo === "error" ? "alert" : "status"}>{estado.texto}</p>}
      <div className="acciones">
        <button type="submit" className="boton primario" disabled={ocupado}>Guardar datos fiscales</button>
        <button type="button" className="boton" onClick={probar} disabled={ocupado || cfg.arcaEntorno === "apagado"}>Probar conexión con ARCA</button>
        {cfg.tieneCredenciales && <button type="button" className="boton" onClick={borrarCred} disabled={ocupado}>Borrar credenciales</button>}
        {cfg.arcaEntorno === "apagado" && <span className="ayuda">Para probar la conexión, elegí homologación o producción y guardá con las credenciales cargadas.</span>}
      </div>
    </form>
  );
}
