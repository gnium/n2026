import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import ConfirmarDialogo from "./ConfirmarDialogo.jsx";
import { formatoUsd } from "./Pipeline.jsx";
import { formatoMonto } from "./PresupuestoModal.jsx";
import { fechaCorta } from "./Expedientes.jsx";

const PERIODOS = [["30", "30 días"], ["90", "90 días"], ["365", "12 meses"]];
const NOMBRE_ROL = { root: "Operador", titular: "Titular", escribano: "Escribano/a", empleado: "Empleado/a" };
const NOMBRE_SUSCRIPCION = { sin_suscripcion: "sin suscripción", pendiente: "pendiente", activa: "activa", pausada: "pausada", cancelada: "cancelada" };
const cuando = (v) => (v ? new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");
// En esta pantalla el cero es un dato contable, no una promoción: "gratis" acá confunde.
const usd = (n) => (Number(n) > 0 ? formatoUsd(n) : "US$ 0,00");
const plural = (n, singular, p = `${singular}s`) => `${n} ${n === 1 ? singular : p}`;
const pct = (parte, total) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : "—");

/**
 * Panel de operación de la plataforma (solo la cuenta operadora).
 * Muestra exclusivamente metadatos y agregados: ningún dato de clientes,
 * expedientes, protocolo ni documentos de las escribanías.
 */
export default function Soporte() {
  const [dias, setDias] = useState("30");
  const [resumen, setResumen] = useState(null);
  const [lista, setLista] = useState(null);
  const [q, setQ] = useState("");
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [aDesactivar, setADesactivar] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setError(null);
    try {
      const [r, c] = await Promise.all([api.soporteResumen(dias), api.soporteCuentas({ dias, q, problemas: soloProblemas ? "1" : "" })]);
      setResumen(r);
      setLista(c.cuentas);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, soloProblemas]);

  const buscar = (e) => {
    e.preventDefault();
    cargar();
  };

  const abrir = async (c) => {
    setError(null);
    try {
      setDetalle(await api.soporteCuenta(c.id, dias));
      setTimeout(() => document.getElementById("soporte-detalle-titulo")?.focus(), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  const cambiarActivo = async (c, activo) => {
    setADesactivar(null);
    setError(null);
    try {
      const r = await api.soporteCuentaActivo(c.id, activo);
      setDetalle(r);
      setAviso(`${r.email}: cuenta ${activo ? "activada" : "desactivada"}.`);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!resumen || !lista) return <div className="equipo"><h2>Operación</h2><p className="vacio" role="status">Cargando…</p>{error && <p className="alerta error" role="alert">{error}</p>}</div>;

  const f = resumen.embudo;

  return (
    <div className="equipo">
      <h2>Operación</h2>
      <p className="nota">
        Panel de la plataforma para dar soporte. Muestra <b>solo metadatos y agregados</b>: altas, uso, facturación y errores. Nunca los clientes, expedientes, protocolo ni documentos de una escribanía — de esas tablas solo se leen conteos. Es lo que permite sostener que ni el operador puede ver una escritura.
      </p>
      {error && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      <div className="acciones agenda-toolbar">
        <div className="segmentado" role="group" aria-label="Período">
          {PERIODOS.map(([v, t]) => (
            <button type="button" key={v} className={dias === v ? "activo" : ""} aria-pressed={dias === v} onClick={() => setDias(v)}>{t}</button>
          ))}
        </div>
        <form className="acciones" onSubmit={buscar}>
          <label className="sr-only" htmlFor="soporte-buscar">Buscar por nombre, correo o escribanía</label>
          <input id="soporte-buscar" type="search" placeholder="Buscar cuenta o escribanía…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="boton"><Icono nombre="lupa" tamano={16} /> Buscar</button>
          <label className="chequeo"><input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} /> Solo con problemas</label>
        </form>
      </div>

      <div className="consumo-cards">
        <div className="consumo-card">
          <span className="consumo-card-valor">{resumen.cuentas.total}</span>
          <span className="consumo-card-etiqueta">cuentas · {resumen.escribanias} escribanía{resumen.escribanias === 1 ? "" : "s"}</span>
          <span className="nota">{resumen.cuentas.altas} alta{resumen.cuentas.altas === 1 ? "" : "s"} y {resumen.cuentas.conAccesoEnPeriodo} con actividad en el período</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{resumen.uso.completadas}</span>
          <span className="consumo-card-etiqueta">documentos procesados</span>
          <span className="nota">{plural(resumen.uso.fallidas, "fallido")} · costo de IA {usd(resumen.uso.costoIaUsd)}</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{formatoMonto(resumen.facturacion.montoArs, "ARS")}</span>
          <span className="consumo-card-etiqueta">facturado por uso</span>
          <span className="nota">{resumen.facturacion.cargos} cargos · suscripciones activas: {resumen.suscripciones.activa || 0}</span>
        </div>
      </div>

      <section className="bloque" aria-labelledby="soporte-embudo-titulo">
        <h3 id="soporte-embudo-titulo">Embudo de las cuentas creadas en el período</h3>
        <div className="tabla-scroll">
          <table aria-labelledby="soporte-embudo-titulo">
            <thead><tr><th scope="col">Etapa</th><th scope="col" className="num">Cuentas</th><th scope="col" className="num">Conversión desde el alta</th></tr></thead>
            <tbody>
              <tr><th scope="row">Se registraron</th><td className="num">{f.registradas}</td><td className="num">—</td></tr>
              <tr><th scope="row">Subieron un documento</th><td className="num">{f.probaron}</td><td className="num">{pct(f.probaron, f.registradas)}</td></tr>
              <tr><th scope="row">Completaron uno</th><td className="num">{f.completaronUno}</td><td className="num">{pct(f.completaronUno, f.registradas)}</td></tr>
              <tr><th scope="row">Se suscribieron</th><td className="num">{f.suscribieron}</td><td className="num">{pct(f.suscribieron, f.registradas)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bloque" aria-labelledby="soporte-cuentas-titulo">
        <h3 id="soporte-cuentas-titulo">Cuentas <span className="etiqueta">{lista.length}</span></h3>
        {lista.length === 0 ? (
          <p className="vacio">Ninguna cuenta coincide con la búsqueda.</p>
        ) : (
          <div className="tabla-scroll">
            <table aria-labelledby="soporte-cuentas-titulo">
              <thead>
                <tr>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Escribanía</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Último acceso</th>
                  <th scope="col" className="num">Documentos</th>
                  <th scope="col">Integraciones</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      {c.nombre || "—"}
                      <span className="recaudo-meta">{c.email}{c.activo ? "" : " · desactivada"}</span>
                    </th>
                    <td>{c.equipo || "—"}<span className="recaudo-meta">{NOMBRE_ROL[c.rol] || c.rol}</span></td>
                    <td>{c.plan || "—"}<span className="recaudo-meta">{NOMBRE_SUSCRIPCION[c.suscripcion] || c.suscripcion}</span></td>
                    <td>{cuando(c.ultimoAcceso)}</td>
                    <td className="num">{c.documentos}{c.fallidas > 0 && <span className="etiqueta riesgo-alto">{c.fallidas} con error</span>}</td>
                    <td>
                      {c.arca !== "apagado" && <span className="etiqueta">ARCA {c.arca}</span>}
                      {c.googleConectado && <span className="etiqueta">Google</span>}
                      {c.arca === "apagado" && !c.googleConectado && "—"}
                    </td>
                    <td><button type="button" className="enlace" aria-label={`Ver la ficha de soporte de ${c.nombre || c.email}`} onClick={() => abrir(c)}>ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detalle && (
        <section className="bloque" aria-labelledby="soporte-detalle-titulo">
          <div className="protocolo-cabecera">
            <h3 id="soporte-detalle-titulo" tabIndex={-1}>{detalle.nombre || detalle.email} {!detalle.activo && <span className="etiqueta riesgo-alto">desactivada</span>}</h3>
            <div className="acciones">
              {!detalle.esRoot && (
                detalle.activo ? (
                  <button type="button" className="boton chico" onClick={() => setADesactivar(detalle)}>Desactivar cuenta</button>
                ) : (
                  <button type="button" className="boton chico" onClick={() => cambiarActivo(detalle, true)}>Reactivar cuenta</button>
                )
              )}
              <button type="button" className="boton discreto chico" aria-label="Cerrar la ficha" onClick={() => setDetalle(null)}><Icono nombre="cruz" tamano={16} /></button>
            </div>
          </div>
          <p className="nota">
            {detalle.email} · alta {fechaCorta(String(detalle.creadoEn).slice(0, 10))} · último acceso {cuando(detalle.ultimoAcceso)} · {detalle.equipo ? `${detalle.equipo} (${NOMBRE_ROL[detalle.rol] || detalle.rol})` : "sin escribanía"} · plan {detalle.plan || "—"} ({NOMBRE_SUSCRIPCION[detalle.suscripcion] || detalle.suscripcion})
          </p>
          <p className="ayuda">
            Volumen cargado: {plural(detalle.volumen.clientes, "cliente")}, {plural(detalle.volumen.expedientes, "expediente")}, {plural(detalle.volumen.comprobantes, "comprobante")}. Son conteos: el contenido no se puede consultar desde acá.
          </p>

          {detalle.fallasPorSkill.length > 0 && (
            <>
              <h4>Errores del pipeline en el período</h4>
              <ul className="alertas-uif">
                {detalle.fallasPorSkill.map((s, i) => (
                  <li key={i} className="alta"><Icono nombre="alerta" tamano={16} titulo="Error" /><span>{s.skill}: {s.error || "sin código"} ({s.n} {s.n === 1 ? "vez" : "veces"})</span></li>
                ))}
              </ul>
            </>
          )}

          <h4>Últimas ejecuciones</h4>
          {detalle.ejecuciones.length === 0 ? (
            <p className="vacio">Todavía no procesó ningún documento.</p>
          ) : (
            <div className="tabla-scroll">
              <table aria-label="Últimas ejecuciones de la cuenta">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Estado</th><th scope="col">Tipo de acto</th><th scope="col" className="num">Duración</th><th scope="col" className="num">Costo</th></tr></thead>
                <tbody>
                  {detalle.ejecuciones.map((e) => (
                    <tr key={e.id}>
                      <td>{cuando(e.iniciadoEn)}</td>
                      <td><span className={`etiqueta ${e.estado === "completada" ? "ok" : e.estado === "fallida" ? "riesgo-alto" : ""}`}>{e.estado}</span></td>
                      <td>{e.tipoActo || "—"}</td>
                      <td className="num">{e.duracionMs ? `${Math.round(e.duracionMs / 1000)} s` : "—"}</td>
                      <td className="num">{e.costoUsd != null ? usd(e.costoUsd) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <ConfirmarDialogo
        abierto={Boolean(aDesactivar)}
        titulo={aDesactivar ? `Desactivar a ${aDesactivar.nombre || aDesactivar.email}` : ""}
        texto="La persona deja de poder ingresar. No se borra nada: sus clientes, expedientes y comprobantes quedan intactos y la cuenta se puede reactivar cuando quiera."
        confirmar="Desactivar"
        destructivo
        onConfirmar={() => cambiarActivo(aDesactivar, false)}
        onCancelar={() => setADesactivar(null)}
      />
    </div>
  );
}
