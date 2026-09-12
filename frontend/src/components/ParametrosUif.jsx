import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatoMonto, parseMonto } from "./PresupuestoModal.jsx";
import { fechaCorta } from "./Expedientes.jsx";

/** Parametros UIF (solo administradora): SMVM vigente y umbral en SMVM. Orientativos: verificar contra la resolucion vigente. */
export default function ParametrosUif() {
  const [form, setForm] = useState(null);
  const [estado, setEstado] = useState(null);
  const aForm = (p) => ({ smvmArs: p.smvmArs ? formatoMonto(p.smvmArs, "ARS").replace(/^\$\s?/, "") : "", umbralSmvm: String(p.umbralSmvm), actualizadoEn: p.actualizadoEn });

  useEffect(() => {
    api.uifParametros().then((p) => setForm(aForm(p))).catch((e) => setEstado({ tipo: "error", texto: e.message }));
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setEstado(null);
    try {
      const p = await api.uifGuardarParametros({ smvmArs: parseMonto(form.smvmArs), umbralSmvm: Number(form.umbralSmvm) });
      setForm(aForm(p));
      setEstado({ tipo: "ok", texto: `Guardado. Umbral de compraventa de inmuebles: ${formatoMonto(p.umbralArs, "ARS")}.` });
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    }
  };

  if (!form) return null;
  const smvm = parseMonto(form.smvmArs);
  const umbral = Number.isFinite(smvm) ? smvm * Number(form.umbralSmvm || 0) : null;
  return (
    <form className="configuracion form-inline" onSubmit={guardar}>
      <h3>Parámetros UIF</h3>
      <p className="nota">El salario mínimo vital y móvil cambia varias veces al año: cargar el valor vigente para que el umbral de compraventa de inmuebles (en SMVM, Res. UIF 242/2023) se calcule bien. Valores orientativos: verificar contra la resolución vigente.</p>
      <div className="cert-grid">
        <label className="campo"><span className="campo-titulo">SMVM vigente (ARS)</span><input type="text" inputMode="decimal" value={form.smvmArs} onChange={(e) => setForm({ ...form, smvmArs: e.target.value })} onBlur={() => Number.isFinite(smvm) && smvm > 0 && setForm({ ...form, smvmArs: formatoMonto(smvm, "ARS").replace(/^\$\s?/, "") })} /></label>
        <label className="campo"><span className="campo-titulo">Umbral (en SMVM)</span><input type="number" min="1" value={form.umbralSmvm} onChange={(e) => setForm({ ...form, umbralSmvm: e.target.value })} /></label>
      </div>
      <p className="ayuda">{form.actualizadoEn ? `SMVM actualizado el ${fechaCorta(String(form.actualizadoEn).slice(0, 10))}` : "SMVM sin cargar"}{umbral ? ` · umbral vigente: ${formatoMonto(umbral, "ARS")}` : ""}.</p>
      {estado && <p className={`alerta ${estado.tipo}`} role={estado.tipo === "error" ? "alert" : "status"}>{estado.texto}</p>}
      <div className="acciones"><button type="submit" className="boton primario">Guardar parámetros UIF</button></div>
    </form>
  );
}
