import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const hoyISO = () => new Date().toLocaleDateString("sv-SE");
const ITEMS_INICIALES = [
  { concepto: "Honorarios", monto: "" },
  { concepto: "Aportes y sellados", monto: "" },
  { concepto: "Certificados e informes", monto: "" },
];

export function formatoMonto(n, moneda) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, minimumFractionDigits: 2 }).format(Number(n) || 0);
}

/** Acepta "850.000,50", "850000,50", "850000.50" y "1.250" (miles). Devuelve un número o NaN. */
export function parseMonto(texto) {
  if (typeof texto === "number") return texto;
  let s = String(texto ?? "").replace(/\s|\$/g, "").trim();
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  return Number(s);
}

/** Arma el enlace de WhatsApp con el resumen; el PDF se adjunta a mano (WhatsApp no acepta adjuntos por URL). */
export function enlaceWhatsApp(presupuesto, cliente) {
  const texto = `Presupuesto N° ${presupuesto.numero}${cliente?.nombre ? ` para ${cliente.nombre}` : ""}: total ${formatoMonto(presupuesto.total, presupuesto.moneda)}, válido por ${presupuesto.validezDias} días. Le adjunto el detalle en PDF.`;
  let tel = String(cliente?.telefono || "").replace(/\D/g, "");
  if (tel.startsWith("0")) tel = tel.slice(1);
  if (tel.length === 10) tel = `549${tel}`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

/**
 * Alta/edicion de presupuesto en un dialogo modal. `clientes` son las opciones
 * del selector (id, nombre, telefono); `expedienteId`/`clienteId` prellenan los vinculos.
 */
export default function PresupuestoModal({ abierto, presupuesto = null, expedienteId = null, clienteId = null, clientes = [], onCerrar, onGuardado }) {
  const dialogo = useRef(null);
  const [form, setForm] = useState(null);
  const [guardado, setGuardado] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (abierto) {
      setError(null);
      setGuardado(null);
      setForm(
        presupuesto
          ? { ...presupuesto, items: presupuesto.items.map((it) => ({ concepto: it.concepto, monto: String(it.monto).replace(".", ",") })), clienteId: presupuesto.clienteId || "", fecha: String(presupuesto.fecha).slice(0, 10), notas: presupuesto.notas || "" }
          : { clienteId: clienteId || (clientes.length === 1 ? clientes[0].id : ""), fecha: hoyISO(), moneda: "ARS", validezDias: 15, items: ITEMS_INICIALES.map((it) => ({ ...it })), notas: "" },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, presupuesto]);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      d.querySelector("select, input")?.focus();
    } else if (!abierto && d.open) d.close();
  }, [abierto]);

  const total = (form?.items || []).reduce((s, it) => s + (parseMonto(it.monto) || 0), 0);
  const setItem = (i, parche) => setForm({ ...form, items: form.items.map((it, j) => (j === i ? { ...it, ...parche } : it)) });

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const datos = {
        expedienteId: expedienteId || presupuesto?.expedienteId || null,
        clienteId: form.clienteId ? Number(form.clienteId) : null,
        fecha: form.fecha,
        moneda: form.moneda,
        validezDias: Number(form.validezDias),
        items: form.items.filter((it) => it.concepto.trim() || it.monto !== "").map((it) => ({ concepto: it.concepto, monto: parseMonto(it.monto) || 0 })),
        notas: form.notas,
      };
      const r = presupuesto ? await api.presupuestoActualizar(presupuesto.id, datos) : await api.presupuestoCrear(datos);
      setGuardado(r);
      onGuardado?.(r);
      setTimeout(() => document.getElementById("presupuesto-titulo")?.focus(), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  const cliente = clientes.find((c) => String(c.id) === String(form?.clienteId));

  return (
    <dialog ref={dialogo} className="modal" aria-labelledby="presupuesto-titulo" onClose={onCerrar} onClick={(e) => e.target === dialogo.current && onCerrar?.()}>
      {form && (
        <form className="cert-form modal-caja" onSubmit={guardar}>
          <div className="protocolo-cabecera">
            <h3 id="presupuesto-titulo" tabIndex={-1}>{guardado ? `Presupuesto N° ${guardado.numero}` : presupuesto ? `Editar presupuesto N° ${presupuesto.numero}` : "Nuevo presupuesto"}</h3>
            <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="cruz" tamano={16} /></button>
          </div>
          {error && <p className="alerta error" role="alert">{error}</p>}

          {guardado ? (
            <>
              <p className="alerta ok" role="status">Guardado. Total {formatoMonto(guardado.total, guardado.moneda)}.</p>
              <div className="acciones">
                <a className="boton primario" href={api.presupuestoUrlPdf(guardado.id)} download><Icono nombre="descargar" tamano={16} /> Descargar PDF</a>
                <a className="boton" href={enlaceWhatsApp(guardado, cliente)} target="_blank" rel="noreferrer"><Icono nombre="chat" tamano={16} /> Enviar por WhatsApp</a>
                <button type="button" className="boton" onClick={onCerrar}>Cerrar</button>
              </div>
              <p className="ayuda">WhatsApp abre con el resumen escrito; el PDF descargado se adjunta desde el chat.</p>
            </>
          ) : (
            <>
              <div className="cert-grid">
                <label className="campo"><span className="campo-titulo">Cliente</span>
                  <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                    <option value="">Sin cliente</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
                <label className="campo"><span className="campo-titulo">Fecha</span><input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></label>
                <label className="campo"><span className="campo-titulo">Moneda</span>
                  <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}><option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option></select>
                </label>
                <label className="campo"><span className="campo-titulo">Validez (días)</span><input type="number" min="0" value={form.validezDias} onChange={(e) => setForm({ ...form, validezDias: e.target.value })} /></label>
              </div>

              <div className="campo">
                <span className="campo-titulo">Conceptos</span>
                <div className="presupuesto-items">
                  {form.items.map((it, i) => (
                    <div className="presupuesto-item" key={i}>
                      <input type="text" aria-label={`Concepto ${i + 1}`} placeholder="Concepto" value={it.concepto} onChange={(e) => setItem(i, { concepto: e.target.value })} />
                      <input type="text" inputMode="decimal" aria-label={`Monto ${i + 1}`} placeholder="0,00" value={it.monto} onChange={(e) => setItem(i, { monto: e.target.value })} className={it.monto !== "" && Number.isNaN(parseMonto(it.monto)) ? "invalido" : ""} />
                      <button type="button" className="boton discreto chico" aria-label={`Quitar concepto ${i + 1}`} onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}><Icono nombre="cruz" tamano={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="acciones">
                  <button type="button" className="boton chico" onClick={() => setForm({ ...form, items: [...form.items, { concepto: "", monto: "" }] })}><Icono nombre="mas" tamano={14} /> Agregar concepto</button>
                  <strong className="presupuesto-total">Total {formatoMonto(total, form.moneda)}</strong>
                </div>
              </div>

              <label className="campo"><span className="campo-titulo">Notas para el cliente <small>(opcional)</small></span><textarea rows={2} maxLength={500} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></label>
              <div className="acciones">
                <button type="submit" className="boton primario">Guardar</button>
                <button type="button" className="boton" onClick={onCerrar}>Cancelar</button>
              </div>
            </>
          )}
        </form>
      )}
    </dialog>
  );
}
