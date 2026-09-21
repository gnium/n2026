/**
 * Periodo de prueba de 60 dias y baja automatica al vencer.
 *
 * Ciclo de vida de una escribania invitada desde el panel de Operacion:
 *
 *   alta  --60 dias de prueba-->  vence  --gracia (15 dias)-->  BORRADO
 *            |                       |                            |
 *            |                       +-- suscribe --> activa      |
 *            +-- avisos a los 10, 3 y 1 dia                       |
 *                                    +-- aviso al vencer y 3 dias antes del borrado
 *
 * Mientras la prueba corre, la cuenta funciona igual que una suscripta.
 * Vencida y sin suscripcion, se bloquea el trabajo nuevo pero se puede seguir
 * entrando: durante la gracia la escribana o el escribano todavia puede
 * suscribirse o llevarse lo suyo. Pasada la gracia se borra todo (ver
 * `services/bajaCuenta.js`): es la unica forma honesta de sostener que no
 * guardamos datos de terceros que ya no tenemos por que tener.
 *
 * Los dos plazos y el borrado automatico se configuran en `configuracion`
 * (`prueba_dias`, `prueba_gracia_dias`, `prueba_borrado_automatico`).
 *
 * Todo se decide por `prueba_termina_en` / `eliminacion_programada_en` y por
 * "la suscripcion NO esta activa", nunca por el estado `prueba`/`vencida`. Ese
 * estado lo pisa cualquier ida y vuelta con Mercado Pago -crear una suscripcion
 * deja la cuenta `pendiente`, cancelarla la deja `cancelada`-, y atarle el
 * control dejaba escapar de la prueba con un pedido cualquiera, sin pagar y sin
 * que el borrado volviera a alcanzarla nunca. Las dos fechas solo las limpia
 * una suscripcion efectivamente activa.
 */
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { enviarCorreo, escaparHtml } from "./correo.js";
import { eliminarCuenta } from "./bajaCuenta.js";
import { invalidarCache } from "../auth/repositorio.js";

const CLAVES = ["prueba_dias", "prueba_gracia_dias", "prueba_borrado_automatico"];
const ESTADOS_PAGOS = ["activa", "pendiente"]; // no se toca a quien ya esta pagando o autorizando

export async function parametros() {
  const [rows] = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN (?)", [CLAVES]);
  const m = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  return {
    diasPrueba: Math.min(Math.max(Number(m.prueba_dias || 60), 1), 365),
    graciaDias: Math.min(Math.max(Number(m.prueba_gracia_dias ?? 15), 0), 180),
    borradoAutomatico: (m.prueba_borrado_automatico ?? "1") === "1",
  };
}

/** Arranca la prueba de una cuenta recien creada por invitacion. */
export async function iniciarPrueba(usuarioId, dias) {
  const { diasPrueba } = await parametros();
  const n = Math.min(Math.max(Number(dias) || diasPrueba, 1), 365);
  await pool.query(
    `UPDATE usuarios
        SET estado_suscripcion = 'prueba',
            prueba_termina_en = DATE_ADD(CURDATE(), INTERVAL ? DAY),
            eliminacion_programada_en = NULL,
            aviso_prueba_dias = NULL
      WHERE id = ? AND estado_suscripcion IN ('sin_suscripcion','prueba')`,
    [n, usuarioId],
  );
  invalidarCache(usuarioId);
  return n;
}

const dia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`) : null);
const hoyCero = () => {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return h;
};

/**
 * Si la cuenta tiene una prueba corriendo o ya vencida. Se decide por la FECHA
 * y no por `estado_suscripcion`: ese estado lo mueve Mercado Pago (y, de
 * rebote, la propia cuenta al crear o cancelar una suscripcion), asi que
 * condicionar el bloqueo a que diga "vencida" permitia salir de la prueba sin
 * pagar. `prueba_termina_en` se limpia solo cuando la suscripcion queda activa.
 */
const tienePrueba = (u) => Boolean(u?.prueba_termina_en) && u.estado_suscripcion !== "activa";
export const enPrueba = (u) => tienePrueba(u) && dia(u.prueba_termina_en) >= hoyCero();
export const pruebaVencida = (u) => tienePrueba(u) && dia(u.prueba_termina_en) < hoyCero();

/**
 * Vista del periodo de prueba de una cuenta, para la pantalla de Suscripcion.
 * `usuario` es la fila que devuelve `buscarPorId`.
 */
export function vista(usuario) {
  if (!usuario) return null;
  const hoy = hoyCero();
  const fin = dia(usuario.prueba_termina_en);
  const borrado = dia(usuario.eliminacion_programada_en);
  const enDias = (f) => (f ? Math.round((f - hoy) / 86400000) : null);
  return {
    estado: usuario.estado_suscripcion,
    enPrueba: enPrueba(usuario),
    vencida: pruebaVencida(usuario),
    terminaEn: fin ? fin.toISOString().slice(0, 10) : null,
    diasRestantes: enDias(fin),
    eliminacionEn: borrado ? borrado.toISOString().slice(0, 10) : null,
    diasHastaEliminacion: enDias(borrado),
  };
}

const formatoFecha = (v) => new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });

async function avisar(u, { asunto, cuerpo }) {
  const enlace = `${env.appUrl}/suscripcion`;
  const texto = `${cuerpo}\n\nPara suscribirse: ${enlace}\n\nDoy Fe`;
  const html = `<p>${escaparHtml(cuerpo).replace(/\n/g, "<br>")}</p><p><a href="${escaparHtml(enlace)}">Suscribirme</a></p>`;
  await enviarCorreo({ para: u.email, asunto, texto, html }).catch((e) => logger.warn("No se pudo avisar del vencimiento de la prueba", { codigo: e.code || "envio" }));
}

const trato = (u) => (u.nombre ? `Hola ${u.nombre}` : "Hola");

/**
 * Pasada diaria: avisa, vence y borra. Es idempotente -correrla dos veces el
 * mismo dia no duplica avisos ni borra de mas-, asi que se puede disparar a
 * mano desde el panel sin cuidados especiales.
 */
export async function revisar({ forzarBorrado = false } = {}) {
  const { graciaDias, borradoAutomatico } = await parametros();
  const resultado = { avisos: 0, vencidas: 0, eliminadas: 0, pendientesDeBorrar: 0 };

  // 1. Avisos mientras la prueba corre: 10, 3 y 1 dia antes. `aviso_prueba_dias`
  //    guarda el ultimo hito avisado para no repetir el correo cada pasada.
  for (const hito of [10, 3, 1]) {
    const [pendientes] = await pool.query(
      `SELECT id, email, nombre, prueba_termina_en
         FROM usuarios
        WHERE estado_suscripcion <> 'activa' AND activo = 1
          AND prueba_termina_en IS NOT NULL
          AND DATEDIFF(prueba_termina_en, CURDATE()) <= ? AND DATEDIFF(prueba_termina_en, CURDATE()) > 0
          AND (aviso_prueba_dias IS NULL OR aviso_prueba_dias > ?)`,
      [hito, hito],
    );
    for (const u of pendientes) {
      await avisar(u, {
        asunto: `Su prueba de Doy Fe vence el ${formatoFecha(u.prueba_termina_en)}`,
        cuerpo: `${trato(u)}. Su periodo de prueba de Doy Fe termina el ${formatoFecha(u.prueba_termina_en)}. Para seguir trabajando sin interrupciones, active una suscripcion antes de esa fecha.\n\nSi no la activa, la cuenta queda bloqueada y, pasados ${graciaDias} dias, todos sus datos se eliminan de forma definitiva: clientes, expedientes, protocolo, caja y comprobantes. No guardamos copias.`,
      });
      await pool.query("UPDATE usuarios SET aviso_prueba_dias = ? WHERE id = ?", [hito, u.id]);
      resultado.avisos += 1;
    }
  }

  // 2. Prueba vencida sin suscripcion: se bloquea y queda fecha de borrado.
  const [aVencer] = await pool.query(
    `SELECT id, email, nombre FROM usuarios
      WHERE estado_suscripcion <> 'activa' AND prueba_termina_en IS NOT NULL AND prueba_termina_en < CURDATE()
        AND eliminacion_programada_en IS NULL`,
  );
  for (const u of aVencer) {
    await pool.query(
      `UPDATE usuarios SET estado_suscripcion = 'vencida',
              eliminacion_programada_en = DATE_ADD(CURDATE(), INTERVAL ? DAY),
              aviso_prueba_dias = 0
        WHERE id = ? AND estado_suscripcion <> 'activa' AND eliminacion_programada_en IS NULL`,
      [graciaDias, u.id],
    );
    invalidarCache(u.id);
    const [[f]] = await pool.query("SELECT eliminacion_programada_en AS f FROM usuarios WHERE id = ?", [u.id]);
    await avisar(u, {
      asunto: "Su prueba de Doy Fe termino",
      cuerpo: `${trato(u)}. El periodo de prueba de Doy Fe termino: la cuenta ya no puede iniciar documentos nuevos, pero todavia puede entrar, consultar y exportar lo suyo.\n\nSi no activa una suscripcion antes del ${formatoFecha(f.f)}, la cuenta y TODO su contenido se eliminan ese dia de forma definitiva e irreversible: clientes, expedientes, protocolo, caja, comprobantes y legajos UIF. Es lo que corresponde hacer con datos que ya no tenemos por que conservar.`,
    });
    resultado.vencidas += 1;
  }

  // 3. Ultimo aviso, 3 dias antes del borrado.
  const [ultimoAviso] = await pool.query(
    `SELECT id, email, nombre, eliminacion_programada_en FROM usuarios
      WHERE estado_suscripcion <> 'activa' AND activo = 1 AND eliminacion_programada_en IS NOT NULL
        AND DATEDIFF(eliminacion_programada_en, CURDATE()) <= 3 AND DATEDIFF(eliminacion_programada_en, CURDATE()) > 0
        AND (aviso_prueba_dias IS NULL OR aviso_prueba_dias >= 0)`,
  );
  for (const u of ultimoAviso) {
    await avisar(u, {
      asunto: "Ultimo aviso: sus datos en Doy Fe se eliminan en pocos dias",
      cuerpo: `${trato(u)}. El ${formatoFecha(u.eliminacion_programada_en)} se eliminan de forma definitiva la cuenta y todo su contenido en Doy Fe. Si quiere conservarlo, active la suscripcion antes de esa fecha o exporte lo que necesite (protocolo, comprobantes y caja se exportan desde cada pantalla).`,
    });
    await pool.query("UPDATE usuarios SET aviso_prueba_dias = -1 WHERE id = ?", [u.id]);
    resultado.avisos += 1;
  }

  // 4. Borrado definitivo. Nunca alcanza a quien tiene suscripcion activa o
  //    en tramite, ni a la cuenta operadora.
  const [aBorrar] = await pool.query(
    `SELECT id FROM usuarios
      WHERE estado_suscripcion <> 'activa' AND es_admin = 0
        AND eliminacion_programada_en IS NOT NULL AND eliminacion_programada_en <= CURDATE()`,
  );
  resultado.pendientesDeBorrar = aBorrar.length;
  if (borradoAutomatico || forzarBorrado) {
    for (const u of aBorrar) {
      try {
        await eliminarCuenta(u.id, "prueba_vencida");
        resultado.eliminadas += 1;
        resultado.pendientesDeBorrar -= 1;
      } catch (e) {
        logger.error("No se pudo eliminar una cuenta vencida", { cantidad: u.id, codigo: e.codigo || e.code || "error" });
      }
    }
  }
  return resultado;
}

/** Quita la prueba y la baja programada cuando la cuenta pasa a pagar. */
export async function cancelarBajaProgramada(usuarioId) {
  await pool.query("UPDATE usuarios SET eliminacion_programada_en = NULL, aviso_prueba_dias = NULL WHERE id = ?", [usuarioId]);
  invalidarCache(usuarioId);
}

let temporizador = null;

/**
 * Revision periodica. Cada 6 h alcanza: todos los plazos son en dias y la
 * pasada es idempotente. Se arranca desde server.js.
 */
export function programarRevision() {
  if (temporizador) return;
  const correr = () =>
    revisar()
      .then((r) => {
        if (r.avisos || r.vencidas || r.eliminadas) logger.info("Revision de periodos de prueba", r);
      })
      .catch((e) => logger.error("Fallo la revision de periodos de prueba", { codigo: e.code || e.codigo || "error" }));
  setTimeout(correr, 60_000).unref(); // al minuto de arrancar, ya con la base lista
  temporizador = setInterval(correr, 6 * 60 * 60 * 1000);
  temporizador.unref();
}
