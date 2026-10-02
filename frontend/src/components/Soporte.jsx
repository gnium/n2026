import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import ConfirmarDialogo from "./ConfirmarDialogo.jsx";
import { formatoUsd } from "./Pipeline.jsx";
import { formatoMonto } from "./PresupuestoModal.jsx";
import { fechaCorta } from "./Expedientes.jsx";

const PERIODOS = [["30", "30 días"], ["90", "90 días"], ["365", "12 meses"]];
const NOMBRE_ROL = { root: "Operador", titular: "Titular", escribano: "Escribano/a", empleado: "Empleado/a" };
const NOMBRE_SUSCRIPCION = {
  sin_suscripcion: "sin suscripción",
  prueba: "en prueba",
  vencida: "prueba vencida",
  pendiente: "pendiente",
  activa: "activa",
  pausada: "pausada",
  cancelada: "cancelada",
};
const ESTADO_INVITACION = { pendiente: "pendiente", aceptada: "aceptada", vencida: "vencida", cancelada: "cancelada" };
// La prueba manda sobre el estado de Mercado Pago: una cuenta puede figurar
// "pendiente" de autorizar y estar igual dentro de su período de prueba.
const textoSuscripcion = (c) => (c.enPrueba ? "en prueba" : c.pruebaVencida ? "prueba vencida" : NOMBRE_SUSCRIPCION[c.suscripcion] || c.suscripcion);
const soloFecha = (v) => (v ? new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
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
  const [ventas, setVentas] = useState(null);
  const [invitaciones, setInvitaciones] = useState([]);
  const [qInv, setQInv] = useState("");
  const [filtroInv, setFiltroInv] = useState("");
  const [selInv, setSelInv] = useState(new Set());
  const [alta, setAlta] = useState({ email: "", nombre: "", escribania: "", diasPrueba: 60 });
  const [enlaceAlta, setEnlaceAlta] = useState(null);
  const [aCancelar, setACancelar] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [bulkAction, setBulkAction] = useState(null);
  const [confirmacionBorrado, setConfirmacionBorrado] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [consultas, setConsultas] = useState([]);
  const [consultaDetalle, setConsultaDetalle] = useState(null);
  const [respuestaConsulta, setRespuestaConsulta] = useState("");
  const [filtroConsultas, setFiltroConsultas] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setError(null);
    try {
      const [r, c, i, cs, v] = await Promise.all([
        api.soporteResumen(dias),
        api.soporteCuentas({ dias, q, problemas: soloProblemas ? "1" : "" }),
        api.soporteInvitaciones(),
        api.soporteConsultas({ estado: filtroConsultas || undefined }),
        api.soporteSuscripciones(dias),
      ]);
      setResumen(r);
      setLista(c.cuentas);
      setInvitaciones(i);
      setConsultas(cs);
      setVentas(v);
    } catch (e) {
      setError(`No se pudieron cargar los datos: ${e.message}`);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, soloProblemas, filtroConsultas]);

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

  const invitar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnlaceAlta(null);
    setOcupado(true);
    try {
      const r = await api.soporteInvitar(alta);
      setInvitaciones(r.invitaciones);
      setAlta({ email: "", nombre: "", escribania: "", diasPrueba: alta.diasPrueba });
      // Sin SMTP configurado el backend devuelve el enlace para pasarlo a mano.
      if (r.enviado) setAviso(`Invitación enviada a ${r.email} con ${r.diasPrueba} días de prueba.`);
      else setEnlaceAlta({ email: r.email, enlace: r.enlace });
    } catch (err) {
      setError(`No se pudo enviar la invitación: ${err.message}`);
    } finally {
      setOcupado(false);
    }
  };

  const reenviar = async (inv) => {
    setError(null);
    setEnlaceAlta(null);
    setOcupado(true);
    try {
      const r = await api.soporteReenviarInvitacion(inv.id);
      setInvitaciones(r.invitaciones);
      if (r.enviado) setAviso(`Invitación reenviada a ${r.email}.`);
      else setEnlaceAlta({ email: r.email, enlace: r.enlace });
    } catch (err) {
      setError(`No se pudo reenviar la invitación a ${inv.email}: ${err.message}`);
    } finally {
      setOcupado(false);
    }
  };

  const cancelarInvitacion = async (inv) => {
    setACancelar(null);
    setError(null);
    try {
      const r = await api.soporteCancelarInvitacion(inv.id);
      setInvitaciones(r.invitaciones);
      setAviso(`Invitación a ${inv.email} cancelada: ese enlace ya no sirve.`);
    } catch (err) {
      setError(`No se pudo cancelar la invitación a ${inv.email}: ${err.message}`);
    }
  };

  const eliminarInvitacion = async (inv) => {
    setAEliminar(null);
    setError(null);
    try {
      const r = await api.soporteEliminarInvitacion(inv.id);
      setInvitaciones(r.invitaciones);
      setSelInv((s) => { const n = new Set(s); n.delete(inv.id); return n; });
      setAviso(`Invitación a ${inv.email} eliminada del historial.`);
    } catch (err) {
      setError(`No se pudo eliminar la invitación: ${err.message}`);
    }
  };

  const bulkCancelar = async () => {
    setBulkAction(null);
    setError(null);
    setOcupado(true);
    try {
      const r = await api.soporteCancelarInvitacionesBulk([...selInv]);
      setInvitaciones(r.invitaciones);
      setSelInv(new Set());
      setAviso(`${r.canceladas} invitación(es) cancelada(s).`);
    } catch (err) {
      setError(`No se pudieron cancelar: ${err.message}`);
    } finally {
      setOcupado(false);
    }
  };

  const bulkEliminar = async () => {
    setBulkAction(null);
    setError(null);
    setOcupado(true);
    try {
      const r = await api.soporteEliminarInvitacionesBulk([...selInv]);
      setInvitaciones(r.invitaciones);
      setSelInv(new Set());
      setAviso("Invitaciones eliminadas del historial.");
    } catch (err) {
      setError(`No se pudieron eliminar: ${err.message}`);
    } finally {
      setOcupado(false);
    }
  };

  const invFiltradas = invitaciones.filter((i) => {
    if (filtroInv && i.estado !== filtroInv) return false;
    if (qInv) {
      const t = qInv.toLowerCase();
      return (i.email && i.email.toLowerCase().includes(t)) || (i.nombre && i.nombre.toLowerCase().includes(t)) || (i.escribania && i.escribania.toLowerCase().includes(t));
    }
    return true;
  });

  const toggleSel = (id) => setSelInv((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelInv((s) => s.size === invFiltradas.length ? new Set() : new Set(invFiltradas.map((i) => i.id)));

  const abrirConsulta = async (id) => {
    setError(null);
    try {
      setConsultaDetalle(await api.soporteConsulta(id));
      setRespuestaConsulta("");
      setTimeout(() => document.getElementById("soporte-consulta-titulo")?.focus(), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  const responderConsulta = async (e) => {
    e.preventDefault();
    if (!consultaDetalle || !respuestaConsulta.trim()) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await api.soporteConsultaResponder(consultaDetalle.id, respuestaConsulta);
      setConsultaDetalle(r);
      setRespuestaConsulta("");
      setAviso("Respuesta enviada.");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const cerrarConsulta = async (id) => {
    setError(null);
    try {
      await api.soporteConsultaCerrar(id);
      setConsultaDetalle(null);
      setAviso("Consulta cerrada.");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const reabrirConsulta = async (id) => {
    setError(null);
    try {
      await api.soporteConsultaReabrir(id);
      setAviso("Consulta reabierta.");
      await abrirConsulta(id);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const revisarVencimientos = async () => {
    setError(null);
    setOcupado(true);
    try {
      const r = await api.soporteRevisarPruebas();
      setAviso(`Revisión hecha: ${r.avisos} aviso(s), ${r.vencidas} prueba(s) vencida(s), ${r.eliminadas} cuenta(s) eliminada(s).`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const eliminarDefinitivamente = async () => {
    setError(null);
    setBorrando(true);
    try {
      const r = await api.soporteEliminarCuenta(detalle.id, confirmacionBorrado);
      setAviso(`Cuenta eliminada de forma definitiva (${r.filas} registros borrados).`);
      setDetalle(null);
      setConfirmacionBorrado("");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBorrando(false);
    }
  };

  useEffect(() => { if (aviso) { const t = setTimeout(() => setAviso(""), 6000); return () => clearTimeout(t); } }, [aviso]);

  if (!resumen || !lista) return <div className="equipo"><h2>Panel general</h2><p className="vacio" role="status">Cargando…</p>{error && <p className="alerta error" role="alert">{error}</p>}</div>;

  const f = resumen.embudo;

  return (
    <div className="equipo">
      <h2>Panel general</h2>
      <p className="nota">
        Métricas y gestión de la plataforma. Muestra <b>solo metadatos y agregados</b>: altas, uso, facturación y errores. Nunca los clientes, expedientes, protocolo ni documentos de una escribanía — de esas tablas solo se leen conteos.
      </p>
      {error && <p className="alerta error" role="alert"><strong>Error:</strong> {error} <button type="button" className="enlace" onClick={() => setError(null)} aria-label="Cerrar error">✕</button></p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

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
          <span className="consumo-card-valor">{resumen.prueba.enPrueba}</span>
          <span className="consumo-card-etiqueta">en período de prueba</span>
          <span className="nota">
            {resumen.prueba.porVencer} vence{resumen.prueba.porVencer === 1 ? "" : "n"} en 7 días · {plural(resumen.prueba.vencidas, "vencida", "vencidas")}
            {resumen.prueba.aEliminar > 0 && <> · <b>{resumen.prueba.aEliminar} a eliminar</b></>}
          </span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{formatoMonto(resumen.facturacion.montoArs, "ARS")}</span>
          <span className="consumo-card-etiqueta">facturado por uso</span>
          <span className="nota">{resumen.facturacion.cargos} cargos · suscripciones activas: {resumen.suscripciones.activa || 0}</span>
        </div>
      </div>

      <section className="bloque" aria-labelledby="soporte-altas-titulo">
        <div className="protocolo-cabecera">
          <h3 id="soporte-altas-titulo">Altas de escribanías <span className="etiqueta">{invitaciones.filter((i) => i.estado === "pendiente").length} pendientes</span></h3>
          <button type="button" className="boton discreto chico" disabled={ocupado} onClick={revisarVencimientos}>
            Revisar vencimientos ahora
          </button>
        </div>
        <p className="nota">
          El alta es cerrada: sin invitación no se puede crear una cuenta. Cada invitación abre un período de prueba y, al terminar sin suscripción, la cuenta queda bloqueada y sus datos se eliminan al vencer el plazo de gracia. Los avisos por correo y el borrado corren solos; el botón de arriba adelanta esa pasada.
        </p>

        <form className="acciones agenda-toolbar" onSubmit={invitar}>
          <label>
            Correo
            <input type="email" required placeholder="escribania@ejemplo.com" value={alta.email} onChange={(e) => setAlta({ ...alta, email: e.target.value })} />
          </label>
          <label>
            Nombre <small>(opcional)</small>
            <input type="text" value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} />
          </label>
          <label>
            Escribanía <small>(opcional)</small>
            <input type="text" placeholder="Escribanía Pérez" value={alta.escribania} onChange={(e) => setAlta({ ...alta, escribania: e.target.value })} />
          </label>
          <label>
            Días de prueba
            <input type="number" min="1" max="365" value={alta.diasPrueba} onChange={(e) => setAlta({ ...alta, diasPrueba: Number(e.target.value) })} />
          </label>
          <button type="submit" className="boton primario" disabled={ocupado}>
            <Icono nombre="mas" tamano={16} /> Invitar
          </button>
        </form>

        {enlaceAlta && (
          <p className="alerta" role="status">
            No hay SMTP configurado, así que el correo no salió. Pásele este enlace a {enlaceAlta.email} por un medio seguro: <code>{enlaceAlta.enlace}</code>
          </p>
        )}

        {invitaciones.length > 0 && (
          <div className="acciones agenda-toolbar" style={{ marginTop: "0.75rem" }}>
            <input type="search" placeholder="Buscar por correo, nombre o escribanía…" value={qInv} onChange={(e) => setQInv(e.target.value)} style={{ flex: 1, minWidth: "200px" }} />
            <div className="segmentado" role="group" aria-label="Filtro de invitaciones">
              {[["", "Todas"], ["pendiente", "Pendientes"], ["aceptada", "Aceptadas"], ["vencida", "Vencidas"], ["cancelada", "Canceladas"]].map(([v, t]) => (
                <button type="button" key={v} className={filtroInv === v ? "activo" : ""} aria-pressed={filtroInv === v} onClick={() => { setFiltroInv(v); setSelInv(new Set()); }}>{t}</button>
              ))}
            </div>
          </div>
        )}

        {selInv.size > 0 && (
          <div className="acciones agenda-toolbar" style={{ marginTop: "0.5rem", gap: "0.5rem" }}>
            <span className="nota" style={{ marginRight: "auto" }}>{selInv.size} seleccionada{selInv.size > 1 ? "s" : ""}</span>
            <button type="button" className="boton chico" disabled={ocupado} onClick={() => setBulkAction("cancelar")}>
              Cancelar seleccionadas
            </button>
            <button type="button" className="boton chico peligro" disabled={ocupado} onClick={() => setBulkAction("eliminar")}>
              Eliminar seleccionadas
            </button>
            <button type="button" className="enlace" onClick={() => setSelInv(new Set())}>Deseleccionar</button>
          </div>
        )}

        {invitaciones.length === 0 ? (
          <p className="vacio">Todavía no se invitó a ninguna escribanía.</p>
        ) : invFiltradas.length === 0 ? (
          <p className="vacio">Ninguna invitación coincide con la búsqueda.</p>
        ) : (
          <div className="tabla-scroll">
            <table aria-labelledby="soporte-altas-titulo">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "2rem" }}>
                    <input type="checkbox" checked={selInv.size === invFiltradas.length && invFiltradas.length > 0} onChange={toggleAll} aria-label="Seleccionar todas" />
                  </th>
                  <th scope="col">Invitada</th>
                  <th scope="col">Escribanía</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="num">Prueba</th>
                  <th scope="col">Vence</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {invFiltradas.map((i) => (
                  <tr key={i.id} className={selInv.has(i.id) ? "fila-seleccionada" : ""}>
                    <td>
                      <input type="checkbox" checked={selInv.has(i.id)} onChange={() => toggleSel(i.id)} aria-label={`Seleccionar ${i.email}`} />
                    </td>
                    <th scope="row">
                      {i.nombre || i.email}
                      {i.nombre && <span className="recaudo-meta">{i.email}</span>}
                    </th>
                    <td>{i.escribania || "—"}</td>
                    <td>
                      <span className={`etiqueta ${i.estado === "aceptada" ? "ok" : i.estado === "pendiente" ? "" : "riesgo-alto"}`}>{ESTADO_INVITACION[i.estado]}</span>
                    </td>
                    <td className="num">{i.diasPrueba} días</td>
                    <td>{soloFecha(i.expiraEn)}</td>
                    <td>
                      <div className="acciones">
                        {(i.estado === "pendiente" || i.estado === "vencida") && (
                          <button type="button" className="enlace" disabled={ocupado} onClick={() => reenviar(i)} aria-label={`Reenviar la invitación a ${i.email}`}>
                            reenviar
                          </button>
                        )}
                        {i.estado === "pendiente" && (
                          <button type="button" className="enlace" onClick={() => setACancelar(i)} aria-label={`Cancelar la invitación a ${i.email}`}>
                            cancelar
                          </button>
                        )}
                        {i.estado !== "pendiente" && (
                          <button type="button" className="enlace" onClick={() => setAEliminar(i)} aria-label={`Eliminar la invitación a ${i.email} del historial`}>
                            eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
                    <td>
                      {c.plan || "—"}
                      <span className="recaudo-meta">
                        {textoSuscripcion(c)}
                        {c.enPrueba && c.pruebaTerminaEn && ` hasta ${soloFecha(c.pruebaTerminaEn)}`}
                        {c.pruebaVencida && c.eliminacionEn && ` · se borra el ${soloFecha(c.eliminacionEn)}`}
                      </span>
                    </td>
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

      <section className="bloque" aria-labelledby="soporte-consultas-titulo">
        <h3 id="soporte-consultas-titulo">
          Consultas de soporte{" "}
          <span className="etiqueta">{consultas.filter((c) => c.estado === "abierta").length} abiertas</span>
        </h3>
        <p className="nota">
          Canal de comunicacion con las cuentas suscriptoras. Los suscriptores envian consultas desde su panel; el operador responde desde aca.
        </p>

        <div className="acciones agenda-toolbar">
          <div className="segmentado" role="group" aria-label="Filtro de consultas">
            {[["", "Todas"], ["abierta", "Abiertas"], ["respondida", "Respondidas"], ["cerrada", "Cerradas"]].map(([v, t]) => (
              <button type="button" key={v} className={filtroConsultas === v ? "activo" : ""} aria-pressed={filtroConsultas === v} onClick={() => { setFiltroConsultas(v); }}>{t}</button>
            ))}
          </div>
        </div>

        {consultaDetalle ? (
          <div className="bloque">
            <div className="protocolo-cabecera">
              <h4 id="soporte-consulta-titulo" tabIndex={-1}>
                {consultaDetalle.asunto}{" "}
                <span className={`etiqueta ${consultaDetalle.estado === "respondida" ? "ok" : consultaDetalle.estado === "cerrada" ? "riesgo-alto" : ""}`}>{consultaDetalle.estado}</span>
              </h4>
              <div className="acciones">
                {consultaDetalle.estado !== "cerrada" && (
                  <button type="button" className="boton chico" onClick={() => cerrarConsulta(consultaDetalle.id)}>Cerrar consulta</button>
                )}
                {consultaDetalle.estado === "cerrada" && (
                  <button type="button" className="boton chico" onClick={() => reabrirConsulta(consultaDetalle.id)}>Reabrir</button>
                )}
                <button type="button" className="boton discreto chico" onClick={() => setConsultaDetalle(null)}>
                  <Icono nombre="izquierda" tamano={16} /> Volver
                </button>
              </div>
            </div>
            <p className="ayuda">{consultaDetalle.nombre || consultaDetalle.email}{consultaDetalle.equipo ? ` · ${consultaDetalle.equipo}` : ""} · {cuando(consultaDetalle.creadoEn)}</p>

            <div className="consulta-mensajes">
              {consultaDetalle.mensajes?.map((m) => (
                <div key={m.id} className={`consulta-mensaje ${m.esAdmin ? "admin" : "propio"}`}>
                  <div className="consulta-mensaje-meta">
                    <strong>{m.esAdmin ? "Operador" : (m.nombre || m.email)}</strong>
                    <span className="recaudo-meta">{cuando(m.creadoEn)}</span>
                  </div>
                  <p className="consulta-mensaje-texto">{m.contenido}</p>
                </div>
              ))}
            </div>

            {consultaDetalle.estado !== "cerrada" && (
              <form className="acciones agenda-toolbar" onSubmit={responderConsulta}>
                <textarea rows={3} maxLength={4000} value={respuestaConsulta} onChange={(e) => setRespuestaConsulta(e.target.value)} placeholder="Escriba la respuesta..." required />
                <button type="submit" className="boton primario" disabled={ocupado || !respuestaConsulta.trim()}>
                  <Icono nombre="chat" tamano={16} /> Responder
                </button>
              </form>
            )}
          </div>
        ) : consultas.length === 0 ? (
          <p className="vacio">No hay consultas{filtroConsultas ? ` ${filtroConsultas}s` : ""}.</p>
        ) : (
          <div className="tabla-scroll">
            <table aria-labelledby="soporte-consultas-titulo">
              <thead>
                <tr>
                  <th scope="col">De</th>
                  <th scope="col">Asunto</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Ultima actividad</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {consultas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.nombre || c.email}
                      {c.equipo && <span className="recaudo-meta">{c.equipo}</span>}
                    </td>
                    <th scope="row">
                      {c.asunto}
                      {c.sinLeer > 0 && <span className="etiqueta">{c.sinLeer} sin leer</span>}
                    </th>
                    <td><span className={`etiqueta ${c.estado === "respondida" ? "ok" : c.estado === "cerrada" ? "riesgo-alto" : ""}`}>{c.estado}</span></td>
                    <td>{cuando(c.actualizadoEn)}</td>
                    <td><button type="button" className="enlace" onClick={() => abrirConsulta(c.id)}>ver</button></td>
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
            {detalle.email} · alta {fechaCorta(String(detalle.creadoEn).slice(0, 10))} · último acceso {cuando(detalle.ultimoAcceso)} · {detalle.equipo ? `${detalle.equipo} (${NOMBRE_ROL[detalle.rol] || detalle.rol})` : "sin escribanía"} · plan {detalle.plan || "—"} ({textoSuscripcion(detalle)})
          </p>
          <p className="ayuda">
            Volumen cargado: {plural(detalle.volumen.clientes, "cliente")}, {plural(detalle.volumen.expedientes, "expediente")}, {plural(detalle.volumen.comprobantes, "comprobante")}. Son conteos: el contenido no se puede consultar desde acá.
          </p>

          {(detalle.enPrueba || detalle.pruebaVencida) && (
            <p className={`alerta ${detalle.pruebaVencida ? "error" : ""}`} role="status">
              {detalle.enPrueba
                ? `En período de prueba hasta el ${soloFecha(detalle.pruebaTerminaEn)}. Si no activa una suscripción, queda bloqueada y sus datos se eliminan al vencer el plazo de gracia.`
                : `Prueba vencida. La cuenta y todo su contenido se eliminan de forma definitiva el ${soloFecha(detalle.eliminacionEn)}.`}
            </p>
          )}

          {!detalle.esRoot && (
            <details className="bloque">
              <summary>Eliminar definitivamente esta cuenta</summary>
              <p className="ayuda">
                Borra la cuenta y <b>todo</b> su contenido: clientes, expedientes, protocolo, caja, comprobantes, legajos UIF y credenciales. No hay copia ni vuelta atrás; queda solo una constancia sin datos personales. Si la cuenta era la titular de una escribanía, el equipo desaparece con ella (las cuentas de sus integrantes y los datos de cada una no se tocan).
              </p>
              <label>
                Escriba <code>{detalle.email}</code> para confirmar
                <input type="text" autoComplete="off" value={confirmacionBorrado} onChange={(e) => setConfirmacionBorrado(e.target.value)} />
              </label>
              <button
                type="button"
                className="boton peligro chico"
                disabled={borrando || confirmacionBorrado.trim().toLowerCase() !== String(detalle.email).toLowerCase()}
                onClick={eliminarDefinitivamente}
              >
                <Icono nombre="basura" tamano={16} /> {borrando ? "Borrando…" : "Eliminar todo definitivamente"}
              </button>
            </details>
          )}

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
        abierto={Boolean(aCancelar)}
        titulo={aCancelar ? `Cancelar la invitación a ${aCancelar.email}` : ""}
        texto="El enlace enviado deja de servir. Se puede volver a invitar al mismo correo cuando quiera."
        confirmar="Cancelar invitación"
        destructivo
        onConfirmar={() => cancelarInvitacion(aCancelar)}
        onCancelar={() => setACancelar(null)}
      />

      <ConfirmarDialogo
        abierto={Boolean(aDesactivar)}
        titulo={aDesactivar ? `Desactivar a ${aDesactivar.nombre || aDesactivar.email}` : ""}
        texto="La persona deja de poder ingresar. No se borra nada: sus clientes, expedientes y comprobantes quedan intactos y la cuenta se puede reactivar cuando quiera."
        confirmar="Desactivar"
        destructivo
        onConfirmar={() => cambiarActivo(aDesactivar, false)}
        onCancelar={() => setADesactivar(null)}
      />

      <ConfirmarDialogo
        abierto={Boolean(aEliminar)}
        titulo={aEliminar ? `Eliminar invitación a ${aEliminar.email}` : ""}
        texto="Se elimina el registro de esta invitación del historial. Esta acción no se puede deshacer."
        confirmar="Eliminar"
        destructivo
        onConfirmar={() => eliminarInvitacion(aEliminar)}
        onCancelar={() => setAEliminar(null)}
      />

      <ConfirmarDialogo
        abierto={bulkAction === "cancelar"}
        titulo={`Cancelar ${selInv.size} invitación(es)`}
        texto="Los enlaces enviados dejan de servir. Se puede volver a invitar a los mismos correos cuando quiera."
        confirmar="Cancelar invitaciones"
        destructivo
        onConfirmar={bulkCancelar}
        onCancelar={() => setBulkAction(null)}
      />

      <ConfirmarDialogo
        abierto={bulkAction === "eliminar"}
        titulo={`Eliminar ${selInv.size} invitación(es) del historial`}
        texto="Se eliminan los registros seleccionados. Las invitaciones pendientes no se eliminan (hay que cancelarlas primero). Esta acción no se puede deshacer."
        confirmar="Eliminar"
        destructivo
        onConfirmar={bulkEliminar}
        onCancelar={() => setBulkAction(null)}
      />
    </div>
  );
}
