import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";
import ConfirmarDialogo from "./ConfirmarDialogo.jsx";
import { formatoMonto } from "./PresupuestoModal.jsx";
import { fechaCorta } from "./Expedientes.jsx";

const NOMBRE_ROL = { titular: "Titular", escribano: "Escribano/a", empleado: "Empleado/a" };
const DESCRIPCION_ROL = {
  titular: "Administra la instalación (IA, precios, planes, parámetros UIF) y el equipo.",
  escribano: "Todo su trabajo: expedientes, clientes, agenda, protocolo, caja, comprobantes y UIF.",
  empleado: "Carga clientes, expedientes, tareas, turnos y notas. No ve protocolo, caja, comprobantes ni legajos UIF.",
};

export default function Equipo({ usuario }) {
  const [equipo, setEquipo] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [dias, setDias] = useState("30");
  const [invitacion, setInvitacion] = useState({ email: "", rol: "empleado" });
  const [enlace, setEnlace] = useState(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [aQuitar, setAQuitar] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setError(null);
    try {
      const e = await api.equipo();
      setEquipo(e);
      setNombreNuevo(e.nombre || "");
      if (e.esTitular) setMetricas(await api.equipoMetricas(dias));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!equipo?.esTitular) return;
    setMetricas(null); // que se vea el estado de carga en vez de datos del periodo anterior
    api.equipoMetricas(dias).then((m) => { setMetricas(m); setAviso(`Métricas de los últimos ${m.dias} días.`); }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const accion = async (fn, texto) => {
    setError(null);
    setAviso("");
    try {
      const e = await fn();
      if (e?.miembros) setEquipo(e);
      else await cargar();
      if (texto) setAviso(texto);
    } catch (err) {
      setError(err.message);
    }
  };

  const crearEquipo = (e) => {
    e.preventDefault();
    accion(() => api.equipoCrear(nombreNuevo), "Equipo creado.");
  };

  const invitar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnlace(null);
    try {
      const r = await api.equipoInvitar(invitacion);
      setEquipo(r.equipo);
      setInvitacion({ email: "", rol: "empleado" });
      setAviso(r.enviado ? `Invitación enviada a ${r.email}.` : `Invitación creada para ${r.email}. No hay servidor de correo configurado: copie el enlace y páselo por su cuenta.`);
      if (!r.enviado) setEnlace(r.enlace);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!equipo) return <div className="equipo"><h2>Equipo</h2><p className="vacio" role="status">Cargando…</p>{error && <p className="alerta error" role="alert">{error}</p>}</div>;

  // Cuenta sin equipo: solo la administradora puede crear uno.
  if (!equipo.existe) {
    return (
      <div className="equipo">
        <h2>Equipo</h2>
        <p className="nota">Su cuenta todavía no forma parte de un equipo. Un equipo permite invitar a otras escribanas, escribanos y personal administrativo, darles un rol y compartirles expedientes puntuales. Cada cuenta sigue siendo dueña de sus propios clientes, expedientes y caja: el equipo no mezcla los datos.</p>
        {error && <p className="alerta error" role="alert">{error}</p>}
        {usuario?.esAdmin ? (
          <form className="cert-form" onSubmit={crearEquipo}>
            <label className="campo"><span className="campo-titulo">Nombre de la escribanía</span>
              <input type="text" required maxLength={160} placeholder="Escribanía Pérez" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
            </label>
            <div className="acciones"><button type="submit" className="boton primario">Crear el equipo</button></div>
          </form>
        ) : (
          <p className="vacio">Para sumarse a un equipo hace falta una invitación de su titular.</p>
        )}
      </div>
    );
  }

  const esTitular = equipo.esTitular;

  return (
    <div className="equipo">
      <h2>Equipo</h2>
      <p className="nota">
        {equipo.nombre} · usted es <b>{NOMBRE_ROL[equipo.rol]}</b>. Cada cuenta es dueña de sus clientes, expedientes y caja; lo que se comparte se comparte de a un expediente por vez, desde el detalle del expediente. Las métricas son conteos: ningún contenido sale de la cuenta que lo creó.
      </p>
      {error && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>
      {enlace && (
        <p className="alerta">
          Enlace de la invitación: <span className="mono">{enlace}</span>
        </p>
      )}

      <section className="bloque primero" aria-labelledby="equipo-miembros-titulo">
        <div className="protocolo-cabecera">
          <h3 id="equipo-miembros-titulo">Integrantes <span className="etiqueta">{equipo.miembros.length}</span></h3>
          {esTitular && (
            <form className="fila" onSubmit={(e) => { e.preventDefault(); accion(() => api.equipoRenombrar(nombreNuevo), "Nombre actualizado."); }}>
              <label className="sr-only" htmlFor="equipo-nombre">Nombre de la escribanía</label>
              <input id="equipo-nombre" type="text" maxLength={160} value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
              <button type="submit" className="boton chico" disabled={!nombreNuevo.trim() || nombreNuevo === equipo.nombre}>Renombrar</button>
            </form>
          )}
        </div>
        <div className="tabla-scroll">
          <table aria-labelledby="equipo-miembros-titulo">
            <thead><tr><th scope="col">Integrante</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col" className="col-sec">Último acceso</th>{esTitular && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
            <tbody>
              {equipo.miembros.map((m) => (
                <tr key={m.usuarioId}>
                  <th scope="row">{m.nombre || "—"}<span className="recaudo-meta">{m.email}</span></th>
                  <td>
                    {esTitular && m.rol !== "titular" ? (
                      <select aria-label={`Rol de ${m.nombre || m.email}`} value={m.rol} onChange={(e) => accion(() => api.equipoCambiarRol(m.usuarioId, e.target.value), `${m.nombre || m.email} ahora es ${NOMBRE_ROL[e.target.value].toLowerCase()}.`)}>
                        <option value="escribano">Escribano/a</option>
                        <option value="empleado">Empleado/a</option>
                      </select>
                    ) : (
                      NOMBRE_ROL[m.rol]
                    )}
                  </td>
                  <td><span className={`etiqueta ${m.estado === "activo" ? "ok" : "riesgo-alto"}`}>{m.estado === "activo" ? "activo" : "suspendido"}</span></td>
                  <td className="col-sec">{m.ultimoAcceso ? fechaCorta(String(m.ultimoAcceso).slice(0, 10)) : "nunca"}</td>
                  {esTitular && (
                    <td>
                      {m.rol !== "titular" && (
                        <div className="acciones">
                          <button
                            type="button"
                            className="enlace"
                            aria-label={`${m.estado === "activo" ? "Suspender" : "Reactivar"} a ${m.nombre || m.email}`}
                            onClick={() => accion(() => api.equipoCambiarEstado(m.usuarioId, m.estado === "activo" ? "suspendido" : "activo"), `${m.nombre || m.email}: ${m.estado === "activo" ? "suspendido" : "reactivado"}.`)}
                          >
                            {m.estado === "activo" ? "suspender" : "reactivar"}
                          </button>
                          <button type="button" className="enlace" aria-label={`Quitar a ${m.nombre || m.email} del equipo`} onClick={() => setAQuitar(m)}>quitar</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>Qué puede hacer cada rol</summary>
          <ul className="recaudos sin-acciones">
            {["titular", "escribano", "empleado"].map((r) => (
              <li className="recaudo" key={r}><span /><span><b>{NOMBRE_ROL[r]}.</b> {DESCRIPCION_ROL[r]}</span></li>
            ))}
          </ul>
        </details>
      </section>

      {esTitular && (
        <section className="bloque" aria-labelledby="equipo-invitar-titulo">
          <h3 id="equipo-invitar-titulo">Invitar a alguien</h3>
          <form className="cert-form" onSubmit={invitar}>
            <div className="cert-grid">
              <label className="campo"><span className="campo-titulo">Correo</span>
                <input type="email" required maxLength={190} placeholder="persona@escribania.com" value={invitacion.email} onChange={(e) => setInvitacion({ ...invitacion, email: e.target.value })} />
              </label>
              <label className="campo"><span className="campo-titulo">Rol</span>
                <select value={invitacion.rol} aria-describedby="ayuda-rol-invitacion" onChange={(e) => setInvitacion({ ...invitacion, rol: e.target.value })}>
                  <option value="empleado">Empleado/a</option>
                  <option value="escribano">Escribano/a</option>
                </select>
              </label>
            </div>
            <p className="ayuda" id="ayuda-rol-invitacion" aria-live="polite">{DESCRIPCION_ROL[invitacion.rol]} La invitación vence en 7 días y solo la puede aceptar ese mismo correo.</p>
            <div className="acciones"><button type="submit" className="boton primario"><Icono nombre="mas" tamano={16} /> Enviar invitación</button></div>
          </form>
          {equipo.invitaciones.length > 0 && (
            <div className="tabla-scroll">
              <table aria-label="Invitaciones pendientes">
                <thead><tr><th scope="col">Correo</th><th scope="col">Rol</th><th scope="col" className="col-sec">Vence</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>
                  {equipo.invitaciones.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td>{NOMBRE_ROL[i.rol]}</td>
                      <td className="col-sec">{fechaCorta(String(i.expiraEn).slice(0, 10))}</td>
                      <td><button type="button" className="enlace" aria-label={`Cancelar la invitación a ${i.email}`} onClick={() => accion(() => api.equipoCancelarInvitacion(i.id), "Invitación cancelada.")}>cancelar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {esTitular && (
        <section className="bloque" aria-labelledby="equipo-metricas-titulo">
          <div className="protocolo-cabecera">
            <h3 id="equipo-metricas-titulo">Actividad del equipo</h3>
            <div className="segmentado" role="group" aria-label="Período de las métricas">
              {[["30", "30 días"], ["90", "90 días"], ["365", "12 meses"]].map(([v, t]) => (
                <button type="button" key={v} className={dias === v ? "activo" : ""} aria-pressed={dias === v} onClick={() => setDias(v)}>{t}</button>
              ))}
            </div>
          </div>
          {!metricas ? (
            <p className="vacio" role="status">Cargando…</p>
          ) : (
            <div className="tabla-scroll">
              <table aria-labelledby="equipo-metricas-titulo">
                <thead>
                  <tr>
                    <th scope="col">Integrante</th>
                    <th scope="col" className="num">Expedientes abiertos</th>
                    <th scope="col" className="num">Creados</th>
                    <th scope="col" className="num">Cerrados</th>
                    <th scope="col" className="num">Tareas hechas</th>
                    <th scope="col" className="num">Tareas pendientes</th>
                    <th scope="col" className="num">Turnos</th>
                    <th scope="col" className="num">Documentos IA</th>
                    <th scope="col" className="num">Comprobantes</th>
                    <th scope="col" className="num">Cobrado</th>
                  </tr>
                </thead>
                <tbody>
                  {metricas.miembros.map((m) => (
                    <tr key={m.usuarioId}>
                      <th scope="row">{m.nombre || m.email}<span className="recaudo-meta">{NOMBRE_ROL[m.rol]}</span></th>
                      <td className="num">{m.expedientesAbiertos}</td>
                      <td className="num">{m.expedientesCreados}</td>
                      <td className="num">{m.expedientesCerrados}</td>
                      <td className="num">{m.tareasCompletadas}</td>
                      <td className="num">{m.tareasPendientes}</td>
                      <td className="num">{m.turnosRealizados}</td>
                      <td className="num">{m.documentosGenerados}</td>
                      <td className="num">{m.comprobantesEmitidos}</td>
                      <td className="num">{formatoMonto(m.cobradoArs, "ARS")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="ayuda">Conteos de los últimos {metricas?.dias || dias} días (los expedientes abiertos y las tareas pendientes son el total vigente). Cobrado: pagos en pesos registrados en la caja de cada cuenta.</p>
        </section>
      )}

      <ConfirmarDialogo
        abierto={Boolean(aQuitar)}
        titulo={aQuitar ? `Quitar a ${aQuitar.nombre || aQuitar.email} del equipo` : ""}
        texto="No se borra nada suyo: sus clientes, expedientes y comprobantes siguen siendo de su cuenta. Pierde el acceso a los expedientes que le compartieron y deja de ver las notas y la agenda del equipo."
        confirmar="Quitar del equipo"
        destructivo
        onConfirmar={() => { const m = aQuitar; setAQuitar(null); accion(() => api.equipoQuitar(m.usuarioId), "Integrante quitado del equipo."); }}
        onCancelar={() => setAQuitar(null)}
      />
    </div>
  );
}
