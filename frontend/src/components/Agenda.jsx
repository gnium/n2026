import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HORA_DESDE = 8;
const HORA_HASTA = 20;
const RECORDATORIOS = [
  { valor: 0, texto: "Sin recordatorio" },
  { valor: 15, texto: "15 minutos antes" },
  { valor: 60, texto: "1 hora antes" },
  { valor: 1440, texto: "1 día antes" },
  { valor: 2880, texto: "2 días antes" },
];
const ESTADOS = ["pendiente", "confirmado", "cancelado", "realizado"];

const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sumarDias = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const lunesDeSemana = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const hora = (d) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const hoy = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function borradorVacio(fecha = new Date()) {
  const f = new Date(fecha);
  const mins = f.getMinutes();
  if (mins % 30 !== 0) f.setMinutes(mins < 30 ? 30 : 60, 0, 0); // setMinutes(60,...) rueda a la hora siguiente
  return {
    id: null,
    titulo: "",
    notas: "",
    fecha: toISODate(f),
    hora: `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`,
    duracionMin: 30,
    recordatorioMinutosAntes: 1440,
    estado: "pendiente",
    compartido: false,
  };
}

export default function Agenda() {
  const [vista, setVista] = useState("mes");
  const [fechaRef, setFechaRef] = useState(hoy());
  const [turnos, setTurnos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const dialogo = useRef(null);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (formulario && !d.open) {
      d.showModal();
      d.querySelector("input")?.focus();
    } else if (!formulario && d.open) d.close();
  }, [formulario]);

  const { desde, hasta, diasGrilla } = useMemo(() => {
    if (vista === "semana") {
      const inicio = lunesDeSemana(fechaRef);
      const dias = Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));
      return { desde: inicio, hasta: sumarDias(inicio, 7), diasGrilla: dias };
    }
    const primerDiaMes = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), 1);
    const inicioGrilla = lunesDeSemana(primerDiaMes);
    const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicioGrilla, i));
    return { desde: inicioGrilla, hasta: sumarDias(inicioGrilla, 42), diasGrilla: dias };
  }, [vista, fechaRef]);

  const [verEquipo, setVerEquipo] = useState(false);

  const cargar = async () => {
    setError(null);
    setAviso(null);
    try {
      setTurnos(await api.turnosListar(toISODate(desde), toISODate(hasta), verEquipo));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, fechaRef, verEquipo]);

  const turnosDelDia = (d) => (turnos || []).filter((t) => toISODate(new Date(t.fechaHora)) === toISODate(d)).sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));

  const abrirNuevo = (fecha) => {
    setError(null);
    setAviso(null);
    setFormulario(borradorVacio(fecha || new Date()));
  };

  const abrirEdicion = (t) => {
    setError(null);
    setAviso(null);
    if (t.esPropio === false) {
      setAviso(`Este turno lo agendó ${t.autor || "otra cuenta del equipo"}: solo esa cuenta puede editarlo.`);
      return;
    }
    const f = new Date(t.fechaHora);
    setFormulario({
      id: t.id,
      titulo: t.titulo,
      notas: t.notas || "",
      fecha: toISODate(f),
      hora: `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`,
      duracionMin: t.duracionMin,
      recordatorioMinutosAntes: t.recordatorioMinutosAntes,
      estado: t.estado,
      compartido: t.compartido,
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const datos = {
        titulo: formulario.titulo.trim(),
        notas: formulario.notas.trim() || null,
        fechaHora: `${formulario.fecha}T${formulario.hora}:00`,
        duracionMin: Number(formulario.duracionMin),
        recordatorioMinutosAntes: Number(formulario.recordatorioMinutosAntes),
        estado: formulario.estado,
        compartido: Boolean(formulario.compartido),
      };
      if (formulario.id) await api.turnoActualizar(formulario.id, datos);
      else await api.turnoCrear(datos);
      setFormulario(null);
      cargar();
      setAviso(formulario.id ? "Turno actualizado." : "Turno agendado.");
    } catch (e) {
      setError(e.message);
    }
  };

  const cambiarEstado = async (id, estado) => {
    setError(null);
    try {
      await api.turnoEstado(id, estado);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const borrar = async (id) => {
    setError(null);
    try {
      await api.turnoBorrar(id);
      setFormulario(null);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const tituloRango = capitalizar(
    vista === "semana"
      ? `${desde.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} – ${sumarDias(hasta, -1).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`
      : fechaRef.toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
  );

  const irA = (delta) => setFechaRef(vista === "semana" ? sumarDias(fechaRef, delta * 7) : new Date(fechaRef.getFullYear(), fechaRef.getMonth() + delta, 1));

  const franjas = [];
  for (let h = HORA_DESDE; h < HORA_HASTA; h++) {
    franjas.push({ h, m: 0 });
    franjas.push({ h, m: 30 });
  }
  const filaDe = (d) => {
    const idx = (d.getHours() - HORA_DESDE) * 2 + (d.getMinutes() >= 30 ? 1 : 0);
    return Math.min(Math.max(idx, 0), franjas.length - 1);
  };

  return (
    <div className="agenda">
      <h2>Agenda</h2>
      <p className="nota">
        El título y las notas de cada turno se guardan en texto plano en la base de datos (no cifrados como el índice de protocolo). Evite anotar datos innecesarios; el nombre del cliente alcanza para identificar el turno.
      </p>
      {error && !formulario && <p className="alerta error" role="alert">{error}</p>}
      <p className={`alerta ok ${aviso ? "" : "sr-only"}`} role="status">{aviso}</p>

      <div className="acciones agenda-toolbar">
        <div className="acciones">
          <button type="button" className="boton" onClick={() => irA(-1)} aria-label={vista === "semana" ? "Semana anterior" : "Mes anterior"}><Icono nombre="izquierda" tamano={16} /></button>
          <button type="button" className="boton" onClick={() => setFechaRef(hoy())}>Hoy</button>
          <button type="button" className="boton" onClick={() => irA(1)} aria-label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"}><Icono nombre="derecha" tamano={16} /></button>
          <strong className="agenda-rango">{tituloRango}</strong>
        </div>
        <div className="acciones">
          <div className="segmentado" role="group" aria-label="Vista">
            <button type="button" className={vista === "mes" ? "activo" : ""} aria-pressed={vista === "mes"} onClick={() => setVista("mes")}>Mes</button>
            <button type="button" className={vista === "semana" ? "activo" : ""} aria-pressed={vista === "semana"} onClick={() => setVista("semana")}>Semana</button>
          </div>
          <div className="segmentado" role="group" aria-label="Turnos que se muestran">
            <button type="button" className={verEquipo ? "" : "activo"} aria-pressed={!verEquipo} onClick={() => setVerEquipo(false)}>Míos</button>
            <button type="button" className={verEquipo ? "activo" : ""} aria-pressed={verEquipo} onClick={() => setVerEquipo(true)}>Equipo</button>
          </div>
          <button type="button" className="boton primario" onClick={() => abrirNuevo(diaSeleccionado || new Date())}><Icono nombre="mas" tamano={16} /> Nuevo turno</button>
        </div>
      </div>

      {turnos === null ? (
        <p className="vacio">Cargando…</p>
      ) : vista === "mes" ? (
        <div className="agenda-mes">
          {DIAS.map((d) => (
            <div className="agenda-mes-encabezado" key={d}>{d}</div>
          ))}
          {diasGrilla.map((d) => {
            const delMes = d.getMonth() === fechaRef.getMonth();
            const esHoy = toISODate(d) === toISODate(hoy());
            const tDia = turnosDelDia(d);
            const seleccionada = Boolean(diaSeleccionado && toISODate(diaSeleccionado) === toISODate(d));
            return (
              <button
                type="button"
                key={toISODate(d)}
                className={`agenda-celda ${delMes ? "" : "fuera-de-mes"} ${esHoy ? "es-hoy" : ""} ${seleccionada ? "seleccionada" : ""}`}
                aria-label={`${d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}${esHoy ? ", hoy" : ""}, ${tDia.length} turno${tDia.length === 1 ? "" : "s"}${tDia.length ? `: ${tDia.map((t) => `${hora(new Date(t.fechaHora))} ${t.titulo}${t.esPropio === false ? `, agendado por ${t.autor}` : ""}`).join("; ")}` : ""}`}
                aria-pressed={seleccionada}
                onClick={() => setDiaSeleccionado(d)}
              >
                <span className="agenda-celda-numero">{d.getDate()}</span>
                <span className="agenda-celda-chips">
                  {tDia.slice(0, 3).map((t) => (
                    <span key={t.id} className={`agenda-chip estado-${t.estado} ${t.esPropio === false ? "ajeno" : ""}`} title={t.esPropio === false ? `${t.titulo} · ${t.autor}` : t.titulo}>{hora(new Date(t.fechaHora))} {t.titulo}{t.esPropio === false && <span className="sr-only"> · agendado por {t.autor}</span>}</span>
                  ))}
                  {tDia.length > 3 && <span className="agenda-chip-mas">+{tDia.length - 3} más</span>}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="agenda-semana-scroll">
          <div className="agenda-semana" style={{ gridTemplateRows: `auto repeat(${franjas.length}, 26px)` }}>
            <div className="agenda-semana-esquina" />
            {diasGrilla.map((d) => (
              <div className={`agenda-semana-encabezado ${toISODate(d) === toISODate(hoy()) ? "es-hoy" : ""}`} key={toISODate(d)}>
                {DIAS[(d.getDay() + 6) % 7]} {d.getDate()}
              </div>
            ))}
            {franjas.map((f, i) => (
              <div className="agenda-semana-hora" style={{ gridRow: i + 2 }} key={i}>
                {f.m === 0 ? `${String(f.h).padStart(2, "0")}:00` : ""}
              </div>
            ))}
            {diasGrilla.map((d, col) =>
              franjas.map((_, fila) => (
                <button
                  type="button"
                  key={`${col}-${fila}`}
                  className="agenda-semana-slot"
                  style={{ gridColumn: col + 2, gridRow: fila + 2 }}
                  aria-label={`Nuevo turno el ${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()} a las ${String(HORA_DESDE + Math.floor(fila / 2)).padStart(2, "0")}:${fila % 2 ? "30" : "00"}`}
                  onClick={() => abrirNuevo(new Date(d.getFullYear(), d.getMonth(), d.getDate(), HORA_DESDE + Math.floor(fila / 2), fila % 2 ? 30 : 0))}
                />
              )),
            )}
            {diasGrilla.map((d, col) =>
              turnosDelDia(d).map((t) => {
                const inicio = new Date(t.fechaHora);
                const filaInicio = filaDe(inicio);
                const span = Math.max(1, Math.round(t.duracionMin / 30));
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={`agenda-turno estado-${t.estado} ${t.esPropio === false ? "ajeno" : ""}`}
                    style={{ gridColumn: col + 2, gridRow: `${filaInicio + 2} / span ${span}` }}
                    onClick={() => abrirEdicion(t)}
                  >
                    <span className="agenda-turno-hora">{hora(inicio)}</span> {t.titulo}{t.esPropio === false && <span className="agenda-turno-autor"> · {t.autor}</span>}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}

      {vista === "mes" && diaSeleccionado && (
        <div className="agenda-dia-panel">
          <div className="protocolo-cabecera">
            <h3>{capitalizar(diaSeleccionado.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }))}</h3>
            <button type="button" className="enlace" onClick={() => abrirNuevo(diaSeleccionado)}>+ nuevo turno</button>
          </div>
          {turnosDelDia(diaSeleccionado).length === 0 ? (
            <p className="vacio">Sin turnos para este día.</p>
          ) : (
            <ul className="agenda-dia-lista">
              {turnosDelDia(diaSeleccionado).map((t) => (
                <li key={t.id} className={`estado-${t.estado}`}>
                  <button type="button" className="enlace" onClick={() => abrirEdicion(t)}>{hora(new Date(t.fechaHora))} · {t.titulo}{t.esPropio === false && ` · ${t.autor}`}</button>
                  <select value={t.estado} disabled={t.esPropio === false} onChange={(e) => cambiarEstado(t.id, e.target.value)}>
                    {ESTADOS.map((es) => (
                      <option key={es} value={es}>{es}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <dialog ref={dialogo} className="modal" aria-labelledby="turno-form-titulo" onClose={() => setFormulario(null)} onClick={(e) => e.target === dialogo.current && setFormulario(null)}>
        {formulario && (
        <form className="cert-form modal-caja" onSubmit={guardar}>
          <div className="protocolo-cabecera">
            <h3 id="turno-form-titulo">{formulario.id ? "Editar turno" : "Nuevo turno"}</h3>
            <button type="button" className="boton discreto chico" aria-label="Cerrar" onClick={() => setFormulario(null)}><Icono nombre="cruz" tamano={16} /></button>
          </div>
          {error && <p className="alerta error" role="alert">{error}</p>}
          <div className="cert-grid">
            <label className="campo">
              <span className="campo-titulo">Título</span>
              <input type="text" autoFocus value={formulario.titulo} onChange={(e) => setFormulario({ ...formulario, titulo: e.target.value })} placeholder="Firma escritura - Juan Pérez" required maxLength={200} />
            </label>
            <label className="campo">
              <span className="campo-titulo">Estado</span>
              <select value={formulario.estado} onChange={(e) => setFormulario({ ...formulario, estado: e.target.value })}>
                {ESTADOS.map((es) => (
                  <option key={es} value={es}>{es}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span className="campo-titulo">Fecha</span>
              <input type="date" value={formulario.fecha} onChange={(e) => setFormulario({ ...formulario, fecha: e.target.value })} required />
            </label>
            <label className="campo">
              <span className="campo-titulo">Hora</span>
              <input type="time" value={formulario.hora} onChange={(e) => setFormulario({ ...formulario, hora: e.target.value })} required />
            </label>
            <label className="campo">
              <span className="campo-titulo">Duración (minutos)</span>
              <input type="number" min="15" step="15" value={formulario.duracionMin} onChange={(e) => setFormulario({ ...formulario, duracionMin: e.target.value })} />
            </label>
            <label className="campo">
              <span className="campo-titulo">Recordatorio por email</span>
              <select value={formulario.recordatorioMinutosAntes} onChange={(e) => setFormulario({ ...formulario, recordatorioMinutosAntes: e.target.value })}>
                {RECORDATORIOS.map((r) => (
                  <option key={r.valor} value={r.valor}>{r.texto}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="campo">
            <span className="campo-titulo">Notas (opcional)</span>
            <textarea rows={2} value={formulario.notas} onChange={(e) => setFormulario({ ...formulario, notas: e.target.value })} maxLength={1000} />
          </label>
          <label className="chequeo">
            <input type="checkbox" checked={Boolean(formulario.compartido)} onChange={(e) => setFormulario({ ...formulario, compartido: e.target.checked })} />
            Mostrar este turno en la agenda del equipo
          </label>
          <div className="acciones">
            <button type="submit" className="boton primario">Guardar</button>
            <button type="button" className="boton" onClick={() => setFormulario(null)}>Cancelar</button>
            {formulario.id && <button type="button" className="boton" onClick={() => borrar(formulario.id)}>Borrar turno</button>}
          </div>
        </form>
        )}
      </dialog>
    </div>
  );
}
