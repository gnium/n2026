import { useEffect, useState } from "react";
import { api } from "../../api.js";
import Icono from "../Iconos.jsx";
import ConfirmarDialogo from "../ConfirmarDialogo.jsx";
import { ESTADO_INVITACION, soloFecha } from "./constants.js";
import AdminNav from "./AdminNav.jsx";

export default function AdminInvitations() {
  const [invitaciones, setInvitaciones] = useState([]);
  const [qInv, setQInv] = useState("");
  const [filtroInv, setFiltroInv] = useState("");
  const [selInv, setSelInv] = useState(new Set());
  const [alta, setAlta] = useState({ email: "", nombre: "", escribania: "", diasPrueba: 60 });
  const [enlaceAlta, setEnlaceAlta] = useState(null);
  const [aCancelar, setACancelar] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [bulkAction, setBulkAction] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setError(null);
    try {
      const i = await api.soporteInvitaciones();
      setInvitaciones(i);
    } catch (e) {
      setError(`No se pudieron cargar las invitaciones: ${e.message}`);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const invitar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnlaceAlta(null);
    setOcupado(true);
    try {
      const r = await api.soporteInvitar(alta);
      setInvitaciones(r.invitaciones);
      setAlta({ email: "", nombre: "", escribania: "", diasPrueba: alta.diasPrueba });
      if (r.enviado) setAviso(`Invitacion enviada a ${r.email} con ${r.diasPrueba} dias de prueba.`);
      else setEnlaceAlta({ email: r.email, enlace: r.enlace });
    } catch (err) {
      setError(`No se pudo enviar la invitacion: ${err.message}`);
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
      if (r.enviado) setAviso(`Invitacion reenviada a ${r.email}.`);
      else setEnlaceAlta({ email: r.email, enlace: r.enlace });
    } catch (err) {
      setError(`No se pudo reenviar la invitacion a ${inv.email}: ${err.message}`);
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
      setAviso(`Invitacion a ${inv.email} cancelada: ese enlace ya no sirve.`);
    } catch (err) {
      setError(`No se pudo cancelar la invitacion a ${inv.email}: ${err.message}`);
    }
  };

  const eliminarInvitacion = async (inv) => {
    setAEliminar(null);
    setError(null);
    try {
      const r = await api.soporteEliminarInvitacion(inv.id);
      setInvitaciones(r.invitaciones);
      setSelInv((s) => { const n = new Set(s); n.delete(inv.id); return n; });
      setAviso(`Invitacion a ${inv.email} eliminada del historial.`);
    } catch (err) {
      setError(`No se pudo eliminar la invitacion: ${err.message}`);
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
      setAviso(`${r.canceladas} invitacion(es) cancelada(s).`);
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

  useEffect(() => { if (aviso) { const t = setTimeout(() => setAviso(""), 6000); return () => clearTimeout(t); } }, [aviso]);

  return (
    <div className="equipo">
      <h2>Panel general</h2>
      <AdminNav />
      {error && <p className="alerta error" role="alert"><strong>Error:</strong> {error} <button type="button" className="enlace" onClick={() => setError(null)} aria-label="Cerrar error">{"✕"}</button></p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <section className="bloque" aria-labelledby="soporte-altas-titulo">
        <div className="protocolo-cabecera">
          <h3 id="soporte-altas-titulo">Altas de escribanias <span className="etiqueta">{invitaciones.filter((i) => i.estado === "pendiente").length} pendientes</span></h3>
          <button type="button" className="boton discreto chico" disabled={ocupado} onClick={revisarVencimientos}>
            Revisar vencimientos ahora
          </button>
        </div>
        <p className="nota">
          El alta es cerrada: sin invitacion no se puede crear una cuenta. Cada invitacion abre un periodo de prueba y, al terminar sin suscripcion, la cuenta queda bloqueada y sus datos se eliminan al vencer el plazo de gracia. Los avisos por correo y el borrado corren solos; el boton de arriba adelanta esa pasada.
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
            Escribania <small>(opcional)</small>
            <input type="text" placeholder="Escribania Perez" value={alta.escribania} onChange={(e) => setAlta({ ...alta, escribania: e.target.value })} />
          </label>
          <label>
            Dias de prueba
            <input type="number" min="1" max="365" value={alta.diasPrueba} onChange={(e) => setAlta({ ...alta, diasPrueba: Number(e.target.value) })} />
          </label>
          <button type="submit" className="boton primario" disabled={ocupado}>
            <Icono nombre="mas" tamano={16} /> Invitar
          </button>
        </form>

        {enlaceAlta && (
          <p className="alerta" role="status">
            No hay SMTP configurado, asi que el correo no salio. Pasele este enlace a {enlaceAlta.email} por un medio seguro: <code>{enlaceAlta.enlace}</code>
          </p>
        )}

        {invitaciones.length > 0 && (
          <div className="acciones agenda-toolbar" style={{ marginTop: "0.75rem" }}>
            <input type="search" placeholder="Buscar por correo, nombre o escribania..." value={qInv} onChange={(e) => setQInv(e.target.value)} style={{ flex: 1, minWidth: "200px" }} />
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
          <p className="vacio">Todavia no se invito a ninguna escribania.</p>
        ) : invFiltradas.length === 0 ? (
          <p className="vacio">Ninguna invitacion coincide con la busqueda.</p>
        ) : (
          <div className="tabla-scroll">
            <table aria-labelledby="soporte-altas-titulo">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "2rem" }}>
                    <input type="checkbox" checked={selInv.size === invFiltradas.length && invFiltradas.length > 0} onChange={toggleAll} aria-label="Seleccionar todas" />
                  </th>
                  <th scope="col">Invitada</th>
                  <th scope="col">Escribania</th>
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
                    <td className="num">{i.diasPrueba} dias</td>
                    <td>{soloFecha(i.expiraEn)}</td>
                    <td>
                      <div className="acciones">
                        {(i.estado === "pendiente" || i.estado === "vencida") && (
                          <button type="button" className="enlace" disabled={ocupado} onClick={() => reenviar(i)} aria-label={`Reenviar la invitacion a ${i.email}`}>
                            reenviar
                          </button>
                        )}
                        {i.estado === "pendiente" && (
                          <button type="button" className="enlace" onClick={() => setACancelar(i)} aria-label={`Cancelar la invitacion a ${i.email}`}>
                            cancelar
                          </button>
                        )}
                        {i.estado !== "pendiente" && (
                          <button type="button" className="enlace" onClick={() => setAEliminar(i)} aria-label={`Eliminar la invitacion a ${i.email} del historial`}>
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

      <ConfirmarDialogo
        abierto={Boolean(aCancelar)}
        titulo={aCancelar ? `Cancelar la invitacion a ${aCancelar.email}` : ""}
        texto="El enlace enviado deja de servir. Se puede volver a invitar al mismo correo cuando quiera."
        confirmar="Cancelar invitacion"
        destructivo
        onConfirmar={() => cancelarInvitacion(aCancelar)}
        onCancelar={() => setACancelar(null)}
      />

      <ConfirmarDialogo
        abierto={Boolean(aEliminar)}
        titulo={aEliminar ? `Eliminar invitacion a ${aEliminar.email}` : ""}
        texto="Se elimina el registro de esta invitacion del historial. Esta accion no se puede deshacer."
        confirmar="Eliminar"
        destructivo
        onConfirmar={() => eliminarInvitacion(aEliminar)}
        onCancelar={() => setAEliminar(null)}
      />

      <ConfirmarDialogo
        abierto={bulkAction === "cancelar"}
        titulo={`Cancelar ${selInv.size} invitacion(es)`}
        texto="Los enlaces enviados dejan de servir. Se puede volver a invitar a los mismos correos cuando quiera."
        confirmar="Cancelar invitaciones"
        destructivo
        onConfirmar={bulkCancelar}
        onCancelar={() => setBulkAction(null)}
      />

      <ConfirmarDialogo
        abierto={bulkAction === "eliminar"}
        titulo={`Eliminar ${selInv.size} invitacion(es) del historial`}
        texto="Se eliminan los registros seleccionados. Las invitaciones pendientes no se eliminan (hay que cancelarlas primero). Esta accion no se puede deshacer."
        confirmar="Eliminar"
        destructivo
        onConfirmar={bulkEliminar}
        onCancelar={() => setBulkAction(null)}
      />
    </div>
  );
}
