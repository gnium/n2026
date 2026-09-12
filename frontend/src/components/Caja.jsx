import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import { fechaCorta } from "./Expedientes.jsx";
import { formatoMonto, parseMonto } from "./PresupuestoModal.jsx";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const MEDIOS = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["mercadopago", "Mercado Pago"], ["cheque", "Cheque"], ["otro", "Otro"]];
const NOMBRE_MEDIO = Object.fromEntries(MEDIOS);
const NOMBRE_ORIGEN = { presupuesto: "presupuesto", comprobante: "comprobante", manual: "manual" };

export default function Caja() {
  const [preset, setPreset] = useState("30");
  const [clienteId, setClienteId] = useState("");
  const [resumen, setResumen] = useState(null);
  const [movs, setMovs] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [expedientes, setExpedientes] = useState([]);
  const [form, setForm] = useState(null); // { tipo: 'pago'|'cargo', ... }
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const dialogo = useRef(null);

  const filtros = () => ({ clienteId, desde: preset === "todo" ? "" : haceDias(Number(preset)), hasta: "" });

  const cargar = async () => {
    setError(null);
    try {
      const [r, m] = await Promise.all([api.movimientosResumen(filtros()), api.movimientosListar(filtros())]);
      setResumen(r);
      setMovs(m);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, clienteId]);

  useEffect(() => {
    api.clientesListar().then(setClientes).catch(() => setClientes([]));
    api.expedientesListar().then((l) => setExpedientes(l.filter((e) => e.estado === "abierto" || e.estado === "en_firma"))).catch(() => setExpedientes([]));
  }, []);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (form && !d.open) {
      d.showModal();
      d.querySelector("select, input")?.focus();
    } else if (!form && d.open) d.close();
  }, [form]);

  const abrir = (tipo) => {
    setError(null);
    setAviso(null);
    setForm({ tipo, clienteId: clienteId || (clientes.length === 1 ? clientes[0].id : ""), expedienteId: "", fecha: hoyISO(), monto: "", moneda: "ARS", medioPago: "transferencia", concepto: tipo === "pago" ? "Pago" : "", referencia: "" });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const datos = { clienteId: Number(form.clienteId), expedienteId: form.expedienteId ? Number(form.expedienteId) : null, fecha: form.fecha, monto: parseMonto(form.monto), moneda: form.moneda, concepto: form.concepto, referencia: form.referencia };
      if (form.tipo === "pago") await api.pagoRegistrar({ ...datos, medioPago: form.medioPago });
      else await api.cargoCrear(datos);
      setForm(null);
      await cargar();
      setAviso(form.tipo === "pago" ? "Pago registrado." : "Cargo registrado.");
    } catch (err) {
      setError(err.message);
    }
  };

  const borrar = async (m) => {
    if (!window.confirm(`¿Borrar el ${m.tipo} manual "${m.concepto}" de ${formatoMonto(m.monto, m.moneda)}?`)) return;
    setError(null);
    try {
      await api.movimientoBorrar(m.id);
      await cargar();
      setAviso("Movimiento borrado.");
    } catch (err) {
      setError(err.message);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="caja">
      <h2>Caja</h2>
      <p className="nota">Cuenta corriente por cliente. Los cargos nacen de presupuestos aceptados y comprobantes emitidos (o se cargan a mano); los pagos se registran a mano. Montos y conceptos se guardan en texto plano.</p>
      {error && !form && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      <div className="acciones agenda-toolbar">
        <div className="acciones">
          <div className="segmentado" role="group" aria-label="Período">
            {[["30", "30 días"], ["90", "90 días"], ["365", "12 meses"], ["todo", "Todo"]].map(([v, t]) => (
              <button type="button" key={v} className={preset === v ? "activo" : ""} aria-pressed={preset === v} onClick={() => setPreset(v)}>{t}</button>
            ))}
          </div>
          <label className="campo"><span className="sr-only">Cliente</span>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        </div>
        <div className="acciones">
          <a className="boton" href={api.movimientosUrlCsv(filtros())} download><Icono nombre="descargar" tamano={16} /> CSV</a>
          <button type="button" className="boton" onClick={() => abrir("cargo")} disabled={!clientes.length}>Nuevo cargo</button>
          <button type="button" className="boton primario" onClick={() => abrir("pago")} disabled={!clientes.length}><Icono nombre="mas" tamano={16} /> Registrar pago</button>
        </div>
      </div>

      {resumen && (
        <div className="consumo-cards">
          {(resumen.length ? resumen : [{ moneda: "ARS", pendiente: 0, pagosPeriodo: 0, cargosPeriodo: 0, cantidadPagos: 0 }]).map((r) => (
            <div className="consumo-card" key={r.moneda}>
              <span className={`consumo-card-valor saldo ${r.pendiente > 0 ? "positivo" : ""}`}>{formatoMonto(r.pendiente, r.moneda)}</span>
              <span className="consumo-card-etiqueta">pendiente de cobro · {r.moneda}</span>
              <span className="nota">Cobrado en el período: {formatoMonto(r.pagosPeriodo, r.moneda)} ({r.cantidadPagos} pago{r.cantidadPagos === 1 ? "" : "s"}) · cargado: {formatoMonto(r.cargosPeriodo, r.moneda)}</span>
            </div>
          ))}
        </div>
      )}

      {movs === null ? (
        <p className="vacio">Cargando…</p>
      ) : movs.length === 0 ? (
        <p className="vacio">Sin movimientos en el período.</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Cliente</th><th scope="col">Concepto</th><th scope="col" className="num">Cargo</th><th scope="col" className="num">Pago</th><th scope="col" className="col-sec">Medio / origen</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td>{fechaCorta(m.fecha)}</td>
                  <td>{m.clienteNombre || "—"}</td>
                  <td>{m.concepto}{m.expedienteCaratula && <span className="nota col-sec"> · {m.expedienteCaratula}</span>}</td>
                  <td className="num">{m.tipo === "cargo" ? formatoMonto(m.monto, m.moneda) : ""}</td>
                  <td className="num">{m.tipo === "pago" ? formatoMonto(m.monto, m.moneda) : ""}</td>
                  <td className="col-sec">{m.tipo === "pago" ? `${NOMBRE_MEDIO[m.medioPago] || m.medioPago || ""}${m.referencia ? ` · ${m.referencia}` : ""}` : NOMBRE_ORIGEN[m.origen]}</td>
                  <td>{m.origen === "manual" && <button type="button" className="enlace" aria-label={`Borrar ${m.tipo} ${m.concepto}`} onClick={() => borrar(m)}>borrar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dialog ref={dialogo} className="modal" aria-labelledby="caja-form-titulo" onClose={() => setForm(null)} onClick={(e) => e.target === dialogo.current && setForm(null)}>
        {form && (
          <form className="cert-form modal-caja" onSubmit={guardar}>
            <div className="protocolo-cabecera">
              <h3 id="caja-form-titulo">{form.tipo === "pago" ? "Registrar pago" : "Nuevo cargo"}</h3>
              <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={() => setForm(null)}><Icono nombre="cruz" tamano={16} /></button>
            </div>
            {error && <p className="alerta error" role="alert">{error}</p>}
            <div className="cert-grid">
              <label className="campo"><span className="campo-titulo">Cliente</span>
                <select required value={form.clienteId} onChange={set("clienteId")}>
                  <option value="">Elegir…</option>
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
              <div className="campo">
                <label className="campo"><span className="campo-titulo">Monto</span><input type="text" inputMode="decimal" required placeholder="0,00" value={form.monto} onChange={set("monto")} aria-invalid={form.monto !== "" && !(parseMonto(form.monto) > 0) ? true : undefined} aria-describedby={form.monto !== "" && !(parseMonto(form.monto) > 0) ? "caja-monto-error" : undefined} className={form.monto !== "" && !(parseMonto(form.monto) > 0) ? "invalido" : ""} /></label>
                {form.monto !== "" && !(parseMonto(form.monto) > 0) && <small id="caja-monto-error" className="ayuda error">Ingresá un importe mayor a 0 (por ejemplo 12.500,00).</small>}
              </div>
              <label className="campo"><span className="campo-titulo">Moneda</span>
                <select value={form.moneda} onChange={set("moneda")}><option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option></select>
              </label>
              {form.tipo === "pago" && (
                <label className="campo"><span className="campo-titulo">Medio de pago</span>
                  <select value={form.medioPago} onChange={set("medioPago")}>{MEDIOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                </label>
              )}
            </div>
            <label className="campo"><span className="campo-titulo">Concepto</span><input type="text" required maxLength={200} value={form.concepto} onChange={set("concepto")} /></label>
            <label className="campo"><span className="campo-titulo">Referencia <small>(opcional: N° de operación, cheque…)</small></span><input type="text" maxLength={120} value={form.referencia} onChange={set("referencia")} /></label>
            <div className="acciones">
              <button type="submit" className="boton primario">Guardar</button>
              <button type="button" className="boton" onClick={() => setForm(null)}>Cancelar</button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
