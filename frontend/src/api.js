const BASE = "/api";

async function manejar(res) {
  if (res.ok) return res.status === 204 ? null : res.json();
  let err;
  try {
    err = (await res.json()).error;
  } catch {
    err = { codigo: "HTTP_" + res.status, mensaje: res.statusText };
  }
  throw Object.assign(new Error(err.mensaje || "Error"), { codigo: err.codigo });
}

const json = (metodo, ruta, cuerpo) =>
  fetch(`${BASE}${ruta}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }).then(manejar);

export const api = {
  salud: () => fetch(`${BASE}/salud`).then(manejar),

  // --- autenticacion (cookie httpOnly, mismo origen) ---
  yo: () => fetch(`${BASE}/auth/yo`).then(manejar),
  login: (email, password) => json("POST", "/auth/login", { email, password }),
  registro: (datos) => json("POST", "/auth/registro", datos),
  logout: () => json("POST", "/auth/logout"),
  recuperar: (email) => json("POST", "/auth/recuperar", { email }),
  restablecer: (token, password) => json("POST", "/auth/restablecer", { token, password }),

  // --- configuracion de la IA (clave cifrada en el servidor) ---
  configuracionIA: () => fetch(`${BASE}/configuracion/ia`).then(manejar),
  guardarConfiguracionIA: (datos) => json("PUT", "/configuracion/ia", datos),
  probarConexionIA: (datos) => json("POST", "/configuracion/ia/probar", datos),
  modelosGemini: (geminiApiKey) => json("POST", "/configuracion/ia/gemini/modelos", { geminiApiKey }),

  // --- costos ---
  consumo: (dias = 30) => fetch(`${BASE}/consumo?dias=${dias}`).then(manejar),
  precios: () => fetch(`${BASE}/configuracion/precios`).then(manejar),
  guardarPrecio: (datos) => json("PUT", "/configuracion/precios", datos),
  borrarPrecio: (proveedor, modelo) => fetch(`${BASE}/configuracion/precios/${proveedor}/${encodeURIComponent(modelo)}`, { method: "DELETE" }).then(manejar),

  // --- suscripcion y facturacion (Mercado Pago, ARS) ---
  planesDisponibles: () => fetch(`${BASE}/suscripcion/planes`).then(manejar),
  miSuscripcion: () => fetch(`${BASE}/suscripcion`).then(manejar),
  suscribirse: (planClave) => json("POST", "/suscripcion", { planClave }),
  cancelarSuscripcion: () => json("POST", "/suscripcion/cancelar"),
  planesAdmin: () => fetch(`${BASE}/configuracion/planes`).then(manejar),
  guardarPlan: (datos) => json("PUT", "/configuracion/planes", datos),
  parametrosFacturacion: () => fetch(`${BASE}/configuracion/planes/facturacion`).then(manejar),
  guardarParametrosFacturacion: (datos) => json("PUT", "/configuracion/planes/facturacion", datos),

  subirDocumento: ({ archivo, modo = "completo", antecedentes = "", instrucciones = "", modelo = null, modeloBibliotecaId = null, datos = null }) => {
    const fd = new FormData();
    if (archivo) fd.append("archivo", archivo);
    fd.append("modo", modo);
    if (antecedentes) fd.append("antecedentes", antecedentes);
    if (instrucciones) fd.append("instrucciones", instrucciones);
    if (modelo) fd.append("modelo", modelo);
    else if (modeloBibliotecaId) fd.append("modeloBibliotecaId", modeloBibliotecaId);
    if (datos) fd.append("datos", JSON.stringify(datos));
    return fetch(`${BASE}/sesiones`, { method: "POST", body: fd }).then(manejar);
  },

  estadoSesion: (id) => fetch(`${BASE}/sesiones/${id}`).then(manejar),

  /** Abre el flujo SSE. Devuelve una funcion para cerrarlo. */
  escucharEventos: (id, onEvento, onError) => {
    const es = new EventSource(`${BASE}/sesiones/${id}/eventos`);
    es.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data);
        onEvento(ev);
        if (ev.tipo === "fin") es.close();
      } catch {
        /* ignorar */
      }
    };
    es.onerror = () => {
      es.close();
      onError?.();
    };
    return () => es.close();
  },

  reintentar: (id) => json("POST", `/sesiones/${id}/reintentar`),
  iterar: (id, feedback) => json("POST", `/sesiones/${id}/iterar`, { feedback }),

  urlDocumento: (id) => `${BASE}/sesiones/${id}/documento`,

  cerrarSesion: (id) => fetch(`${BASE}/sesiones/${id}`, { method: "DELETE" }).then(manejar),

  // --- guardar y reanudar sesiones ---
  guardarSesion: (id) => json("POST", `/sesiones/${id}/guardar`),
  listarSesionesGuardadas: () => fetch(`${BASE}/sesiones-guardadas`).then(manejar),
  reanudarSesionGuardada: (id) => json("POST", `/sesiones-guardadas/${id}/reanudar`),
  borrarSesionGuardada: (id) => fetch(`${BASE}/sesiones-guardadas/${id}`, { method: "DELETE" }).then(manejar),

  // --- indice de protocolo ---
  protocoloListar: (anio) => fetch(`${BASE}/protocolo?anio=${anio}`).then(manejar),
  protocoloAnios: () => fetch(`${BASE}/protocolo/anios`).then(manejar),
  protocoloSugerido: (anio) => fetch(`${BASE}/protocolo/sugerido?anio=${anio}`).then(manejar),
  protocoloDesdeSesion: (sesionId) => fetch(`${BASE}/protocolo/desde-sesion/${sesionId}`).then(manejar),
  protocoloCrear: (datos) => json("POST", "/protocolo", datos),
  protocoloActualizar: (id, datos) => json("PUT", `/protocolo/${id}`, datos),
  protocoloEstado: (id, estado, observaciones) => json("PATCH", `/protocolo/${id}/estado`, { estado, observaciones }),
  protocoloBorrar: (id) => fetch(`${BASE}/protocolo/${id}`, { method: "DELETE" }).then(manejar),
  protocoloUrlExportar: (anio) => `${BASE}/protocolo/${anio}/exportar`,

  // --- agenda de turnos ---
  turnosListar: (desde, hasta, equipo = false) => fetch(`${BASE}/turnos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${equipo ? "&equipo=1" : ""}`).then(manejar),
  turnoCrear: (datos) => json("POST", "/turnos", datos),
  turnoActualizar: (id, datos) => json("PUT", `/turnos/${id}`, datos),
  turnoEstado: (id, estado) => json("PATCH", `/turnos/${id}/estado`, { estado }),
  turnoBorrar: (id) => fetch(`${BASE}/turnos/${id}`, { method: "DELETE" }).then(manejar),

  // --- notas individuales o compartidas ---
  notasListar: () => fetch(`${BASE}/notas`).then(manejar),
  notaCrear: (datos) => json("POST", "/notas", datos),
  notaActualizar: (id, datos) => json("PUT", `/notas/${id}`, datos),
  notaBorrar: (id) => fetch(`${BASE}/notas/${id}`, { method: "DELETE" }).then(manejar),

  // --- biblioteca de modelos propios ---
  bibliotecaListar: () => fetch(`${BASE}/biblioteca-modelos`).then(manejar),
  bibliotecaSubir: ({ archivo, nombre, tipoActo }) => {
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("nombre", nombre);
    if (tipoActo) fd.append("tipoActo", tipoActo);
    return fetch(`${BASE}/biblioteca-modelos`, { method: "POST", body: fd }).then(manejar);
  },
  bibliotecaBorrar: (id) => fetch(`${BASE}/biblioteca-modelos/${id}`, { method: "DELETE" }).then(manejar),

  // --- clientes (CRM) ---
  clientesListar: (q = "") => fetch(`${BASE}/clientes?q=${encodeURIComponent(q)}`).then(manejar),
  clienteObtener: (id) => fetch(`${BASE}/clientes/${id}`).then(manejar),
  clienteCrear: (datos) => json("POST", "/clientes", datos),
  clienteActualizar: (id, datos) => json("PUT", `/clientes/${id}`, datos),
  clienteBorrar: (id) => fetch(`${BASE}/clientes/${id}`, { method: "DELETE" }).then(manejar),

  // --- expedientes, partes y tareas ---
  expedientesListar: (estado = "") => fetch(`${BASE}/expedientes${estado ? `?estado=${estado}` : ""}`).then(manejar),
  expedienteObtener: (id) => fetch(`${BASE}/expedientes/${id}`).then(manejar),
  expedienteCrear: (datos) => json("POST", "/expedientes", datos),
  expedienteActualizar: (id, datos) => json("PUT", `/expedientes/${id}`, datos),
  expedienteEstado: (id, estado) => json("PATCH", `/expedientes/${id}/estado`, { estado }),
  expedienteBorrar: (id) => fetch(`${BASE}/expedientes/${id}`, { method: "DELETE" }).then(manejar),
  expedientePartes: (id, partes) => json("PUT", `/expedientes/${id}/partes`, { partes }),
  tareaCrear: (expedienteId, datos) => json("POST", `/expedientes/${expedienteId}/tareas`, datos),
  tareaActualizar: (expedienteId, id, datos) => json("PUT", `/expedientes/${expedienteId}/tareas/${id}`, datos),
  tareaEstado: (expedienteId, id, estado) => json("PATCH", `/expedientes/${expedienteId}/tareas/${id}/estado`, { estado }),
  tareaBorrar: (expedienteId, id) => fetch(`${BASE}/expedientes/${expedienteId}/tareas/${id}`, { method: "DELETE" }).then(manejar),
  tareasDesdeSesion: (expedienteId, sesionId) => json("POST", `/expedientes/${expedienteId}/tareas/desde-sesion/${sesionId}`),

  // --- presupuestos ---
  presupuestosListar: ({ expedienteId, clienteId } = {}) => {
    const p = new URLSearchParams();
    if (expedienteId) p.set("expedienteId", expedienteId);
    if (clienteId) p.set("clienteId", clienteId);
    return fetch(`${BASE}/presupuestos?${p}`).then(manejar);
  },
  presupuestoObtener: (id) => fetch(`${BASE}/presupuestos/${id}`).then(manejar),
  presupuestoCrear: (datos) => json("POST", "/presupuestos", datos),
  presupuestoActualizar: (id, datos) => json("PUT", `/presupuestos/${id}`, datos),
  presupuestoEstado: (id, estado) => json("PATCH", `/presupuestos/${id}/estado`, { estado }),
  presupuestoBorrar: (id) => fetch(`${BASE}/presupuestos/${id}`, { method: "DELETE" }).then(manejar),
  presupuestoUrlPdf: (id) => `${BASE}/presupuestos/${id}/pdf`,

  // --- caja (cuenta corriente) ---
  movimientosListar: (f = {}) => fetch(`${BASE}/movimientos?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(manejar),
  movimientosResumen: (f = {}) => fetch(`${BASE}/movimientos/resumen?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(manejar),
  movimientosSaldo: (clienteId) => fetch(`${BASE}/movimientos/saldo/${clienteId}`).then(manejar),
  movimientosUrlCsv: (f = {}) => `${BASE}/movimientos/csv?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`,
  pagoRegistrar: (datos) => json("POST", "/movimientos/pagos", datos),
  cargoCrear: (datos) => json("POST", "/movimientos/cargos", datos),
  movimientoBorrar: (id) => fetch(`${BASE}/movimientos/${id}`, { method: "DELETE" }).then(manejar),

  // --- comprobantes ---
  comprobantesListar: (f = {}) => fetch(`${BASE}/comprobantes?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(manejar),
  comprobantesUrlCsv: (f = {}) => `${BASE}/comprobantes/csv?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`,
  comprobanteObtener: (id) => fetch(`${BASE}/comprobantes/${id}`).then(manejar),
  comprobanteEmitir: (datos) => json("POST", "/comprobantes", datos),
  comprobanteAnular: (id, motivo) => json("POST", `/comprobantes/${id}/anular`, { motivo }),
  comprobanteUrlPdf: (id) => `${BASE}/comprobantes/${id}/pdf`,

  // --- configuracion fiscal y ARCA (propia de cada cuenta) ---
  configuracionFiscal: () => fetch(`${BASE}/configuracion-fiscal`).then(manejar),
  guardarConfiguracionFiscal: (datos) => json("PUT", "/configuracion-fiscal", datos),
  borrarCredencialesArca: () => fetch(`${BASE}/configuracion-fiscal/credenciales`, { method: "DELETE" }).then(manejar),
  probarArca: () => json("POST", "/configuracion-fiscal/probar"),

  // --- UIF ---
  uifAlertas: () => fetch(`${BASE}/uif/alertas`).then(manejar),
  uifParametros: () => fetch(`${BASE}/uif/parametros`).then(manejar),
  uifGuardarParametros: (datos) => json("PUT", "/uif/parametros", datos),
  uifExpedientes: () => fetch(`${BASE}/uif/expedientes`).then(manejar),
  uifLegajo: (clienteId) => fetch(`${BASE}/uif/legajos/${clienteId}`).then(manejar),
  uifGuardarLegajo: (clienteId, datos) => json("PUT", `/uif/legajos/${clienteId}`, datos),
  uifExpediente: (id) => fetch(`${BASE}/uif/expedientes/${id}`).then(manejar),
  uifGuardarExpediente: (id, datos) => json("PUT", `/uif/expedientes/${id}`, datos),
  uifGenerarRecaudos: (id) => json("POST", `/uif/expedientes/${id}/generar`),
  uifEventos: () => fetch(`${BASE}/uif/eventos`).then(manejar),
  uifCrearEvento: (datos) => json("POST", "/uif/eventos", datos),
  uifBorrarEvento: (id) => fetch(`${BASE}/uif/eventos/${id}`, { method: "DELETE" }).then(manejar),

  // --- equipo de la escribanía ---
  equipo: () => fetch(`${BASE}/equipo`).then(manejar),
  equipoCompaneros: () => fetch(`${BASE}/equipo/companeros`).then(manejar),
  equipoMetricas: (dias = 30) => fetch(`${BASE}/equipo/metricas?dias=${dias}`).then(manejar),
  equipoCrear: (nombre) => json("POST", "/equipo", { nombre }),
  equipoRenombrar: (nombre) => json("PUT", "/equipo", { nombre }),
  equipoInvitar: (datos) => json("POST", "/equipo/invitaciones", datos),
  equipoCancelarInvitacion: (id) => fetch(`${BASE}/equipo/invitaciones/${id}`, { method: "DELETE" }).then(manejar),
  equipoAceptarInvitacion: (token) => json("POST", "/equipo/invitaciones/aceptar", { token }),
  equipoCambiarRol: (usuarioId, rol) => json("PATCH", `/equipo/miembros/${usuarioId}/rol`, { rol }),
  equipoCambiarEstado: (usuarioId, estado) => json("PATCH", `/equipo/miembros/${usuarioId}/estado`, { estado }),
  equipoQuitar: (usuarioId) => fetch(`${BASE}/equipo/miembros/${usuarioId}`, { method: "DELETE" }).then(manejar),
  invitacionVer: (token) => fetch(`${BASE}/auth/invitacion/${token}`).then(manejar),

  // --- compartir un expediente con el equipo ---
  expedienteColaboradores: (id) => fetch(`${BASE}/expedientes/${id}/colaboradores`).then(manejar),
  expedienteCompartir: (id, datos) => json("POST", `/expedientes/${id}/colaboradores`, datos),
  expedienteDejarDeCompartir: (id, usuarioId) => fetch(`${BASE}/expedientes/${id}/colaboradores/${usuarioId}`, { method: "DELETE" }).then(manejar),
  misTareas: () => fetch(`${BASE}/expedientes/mis-tareas`).then(manejar),

  // --- novedades (vencimientos y pendientes) ---
  novedades: () => fetch(`${BASE}/alertas`).then(manejar),

  // --- integraciones con Google ---
  googleEstado: () => fetch(`${BASE}/google/estado`).then(manejar),
  googleAutorizar: () => fetch(`${BASE}/google/autorizar`).then(manejar),
  googleDesconectar: () => json("POST", "/google/desconectar"),
  googlePreferencias: (datos) => json("PUT", "/google/preferencias", datos),
  googleGuardarConfiguracion: (datos) => json("PUT", "/google/configuracion", datos),
  googleEnviar: (datos) => json("POST", "/google/enviar", datos),
};
