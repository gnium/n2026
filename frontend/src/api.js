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
  turnosListar: (desde, hasta) => fetch(`${BASE}/turnos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`).then(manejar),
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
};
