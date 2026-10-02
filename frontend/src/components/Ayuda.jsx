import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icono from "./Iconos.jsx";

const SECCIONES = [
  {
    id: "redactar",
    titulo: "Redactar",
    icono: "pluma",
    ruta: "/",
    descripcion: "El asistente de inteligencia artificial analiza documentos notariales y genera borradores de escrituras, estudios de títulos y certificaciones de firmas.",
    funciones: [
      { nombre: "Cargar un documento", detalle: "Arrastre un archivo .doc o .docx al área de carga, o haga clic para seleccionarlo. También puede escribir los antecedentes a mano sin subir un archivo." },
      { nombre: "Elegir el modo de análisis", detalle: "Escritura (redacta el borrador de la escritura), Estudio de títulos (revisa la cadena dominial), Análisis completo (ambos) o Certificación de firmas (con datos de las partes y modalidad de representación o a título personal)." },
      { nombre: "Usar un modelo propio", detalle: "Puede adjuntar una plantilla de su Biblioteca de modelos para que la IA la use como base del documento." },
      { nombre: "Seguir el progreso en tiempo real", detalle: "Mientras se procesa, la columna derecha muestra las etapas del análisis. Si alguna falla, puede reintentar desde la etapa que falló." },
      { nombre: "Pedir mejoras", detalle: "Una vez completado, puede pedir iteraciones con comentarios específicos (\"agregá la cláusula de…\", \"cambiá el nombre de…\") y la IA genera una versión mejorada." },
      { nombre: "Descargar el documento", detalle: "El resultado se descarga como .docx listo para usar. Al descargar, la sesión se cierra y los datos se borran del servidor." },
      { nombre: "Guardar y continuar después", detalle: "Si no puede terminar ahora, guarde la sesión. Aparecerá en \"Reanudar sesión guardada\" en la pantalla de inicio (se conserva hasta 7 días)." },
      { nombre: "Registrar en protocolo", detalle: "Desde los resultados puede registrar el acto directamente en el índice de protocolo." },
      { nombre: "Guardar en un expediente", detalle: "Puede vincular el resultado a un expediente existente o crear uno nuevo." },
    ],
  },
  {
    id: "expedientes",
    titulo: "Expedientes",
    icono: "carpeta",
    ruta: "/cases",
    descripcion: "Gestión de expedientes notariales: cada expediente agrupa un acto con sus partes, tareas, presupuestos y comprobantes.",
    funciones: [
      { nombre: "Crear expedientes", detalle: "Indique la carátula, el tipo de acto y observaciones. El expediente se crea en estado \"abierto\"." },
      { nombre: "Filtrar por estado", detalle: "Vea expedientes abiertos, en firma, cerrados o archivados." },
      { nombre: "Agregar partes", detalle: "Vincule clientes del CRM como partes del expediente (compradores, vendedores, etc.)." },
      { nombre: "Gestionar tareas", detalle: "Cree tareas dentro del expediente, asígnelas y marque su estado. También puede importar tareas sugeridas por la IA después de procesar un documento." },
      { nombre: "Compartir con el equipo", detalle: "Comparta el expediente con otros miembros de su escribanía, asignando permisos." },
      { nombre: "Presupuestos", detalle: "Genere presupuestos vinculados al expediente con detalle de ítems, montos y descuentos. Puede exportarlos como PDF o compartirlos por WhatsApp." },
      { nombre: "Facturación directa", detalle: "Emita comprobantes fiscales vinculados al expediente sin salir de la ficha." },
    ],
  },
  {
    id: "clientes",
    titulo: "Clientes",
    icono: "personas",
    ruta: "/clients",
    descripcion: "CRM de clientes de la escribanía. Todos los datos personales se guardan cifrados en el servidor.",
    funciones: [
      { nombre: "Alta de clientes", detalle: "Registre nombre, DNI/CUIT, domicilio, teléfono y correo electrónico." },
      { nombre: "Buscar clientes", detalle: "Busque por nombre, documento o cualquier dato del cliente." },
      { nombre: "Ficha del cliente", detalle: "Vea el detalle completo: expedientes vinculados, presupuestos, saldo en cuenta corriente y legajo UIF." },
      { nombre: "Editar y eliminar", detalle: "Modifique los datos o elimine un cliente que ya no necesite." },
    ],
  },
  {
    id: "caja",
    titulo: "Caja",
    icono: "caja",
    ruta: "/cash",
    rolMinimo: "escribano",
    descripcion: "Cuenta corriente de la escribanía: registre cobros, cargos y consulte el saldo de cada cliente.",
    funciones: [
      { nombre: "Registrar pagos", detalle: "Registre cobros en efectivo, transferencia, cheque o tarjeta, vinculados a un cliente y opcionalmente a un expediente." },
      { nombre: "Crear cargos", detalle: "Registre honorarios, gastos o cualquier concepto a cobrar." },
      { nombre: "Filtrar movimientos", detalle: "Filtre por rango de fechas, cliente o expediente." },
      { nombre: "Ver resumen", detalle: "Consulte el total de ingresos, cargos y saldo del período." },
      { nombre: "Exportar a CSV", detalle: "Descargue los movimientos en formato CSV para abrir en Excel." },
    ],
  },
  {
    id: "comprobantes",
    titulo: "Comprobantes",
    icono: "factura",
    ruta: "/invoices",
    rolMinimo: "escribano",
    descripcion: "Emisión de comprobantes fiscales electrónicos a través de ARCA (ex AFIP). Requiere configurar las credenciales fiscales.",
    funciones: [
      { nombre: "Emitir comprobantes", detalle: "Genere facturas, recibos y notas de crédito electrónicas directamente desde la plataforma." },
      { nombre: "Descargar PDF", detalle: "Descargue el comprobante en formato PDF con el código QR de ARCA." },
      { nombre: "Copiar a Google Drive", detalle: "Si tiene Google conectado, copie el comprobante directamente a su Drive." },
      { nombre: "Anular comprobantes", detalle: "Anule un comprobante emitido indicando el motivo (genera la nota de crédito correspondiente)." },
      { nombre: "Exportar a CSV", detalle: "Descargue el listado de comprobantes para su contador." },
      { nombre: "Configuración fiscal", detalle: "Configure su CUIT, condición fiscal, punto de venta y credenciales de ARCA desde la sección de configuración fiscal." },
    ],
  },
  {
    id: "uif",
    titulo: "UIF",
    icono: "escudo",
    ruta: "/uif",
    rolMinimo: "escribano",
    descripcion: "Cumplimiento de la normativa antilavado de la Unidad de Información Financiera. Gestione legajos, alertas y reportes.",
    funciones: [
      { nombre: "Alertas de cumplimiento", detalle: "Vea las alertas automáticas: clientes sin legajo completo, operaciones por encima de los umbrales configurados, vencimientos de documentación." },
      { nombre: "Legajos de clientes", detalle: "Complete el legajo de debida diligencia de cada cliente: datos de identificación, actividad económica, nivel de riesgo, condición de PEP." },
      { nombre: "Expedientes UIF", detalle: "Consulte los expedientes que requieren reporte ante la UIF y genere los recaudos de debida diligencia con ayuda de la IA." },
      { nombre: "Eventos sospechosos", detalle: "Registre y gestione reportes de operaciones sospechosas." },
      { nombre: "Parámetros", detalle: "Configure los umbrales de reporte y los parámetros de riesgo (solo administradores)." },
    ],
  },
  {
    id: "agenda",
    titulo: "Agenda",
    icono: "calendario",
    ruta: "/calendar",
    descripcion: "Calendario de turnos y citas de la escribanía.",
    funciones: [
      { nombre: "Crear turnos", detalle: "Agregue citas indicando título, fecha, hora, duración y notas." },
      { nombre: "Vistas de semana y mes", detalle: "Navegue entre la vista semanal y mensual. Haga clic en un día o franja horaria para crear un turno rápido." },
      { nombre: "Cambiar estado", detalle: "Marque los turnos como pendientes, confirmados, completados o cancelados." },
      { nombre: "Turnos del equipo", detalle: "Vea los turnos de todos los miembros del equipo o solo los propios." },
    ],
  },
  {
    id: "notas",
    titulo: "Notas",
    icono: "nota",
    ruta: "/notes",
    descripcion: "Notas personales o compartidas con el equipo de la escribanía.",
    funciones: [
      { nombre: "Crear notas", detalle: "Escriba notas de texto libre. Marque como compartida para que la vea todo el equipo." },
      { nombre: "Eliminar notas", detalle: "Borre las notas que ya no necesite." },
    ],
  },
  {
    id: "biblioteca",
    titulo: "Biblioteca de modelos",
    icono: "biblioteca",
    ruta: "/templates",
    descripcion: "Sus modelos de escritura propios. Suba plantillas .docx que la IA usará como base al redactar.",
    funciones: [
      { nombre: "Subir modelos", detalle: "Cargue un archivo .doc o .docx con un nombre descriptivo y el tipo de acto al que corresponde." },
      { nombre: "Usar en redacción", detalle: "Al procesar un documento, elija uno de sus modelos como base para que la IA siga su estilo y estructura." },
      { nombre: "Eliminar modelos", detalle: "Quite los modelos que ya no use." },
    ],
  },
  {
    id: "protocolo",
    titulo: "Protocolo",
    icono: "protocolo",
    ruta: "/protocol",
    rolMinimo: "escribano",
    descripcion: "Índice de protocolo notarial: registre cada acto con su número, fecha, partes y folio.",
    funciones: [
      { nombre: "Registrar actos", detalle: "Agregue entradas al protocolo con número, fecha, tipo de acto, partes intervinientes, folio y observaciones." },
      { nombre: "Registro desde la IA", detalle: "Después de procesar un documento, puede registrar el acto directamente en el protocolo desde los resultados." },
      { nombre: "Cambiar estado", detalle: "Marque las entradas como registradas, firmadas o cerradas." },
      { nombre: "Filtrar por año", detalle: "Consulte el protocolo de cualquier año." },
      { nombre: "Exportar", detalle: "Descargue el índice anual completo como archivo .docx." },
    ],
  },
  {
    id: "equipo",
    titulo: "Equipo",
    icono: "edificio",
    ruta: "/team",
    descripcion: "Gestione el equipo de su escribanía: invite colaboradores, asigne roles y controle permisos.",
    funciones: [
      { nombre: "Crear el equipo", detalle: "Dele un nombre a su escribanía. El equipo agrupa a todos los que trabajan juntos." },
      { nombre: "Invitar miembros", detalle: "Invite por correo electrónico a escribanos o empleados. Cada invitado recibe un enlace para crear su cuenta." },
      { nombre: "Roles", detalle: "Escribano: acceso completo (caja, comprobantes, protocolo, UIF). Empleado: acceso a redacción, expedientes, clientes, agenda y notas." },
      { nombre: "Suspender y reactivar", detalle: "Suspenda temporalmente el acceso de un miembro sin perder sus datos." },
      { nombre: "Quitar miembros", detalle: "Desvinculen a un miembro del equipo." },
      { nombre: "Métricas de uso", detalle: "Vea cuántos documentos procesó cada miembro y el costo de IA en el período." },
    ],
  },
  {
    id: "integraciones",
    titulo: "Integraciones",
    icono: "nube",
    ruta: "/integrations",
    descripcion: "Conecte servicios externos para ampliar las funciones de la plataforma.",
    funciones: [
      { nombre: "Google Calendar", detalle: "Sincronice los turnos de la agenda con su calendario de Google." },
      { nombre: "Google Drive", detalle: "Copie comprobantes y documentos directamente a su Drive." },
      { nombre: "Conectar y desconectar", detalle: "Autorice el acceso a Google con un clic. Puede desconectar en cualquier momento sin perder datos." },
    ],
  },
  {
    id: "consumo",
    titulo: "Consumo de IA",
    icono: "grafico",
    ruta: "/usage",
    descripcion: "Estadísticas de uso de la inteligencia artificial: sesiones, tokens consumidos y costo.",
    funciones: [
      { nombre: "Ver consumo por período", detalle: "Consulte el uso de IA en los últimos 30, 90 o 365 días." },
      { nombre: "Detalle por sesión", detalle: "Vea cuántos tokens consumió cada sesión y su costo en dólares." },
      { nombre: "Precios por modelo (admin)", detalle: "Los administradores pueden configurar el precio por token de cada modelo y proveedor de IA." },
    ],
  },
  {
    id: "suscripcion",
    titulo: "Suscripción",
    icono: "tarjeta",
    ruta: "/subscription",
    descripcion: "Gestione su plan y forma de pago. La suscripción se cobra a través de Mercado Pago.",
    funciones: [
      { nombre: "Ver estado actual", detalle: "Consulte su plan, estado (prueba, activa, pausada, cancelada) y fecha de próximo cobro." },
      { nombre: "Período de prueba", detalle: "Al crear su cuenta recibe un período de prueba sin cargo. Al terminar, si no activa una suscripción, la cuenta se bloquea y los datos se eliminan tras el plazo de gracia." },
      { nombre: "Suscribirse", detalle: "Elija un plan y complete el pago a través de Mercado Pago." },
      { nombre: "Cancelar", detalle: "Puede cancelar su suscripción en cualquier momento. La cuenta sigue activa hasta el fin del período pagado." },
    ],
  },
  {
    id: "soporte",
    titulo: "Soporte",
    icono: "chat",
    ruta: "/support",
    descripcion: "Canal de comunicación directo con el equipo de Doy Fe.",
    funciones: [
      { nombre: "Crear consultas", detalle: "Envíe un mensaje con asunto y descripción. El equipo de soporte responde desde el panel de administración." },
      { nombre: "Seguir la conversación", detalle: "Vea el historial de mensajes y responda en el mismo hilo." },
      { nombre: "Notificaciones", detalle: "El ícono de Soporte en el menú muestra un indicador cuando tiene respuestas sin leer." },
    ],
  },
  {
    id: "admin",
    titulo: "Panel de administración",
    icono: "capas",
    ruta: "/admin",
    soloAdmin: true,
    descripcion: "Herramientas de gestión de la plataforma. Solo visible para la cuenta administradora.",
    funciones: [
      { nombre: "Dashboard", detalle: "Resumen de la plataforma: cuentas activas, documentos procesados, pruebas en curso, facturación y MRR. Embudo de conversión desde el alta hasta la suscripción." },
      { nombre: "Invitaciones", detalle: "Cree invitaciones para dar de alta escribanías nuevas. Busque, filtre por estado, reenvíe, cancele o elimine invitaciones. Acciones en lote para gestionar varias a la vez." },
      { nombre: "Cuentas", detalle: "Vea todas las cuentas registradas con su actividad, plan y estado. Abra la ficha de cada cuenta para ver sus ejecuciones, errores del pipeline y volumen de datos. Active, desactive o elimine cuentas de forma definitiva." },
      { nombre: "Consultas de soporte", detalle: "Vea y responda las consultas enviadas por los suscriptores. Cierre o reabra conversaciones." },
      { nombre: "Configuración de IA", detalle: "Elija el proveedor de IA (Claude, Gemini, modelo local) y configure las credenciales. Pruebe la conexión antes de guardar." },
      { nombre: "Parámetros UIF", detalle: "Configure los umbrales globales del módulo de cumplimiento antilavado." },
      { nombre: "Planes y facturación", detalle: "Administre los planes de suscripción disponibles, sus precios y los parámetros de facturación." },
      { nombre: "Revisar vencimientos", detalle: "Ejecute manualmente la revisión de pruebas vencidas: envía avisos, bloquea cuentas y programa la eliminación de datos." },
    ],
  },
];

export default function Ayuda() {
  const navigate = useNavigate();
  const [abierta, setAbierta] = useState(null);

  return (
    <div className="equipo">
      <h2>Ayuda</h2>
      <p className="nota">
        Guía completa de todas las funciones de <b>Doy Fe</b>. Haga clic en cualquier sección para ver el detalle.
      </p>

      {SECCIONES.map((s) => (
        <details
          key={s.id}
          className="bloque"
          open={abierta === s.id}
          onToggle={(e) => { if (e.target.open) setAbierta(s.id); else if (abierta === s.id) setAbierta(null); }}
        >
          <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Icono nombre={s.icono} tamano={20} />
            <strong>{s.titulo}</strong>
            {s.rolMinimo && <span className="etiqueta">solo escribanos</span>}
            {s.soloAdmin && <span className="etiqueta riesgo-alto">solo admin</span>}
          </summary>

          <p style={{ margin: "0.75rem 0 0.5rem" }}>{s.descripcion}</p>

          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "30%" }}>Función</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {s.funciones.map((f, i) => (
                  <tr key={i}>
                    <th scope="row">{f.nombre}</th>
                    <td>{f.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: "0.5rem" }}>
            <button type="button" className="enlace" onClick={() => navigate(s.ruta)}>
              Ir a {s.titulo} →
            </button>
          </p>
        </details>
      ))}

      <section className="bloque">
        <h3>Seguridad y privacidad</h3>
        <ul style={{ lineHeight: 1.8 }}>
          <li>Los datos de clientes (nombre, DNI, domicilio) se guardan <b>cifrados</b> en el servidor.</li>
          <li>Los documentos procesados por la IA se <b>anonimizan</b> antes del análisis: los datos reales nunca llegan al proveedor de IA.</li>
          <li>Al descargar el documento o cerrar la sesión, los datos se <b>borran de la memoria</b> del servidor.</li>
          <li>Las sesiones guardadas y el protocolo se conservan cifrados hasta 7 días.</li>
          <li>Las credenciales fiscales (ARCA) se guardan cifradas y solo se usan para emitir comprobantes.</li>
          <li>Cada cuenta ve exclusivamente sus datos: el panel de administración muestra solo metadatos y conteos, nunca el contenido de las escribanías.</li>
        </ul>
      </section>

      <section className="bloque">
        <h3>Roles y permisos</h3>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Rol</th>
                <th scope="col">Acceso</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Titular</th>
                <td>Acceso completo. Puede gestionar el equipo, la suscripción y todas las funciones de la plataforma.</td>
              </tr>
              <tr>
                <th scope="row">Escribano/a</th>
                <td>Acceso a todas las funciones de trabajo: redacción, expedientes, clientes, caja, comprobantes, protocolo, UIF, agenda, notas y biblioteca.</td>
              </tr>
              <tr>
                <th scope="row">Empleado/a</th>
                <td>Acceso a redacción, expedientes, clientes, agenda, notas y biblioteca de modelos. No ve caja, comprobantes, protocolo ni UIF.</td>
              </tr>
              <tr>
                <th scope="row">Administrador</th>
                <td>La cuenta operadora de la plataforma. Gestiona todas las escribanías, invitaciones, suscripciones y configuración global.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bloque">
        <h3>Atajos y consejos</h3>
        <ul style={{ lineHeight: 1.8 }}>
          <li>Puede arrastrar un archivo directamente al área de carga desde cualquier carpeta de su computadora.</li>
          <li>Use la barra de búsqueda en Clientes y en el Panel de administración para encontrar rápidamente lo que busca.</li>
          <li>Los filtros por estado en Expedientes, Invitaciones y Consultas le permiten ver solo lo relevante.</li>
          <li>En el Panel de administración, use las acciones en lote (bulk) para cancelar o eliminar múltiples invitaciones a la vez.</li>
          <li>Cada sección tiene su propia URL: puede guardar un enlace directo o compartirlo con un colega.</li>
          <li>Si el procesamiento de un documento falla, no hace falta volver a cargarlo: use \"Reintentar desde la etapa que falló\".</li>
        </ul>
      </section>
    </div>
  );
}
