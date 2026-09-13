import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import { fechaCorta } from "./Expedientes.jsx";
import { formatoMonto } from "./PresupuestoModal.jsx";
import ComprobanteModal from "./ComprobanteModal.jsx";
import ConfirmarDialogo from "./ConfirmarDialogo.jsx";
import ConfiguracionFiscal from "./ConfiguracionFiscal.jsx";

const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE");
};

export default function Comprobantes() {
  const [preset, setPreset] = useState("90");
  const [lista, setLista] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [expedientes, setExpedientes] = useState([]);
  const [config, setConfig] = useState(null);
  const [google, setGoogle] = useState(null);
  const [modal, setModal] = useState(false);
  const [verFiscal, setVerFiscal] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const filtros = () => ({ desde: preset === "todo" ? "" : haceDias(Number(preset)) });
  const cargar = async () => {
    setError(null);
    try {
      setLista(await api.comprobantesListar(filtros()));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);
  useEffect(() => {
    api.clientesListar().then(setClientes).catch(() => setClientes([]));
    api.expedientesListar().then((l) => setExpedientes(l.filter((e) => e.estado === "abierto" || e.estado === "en_firma"))).catch(() => setExpedientes([]));
    api.configuracionFiscal().then(setConfig).catch(() => setConfig({ arcaEntorno: "apagado" }));
    api.googleEstado().then(setGoogle).catch(() => setGoogle(null));
  }, []);

  // Copiar el PDF a la carpeta de la escribanía en Drive (solo si la cuenta lo activó).
  const aDrive = async (c) => {
    setError(null);
    try {
      const r = await api.googleSubirADrive({ tipo: "comprobante", id: c.id });
      setAviso(`${c.tipoNombre} ${c.numeroCompleto} copiado a Drive.`);
      if (r?.enlace) window.open(r.enlace, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message);
    }
  };

  const [aAnular, setAAnular] = useState(null);
  const anular = (c) => setAAnular(c);
  const confirmarAnulacion = async (motivo) => {
    const c = aAnular;
    setError(null);
    try {
      const r = await api.comprobanteAnular(c.id, motivo);
      setAAnular(null);
      await cargar();
      setAviso(r.advertencia || "Comprobante anulado.");
    } catch (e) {
      setAAnular(null);
      setError(e.message);
    }
  };

  return (
    <div className="comprobantes">
      <h2>Comprobantes</h2>
      <p className="nota">Recibos y notas de honorarios son comprobantes internos, no válidos como factura. Las facturas electrónicas con CAE se habilitan al activar ARCA en los datos fiscales. El receptor de cada comprobante se guarda cifrado y se conserva aunque se borre el cliente.</p>
      {error && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      <div className="acciones agenda-toolbar">
        <div className="segmentado" role="group" aria-label="Período">
          {[["30", "30 días"], ["90", "90 días"], ["365", "12 meses"], ["todo", "Todo"]].map(([v, t]) => (
            <button type="button" key={v} className={preset === v ? "activo" : ""} aria-pressed={preset === v} onClick={() => setPreset(v)}>{t}</button>
          ))}
        </div>
        <div className="acciones">
          <button type="button" className="boton" aria-expanded={verFiscal} aria-controls="config-fiscal" onClick={() => setVerFiscal((v) => !v)}>Datos fiscales{config && config.arcaEntorno !== "apagado" ? ` · ARCA ${config.arcaEntorno}` : ""}</button>
          <a className="boton" href={api.comprobantesUrlCsv(filtros())} download><Icono nombre="descargar" tamano={16} /> CSV</a>
          <button type="button" className="boton primario" onClick={() => setModal(true)}><Icono nombre="mas" tamano={16} /> Emitir comprobante</button>
        </div>
      </div>

      {verFiscal && <ConfiguracionFiscal onCambio={setConfig} />}

      {lista === null ? (
        <p className="vacio">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="vacio">Sin comprobantes en el período.</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Comprobante</th><th scope="col">Receptor</th><th scope="col" className="num">Total</th><th scope="col">Estado</th><th scope="col" className="col-sec">CAE</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>{fechaCorta(c.fecha)}</td>
                  <td className="mono">{c.numeroCompleto}<span className="recaudo-meta">{c.tipoNombre}</span></td>
                  <td>{c.receptorNombre || (c.receptorLegible ? "Consumidor final" : "(no legible)")}{c.expedienteCaratula && <span className="nota col-sec"> · {c.expedienteCaratula}</span>}</td>
                  <td className="num">{formatoMonto(c.total, c.moneda)}</td>
                  <td><span className={`etiqueta ${c.estado === "emitido" ? "ok" : ""}`}>{c.estado}</span></td>
                  <td className="col-sec">{c.cae ? <>{c.cae}<span className="recaudo-meta">vence {fechaCorta(c.caeVencimiento)}{c.arcaEntorno === "homologacion" ? " · homologación" : ""}</span></> : c.esFiscal ? "—" : <span className="nota">interno</span>}</td>
                  <td>
                    <div className="acciones">
                      <a className="enlace" href={api.comprobanteUrlPdf(c.id)} download aria-label={`Descargar PDF de ${c.tipoNombre} ${c.numeroCompleto}`}>PDF</a>
                      {google?.conectado && google?.subirComprobantes && (
                        <button type="button" className="enlace" aria-label={`Copiar a Drive ${c.tipoNombre} ${c.numeroCompleto}`} onClick={() => aDrive(c)}>Drive</button>
                      )}
                      {c.estado === "emitido" && <button type="button" className="enlace" aria-label={`Anular ${c.tipoNombre} ${c.numeroCompleto}`} onClick={() => anular(c)}>anular</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmarDialogo abierto={Boolean(aAnular)} titulo={aAnular ? `Anular ${aAnular.tipoNombre} ${aAnular.numeroCompleto}` : ""} texto={aAnular?.cae ? "La factura queda marcada como anulada y se quita el cargo de la cuenta corriente. La anulación fiscal ante ARCA requiere una nota de crédito (fuera de esta app)." : "El comprobante queda marcado como anulado y se quita el cargo de la cuenta corriente. No se borra."} confirmar="Anular" destructivo conMotivo etiquetaMotivo="Motivo de anulación" onConfirmar={confirmarAnulacion} onCancelar={() => setAAnular(null)} />
      <ComprobanteModal abierto={modal} clientes={clientes} expedientes={expedientes} config={config} onCerrar={() => setModal(false)} onEmitido={() => cargar()} />
    </div>
  );
}
