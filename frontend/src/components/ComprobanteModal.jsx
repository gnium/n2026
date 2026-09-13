import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import { formatoMonto, parseMonto } from "./PresupuestoModal.jsx";

const hoyISO = () => new Date().toLocaleDateString("sv-SE");
export const TIPOS_COMPROBANTE = [["recibo", "Recibo"], ["nota_honorarios", "Nota de honorarios"], ["factura_c", "Factura C"], ["factura_b", "Factura B"], ["factura_a", "Factura A"]];
const ES_FACTURA = (t) => t.startsWith("factura_");
const COND_IVA = [["consumidor_final", "Consumidor final"], ["responsable_inscripto", "Responsable inscripto"], ["monotributo", "Monotributo"], ["exento", "Exento"]];
const IVA_OPCIONES = [["gravado_21", "IVA 21%", 0.21], ["gravado_10_5", "IVA 10,5%", 0.105], ["gravado_27", "IVA 27%", 0.27], ["exento", "Exento", 0], ["no_gravado", "No gravado", 0]];
const TASA_IVA = Object.fromEntries(IVA_OPCIONES.map(([v, , t]) => [v, t]));
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Emision de comprobantes. `presupuesto` prellena cliente, expediente e items;
 * `config` (configuracionFiscal) decide si se ofrecen facturas electronicas.
 */
export default function ComprobanteModal({ abierto, presupuesto = null, clientes = [], expedientes = [], config = null, onCerrar, onEmitido }) {
  const dialogo = useRef(null);
  const [form, setForm] = useState(null);
  const [emitido, setEmitido] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const arcaActivo = config && config.arcaEntorno !== "apagado";
  const emisorRI = config?.condicionIva === "responsable_inscripto";
  const tiposDisponibles = TIPOS_COMPROBANTE.filter(([v]) => !ES_FACTURA(v) || (arcaActivo && (emisorRI ? v !== "factura_c" : v === "factura_c")));

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setEmitido(null);
    setForm({
      tipo: "recibo",
      clienteId: presupuesto?.clienteId || (clientes.length === 1 ? clientes[0].id : ""),
      expedienteId: presupuesto?.expedienteId || "",
      fecha: hoyISO(),
      moneda: presupuesto?.moneda || "ARS",
      cotizacion: "",
      condicionIvaReceptor: "consumidor_final",
      items: presupuesto?.items?.length ? presupuesto.items.map((it) => ({ concepto: it.concepto, monto: String(it.monto).replace(".", ","), iva: "gravado_21" })) : [{ concepto: "Honorarios", monto: "", iva: "gravado_21" }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, presupuesto]);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      d.querySelector("select")?.focus();
    } else if (!abierto && d.open) d.close();
  }, [abierto]);

  const discrimina = Boolean(form && ES_FACTURA(form.tipo) && form.tipo !== "factura_c" && emisorRI);
  const neto = r2((form?.items || []).reduce((s, it) => s + (parseMonto(it.monto) || 0), 0));
  const iva = discrimina ? r2((form?.items || []).reduce((s, it) => s + r2((parseMonto(it.monto) || 0) * (TASA_IVA[it.iva] ?? 0.21)), 0)) : 0;
  const total = r2(neto + iva);
  const setItem = (i, parche) => setForm({ ...form, items: form.items.map((it, j) => (j === i ? { ...it, ...parche } : it)) });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const emitir = async (e) => {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const r = await api.comprobanteEmitir({
        tipo: form.tipo,
        clienteId: form.clienteId ? Number(form.clienteId) : null,
        expedienteId: form.expedienteId ? Number(form.expedienteId) : null,
        presupuestoId: presupuesto?.id || null,
        fecha: form.fecha,
        moneda: form.moneda,
        cotizacion: form.cotizacion ? parseMonto(form.cotizacion) : null,
        condicionIvaReceptor: form.condicionIvaReceptor,
        items: form.items.filter((it) => it.concepto.trim() || it.monto !== "").map((it) => ({ concepto: it.concepto, monto: parseMonto(it.monto) || 0, iva: it.iva })),
      });
      setEmitido(r);
      onEmitido?.(r);
      setTimeout(() => document.getElementById("comprobante-titulo")?.focus(), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <dialog ref={dialogo} className="modal" aria-labelledby="comprobante-titulo" onClose={onCerrar} onClick={(e) => e.target === dialogo.current && onCerrar?.()}>
      {form && (
        <form className="cert-form modal-caja" onSubmit={emitir}>
          <div className="protocolo-cabecera">
            <h3 id="comprobante-titulo" tabIndex={-1}>{emitido ? `${emitido.tipoNombre} ${emitido.numeroCompleto}` : "Emitir comprobante"}</h3>
            <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="cruz" tamano={16} /></button>
          </div>
          {error && <p className="alerta error" role="alert">{error}</p>}
          {emitido ? (
            <>
              <p className="alerta ok" role="status">Emitido por {formatoMonto(emitido.total, emitido.moneda)}{emitido.cae ? ` · CAE ${emitido.cae}` : ""}. El cargo quedó en la cuenta corriente del cliente.</p>
              <div className="acciones">
                <a className="boton primario" href={api.comprobanteUrlPdf(emitido.id)} download><Icono nombre="descargar" tamano={16} /> Descargar PDF</a>
                <button type="button" className="boton" onClick={onCerrar}>Cerrar</button>
              </div>
            </>
          ) : (
            <>
              <div className="cert-grid">
                <label className="campo"><span className="campo-titulo">Tipo</span>
                  <select value={form.tipo} onChange={set("tipo")}>
                    {tiposDisponibles.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </label>
                <label className="campo"><span className="campo-titulo">Cliente {ES_FACTURA(form.tipo) && <small>(obligatorio)</small>}</span>
                  <select value={form.clienteId} onChange={set("clienteId")} required={ES_FACTURA(form.tipo)}>
                    <option value="">{ES_FACTURA(form.tipo) ? "Elegir…" : "Consumidor final / sin cliente"}</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
                <label className="campo"><span className="campo-titulo">Expediente <small>(opcional)</small></span>
                  <select value={form.expedienteId} onChange={set("expedienteId")}>
                    <option value="">Sin expediente</option>
                    {expedientes.map((x) => <option key={x.id} value={x.id}>{x.caratula}</option>)}
                  </select>
                </label>
                <label className="campo"><span className="campo-titulo">Fecha</span><input type="date" required value={form.fecha} onChange={set("fecha")} /></label>
                <label className="campo"><span className="campo-titulo">Moneda</span>
                  <select value={form.moneda} onChange={set("moneda")}><option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option></select>
                </label>
                {form.moneda === "USD" && ES_FACTURA(form.tipo) && <label className="campo"><span className="campo-titulo">Cotización USD→ARS <small>(opcional)</small></span><input type="text" inputMode="decimal" placeholder="Vacío: cotización oficial de ARCA" value={form.cotizacion} onChange={set("cotizacion")} /></label>}
                {ES_FACTURA(form.tipo) && (
                  <label className="campo"><span className="campo-titulo">Condición IVA del receptor</span>
                    <select value={form.condicionIvaReceptor} onChange={set("condicionIvaReceptor")}>{COND_IVA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                  </label>
                )}
              </div>
              {!ES_FACTURA(form.tipo) && <p className="ayuda">Recibos y notas de honorarios son comprobantes internos: no válidos como factura.</p>}
              {ES_FACTURA(form.tipo) && <p className="ayuda">Se solicita el CAE a ARCA ({config.arcaEntorno}) con los datos fiscales de la cuenta. Si ARCA rechaza el comprobante, no se emite.{discrimina ? " Los importes se cargan sin IVA; el IVA se calcula por concepto." : ""}</p>}
              <div className="campo">
                <span className="campo-titulo">Conceptos</span>
                <div className="presupuesto-items">
                  {form.items.map((it, i) => (
                    <div className={`presupuesto-item ${discrimina ? "con-iva" : ""}`} key={i}>
                      <input type="text" aria-label={`Concepto ${i + 1}`} placeholder="Concepto" value={it.concepto} onChange={(e) => setItem(i, { concepto: e.target.value })} />
                      {discrimina && <select aria-label={`IVA del concepto ${i + 1}`} value={it.iva || "gravado_21"} onChange={(e) => setItem(i, { iva: e.target.value })}>{IVA_OPCIONES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                      <input type="text" inputMode="decimal" aria-label={`Importe ${i + 1}${it.monto !== "" && Number.isNaN(parseMonto(it.monto)) ? " (importe inválido, por ejemplo 12.500,00)" : ""}`} placeholder="0,00" value={it.monto} onChange={(e) => setItem(i, { monto: e.target.value })} aria-invalid={it.monto !== "" && Number.isNaN(parseMonto(it.monto)) ? true : undefined} className={it.monto !== "" && Number.isNaN(parseMonto(it.monto)) ? "invalido" : ""} />
                      <button type="button" className="boton discreto chico" aria-label={`Quitar concepto ${i + 1}`} onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}><Icono nombre="cruz" tamano={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="acciones">
                  <button type="button" className="boton chico" onClick={() => setForm({ ...form, items: [...form.items, { concepto: "", monto: "" }] })}><Icono nombre="mas" tamano={14} /> Agregar concepto</button>
                  {discrimina ? (
                    <div className="desglose" aria-live="polite">
                      <span>Neto {formatoMonto(neto, form.moneda)}</span>
                      <span>IVA {formatoMonto(iva, form.moneda)}</span>
                      <strong className="presupuesto-total">Total {formatoMonto(total, form.moneda)}</strong>
                    </div>
                  ) : (
                    <strong className="presupuesto-total">Total {formatoMonto(total, form.moneda)}</strong>
                  )}
                </div>
              </div>
              <div className="acciones">
                <button type="submit" className="boton primario" aria-disabled={ocupado} aria-busy={ocupado} onClick={(e) => ocupado && e.preventDefault()}>{ocupado ? "Emitiendo…" : "Emitir"}</button>
                <button type="button" className="boton" onClick={onCerrar}>Cancelar</button>
              </div>
            </>
          )}
        </form>
      )}
    </dialog>
  );
}
