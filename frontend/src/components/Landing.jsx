import { useState } from "react";
import Icono from "./Iconos.jsx";

const FEATURES = [
  { icono: "pluma", titulo: "Redacción de escrituras con IA", desc: "Genere borradores de escrituras públicas a partir de la documentación del acto, con cláusulas adaptadas al tipo de operación y listas para su revisión profesional." },
  { icono: "carpeta", titulo: "Estudios de títulos automatizados", desc: "Obtenga estudios de títulos estructurados con análisis de antecedentes dominiales, gravámenes, inhibiciones y observaciones relevantes." },
  { icono: "escudo", titulo: "Anonimización automática de datos", desc: "Todos los datos personales y sensibles se eliminan del documento antes de ser procesados por inteligencia artificial." },
  { icono: "protocolo", titulo: "Protocolo notarial digital", desc: "Administre su protocolo notarial de forma digital: numeración, folios, orden cronológico y búsqueda instantánea de cualquier acto." },
  { icono: "personas", titulo: "Gestión de clientes y expedientes", desc: "Centralice la información de sus requirentes con historial completo de actos, documentación asociada y seguimiento del estado." },
  { icono: "calendario", titulo: "Agenda y vencimientos", desc: "Programe firmas, audiencias y vencimientos con alertas automáticas. Sincronice con Google Calendar para tener todo unificado en su celular." },
  { icono: "firma", titulo: "Certificaciones de firmas", desc: "Libro de Requerimientos digital con numeración anual correlativa, control de estados y generación de PDF para cada certificación realizada." },
  { icono: "escudo", titulo: "Cumplimiento UIF integrado", desc: "Gestione reportes de operaciones sospechosas y el régimen informativo de la Unidad de Información Financiera directamente desde la plataforma." },
  { icono: "caja", titulo: "Facturación y DDJJ", desc: "Calcule aranceles, genere liquidaciones y declaraciones juradas de sellos. Integración con ARCA para facturación electrónica con CAE." },
  { icono: "nube", titulo: "Google Calendar y Drive", desc: "Sincronice turnos con Google Calendar y copie cualquier documento generado a su carpeta de Drive con un solo clic." },
  { icono: "capas", titulo: "Custodia documental", desc: "Registre la recepción, devolución y entrega de documentación en custodia con trazabilidad completa y códigos de verificación." },
  { icono: "edificio", titulo: "Colaboración para todo el equipo", desc: "Asigne tareas, comparta expedientes y coordine el trabajo entre escribanos, adscriptos y empleados con permisos por rol." },
];

const PASOS = [
  { num: "1", titulo: "Cargue su documentación", desc: "Suba los archivos .doc o .docx con la información del acto notarial. Doy Fe los procesa, anonimiza los datos sensibles y extrae la información relevante de forma automática." },
  { num: "2", titulo: "La IA genera el borrador", desc: "El motor de inteligencia artificial redacta un borrador de escritura o estudio de títulos adaptado al tipo de acto, con las cláusulas y formalidades que correspondan." },
  { num: "3", titulo: "Revise, ajuste y autorice", desc: "Usted tiene el control total. Revise el borrador, realice los ajustes que considere necesarios y, cuando esté conforme, incorpórelo a su protocolo notarial." },
];

const CONFIANZA = [
  { titulo: "Anonimización antes del procesamiento", desc: "Ningún dato personal llega al motor de inteligencia artificial. Un proceso automático reemplaza toda información identificable por marcadores neutros antes de cualquier análisis." },
  { titulo: "Sus datos son suyos", desc: "La información cargada en Doy Fe no se utiliza para entrenar modelos de IA ni se comparte con terceros bajo ninguna circunstancia." },
  { titulo: "Seguridad de nivel empresarial", desc: "Comunicaciones cifradas, acceso con autenticación segura y almacenamiento protegido con los estándares que la función notarial exige." },
  { titulo: "Cumplimiento normativo argentino", desc: "Doy Fe opera en conformidad con la Ley 25.326 de Protección de Datos Personales y las disposiciones aplicables a la función notarial." },
];

const FAQ = [
  { q: "¿Qué es Doy Fe y para qué tipo de escribanías está pensado?", a: "Doy Fe es un software para escribanías que integra inteligencia artificial en el flujo de trabajo notarial. Está diseñado tanto para escribanías unipersonales como para registros con múltiples adscriptos y equipos de trabajo. La plataforma abarca desde la redacción asistida de escrituras y estudios de títulos hasta la gestión completa del protocolo notarial, expedientes, clientes, facturación y cumplimiento UIF." },
  { q: "¿Cómo funciona la redacción de escrituras con inteligencia artificial?", a: "Usted carga la documentación del acto en formato .doc o .docx. La plataforma anonimiza automáticamente los datos personales, analiza la estructura del acto y genera un borrador de escritura pública con las cláusulas y formalidades correspondientes al tipo de operación. El borrador queda listo para su revisión profesional. La IA asiste; el escribano decide." },
  { q: "¿El sistema realiza estudios de títulos completos?", a: "Doy Fe genera estudios de títulos automatizados a partir de la documentación que usted cargue: escrituras antecedentes, informes de dominio e inhibición, planos y demás antecedentes dominiales. El sistema estructura la cadena de transmisiones, identifica posibles observaciones y señala puntos de atención que requieren su análisis profesional." },
  { q: "¿Mis datos y los de mis clientes están seguros?", a: "La seguridad de los datos es el principio fundacional de Doy Fe. Antes de que cualquier documento sea procesado por el motor de inteligencia artificial, un módulo de anonimización automática reemplaza todos los datos personales por marcadores genéricos. La IA analiza la estructura y el contenido jurídico del acto sin acceder a la identidad de las partes ni a información patrimonial sensible." },
  { q: "¿Doy Fe reemplaza el criterio del escribano?", a: "En absoluto. Doy Fe es una herramienta de asistencia profesional, no un sustituto del escribano. La plataforma genera borradores y análisis que aceleran el trabajo operativo, pero toda decisión jurídica, toda revisión de fondo y toda autorización siguen siendo responsabilidad exclusiva del notario." },
  { q: "¿Cómo se maneja el protocolo notarial dentro de la plataforma?", a: "Doy Fe incluye un módulo de gestión de protocolo notarial digital que permite administrar la numeración de escrituras, el orden cronológico de los actos, la asignación de folios y la búsqueda rápida por múltiples criterios. El sistema refleja fielmente la estructura del protocolo tal como lo exige la normativa notarial vigente." },
  { q: "¿El sistema ayuda con las obligaciones ante la UIF?", a: "Sí. Doy Fe integra un módulo de cumplimiento con la Unidad de Información Financiera que facilita la gestión del régimen informativo al que están sujetos los escribanos públicos conforme la Ley 25.246 y las resoluciones aplicables. La plataforma asiste en la identificación de operaciones que superan los umbrales de reporte y el seguimiento de las obligaciones periódicas." },
  { q: "¿Puedo usar Doy Fe con mi equipo de trabajo?", a: "Sí. Doy Fe permite crear usuarios con roles diferenciados —titular, adscripto, empleado— con permisos específicos para cada función. Los expedientes pueden asignarse a responsables, las tareas se coordinan internamente y toda la actividad queda registrada con trazabilidad completa." },
  { q: "¿Doy Fe se integra con Google Calendar y Drive?", a: "Sí. Cada escribano puede conectar su cuenta de Google para sincronizar automáticamente los turnos de la agenda con Google Calendar y copiar cualquier documento generado —comprobantes, certificaciones, declaraciones juradas, custodias— a una carpeta de Drive con un solo clic. La integración usa permisos mínimos: solo ve los archivos que crea la app y los eventos que ella misma agenda." },
  { q: "¿Qué tipo de documentos puedo cargar?", a: "Actualmente, Doy Fe acepta documentos en formato .doc y .docx para el procesamiento con inteligencia artificial. Usted puede cargar boletos de compraventa, escrituras antecedentes, informes de dominio e inhibición, poderes, actas y cualquier otro documento relevante para el acto notarial." },
  { q: "¿Cuánto tiempo lleva implementar Doy Fe?", a: "La implementación es rápida y no requiere infraestructura especial. Al ser una plataforma web, solo necesita un navegador actualizado y conexión a internet. La mayoría de las escribanías comienzan a operar productivamente dentro de la primera semana." },
];

function FaqItem({ q, a }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="landing-faq-item" itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
      <button
        type="button"
        className={`landing-faq-q ${abierto ? "abierto" : ""}`}
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
      >
        <span itemProp="name">{q}</span>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="landing-faq-chevron">
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {abierto && (
        <div className="landing-faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
          <p itemProp="text">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function Landing({ onIrAcceso }) {
  return (
    <div className="landing" itemScope itemType="https://schema.org/WebPage">
      {/* --- Header --- */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <a className="landing-logo" href="/" aria-label="Doy Fe - Inicio">
            <img src="/favicon.svg" width="34" height="34" alt="" />
            <span className="landing-logo-texto">
              <strong>Doy Fe</strong>
              <small>Software notarial con IA</small>
            </span>
          </a>
          <nav className="landing-nav" aria-label="Navegacion principal">
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#seguridad">Seguridad</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <button type="button" className="boton primario" onClick={onIrAcceso}>
            Ingresar
          </button>
        </div>
      </header>

      {/* --- Hero --- */}
      <section className="landing-hero">
        <div className="landing-contenedor">
          <h1>Inteligencia artificial al servicio de su escribanía</h1>
          <p className="landing-hero-sub">
            Doy Fe automatiza la redacción de escrituras, estudios de títulos y la gestión integral de su protocolo notarial. Más precisión, menos trabajo operativo.
          </p>
          <div className="landing-hero-ctas">
            <button type="button" className="boton primario landing-boton-grande" onClick={onIrAcceso}>
              Comenzar prueba gratuita
            </button>
            <a href="#como-funciona" className="boton landing-boton-grande">Ver cómo funciona</a>
          </div>
          <p className="landing-hero-nota">Sin tarjeta de crédito. Sin permanencia mínima.</p>
        </div>
      </section>

      {/* --- Barra de valor --- */}
      <section className="landing-barra" aria-label="Beneficios principales">
        <div className="landing-contenedor">
          <div className="landing-barra-items">
            <div className="landing-barra-item">
              <Icono nombre="pluma" tamano={24} />
              <div>
                <strong>Escrituras en minutos</strong>
                <span>No en horas</span>
              </div>
            </div>
            <div className="landing-barra-item">
              <Icono nombre="escudo" tamano={24} />
              <div>
                <strong>Datos anonimizados</strong>
                <span>Antes del análisis</span>
              </div>
            </div>
            <div className="landing-barra-item">
              <Icono nombre="capas" tamano={24} />
              <div>
                <strong>Gestión completa</strong>
                <span>Todo en un solo lugar</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Propuesta de valor --- */}
      <section className="landing-seccion" id="propuesta">
        <div className="landing-contenedor">
          <div className="landing-seccion-cabecera">
            <h2>Software de gestión notarial integral</h2>
            <p>Todo lo que su escribanía necesita para trabajar mejor, más rápido y con total seguridad.</p>
          </div>
          <div className="landing-propuestas">
            <article className="landing-propuesta">
              <div className="landing-propuesta-icono"><Icono nombre="pluma" tamano={28} /></div>
              <h3>Escrituras redactadas en minutos, no en horas</h3>
              <p>Suba un documento con los datos del acto y Doy Fe genera un borrador de escritura listo para su revisión. La inteligencia artificial analiza la información, aplica las cláusulas correspondientes y respeta el estilo de redacción de su escribanía.</p>
            </article>
            <article className="landing-propuesta">
              <div className="landing-propuesta-icono"><Icono nombre="carpeta" tamano={28} /></div>
              <h3>Estudios de títulos con análisis automatizado</h3>
              <p>Cargue la documentación del inmueble y obtenga un estudio de títulos estructurado con observaciones, antecedentes dominiales y puntos de atención. Lo que antes demandaba jornadas de trabajo, ahora se resuelve en una fracción del tiempo.</p>
            </article>
            <article className="landing-propuesta">
              <div className="landing-propuesta-icono"><Icono nombre="escudo" tamano={28} /></div>
              <h3>Sus datos nunca llegan a la inteligencia artificial</h3>
              <p>Antes de que cualquier documento sea procesado por IA, Doy Fe anonimiza automáticamente todos los datos personales y sensibles. Nombres, DNI, domicilios y datos patrimoniales se reemplazan por marcadores neutros.</p>
            </article>
            <article className="landing-propuesta">
              <div className="landing-propuesta-icono"><Icono nombre="grafico" tamano={28} /></div>
              <h3>Gestión notarial completa en una sola plataforma</h3>
              <p>Protocolo notarial, expedientes, clientes, facturación, agenda y cumplimiento UIF. Todo integrado, todo en un mismo lugar. Sin planillas dispersas ni múltiples sistemas que no se comunican entre sí.</p>
            </article>
          </div>
        </div>
      </section>

      {/* --- Como funciona --- */}
      <section className="landing-seccion landing-seccion-alt" id="como-funciona">
        <div className="landing-contenedor">
          <div className="landing-seccion-cabecera">
            <h2>Cómo funciona</h2>
            <p>Tres pasos para transformar la operatoria de su escribanía.</p>
          </div>
          <div className="landing-pasos">
            {PASOS.map((p) => (
              <article className="landing-paso" key={p.num}>
                <div className="landing-paso-num">{p.num}</div>
                <h3>{p.titulo}</h3>
                <p>{p.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --- Funcionalidades --- */}
      <section className="landing-seccion" id="funcionalidades">
        <div className="landing-contenedor">
          <div className="landing-seccion-cabecera">
            <h2>Todas las herramientas que su escribanía necesita</h2>
            <p>Desde la redacción de escrituras hasta el cumplimiento UIF, todo en una plataforma integrada.</p>
          </div>
          <div className="landing-features">
            {FEATURES.map((f, i) => (
              <article className="landing-feature" key={i}>
                <div className="landing-feature-icono"><Icono nombre={f.icono} tamano={22} /></div>
                <h3>{f.titulo}</h3>
                <p>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --- Seguridad --- */}
      <section className="landing-seccion landing-seccion-alt" id="seguridad">
        <div className="landing-contenedor">
          <div className="landing-seccion-cabecera">
            <h2>La confidencialidad es un deber profesional. También es el nuestro.</h2>
            <p>Doy Fe fue diseñado desde su arquitectura para proteger la información que su escribanía gestiona a diario.</p>
          </div>
          <div className="landing-confianza">
            {CONFIANZA.map((c, i) => (
              <article className="landing-confianza-item" key={i}>
                <div className="landing-confianza-check">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4 10.5L8 14.5L16 6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h3>{c.titulo}</h3>
                  <p>{c.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --- FAQ --- */}
      <section className="landing-seccion" id="preguntas" itemScope itemType="https://schema.org/FAQPage">
        <div className="landing-contenedor landing-contenedor-estrecho">
          <div className="landing-seccion-cabecera">
            <h2>Preguntas frecuentes</h2>
            <p>Todo lo que necesita saber antes de empezar a usar Doy Fe en su escribanía.</p>
          </div>
          <div className="landing-faq">
            {FAQ.map((f, i) => <FaqItem key={i} {...f} />)}
          </div>
        </div>
      </section>

      {/* --- CTA final --- */}
      <section className="landing-cta-final">
        <div className="landing-contenedor">
          <h2>Su escribanía merece herramientas a la altura de su responsabilidad</h2>
          <p>Conozca cómo Doy Fe puede transformar la operatoria diaria de su estudio notarial. Sin compromiso, sin letra chica.</p>
          <button type="button" className="boton primario landing-boton-grande" onClick={onIrAcceso}>
            Comenzar prueba gratuita
          </button>
          <p className="landing-cta-nota">Sin tarjeta de crédito. Sin permanencia mínima.</p>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="landing-footer">
        <div className="landing-contenedor">
          <div className="landing-footer-inner">
            <div className="landing-footer-marca">
              <img src="/favicon.svg" width="28" height="28" alt="" />
              <strong>Doy Fe</strong>
              <span>Software notarial con IA</span>
            </div>
            <nav className="landing-footer-links" aria-label="Enlaces legales">
              <a href="/privacidad.html">Política de privacidad</a>
              <a href="/condiciones.html">Condiciones del servicio</a>
            </nav>
          </div>
          <p className="landing-footer-legal">© {new Date().getFullYear()} Doy Fe · Cumbre Tech S.R.L. · Software de gestión notarial con inteligencia artificial para escribanías argentinas.</p>
        </div>
      </footer>
    </div>
  );
}
