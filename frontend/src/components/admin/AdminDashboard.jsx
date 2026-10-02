import { useEffect, useState } from "react";
import { api } from "../../api.js";
import Icono from "../Iconos.jsx";
import { formatoMonto } from "../PresupuestoModal.jsx";
import { PERIODOS, NOMBRE_SUSCRIPCION, soloFecha, usd, plural, pct } from "./constants.js";
import AdminNav from "./AdminNav.jsx";

export default function AdminDashboard() {
  const [dias, setDias] = useState("30");
  const [resumen, setResumen] = useState(null);
  const [ventas, setVentas] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setError(null);
    try {
      const [r, v] = await Promise.all([
        api.soporteResumen(dias),
        api.soporteSuscripciones(dias),
      ]);
      setResumen(r);
      setVentas(v);
    } catch (e) {
      setError(`No se pudieron cargar los datos: ${e.message}`);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const revisarVencimientos = async () => {
    setError(null);
    setOcupado(true);
    try {
      const r = await api.soporteRevisarPruebas();
      setAviso(`Revision hecha: ${r.avisos} aviso(s), ${r.vencidas} prueba(s) vencida(s), ${r.eliminadas} cuenta(s) eliminada(s).`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  useEffect(() => { if (aviso) { const t = setTimeout(() => setAviso(""), 6000); return () => clearTimeout(t); } }, [aviso]);

  if (!resumen) return <div className="equipo"><h2>Panel general</h2><AdminNav /><p className="vacio" role="status">Cargando...</p>{error && <p className="alerta error" role="alert">{error}</p>}</div>;

  const f = resumen.embudo;

  return (
    <div className="equipo">
      <h2>Panel general</h2>
      <AdminNav />
      <p className="nota">
        Metricas y gestion de la plataforma. Muestra <b>solo metadatos y agregados</b>: altas, uso, facturacion y errores. Nunca los clientes, expedientes, protocolo ni documentos de una escribania — de esas tablas solo se leen conteos.
      </p>
      {error && <p className="alerta error" role="alert"><strong>Error:</strong> {error} <button type="button" className="enlace" onClick={() => setError(null)} aria-label="Cerrar error">{"✕"}</button></p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <div className="acciones agenda-toolbar">
        <div className="segmentado" role="group" aria-label="Periodo">
          {PERIODOS.map(([v, t]) => (
            <button type="button" key={v} className={dias === v ? "activo" : ""} aria-pressed={dias === v} onClick={() => setDias(v)}>{t}</button>
          ))}
        </div>
        <button type="button" className="boton discreto chico" disabled={ocupado} onClick={revisarVencimientos}>
          Revisar vencimientos ahora
        </button>
      </div>

      <div className="consumo-cards">
        <div className="consumo-card">
          <span className="consumo-card-valor">{resumen.cuentas.total}</span>
          <span className="consumo-card-etiqueta">cuentas {"·"} {resumen.escribanias} escribania{resumen.escribanias === 1 ? "" : "s"}</span>
          <span className="nota">{resumen.cuentas.altas} alta{resumen.cuentas.altas === 1 ? "" : "s"} y {resumen.cuentas.conAccesoEnPeriodo} con actividad en el periodo</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{resumen.uso.completadas}</span>
          <span className="consumo-card-etiqueta">documentos procesados</span>
          <span className="nota">{plural(resumen.uso.fallidas, "fallido")} {"·"} costo de IA {usd(resumen.uso.costoIaUsd)}</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{resumen.prueba.enPrueba}</span>
          <span className="consumo-card-etiqueta">en periodo de prueba</span>
          <span className="nota">
            {resumen.prueba.porVencer} vence{resumen.prueba.porVencer === 1 ? "" : "n"} en 7 dias {"·"} {plural(resumen.prueba.vencidas, "vencida", "vencidas")}
            {resumen.prueba.aEliminar > 0 && <> {"·"} <b>{resumen.prueba.aEliminar} a eliminar</b></>}
          </span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{formatoMonto(resumen.facturacion.montoArs, "ARS")}</span>
          <span className="consumo-card-etiqueta">facturado por uso</span>
          <span className="nota">{resumen.facturacion.cargos} cargos {"·"} suscripciones activas: {resumen.suscripciones.activa || 0}</span>
        </div>
      </div>

      <section className="bloque" aria-labelledby="soporte-embudo-titulo">
        <h3 id="soporte-embudo-titulo">Embudo de las cuentas creadas en el periodo</h3>
        <div className="tabla-scroll">
          <table aria-labelledby="soporte-embudo-titulo">
            <thead><tr><th scope="col">Etapa</th><th scope="col" className="num">Cuentas</th><th scope="col" className="num">Conversion desde el alta</th></tr></thead>
            <tbody>
              <tr><th scope="row">Se registraron</th><td className="num">{f.registradas}</td><td className="num">{"—"}</td></tr>
              <tr><th scope="row">Subieron un documento</th><td className="num">{f.probaron}</td><td className="num">{pct(f.probaron, f.registradas)}</td></tr>
              <tr><th scope="row">Completaron uno</th><td className="num">{f.completaronUno}</td><td className="num">{pct(f.completaronUno, f.registradas)}</td></tr>
              <tr><th scope="row">Se suscribieron</th><td className="num">{f.suscribieron}</td><td className="num">{pct(f.suscribieron, f.registradas)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {ventas && (
        <section className="bloque" aria-labelledby="soporte-ventas-titulo">
          <h3 id="soporte-ventas-titulo">Ventas de suscripciones</h3>
          <div className="consumo-cards">
            <div className="consumo-card">
              <span className="consumo-card-valor">{formatoMonto(ventas.mrr, "ARS")}</span>
              <span className="consumo-card-etiqueta">MRR (ingreso recurrente mensual)</span>
              <span className="nota">{ventas.activas.filter((s) => s.estado === "activa").length} suscripcion{ventas.activas.filter((s) => s.estado === "activa").length === 1 ? "" : "es"} activa{ventas.activas.filter((s) => s.estado === "activa").length === 1 ? "" : "s"}</span>
            </div>
            <div className="consumo-card">
              <span className="consumo-card-valor">{formatoMonto(ventas.activas.reduce((s, r) => s + r.usoArs, 0), "ARS")}</span>
              <span className="consumo-card-etiqueta">uso acumulado en el periodo</span>
              <span className="nota">{formatoMonto(ventas.activas.reduce((s, r) => s + r.cobradoArs, 0), "ARS")} ya cobrado</span>
            </div>
          </div>
          {ventas.activas.length > 0 && (
            <div className="tabla-scroll">
              <table aria-labelledby="soporte-ventas-titulo">
                <thead>
                  <tr>
                    <th scope="col">Cuenta</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="num">Cuota</th>
                    <th scope="col" className="num">Uso periodo</th>
                    <th scope="col">Proximo cobro</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.activas.map((s) => (
                    <tr key={s.id}>
                      <th scope="row">
                        {s.nombre || s.email}
                        {s.equipo && <span className="recaudo-meta">{s.equipo}</span>}
                      </th>
                      <td>{s.plan || "—"}</td>
                      <td><span className={`etiqueta ${s.estado === "activa" ? "ok" : ""}`}>{NOMBRE_SUSCRIPCION[s.estado] || s.estado}</span></td>
                      <td className="num">{formatoMonto(s.precioArs, "ARS")}</td>
                      <td className="num">{formatoMonto(s.usoArs, "ARS")}</td>
                      <td>{soloFecha(s.proximoCobro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
