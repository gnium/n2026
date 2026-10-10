import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import ModalNuevoCliente from "./ModalNuevoCliente.jsx";

const hoyISO = () => new Date().toLocaleDateString("sv-SE");
const ITEMS_INICIALES = [
  { concepto: "Honorarios", monto: "" },
  { concepto: "Aportes y sellados", monto: "" },
  { concepto: "Certificados e informes", monto: "" },
  { concepto: "Diligenciamiento", monto: "" },
];
const TIPOS_ACTO = [
  ["compraventa", "Compraventa"],
  ["donacion", "Donación"],
  ["hipoteca", "Hipoteca"],
  ["permuta", "Permuta"],
  ["cesion", "Cesión"],
  ["sucesion", "Sucesión"],
  ["poder", "Poder"],
  ["certificacion_firmas", "Certificación de firmas"],
  ["otro", "Otro"],
];
const NOMBRE_QUIEN_PAGA = { comprador: "Comprador", vendedor: "Vendedor", ambos: "Ambas partes", escribano: "Escribano", cliente: "Cliente" };

export function formatoMonto(n, moneda) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, minimumFractionDigits: 2 }).format(Number(n) || 0);
}

export function parseMonto(texto) {
  if (typeof texto === "number") return texto;
  let s = String(texto ?? "").replace(/\s|\$/g, "").trim();
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  return Number(s);
}

export function enlaceWhatsApp(presupuesto, cliente) {
  const texto = `Presupuesto N° ${presupuesto.numero}${cliente?.nombre ? ` para ${cliente.nombre}` : ""}: total ${formatoMonto(presupuesto.total, presupuesto.moneda)}, válido por ${presupuesto.validezDias} días. Le adjunto el detalle en PDF.`;
  let tel = String(cliente?.telefono || "").replace(/\D/g, "");
  if (tel.startsWith("0")) tel = tel.slice(1);
  if (tel.length === 10) tel = `549${tel}`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

export default function PresupuestoModal({ abierto, presupuesto = null, expedienteId = null, clienteId = null, tipoActo: tipoActoProp = null, clientes = [], onCerrar, onGuardado }) {
  const dialogo = useRef(null);
  const [form, setForm] = useState(null);
  const [guardado, setGuardado] = useState(null);
  const [error, setError] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [clientesExtra, setClientesExtra] = useState([]);
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const todosClientes = [...clientes, ...clientesExtra.filter(c => !clientes.some(x => x.id === c.id))];

  useEffect(() => {
    if (abierto) {
      setError(null);
      setGuardado(null);
      setForm(
        presupuesto
          ? {
              ...presupuesto,
              items: presupuesto.items.map((it) => ({ concepto: it.concepto, monto: String(it.monto).replace(".", ","), quienPaga: it.quienPaga || null, categoria: it.categoria || null, esCalculado: it.esCalculado || false })),
              clienteId: presupuesto.clienteId || "",
              fecha: String(presupuesto.fecha).slice(0, 10),
              notas: presupuesto.notas || "",
              tipoActo: presupuesto.tipoActo || tipoActoProp || "",
              montoOperacion: presupuesto.montoOperacion ? String(presupuesto.montoOperacion).replace(".", ",") : "",
            }
          : {
              clienteId: clienteId || (clientes.length === 1 ? clientes[0].id : ""),
              fecha: hoyISO(),
              moneda: "ARS",
              validezDias: 15,
              items: ITEMS_INICIALES.map((it) => ({ ...it })),
              notas: "",
              tipoActo: tipoActoProp || "",
              montoOperacion: "",
            },
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
  const totalComprador = (form?.items || []).reduce((s, it) => {
    const m = parseMonto(it.monto) || 0;
    if (it.quienPaga === "ambos") return s + m / 2;
    if (["comprador", "cliente"].includes(it.quienPaga)) return s + m;
    return s;
  }, 0);
  const totalVendedor = (form?.items || []).reduce((s, it) => {
    const m = parseMonto(it.monto) || 0;
    if (it.quienPaga === "ambos") return s + m / 2;
    if (it.quienPaga === "vendedor") return s + m;
    return s;
  }, 0);
  const tieneDesglose = (form?.items || []).some((it) => it.quienPaga);
  const setItem = (i, parche) => setForm({ ...form, items: form.items.map((it, j) => (j === i ? { ...it, ...parche } : it)) });

  const calcularAranceles = async () => {
    const monto = parseMonto(form.montoOperacion);
    if (!form.tipoActo || !monto || monto <= 0) {
      setError("Ingresá el tipo de acto y el monto de la operación para calcular.");
      return;
    }
    setError(null);
    setCalculando(true);
    try {
      const jurisdiccion = window.__doyfe_jurisdiccion;
      if (!jurisdiccion) {
        setError("Configure la jurisdicción en Mi Escribanía antes de calcular aranceles.");
        return;
      }
      const condicionFiscal = window.__doyfe_condicion_fiscal || null;
      const r = await api.arancelesCalcular({ jurisdiccion, tipoActo: form.tipoActo, montoOperacion: monto, condicionFiscal });
      const itemsManuales = form.items.filter((it) => !it.esCalculado && it.concepto.trim());
      const itemsCalculados = r.items.map((it) => ({
        concepto: it.concepto,
        monto: String(it.monto).replace(".", ","),
        quienPaga: it.quienPaga,
        categoria: it.categoria,
        esCalculado: true,
      }));
      setForm({ ...form, items: [...itemsCalculados, ...itemsManuales] });
    } catch (e) {
      setError(e.message);
    } finally {
      setCalculando(false);
    }
  };

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
        tipoActo: form.tipoActo || null,
        montoOperacion: parseMonto(form.montoOperacion) || null,
        items: form.items.filter((it) => it.concepto.trim() || it.monto !== "").map((it) => ({
          concepto: it.concepto,
          monto: parseMonto(it.monto) || 0,
          quienPaga: it.quienPaga || null,
          categoria: it.categoria || null,
          esCalculado: it.esCalculado || false,
        })),
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

  return (<>
    <dialog ref={dialogo} className="modal modal-presupuesto" aria-labelledby="presupuesto-titulo" onClose={onCerrar} onClick={(e) => e.target === dialogo.current && onCerrar?.()}>
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
                <div className="campo">
                  <span className="campo-titulo">Cliente</span>
                  <div className="select-con-nuevo">
                    <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                      <option value="">Sin cliente</option>
                      {todosClientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <button type="button" className="boton chico" onClick={() => setNuevoCliente(true)} title="Crear nuevo cliente"><Icono nombre="mas" tamano={14} /></button>
                  </div>
                </div>
                <label className="campo"><span className="campo-titulo">Fecha</span><input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></label>
                <label className="campo"><span className="campo-titulo">Moneda</span>
                  <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}><option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option></select>
                </label>
                <label className="campo"><span className="campo-titulo">Validez (días)</span><input type="number" min="0" value={form.validezDias} onChange={(e) => setForm({ ...form, validezDias: e.target.value })} /></label>
              </div>

              <div className="presupuesto-calculo">
                <div className="cert-grid">
                  <label className="campo"><span className="campo-titulo">Tipo de acto</span>
                    <select value={form.tipoActo} onChange={(e) => setForm({ ...form, tipoActo: e.target.value })}>
                      <option value="">Seleccionar...</option>
                      {TIPOS_ACTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </label>
                  <div className="campo">
                    <label className="campo"><span className="campo-titulo">Monto de la operación</span>
                      <input type="text" inputMode="decimal" placeholder="0,00" value={form.montoOperacion} onChange={(e) => setForm({ ...form, montoOperacion: e.target.value })} />
                    </label>
                  </div>
                </div>
                <button type="button" className="boton" onClick={calcularAranceles} disabled={calculando || !form.tipoActo || !form.montoOperacion}>
                  {calculando ? "Calculando…" : "Calcular aranceles"}
                </button>
                <small className="ayuda">Calcula honorarios, sellos, aportes y tasas según la jurisdicción configurada.</small>
              </div>

              <div className="campo">
                <span className="campo-titulo">Conceptos</span>
                <div className="presupuesto-items">
                  {form.items.map((it, i) => (
                    <div className="presupuesto-item" key={i}>
                      <input type="text" aria-label={`Concepto ${i + 1}`} placeholder="Concepto" value={it.concepto} onChange={(e) => setItem(i, { concepto: e.target.value })} />
                      <input type="text" inputMode="decimal" aria-label={`Monto ${i + 1}`} placeholder="0,00" value={it.monto} onChange={(e) => setItem(i, { monto: e.target.value })} className={it.monto !== "" && Number.isNaN(parseMonto(it.monto)) ? "invalido" : ""} />
                      {it.quienPaga && <span className="etiqueta etiqueta-quien-paga">{NOMBRE_QUIEN_PAGA[it.quienPaga] || it.quienPaga}</span>}
                      <button type="button" className="boton discreto chico" aria-label={`Quitar concepto ${i + 1}`} onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}><Icono nombre="cruz" tamano={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="acciones">
                  <button type="button" className="boton chico" onClick={() => setForm({ ...form, items: [...form.items, { concepto: "", monto: "", quienPaga: null, categoria: null, esCalculado: false }] })}><Icono nombre="mas" tamano={14} /> Agregar concepto</button>
                  <strong className="presupuesto-total">Total {formatoMonto(total, form.moneda)}</strong>
                </div>
                {tieneDesglose && (
                  <div className="presupuesto-desglose">
                    <span>Comprador: <b>{formatoMonto(totalComprador, form.moneda)}</b></span>
                    <span>Vendedor: <b>{formatoMonto(totalVendedor, form.moneda)}</b></span>
                  </div>
                )}
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
    {nuevoCliente && <ModalNuevoCliente onCreado={(c) => { setClientesExtra(prev => [...prev, c]); setForm(f => ({ ...f, clienteId: c.id })); setNuevoCliente(false); }} onCerrar={() => setNuevoCliente(false)} />}
    </>
  );
}
