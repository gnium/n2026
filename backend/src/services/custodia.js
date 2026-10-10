import { randomBytes } from "node:crypto";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";
import { obtener as obtenerCliente, CAMPOS_CIFRADOS } from "./clientes.js";
import { construirCustodiaPdf } from "./custodiaPdf.js";
import { enviarCorreo, escaparHtml } from "./correo.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

function generarCodigo() {
  return randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
}

function urlVerificacion(codigo) {
  return `${env.appUrl}/verify/${codigo}`;
}

export async function listar(usuarioId, { clienteId, estado } = {}) {
  let sql = `SELECT cu.*, cl.nombre AS cliente_nombre
               FROM custodia cu
               JOIN clientes cl ON cl.id = cu.cliente_id
              WHERE cu.usuario_id = :usuarioId`;
  const params = { usuarioId };
  if (clienteId) { sql += " AND cu.cliente_id = :clienteId"; params.clienteId = clienteId; }
  if (estado) { sql += " AND cu.estado = :estado"; params.estado = estado; }
  sql += " ORDER BY cu.recibido_en DESC LIMIT 500";
  const [rows] = await pool.query(sql, params);
  return rows.map(filaAVista);
}

export async function obtener(usuarioId, id) {
  const [[fila]] = await pool.query(
    `SELECT cu.*, cl.nombre AS cliente_nombre
       FROM custodia cu JOIN clientes cl ON cl.id = cu.cliente_id
      WHERE cu.id = ? AND cu.usuario_id = ?`,
    [id, usuarioId],
  );
  if (!fila) throw new AppError("NO_ENCONTRADO", "Registro de custodia no encontrado.", 404);
  return filaAVista(fila);
}

export async function recibir(usuarioId, { clienteId, descripcion, notas, enviarEmail, enviarWhatsapp }) {
  if (!clienteId) throw new AppError("DATOS_INVALIDOS", "Debe seleccionar un cliente.", 400);
  if (!descripcion?.trim()) throw new AppError("DATOS_INVALIDOS", "Debe describir la documentación recibida.", 400);

  const cliente = await obtenerCliente(usuarioId, clienteId);
  let codigo;
  for (let i = 0; i < 5; i++) {
    codigo = generarCodigo();
    const [[dup]] = await pool.query("SELECT 1 FROM custodia WHERE codigo = ?", [codigo]);
    if (!dup) break;
  }

  const envio = { email: !!enviarEmail, whatsapp: !!enviarWhatsapp };
  const [r] = await pool.query(
    `INSERT INTO custodia (usuario_id, cliente_id, codigo, descripcion, notas, envio_recepcion)
     VALUES (:usuarioId, :clienteId, :codigo, :descripcion, :notas, :envio)`,
    { usuarioId, clienteId, codigo, descripcion: descripcion.trim().slice(0, 500), notas: notas?.trim().slice(0, 2000) || null, envio: JSON.stringify(envio) },
  );

  const registro = await obtener(usuarioId, r.insertId);
  const [[escribano]] = await pool.query("SELECT nombre, email FROM usuarios WHERE id = ?", [usuarioId]);

  notificarCustodia(registro, cliente, escribano, "recepcion", envio).catch((e) => logger.warn("Error enviando comprobantes de recepción", { error: e.message }));

  return registro;
}

export async function entregar(usuarioId, { clienteId, descripcion, notas, enviarEmail, enviarWhatsapp }) {
  if (!clienteId) throw new AppError("DATOS_INVALIDOS", "Debe seleccionar un cliente.", 400);
  if (!descripcion?.trim()) throw new AppError("DATOS_INVALIDOS", "Debe describir la documentación a entregar.", 400);

  const cliente = await obtenerCliente(usuarioId, clienteId);
  let codigo;
  for (let i = 0; i < 5; i++) {
    codigo = generarCodigo();
    const [[dup]] = await pool.query("SELECT 1 FROM custodia WHERE codigo = ?", [codigo]);
    if (!dup) break;
  }

  const envio = { email: !!enviarEmail, whatsapp: !!enviarWhatsapp };
  const [r] = await pool.query(
    `INSERT INTO custodia (usuario_id, cliente_id, codigo, descripcion, notas, estado, recibido_en, entregado_en, envio_entrega)
     VALUES (:usuarioId, :clienteId, :codigo, :descripcion, :notas, 'entregado', NULL, NOW(), :envio)`,
    { usuarioId, clienteId, codigo, descripcion: descripcion.trim().slice(0, 500), notas: notas?.trim().slice(0, 2000) || null, envio: JSON.stringify(envio) },
  );

  const registro = await obtener(usuarioId, r.insertId);
  const [[escribano]] = await pool.query("SELECT nombre, email FROM usuarios WHERE id = ?", [usuarioId]);

  notificarCustodia(registro, cliente, escribano, "entrega", envio).catch((e) => logger.warn("Error enviando comprobantes de entrega", { error: e.message }));

  return registro;
}

export async function devolver(usuarioId, id, { notas, enviarEmail, enviarWhatsapp } = {}) {
  const [[fila]] = await pool.query("SELECT * FROM custodia WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (!fila) throw new AppError("NO_ENCONTRADO", "Registro de custodia no encontrado.", 404);
  if (fila.estado === "devuelto") throw new AppError("YA_DEVUELTO", "Esta documentación ya fue devuelta.", 400);

  const envio = { email: !!enviarEmail, whatsapp: !!enviarWhatsapp };
  await pool.query(
    "UPDATE custodia SET estado = 'devuelto', devuelto_en = NOW(), notas = COALESCE(:notas, notas), envio_devolucion = :envio WHERE id = :id",
    { id, notas: notas?.trim().slice(0, 2000) || null, envio: JSON.stringify(envio) },
  );

  const registro = await obtener(usuarioId, id);
  const cliente = await obtenerCliente(usuarioId, fila.cliente_id);
  const [[escribano]] = await pool.query("SELECT nombre, email FROM usuarios WHERE id = ?", [usuarioId]);

  notificarCustodia(registro, cliente, escribano, "devolucion", envio).catch((e) => logger.warn("Error enviando comprobantes de devolución", { error: e.message }));

  return registro;
}

export async function verificarPublico(codigo) {
  const [[fila]] = await pool.query(
    `SELECT cu.codigo, cu.descripcion, cu.estado, cu.recibido_en, cu.devuelto_en, cu.entregado_en, cl.nombre AS cliente_nombre
       FROM custodia cu JOIN clientes cl ON cl.id = cu.cliente_id
      WHERE cu.codigo = ?`,
    [codigo],
  );
  if (!fila) return null;
  return {
    codigo: fila.codigo,
    descripcion: fila.descripcion,
    estado: fila.estado,
    clienteNombre: fila.cliente_nombre,
    recibidoEn: fila.recibido_en,
    devueltoEn: fila.devuelto_en,
    entregadoEn: fila.entregado_en,
  };
}

export async function generarPdf(usuarioId, id, tipo) {
  const registro = await obtener(usuarioId, id);
  const cliente = await obtenerCliente(usuarioId, registro.clienteId);
  const [[cuenta]] = await pool.query("SELECT nombre, email FROM usuarios WHERE id = ?", [usuarioId]);
  return construirCustodiaPdf({ registro, cliente, escribano: cuenta, tipo, urlVerificacion: urlVerificacion(registro.codigo) });
}

async function notificarCustodia(registro, cliente, escribano, tipo, canales) {
  const url = urlVerificacion(registro.codigo);
  const accion = tipo === "recepcion" ? "recibida" : tipo === "entrega" ? "entregada" : "devuelta";
  const tipoLegible = tipo === "recepcion" ? "recepción" : tipo === "entrega" ? "entrega" : "devolución";
  const fechaHora = new Date().toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });
  const asunto = `Comprobante de ${tipoLegible} de documentación — ${registro.codigo}`;

  const cuerpoHtml = (destinatario, esCopia) => `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#24466b">Doy Fe — Comprobante de ${tipoLegible}</h2>
      <p>Estimado/a <strong>${escaparHtml(destinatario)}</strong>,</p>
      <p>La siguiente documentación ha sido ${accion}:</p>
      <blockquote style="border-left:4px solid #c9a84c;padding:8px 16px;background:#faf7f0">${escaparHtml(registro.descripcion)}</blockquote>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold;width:40%">Código de verificación</td><td style="padding:6px 12px;border:1px solid #ddd;font-family:monospace">${registro.codigo}</td></tr>
        <tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold">Cliente</td><td style="padding:6px 12px;border:1px solid #ddd">${escaparHtml(cliente.nombre)}</td></tr>
        <tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold">Escribanía</td><td style="padding:6px 12px;border:1px solid #ddd">${escaparHtml(escribano?.nombre || "—")}</td></tr>
        <tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold">Fecha y hora</td><td style="padding:6px 12px;border:1px solid #ddd">${fechaHora}</td></tr>
        <tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold">Estado</td><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold;color:${registro.estado === "en_custodia" ? "#24466b" : "#2d7a3a"}">${registro.estado === "en_custodia" ? "EN CUSTODIA" : "DEVUELTO"}</td></tr>
      </table>
      <p>Puede verificar el estado de esta documentación en cualquier momento escaneando el código QR del comprobante o visitando:</p>
      <p><a href="${url}" style="color:#24466b">${url}</a></p>
      ${esCopia ? '<p style="font-size:12px;color:#555;background:#f5f5f5;padding:8px 12px;border-radius:4px"><strong>Nota:</strong> Este correo constituye constancia de fecha cierta de la ${tipoLegible} de la documentación descripta. Conserve este mensaje como respaldo.</p>' : ""}
      <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
      <p style="font-size:12px;color:#888">Este es un mensaje automático de Doy Fe. No responda a este correo.</p>
    </div>`;

  const textoPlano = `Documentación ${accion}: ${registro.descripcion}\nCliente: ${cliente.nombre}\nEscribanía: ${escribano?.nombre || "—"}\nFecha: ${fechaHora}\nCódigo: ${registro.codigo}\nVerificar: ${url}`;

  const envios = [];

  if (cliente.email) {
    envios.push(
      enviarCorreo({ para: cliente.email, asunto, texto: textoPlano, html: cuerpoHtml(cliente.nombre, false) })
        .then(() => logger.info(`Comprobante de ${tipoLegible} enviado al cliente`, { email: cliente.email, codigo: registro.codigo }))
        .catch((e) => logger.warn(`Error enviando comprobante al cliente`, { error: e.message })),
    );
  }

  if (escribano?.email) {
    envios.push(
      enviarCorreo({ para: escribano.email, asunto: `[Copia] ${asunto}`, texto: textoPlano, html: cuerpoHtml(escribano.nombre, true) })
        .then(() => logger.info(`Comprobante de ${tipoLegible} enviado al escribano`, { email: escribano.email, codigo: registro.codigo }))
        .catch((e) => logger.warn(`Error enviando comprobante al escribano`, { error: e.message })),
    );
  }

  await Promise.allSettled(envios);
}

function filaAVista(r) {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    clienteNombre: r.cliente_nombre,
    codigo: r.codigo,
    descripcion: r.descripcion,
    notas: r.notas,
    estado: r.estado,
    recibidoEn: r.recibido_en,
    devueltoEn: r.devuelto_en,
    entregadoEn: r.entregado_en,
    envioRecepcion: typeof r.envio_recepcion === "string" ? JSON.parse(r.envio_recepcion) : r.envio_recepcion,
    envioDevolucion: typeof r.envio_devolucion === "string" ? JSON.parse(r.envio_devolucion) : r.envio_devolucion,
    envioEntrega: typeof r.envio_entrega === "string" ? JSON.parse(r.envio_entrega) : r.envio_entrega,
  };
}
