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
  // Con sesion trae el detalle operativo (proveedor de IA, modelo, sesiones
  // abiertas); sin sesion, solo el latido: esos datos no son publicos.
  salud: () =>
    fetch(`${BASE}/health/detail`)
      .then(manejar)
      .catch(() => fetch(`${BASE}/health`).then(manejar)),

  // --- autenticacion (cookie httpOnly, mismo origen) ---
  yo: () => fetch(`${BASE}/auth/me`).then(manejar),
  login: (email, password) => json("POST", "/auth/login", { email, password }),
  registro: (datos) => json("POST", "/auth/register", datos),
  logout: () => json("POST", "/auth/logout"),
  recuperar: (email) => json("POST", "/auth/recover", { email }),
  restablecer: (token, password) => json("POST", "/auth/reset", { token, password }),

  // --- configuracion de la IA (clave cifrada en el servidor) ---
  configuracionIA: () => fetch(`${BASE}/config/ai`).then(manejar),
  guardarConfiguracionIA: (datos) => json("PUT", "/config/ai", datos),
  probarConexionIA: (datos) => json("POST", "/config/ai/test", datos),
  modelosGemini: (geminiApiKey) => json("POST", "/config/ai/gemini/models", { geminiApiKey }),

  // --- configuracion NER / anonimizacion ---
  configuracionNer: () => fetch(`${BASE}/config/ner`).then(manejar),
  guardarConfiguracionNer: (datos) => json("PUT", "/config/ner", datos),
  probarNer: (datos) => json("POST", "/config/ner/test", datos),

  // --- costos ---
  consumo: (dias = 30) => fetch(`${BASE}/usage?dias=${dias}`).then(manejar),
  precios: () => fetch(`${BASE}/config/pricing`).then(manejar),
  guardarPrecio: (datos) => json("PUT", "/config/pricing", datos),
  borrarPrecio: (proveedor, modelo) => fetch(`${BASE}/config/pricing/${proveedor}/${encodeURIComponent(modelo)}`, { method: "DELETE" }).then(manejar),

  // --- suscripcion y facturacion (Mercado Pago, ARS) ---
  planesDisponibles: () => fetch(`${BASE}/subscription/plans`).then(manejar),
  miSuscripcion: () => fetch(`${BASE}/subscription`).then(manejar),
  suscribirse: (planClave) => json("POST", "/subscription", { planClave }),
  cancelarSuscripcion: () => json("POST", "/subscription/cancel"),
  planesAdmin: () => fetch(`${BASE}/config/plans`).then(manejar),
  guardarPlan: (datos) => json("PUT", "/config/plans", datos),
  parametrosFacturacion: () => fetch(`${BASE}/config/plans/billing`).then(manejar),
  guardarParametrosFacturacion: (datos) => json("PUT", "/config/plans/billing", datos),

  subirDocumento: ({ archivo, modo = "completo", antecedentes = "", instrucciones = "", modelo = null, modeloBibliotecaId = null, datos = null }) => {
    const fd = new FormData();
    if (archivo) fd.append("archivo", archivo);
    fd.append("modo", modo);
    if (antecedentes) fd.append("antecedentes", antecedentes);
    if (instrucciones) fd.append("instrucciones", instrucciones);
    if (modelo) fd.append("modelo", modelo);
    else if (modeloBibliotecaId) fd.append("modeloBibliotecaId", modeloBibliotecaId);
    if (datos) fd.append("datos", JSON.stringify(datos));
    return fetch(`${BASE}/sessions`, { method: "POST", body: fd }).then(manejar);
  },

  estadoSesion: (id) => fetch(`${BASE}/sessions/${id}`).then(manejar),

  /** Abre el flujo SSE. Devuelve una funcion para cerrarlo. */
  escucharEventos: (id, onEvento, onError) => {
    const es = new EventSource(`${BASE}/sessions/${id}/events`);
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

  reintentar: (id) => json("POST", `/sessions/${id}/retry`),
  iterar: (id, feedback) => json("POST", `/sessions/${id}/iterate`, { feedback }),

  urlDocumento: (id) => `${BASE}/sessions/${id}/document`,

  cerrarSesion: (id) => fetch(`${BASE}/sessions/${id}`, { method: "DELETE" }).then(manejar),

  // --- guardar y reanudar sesiones ---
  guardarSesion: (id) => json("POST", `/sessions/${id}/save`),
  listarSesionesGuardadas: () => fetch(`${BASE}/saved-sessions`).then(manejar),
  reanudarSesionGuardada: (id) => json("POST", `/saved-sessions/${id}/resume`),
  borrarSesionGuardada: (id) => fetch(`${BASE}/saved-sessions/${id}`, { method: "DELETE" }).then(manejar),

  // --- indice de protocolo ---
  protocoloListar: (anio) => fetch(`${BASE}/protocol?anio=${anio}`).then(manejar),
  protocoloAnios: () => fetch(`${BASE}/protocol/years`).then(manejar),
  protocoloSugerido: (anio) => fetch(`${BASE}/protocol/suggested?anio=${anio}`).then(manejar),
  protocoloDesdeSesion: (sesionId) => fetch(`${BASE}/protocol/from-session/${sesionId}`).then(manejar),
  protocoloCrear: (datos) => json("POST", "/protocol", datos),
  protocoloActualizar: (id, datos) => json("PUT", `/protocol/${id}`, datos),
  protocoloEstado: (id, estado, observaciones) => json("PATCH", `/protocol/${id}/status`, { estado, observaciones }),
  protocoloBorrar: (id) => fetch(`${BASE}/protocol/${id}`, { method: "DELETE" }).then(manejar),
  protocoloUrlExportar: (anio) => `${BASE}/protocol/${anio}/export`,

  // --- agenda de turnos ---
  turnosListar: (desde, hasta, equipo = false) => fetch(`${BASE}/appointments?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${equipo ? "&equipo=1" : ""}`).then(manejar),
  turnoCrear: (datos) => json("POST", "/appointments", datos),
  turnoActualizar: (id, datos) => json("PUT", `/appointments/${id}`, datos),
  turnoEstado: (id, estado) => json("PATCH", `/appointments/${id}/status`, { estado }),
  turnoBorrar: (id) => fetch(`${BASE}/appointments/${id}`, { method: "DELETE" }).then(manejar),

  // --- notas individuales o compartidas ---
  notasListar: () => fetch(`${BASE}/notes`).then(manejar),
  notaCrear: (datos) => json("POST", "/notes", datos),
  notaActualizar: (id, datos) => json("PUT", `/notes/${id}`, datos),
  notaBorrar: (id) => fetch(`${BASE}/notes/${id}`, { method: "DELETE" }).then(manejar),

  // --- biblioteca de modelos propios ---
  bibliotecaListar: () => fetch(`${BASE}/templates`).then(manejar),
  bibliotecaSubir: ({ archivo, nombre, tipoActo }) => {
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("nombre", nombre);
    if (tipoActo) fd.append("tipoActo", tipoActo);
    return fetch(`${BASE}/templates`, { method: "POST", body: fd }).then(manejar);
  },
  bibliotecaBorrar: (id) => fetch(`${BASE}/templates/${id}`, { method: "DELETE" }).then(manejar),

  // --- clientes (CRM) ---
  clientesListar: (q = "") => fetch(`${BASE}/clients?q=${encodeURIComponent(q)}`).then(manejar),
  clienteObtener: (id) => fetch(`${BASE}/clients/${id}`).then(manejar),
  clienteCrear: (datos) => json("POST", "/clients", datos),
  clienteActualizar: (id, datos) => json("PUT", `/clients/${id}`, datos),
  clienteBorrar: (id) => fetch(`${BASE}/clients/${id}`, { method: "DELETE" }).then(manejar),

  // --- expedientes, partes y tareas ---
  expedientesListar: (estado = "") => fetch(`${BASE}/cases${estado ? `?estado=${estado}` : ""}`).then(manejar),
  expedienteObtener: (id) => fetch(`${BASE}/cases/${id}`).then(manejar),
  expedienteCrear: (datos) => json("POST", "/cases", datos),
  expedienteActualizar: (id, datos) => json("PUT", `/cases/${id}`, datos),
  expedienteEstado: (id, estado) => json("PATCH", `/cases/${id}/status`, { estado }),
  expedienteBorrar: (id) => fetch(`${BASE}/cases/${id}`, { method: "DELETE" }).then(manejar),
  expedientePartes: (id, partes) => json("PUT", `/cases/${id}/parties`, { partes }),
  tareaCrear: (expedienteId, datos) => json("POST", `/cases/${expedienteId}/tasks`, datos),
  tareaActualizar: (expedienteId, id, datos) => json("PUT", `/cases/${expedienteId}/tasks/${id}`, datos),
  tareaEstado: (expedienteId, id, estado) => json("PATCH", `/cases/${expedienteId}/tasks/${id}/status`, { estado }),
  tareaBorrar: (expedienteId, id) => fetch(`${BASE}/cases/${expedienteId}/tasks/${id}`, { method: "DELETE" }).then(manejar),
  tareasDesdeSesion: (expedienteId, sesionId) => json("POST", `/cases/${expedienteId}/tasks/from-session/${sesionId}`),

  // --- presupuestos ---
  presupuestosListar: ({ expedienteId, clienteId } = {}) => {
    const p = new URLSearchParams();
    if (expedienteId) p.set("expedienteId", expedienteId);
    if (clienteId) p.set("clienteId", clienteId);
    return fetch(`${BASE}/quotes?${p}`).then(manejar);
  },
  presupuestoObtener: (id) => fetch(`${BASE}/quotes/${id}`).then(manejar),
  presupuestoCrear: (datos) => json("POST", "/quotes", datos),
  presupuestoActualizar: (id, datos) => json("PUT", `/quotes/${id}`, datos),
  presupuestoEstado: (id, estado) => json("PATCH", `/quotes/${id}/status`, { estado }),
  presupuestoBorrar: (id) => fetch(`${BASE}/quotes/${id}`, { method: "DELETE" }).then(manejar),
  presupuestoUrlPdf: (id) => `${BASE}/quotes/${id}/pdf`,

  // --- caja (cuenta corriente) ---
  movimientosListar: (f = {}) => fetch(`${BASE}/transactions?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(manejar),
  movimientosResumen: (f = {}) => fetch(`${BASE}/transactions/summary?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(manejar),
  movimientosSaldo: (clienteId) => fetch(`${BASE}/transactions/balance/${clienteId}`).then(manejar),
  movimientosUrlCsv: (f = {}) => `${BASE}/transactions/csv?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`,
  pagoRegistrar: (datos) => json("POST", "/transactions/payments", datos),
  cargoCrear: (datos) => json("POST", "/transactions/charges", datos),
  movimientoBorrar: (id) => fetch(`${BASE}/transactions/${id}`, { method: "DELETE" }).then(manejar),

  // --- comprobantes ---
  comprobantesListar: (f = {}) => fetch(`${BASE}/invoices?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(manejar),
  comprobantesUrlCsv: (f = {}) => `${BASE}/invoices/csv?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`,
  comprobanteObtener: (id) => fetch(`${BASE}/invoices/${id}`).then(manejar),
  comprobanteEmitir: (datos) => json("POST", "/invoices", datos),
  comprobanteAnular: (id, motivo) => json("POST", `/invoices/${id}/void`, { motivo }),
  comprobanteUrlPdf: (id) => `${BASE}/invoices/${id}/pdf`,

  // --- configuracion fiscal y ARCA (propia de cada cuenta) ---
  configuracionFiscal: () => fetch(`${BASE}/tax-config`).then(manejar),
  guardarConfiguracionFiscal: (datos) => json("PUT", "/tax-config", datos),
  borrarCredencialesArca: () => fetch(`${BASE}/tax-config/credentials`, { method: "DELETE" }).then(manejar),
  probarArca: () => json("POST", "/tax-config/test"),

  // --- UIF ---
  uifAlertas: () => fetch(`${BASE}/uif/alerts`).then(manejar),
  uifParametros: () => fetch(`${BASE}/uif/parameters`).then(manejar),
  uifGuardarParametros: (datos) => json("PUT", "/uif/parameters", datos),
  uifExpedientes: () => fetch(`${BASE}/uif/cases`).then(manejar),
  uifLegajo: (clienteId) => fetch(`${BASE}/uif/records/${clienteId}`).then(manejar),
  uifGuardarLegajo: (clienteId, datos) => json("PUT", `/uif/records/${clienteId}`, datos),
  uifExpediente: (id) => fetch(`${BASE}/uif/cases/${id}`).then(manejar),
  uifGuardarExpediente: (id, datos) => json("PUT", `/uif/cases/${id}`, datos),
  uifGenerarRecaudos: (id) => json("POST", `/uif/cases/${id}/generate`),
  uifEventos: () => fetch(`${BASE}/uif/events`).then(manejar),
  uifCrearEvento: (datos) => json("POST", "/uif/events", datos),
  uifBorrarEvento: (id) => fetch(`${BASE}/uif/events/${id}`, { method: "DELETE" }).then(manejar),

  // --- equipo de la escribanía ---
  equipo: () => fetch(`${BASE}/team`).then(manejar),
  equipoCompaneros: () => fetch(`${BASE}/team/colleagues`).then(manejar),
  equipoMetricas: (dias = 30) => fetch(`${BASE}/team/metrics?dias=${dias}`).then(manejar),
  equipoCrear: (nombre) => json("POST", "/team", { nombre }),
  equipoRenombrar: (nombre) => json("PUT", "/team", { nombre }),
  equipoInvitar: (datos) => json("POST", "/team/invitations", datos),
  equipoCancelarInvitacion: (id) => fetch(`${BASE}/team/invitations/${id}`, { method: "DELETE" }).then(manejar),
  equipoAceptarInvitacion: (token) => json("POST", "/team/invitations/accept", { token }),
  equipoCambiarRol: (usuarioId, rol) => json("PATCH", `/team/members/${usuarioId}/role`, { rol }),
  equipoCambiarEstado: (usuarioId, estado) => json("PATCH", `/team/members/${usuarioId}/status`, { estado }),
  equipoQuitar: (usuarioId) => fetch(`${BASE}/team/members/${usuarioId}`, { method: "DELETE" }).then(manejar),
  invitacionVer: (token) => fetch(`${BASE}/auth/invitation/${encodeURIComponent(token)}`).then(manejar),
  altaVer: (token) => fetch(`${BASE}/auth/signup/${encodeURIComponent(token)}`).then(manejar),

  // --- compartir un expediente con el equipo ---
  expedienteColaboradores: (id) => fetch(`${BASE}/cases/${id}/collaborators`).then(manejar),
  expedienteCompartir: (id, datos) => json("POST", `/cases/${id}/collaborators`, datos),
  expedienteDejarDeCompartir: (id, usuarioId) => fetch(`${BASE}/cases/${id}/collaborators/${usuarioId}`, { method: "DELETE" }).then(manejar),
  misTareas: () => fetch(`${BASE}/cases/my-tasks`).then(manejar),

  // --- panel de operación de la plataforma (solo la cuenta operadora) ---
  soporteResumen: (dias = 30) => fetch(`${BASE}/admin/summary?dias=${dias}`).then(manejar),
  soporteCuentas: (f = {}) => fetch(`${BASE}/admin/accounts?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(manejar),
  soporteCuenta: (id, dias = 30) => fetch(`${BASE}/admin/accounts/${id}?dias=${dias}`).then(manejar),
  soporteCuentaActivo: (id, activo) => json("PATCH", `/admin/accounts/${id}/active`, { activo }),
  soporteEliminarCuenta: (id, email) => json("DELETE", `/admin/accounts/${id}`, { email }),
  soporteInvitaciones: () => fetch(`${BASE}/admin/invitations`).then(manejar),
  soporteInvitar: (datos) => json("POST", "/admin/invitations", datos),
  soporteReenviarInvitacion: (id) => json("POST", `/admin/invitations/${id}/resend`),
  soporteCancelarInvitacion: (id) => json("PATCH", `/admin/invitations/${id}/cancel`),
  soporteEliminarInvitacion: (id) => json("DELETE", `/admin/invitations/${id}`),
  soporteCancelarInvitacionesBulk: (ids) => json("PATCH", "/admin/invitations/bulk/cancel", { ids }),
  soporteEliminarInvitacionesBulk: (ids) => json("DELETE", "/admin/invitations/bulk", { ids }),
  soporteRevisarPruebas: (forzarBorrado = false) => json("POST", "/admin/trials/review", { forzarBorrado }),
  soporteSuscripciones: (dias = 30) => fetch(`${BASE}/admin/subscriptions?dias=${dias}`).then(manejar),

  // --- consultas de soporte (canal de comunicacion con el operador) ---
  consultasListar: () => fetch(`${BASE}/tickets`).then(manejar),
  consultasSinLeer: () => fetch(`${BASE}/tickets/unread`).then(manejar),
  consultaObtener: (id) => fetch(`${BASE}/tickets/${id}`).then(manejar),
  consultaCrear: (datos) => json("POST", "/tickets", datos),
  consultaResponder: (id, contenido) => json("POST", `/tickets/${id}/messages`, { contenido }),
  // operador
  soporteConsultas: (f = {}) => fetch(`${BASE}/admin/tickets?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`).then(manejar),
  soporteConsultasAbiertas: () => fetch(`${BASE}/admin/tickets/open`).then(manejar),
  soporteConsulta: (id) => fetch(`${BASE}/admin/tickets/${id}`).then(manejar),
  soporteConsultaResponder: (id, contenido) => json("POST", `/admin/tickets/${id}/messages`, { contenido }),
  soporteConsultaCerrar: (id) => json("PATCH", `/admin/tickets/${id}/close`),
  soporteConsultaReabrir: (id) => json("PATCH", `/admin/tickets/${id}/reopen`),

  // --- novedades (vencimientos y pendientes) ---
  novedades: () => fetch(`${BASE}/alerts`).then(manejar),

  // --- integraciones con Google ---
  googleEstado: () => fetch(`${BASE}/google/status`).then(manejar),
  googleAutorizar: () => fetch(`${BASE}/google/authorize`).then(manejar),
  googleDesconectar: () => json("POST", "/google/disconnect"),
  googlePreferencias: (datos) => json("PUT", "/google/preferences", datos),
  googleGuardarConfiguracion: (datos) => json("PUT", "/google/config", datos),
  googleSubirADrive: (datos) => json("POST", "/google/drive", datos),
};
