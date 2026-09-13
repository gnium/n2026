import { useCallback, useEffect, useRef, useState } from "react";
import DropZone from "./components/DropZone.jsx";
import Pipeline from "./components/Pipeline.jsx";
import ChatLog from "./components/ChatLog.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import Configurador from "./components/Configurador.jsx";
import Acceso from "./components/Acceso.jsx";
import Configuracion from "./components/Configuracion.jsx";
import Consumo from "./components/Consumo.jsx";
import Suscripcion from "./components/Suscripcion.jsx";
import PlanesFacturacion from "./components/PlanesFacturacion.jsx";
import Protocolo from "./components/Protocolo.jsx";
import SesionesGuardadasPicker from "./components/SesionesGuardadasPicker.jsx";
import Agenda from "./components/Agenda.jsx";
import Notas from "./components/Notas.jsx";
import BibliotecaModelos from "./components/BibliotecaModelos.jsx";
import Clientes from "./components/Clientes.jsx";
import Expedientes from "./components/Expedientes.jsx";
import Caja from "./components/Caja.jsx";
import Comprobantes from "./components/Comprobantes.jsx";
import Uif from "./components/Uif.jsx";
import ParametrosUif from "./components/ParametrosUif.jsx";
import Equipo from "./components/Equipo.jsx";
import Integraciones from "./components/Integraciones.jsx";
import Novedades from "./components/Novedades.jsx";
import TemaToggle from "./components/TemaToggle.jsx";
import Icono from "./components/Iconos.jsx";
import { api } from "./api.js";

const BIENVENIDA = {
  autor: "asistente",
  ts: Date.now(),
  texto: "Hola. Arrastre el documento base (borrador, antecedentes o título) en formato .doc o .docx. Después me indica si quiere la escritura, el estudio de títulos o ambos, y puede darme instrucciones. Los datos de las partes se ocultan antes de analizarlos y nunca se guardan.",
};

const NAV = [
  {
    titulo: "Trabajo",
    items: [
      { clave: "principal", texto: "Redactar", icono: "pluma" },
      { clave: "expedientes", texto: "Expedientes", icono: "carpeta" },
      { clave: "clientes", texto: "Clientes", icono: "personas" },
      { clave: "caja", texto: "Caja", icono: "caja", rolMinimo: "escribano" },
      { clave: "comprobantes", texto: "Comprobantes", icono: "factura", rolMinimo: "escribano" },
      { clave: "uif", texto: "UIF", icono: "escudo", rolMinimo: "escribano" },
      { clave: "agenda", texto: "Agenda", icono: "calendario" },
      { clave: "notas", texto: "Notas", icono: "nota" },
      { clave: "biblioteca", texto: "Biblioteca de modelos", icono: "biblioteca" },
      { clave: "protocolo", texto: "Protocolo", icono: "protocolo", rolMinimo: "escribano" },
    ],
  },
  {
    titulo: "Cuenta",
    items: [
      { clave: "equipo", texto: "Equipo", icono: "edificio" },
      { clave: "integraciones", texto: "Integraciones", icono: "nube" },
      { clave: "consumo", texto: "Consumo de IA", icono: "grafico" },
      { clave: "suscripcion", texto: "Suscripción", icono: "tarjeta" },
    ],
  },
  {
    titulo: "Administración",
    soloAdmin: true,
    items: [{ clave: "configuracion", texto: "Configuración", icono: "ajustes" }],
  },
];
const TITULO = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.clave, i.texto])));
// Roles del equipo: el personal administrativo no ve protocolo, caja, comprobantes ni UIF.
const RANGO_ROL = { empleado: 1, escribano: 2, titular: 3 };
const puedeVer = (usuario, rolMinimo) => !rolMinimo || (RANGO_ROL[usuario?.rol] || RANGO_ROL.escribano) >= RANGO_ROL[rolMinimo];

export default function App() {
  const [salud, setSalud] = useState(null);
  const [usuario, setUsuario] = useState(undefined); // undefined = verificando, null = sin sesion
  const [pantalla, setPantalla] = useState(window.location.pathname === "/suscripcion" ? "suscripcion" : "principal");
  const recargarSalud = () => api.salud().then(setSalud).catch(() => setSalud({ ok: false }));
  const sondeo = useRef(null);
  const [sesionId, setSesionId] = useState(null);
  const [estado, setEstado] = useState("inicio"); // inicio | configurando | subiendo | en_curso | completada | fallida
  const [archivoElegido, setArchivoElegido] = useState(null);
  const [modoInicial, setModoInicial] = useState("escritura");
  const [modoSesion, setModoSesion] = useState("completo");
  const [skills, setSkills] = useState([]);
  const [mensajes, setMensajes] = useState([BIENVENIDA]);
  const [resultados, setResultados] = useState(null);
  const [numeroIteracion, setNumeroIteracion] = useState(1);
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [expedienteAbierto, setExpedienteAbierto] = useState(null);
  const [invitacion, setInvitacion] = useState(() => new URLSearchParams(window.location.search).get("invitacion"));
  const [avisoGoogle] = useState(() => new URLSearchParams(window.location.search).get("google"));
  const cerrarSSE = useRef(null);
  const sesionIdRef = useRef(null);

  useEffect(() => {
    api.salud().then(setSalud).catch(() => setSalud({ ok: false }));
    api.yo().then((r) => setUsuario(r.usuario)).catch(() => setUsuario(null));
    return () => {
      cerrarSSE.current?.();
      clearInterval(sondeo.current);
    };
  }, []);

  // Vuelta de Google: el backend redirige a /?google=<resultado>.
  useEffect(() => {
    if (!avisoGoogle || !usuario) return;
    window.history.replaceState({}, "", window.location.pathname);
    setPantalla("integraciones");
  }, [avisoGoogle, usuario]);

  // Invitacion a un equipo: el enlace del correo abre la app con ?invitacion=<token>.
  useEffect(() => {
    if (!invitacion || !usuario) return;
    const limpiarUrl = () => window.history.replaceState({}, "", window.location.pathname);
    api
      .equipoAceptarInvitacion(invitacion)
      .then(async () => {
        limpiarUrl();
        setInvitacion(null);
        const r = await api.yo();
        setUsuario(r.usuario);
        setPantalla("equipo");
      })
      .catch((e) => {
        limpiarUrl();
        setInvitacion(null);
        setErrorGeneral(e.message);
      });
  }, [invitacion, usuario]);

  const irA = (p) => {
    if (window.location.pathname === "/suscripcion") window.history.replaceState({}, "", "/");
    setPantalla(p);
  };
  const abrirExpediente = (id) => {
    setExpedienteAbierto(id);
    irA("expedientes");
  };

  const salir = async () => {
    await api.logout().catch(() => {});
    cerrarSSE.current?.();
    clearInterval(sondeo.current);
    setUsuario(null);
  };

  const agregarMensaje = useCallback((m) => setMensajes((prev) => [...prev, { ts: Date.now(), ...m }]), []);

  const procesarEvento = useCallback(
    (ev) => {
      if (ev.tipo === "mensaje") agregarMensaje({ autor: "asistente", texto: ev.texto, nivel: ev.nivel, ts: ev.ts });
      else if (ev.tipo === "skill") setSkills((prev) => prev.map((s) => (s.clave === ev.skill.clave ? ev.skill : s)));
      else if (ev.tipo === "estado") {
        if (ev.skills) setSkills(ev.skills);
        if (ev.estado === "fallida") {
          setEstado("fallida");
          setErrorGeneral(ev.error);
          agregarMensaje({ autor: "asistente", nivel: "error", texto: `El proceso se detuvo: ${ev.error?.mensaje || "error desconocido"}` });
        } else if (ev.estado === "completada") setEstado("completada");
      } else if (ev.tipo === "fin") {
        clearInterval(sondeo.current);
        if (ev.estado !== "completada") return;
        api.estadoSesion(sesionIdRef.current).then((s) => { setResultados(s.resultados); setNumeroIteracion(s.numeroIteracion || 1); }).catch(() => {});
      }
    },
    [agregarMensaje],
  );

  const onArchivo = (archivo) => {
    setArchivoElegido(archivo);
    setModoInicial("escritura");
    setErrorGeneral(null);
    setEstado("configurando");
  };

  const onSinDocumento = () => {
    setArchivoElegido(null);
    setModoInicial("escritura");
    setErrorGeneral(null);
    setEstado("configurando");
  };

  const NOMBRE_MODO = { escritura: "redactar la escritura", estudio_titulos: "estudio de títulos", completo: "análisis completo", certificacion_firmas: "certificación de firmas" };

  const onProcesar = async ({ archivo, modo, antecedentes, instrucciones, modelo, modeloBibliotecaId, datos }) => {
    setEstado("subiendo");
    setErrorGeneral(null);
    setResultados(null);
    setNumeroIteracion(1);
    setSkills([]);
    setModoSesion(modo);
    const resumenAntecedentes = !archivo && antecedentes ? (antecedentes.length > 140 ? antecedentes.slice(0, 140) + "…" : antecedentes) : null;
    agregarMensaje({ autor: "usuario", texto: `${archivo ? archivo.name : resumenAntecedentes ? "Antecedentes escritos: " + resumenAntecedentes : "Sin documento"}${modelo ? " + modelo " + modelo.name : ""} · ${NOMBRE_MODO[modo]}${datos ? " (" + (datos.modalidad === "representacion" ? "con representación" : "a título personal") + ")" : ""}${instrucciones ? "\n" + instrucciones : ""}` });
    try {
      const r = await api.subirDocumento({ archivo, modo, antecedentes, instrucciones, modelo, modeloBibliotecaId, datos });
      setSesionId(r.sesionId);
      sesionIdRef.current = r.sesionId;
      setEstado("en_curso");
      escuchar(r.sesionId);
    } catch (e) {
      setEstado("fallida");
      setErrorGeneral({ codigo: e.codigo, mensaje: e.message });
      agregarMensaje({ autor: "asistente", nivel: "error", texto: `No pude procesar el archivo: ${e.message}` });
    }
  };

  const iterar = async (feedback) => {
    if (!sesionId) return;
    setErrorGeneral(null);
    try {
      const r = await api.iterar(sesionId, feedback);
      agregarMensaje({ autor: "usuario", texto: feedback ? `Pedido de mejora: ${feedback}` : "Generar otra versión" });
      setNumeroIteracion(r.numeroIteracion || numeroIteracion + 1);
      setEstado("en_curso");
      escuchar(sesionId);
    } catch (e) {
      setErrorGeneral({ codigo: e.codigo, mensaje: e.message });
      if (e.codigo === "SESION_INEXISTENTE" || e.codigo === "SESION_SIN_DATOS") {
        setSesionId(null);
        sesionIdRef.current = null;
        agregarMensaje({ autor: "asistente", nivel: "error", texto: "La sesión ya no está disponible: vuelva a cargar el documento." });
      }
    }
  };

  const reintentar = async () => {
    if (!sesionId) return;
    setErrorGeneral(null);
    setEstado("en_curso");
    try {
      await api.reintentar(sesionId);
      escuchar(sesionId);
    } catch (e) {
      setEstado("fallida");
      setErrorGeneral({ codigo: e.codigo, mensaje: e.message });
      if (e.codigo === "SESION_INEXISTENTE" || e.codigo === "SESION_SIN_DATOS") {
        setSesionId(null);
        sesionIdRef.current = null;
        agregarMensaje({ autor: "asistente", nivel: "error", texto: "La sesión ya no está disponible: vuelva a cargar el documento." });
      }
    }
  };

  const escuchar = (id) => {
    cerrarSSE.current?.();
    clearInterval(sondeo.current);
    const sondear = async () => {
      try {
        const s = await api.estadoSesion(id);
        setSkills(s.skills);
        if (s.estado === "completada") {
          clearInterval(sondeo.current);
          setEstado("completada");
          setResultados(s.resultados);
          setNumeroIteracion(s.numeroIteracion || 1);
        } else if (s.estado === "fallida") {
          clearInterval(sondeo.current);
          setEstado("fallida");
          setErrorGeneral(s.error);
        }
      } catch (e) {
        if (e.codigo === "SESION_INEXISTENTE" || e.codigo === "NO_AUTENTICADO") clearInterval(sondeo.current);
      }
    };
    cerrarSSE.current = api.escucharEventos(id, procesarEvento, () => {
      // Si el SSE no esta disponible (por ejemplo detras de un proxy que no lo soporta), seguimos por sondeo.
      clearInterval(sondeo.current);
      sondeo.current = setInterval(sondear, 3000);
      sondear();
    });
  };

  const reiniciar = async () => {
    cerrarSSE.current?.();
    clearInterval(sondeo.current);
    if (sesionId) await api.cerrarSesion(sesionId).catch(() => {});
    setSesionId(null);
    sesionIdRef.current = null;
    setArchivoElegido(null);
    setEstado("inicio");
    setSkills([]);
    setResultados(null);
    setNumeroIteracion(1);
    setErrorGeneral(null);
    setMensajes([{ ...BIENVENIDA, ts: Date.now() }]);
  };

  const onDescargado = () => {
    agregarMensaje({ autor: "asistente", nivel: "ok", texto: "Documento descargado. La sesión fue cerrada y los datos borrados de la memoria del servidor." });
    setSesionId(null);
    sesionIdRef.current = null;
    setEstado("inicio");
  };

  const guardarSesionActual = async () => {
    if (!sesionId) return;
    try {
      await api.guardarSesion(sesionId);
      agregarMensaje({ autor: "asistente", nivel: "ok", texto: "Sesión guardada. Podrá reanudarla desde \"Reanudar sesión guardada\", en la pantalla de inicio." });
      setSesionId(null);
      sesionIdRef.current = null;
      setEstado("inicio");
    } catch (e) {
      setErrorGeneral({ codigo: e.codigo, mensaje: e.message });
    }
  };

  const reanudarGuardada = async (id) => {
    try {
      const s = await api.reanudarSesionGuardada(id);
      setSesionId(s.id);
      sesionIdRef.current = s.id;
      setModoSesion(s.modo);
      setSkills(s.skills || []);
      setResultados(s.resultados);
      setNumeroIteracion(s.numeroIteracion || 1);
      setErrorGeneral(s.estado === "fallida" ? s.error : null);
      setEstado(s.estado);
      agregarMensaje({ autor: "asistente", nivel: "ok", texto: "Sesión reanudada." });
    } catch (e) {
      agregarMensaje({ autor: "asistente", nivel: "error", texto: `No se pudo reanudar la sesión: ${e.message}` });
    }
  };

  const ocupado = estado === "subiendo" || estado === "en_curso";

  if (usuario === undefined) return <div className="cargando">Cargando…</div>;
  if (!usuario) return <Acceso onIngreso={setUsuario} invitacion={invitacion} />;

  const estadoIA = !salud ? "" : !salud.ok ? "error" : salud.modo === "simulado" ? "alerta" : "ok";
  const textoIA = salud === null ? "Conectando…" : !salud.ok ? "Servidor no disponible" : salud.modo === "real" ? "Claude conectado" : salud.modo === "gemini" ? `Gemini · ${salud.modelo}` : salud.modo === "local" ? `IA local · ${salud.modelo}` : "Sin IA configurada";

  const pantallaSimple = {
    expedientes: <Expedientes inicialId={expedienteAbierto} onConsumirInicial={() => setExpedienteAbierto(null)} />,
    clientes: <Clientes onAbrirExpediente={abrirExpediente} />,
    caja: <Caja />,
    comprobantes: <Comprobantes />,
    uif: <Uif onAbrirExpediente={abrirExpediente} esAdmin={usuario.esAdmin} />,
    equipo: <Equipo usuario={usuario} />,
    integraciones: <Integraciones usuario={usuario} aviso={avisoGoogle} />,
    agenda: <Agenda />,
    notas: <Notas />,
    biblioteca: <BibliotecaModelos />,
    protocolo: <Protocolo />,
    consumo: <Consumo esAdmin={usuario.esAdmin} />,
    suscripcion: <Suscripcion />,
  }[pantalla];

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="sidebar-marca" href="/" onClick={(e) => { e.preventDefault(); irA("principal"); }}>
          <span className="marca-sello" aria-hidden="true"><Icono nombre="sello" tamano={20} /></span>
          <span>
            <strong>Doy Fe</strong>
            <small>IA para escribanías</small>
          </span>
        </a>
        <nav aria-label="Secciones">
          {NAV.filter((g) => !g.soloAdmin || usuario.esAdmin)
            .map((g) => ({ ...g, items: g.items.filter((i) => puedeVer(usuario, i.rolMinimo)) }))
            .filter((g) => g.items.length)
            .map((g) => (
            <div className="nav-grupo" key={g.titulo}>
              <div className="nav-titulo">{g.titulo}</div>
              {g.items.map((i) => (
                <button key={i.clave} type="button" className={`nav-item ${pantalla === i.clave ? "activo" : ""}`} aria-current={pantalla === i.clave ? "page" : undefined} aria-label={i.texto} onClick={() => irA(i.clave)} title={i.texto}>
                  <Icono nombre={i.icono} tamano={18} />
                  <span>{i.texto}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-pie">
          <TemaToggle />
        </div>
      </aside>

      <div className="area">
        <header className="topbar">
          <div className="topbar-titulo">{TITULO[pantalla]}</div>
          <div className="topbar-derecha">
            {usuario.esAdmin ? (
              <button type="button" className={`estado-servidor ${estadoIA}`} aria-label={`Estado de la IA: ${textoIA}. Abrir configuración`} title={`${textoIA} · clic para configurar la IA`} onClick={() => irA("configuracion")}>
                <span className="estado-servidor-texto">{textoIA}</span>
              </button>
            ) : (
              <div className={`estado-servidor ${estadoIA}`} role="status" aria-label={`Estado de la IA: ${textoIA}`} title={textoIA}>
                <span className="estado-servidor-texto">{textoIA}</span>
              </div>
            )}
            <div className="usuario">
              <span title={usuario.email}>{usuario.nombre || usuario.email}</span>
              {usuario.esAdmin && <span className="admin-badge">admin</span>}
              <button type="button" className="boton discreto chico" onClick={salir} title="Cerrar sesión">
                <Icono nombre="salir" tamano={16} /> Salir
              </button>
            </div>
          </div>
        </header>

        <main className="contenido">
          {pantalla === "configuracion" ? (
            <div className="principal una-columna">
              <section className="columna" aria-label="Configuración">
                <Configuracion onCambio={recargarSalud} />
                <ParametrosUif />
                <PlanesFacturacion />
              </section>
            </div>
          ) : pantallaSimple ? (
            <div className="principal una-columna">
              <section className="columna" aria-label={TITULO[pantalla]}>{pantallaSimple}</section>
            </div>
          ) : (
            <div className="principal">
              <section className="columna izquierda" aria-label="Conversación">
                {estado === "inicio" && <Novedades onIr={irA} onAbrirExpediente={abrirExpediente} />}
                <ChatLog mensajes={mensajes} />
                {estado === "inicio" || estado === "fallida" ? (
                  <>
                    <DropZone onArchivo={onArchivo} onSinDocumento={onSinDocumento} deshabilitado={!salud?.ok} />
                    {estado === "inicio" && <SesionesGuardadasPicker onReanudar={reanudarGuardada} />}
                  </>
                ) : estado === "configurando" ? (
                  <Configurador archivo={archivoElegido} modoInicial={modoInicial} onProcesar={onProcesar} onCancelar={() => { setArchivoElegido(null); setEstado("inicio"); }} deshabilitado={!salud?.ok} />
                ) : (
                  <div className="acciones-proceso">
                    {estado === "completada" ? null : <p className="nota" role="status">Procesando… puede tardar varios minutos según el tamaño del documento.</p>}
                    <button className="boton" onClick={reiniciar} disabled={estado === "subiendo"}>
                      {ocupado ? "Cancelar y empezar de nuevo" : "Nuevo documento"}
                    </button>
                  </div>
                )}
                {errorGeneral && (
                  <p className="alerta error" role="alert">
                    {errorGeneral.mensaje} {errorGeneral.codigo && <small>({errorGeneral.codigo})</small>}
                  </p>
                )}
                {estado === "fallida" && sesionId && (
                  <div className="acciones">
                    <button className="boton primario" onClick={reintentar}>Reintentar desde la etapa que falló</button>
                    {usuario.esAdmin && <button className="boton" onClick={() => irA("configuracion")}>Cambiar proveedor de IA</button>}
                    <button className="boton" onClick={guardarSesionActual}>Guardar y continuar después</button>
                    <small className="ayuda">El documento y las instrucciones siguen en memoria (hasta 30 minutos); no hace falta volver a cargarlos.</small>
                  </div>
                )}
              </section>

              <section className="columna derecha" aria-label="Progreso y resultados">
                <h2>Etapas del análisis</h2>
                {skills.length ? <Pipeline skills={skills} /> : <p className="vacio">Las etapas aparecerán aquí al procesar un documento.</p>}
                {estado === "completada" && resultados && sesionId && (
                  <ResultPanel resultados={resultados} modo={modoSesion} numeroIteracion={numeroIteracion} urlDescarga={api.urlDocumento(sesionId)} sesionId={sesionId} onDescargado={onDescargado} onNuevo={reiniciar} onIterar={iterar} onGuardar={guardarSesionActual} onAbrirExpediente={abrirExpediente} />
                )}
              </section>
            </div>
          )}
        </main>

        <footer className="pie">
          Los nombres, documentos, domicilios y datos catastrales se anonimizan antes del análisis y se conservan solo en la memoria del servidor hasta que descarga el documento o cierra la sesión. Excepciones, siempre a su pedido: el índice de protocolo y "Guardar y continuar después" (cifrados); agenda, notas y biblioteca de modelos (sin cifrar).
        </footer>
      </div>
    </div>
  );
}
