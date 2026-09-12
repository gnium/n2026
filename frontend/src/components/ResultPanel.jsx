import { useState } from "react";
import RegistrarProtocoloModal from "./RegistrarProtocoloModal.jsx";
import GuardarEnExpedienteModal from "./GuardarEnExpedienteModal.jsx";
import Icono from "./Iconos.jsx";

const SEV = { bloqueante: "sev-bloqueante", alta: "sev-alta", media: "sev-media", baja: "sev-baja" };

function Minuta({ r }) {
  if (!r) return <p className="vacio">Sin minuta.</p>;
  return (
    <>
      <p className="nota">
        Vista previa <strong>anonimizada</strong>: las marcas entre corchetes dobles se reemplazan por los datos reales únicamente dentro del archivo descargado.
      </p>
      <h3>{r.titulo}</h3>
      <pre className="minuta">{r.texto_escritura}</pre>
      {r.variables_faltantes?.length > 0 && (
        <>
          <h4>Datos que deberá completar</h4>
          <ul>
            {r.variables_faltantes.map((v) => (
              <li key={v.placeholder}>
                <code>{v.placeholder}</code> — {v.descripcion}
              </li>
            ))}
          </ul>
        </>
      )}
      {r.notas_para_escribana?.length > 0 && (
        <>
          <h4>Notas del redactor</h4>
          <ul>{r.notas_para_escribana.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
    </>
  );
}

function Titulos({ r }) {
  if (!r) return <p className="vacio">Sin estudio de títulos.</p>;
  return (
    <>
      <p>
        <strong>Continuidad del tracto:</strong> {r.continuidad_tracto}
      </p>
      <p>{r.conclusion}</p>
      {r.riesgos.length > 0 && (
        <>
          <h4>Riesgos ({r.riesgos.length})</h4>
          <ul className="riesgos">
            {r.riesgos.map((x, i) => (
              <li key={i} className={SEV[x.severidad]}>
                <span className="etiqueta">{x.severidad}</span> <strong>{x.categoria}</strong>: {x.descripcion}
                {x.fundamento_legal && <em> ({x.fundamento_legal})</em>}
                <div className="recomendacion">→ {x.recomendacion}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.tracto_sucesivo.length > 0 && (
        <>
          <h4>Tracto sucesivo</h4>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>#</th><th>Acto</th><th>Fecha</th><th>Transmitente</th><th>Adquirente</th><th>Inscripción</th></tr>
              </thead>
              <tbody>
                {r.tracto_sucesivo.map((t) => (
                  <tr key={t.orden}><td>{t.orden}</td><td>{t.acto}</td><td>{t.fecha}</td><td>{t.transmitente}</td><td>{t.adquirente}</td><td>{t.inscripcion}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {r.requisitos_previos.length > 0 && (
        <>
          <h4>Requisitos previos</h4>
          <ul>{r.requisitos_previos.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}
    </>
  );
}

function Fiscal({ r }) {
  if (!r) return <p className="vacio">Sin validación fiscal.</p>;
  return (
    <>
      <p className={`aptitud ${r.apto_para_firma ? "ok" : "alerta"}`}>{r.apto_para_firma ? "Apto para firma según el control automático." : "Requiere acciones previas a la firma."}</p>
      <p>{r.resumen}</p>
      {r.certificados.length > 0 && (
        <>
          <h4>Certificados</h4>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Certificado</th><th>Estado</th><th>Plazo</th><th>Detalle</th></tr></thead>
              <tbody>
                {r.certificados.map((c, i) => (
                  <tr key={i} className={`cert-${c.estado}`}><td>{c.nombre}</td><td>{c.estado.replace(/_/g, " ")}</td><td>{c.plazo_legal}</td><td>{c.detalle}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {r.impuestos_y_tasas.length > 0 && (
        <>
          <h4>Impuestos y tasas</h4>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Concepto</th><th>Aplica</th><th>Jurisdicción</th><th>Alícuota / fórmula</th><th>Obligado</th></tr></thead>
              <tbody>
                {r.impuestos_y_tasas.map((c, i) => (
                  <tr key={i}><td>{c.concepto}</td><td>{c.aplica}</td><td>{c.jurisdiccion}</td><td>{c.alicuota_o_formula}</td><td>{c.sujeto_obligado}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {r.inconsistencias.length > 0 && (
        <>
          <h4>Inconsistencias</h4>
          <ul>{r.inconsistencias.map((x, i) => <li key={i}><span className="etiqueta">{x.severidad}</span> {x.descripcion}</li>)}</ul>
        </>
      )}
      {r.checklist_previo_firma.length > 0 && (
        <>
          <h4>Checklist previo a la firma</h4>
          <ol>{r.checklist_previo_firma.map((x) => <li key={x.orden}>{x.accion}{x.responsable ? ` (${x.responsable})` : ""}</li>)}</ol>
        </>
      )}
    </>
  );
}

function Certificacion({ r }) {
  if (!r) return <p className="vacio">Sin certificación.</p>;
  const EST = { ok: "sev-baja", atencion: "sev-media", faltante: "sev-alta" };
  return (
    <>
      <p className="nota">
        Vista previa <strong>anonimizada</strong>. Modalidad: <strong>{r.modalidad === "representacion" ? "con representación" : "a título personal"}</strong>.
      </p>
      <h4>Acta de requerimiento</h4>
      <pre className="minuta">{r.acta_requerimiento}</pre>
      <h4>Certificación</h4>
      <pre className="minuta">{r.certificacion}</pre>
      {r.firmantes.length > 0 && (
        <>
          <h4>Firmantes</h4>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Firmante</th><th>Carácter</th><th>Representa a</th><th>Documentos habilitantes</th></tr></thead>
              <tbody>{r.firmantes.map((f, i) => <tr key={i}><td>{f.marca}</td><td>{f.caracter}</td><td>{f.representa_a}</td><td>{f.documentos_habilitantes.join("; ")}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      {r.documentos_habilitantes_requeridos.length > 0 && (
        <>
          <h4>Documentos habilitantes</h4>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Documento</th><th>Estado</th><th>Detalle</th></tr></thead>
              <tbody>{r.documentos_habilitantes_requeridos.map((d, i) => <tr key={i} className={`cert-${d.estado}`}><td>{d.documento}</td><td>{d.estado}</td><td>{d.detalle}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      {r.controles.length > 0 && (
        <>
          <h4>Controles</h4>
          <ul className="riesgos">
            {r.controles.map((c, i) => (
              <li key={i} className={EST[c.resultado]}>
                <span className="etiqueta">{c.resultado}</span> <strong>{c.control}</strong>
                {c.fundamento && <em> ({c.fundamento})</em>}
                {c.detalle && <div className="recomendacion">{c.detalle}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
      {r.variables_faltantes.length > 0 && (
        <>
          <h4>Datos que deberá completar</h4>
          <ul>{r.variables_faltantes.map((v) => <li key={v.placeholder}><code>{v.placeholder}</code> — {v.descripcion}</li>)}</ul>
        </>
      )}
      {r.notas_para_escribana.length > 0 && (
        <>
          <h4>Notas</h4>
          <ul>{r.notas_para_escribana.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
    </>
  );
}

function PedirMejora({ onIterar }) {
  const [feedback, setFeedback] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await onIterar(feedback.trim());
      setFeedback("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="pedir-mejora" onSubmit={enviar}>
      <h3>¿Quiere ajustar el resultado?</h3>
      <p className="nota">
        Describa qué cambiar (por ejemplo: "revisar la cláusula de posesión", "agregar el certificado catastral", "faltó considerar el embargo") y se genera una nueva versión sin volver a cargar el documento. No hace falta repetir nombres o datos ya conocidos.
      </p>
      <textarea rows={3} aria-label="Qué le gustaría cambiar o mejorar" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Qué le gustaría cambiar o mejorar (puede dejarlo vacío para simplemente generar otra versión)…" maxLength={4000} disabled={enviando} />
      <div className="acciones">
        <button type="submit" className="boton primario" disabled={enviando}>
          {enviando ? "Generando…" : "Generar nueva versión"}
        </button>
      </div>
    </form>
  );
}

export default function ResultPanel({ resultados, modo, numeroIteracion = 1, urlDescarga, sesionId, onDescargado, onNuevo, onIterar, onGuardar, onAbrirExpediente }) {
  const [mostrarExpediente, setMostrarExpediente] = useState(false);
  const tabs = [
    resultados?.redactor_certificacion_firmas && ["certificacion", "Certificación de firmas"],
    resultados?.redactor_minuta_escritura && ["minuta", "Minuta"],
    resultados?.analista_estudio_titulos && ["titulos", "Estudio de títulos"],
    resultados?.validador_fiscal_registral && ["fiscal", "Fiscal y registral"],
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]?.[0] || "minuta");
  const [mostrarProtocolo, setMostrarProtocolo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const nombreDescarga = modo === "estudio_titulos" ? "Descargar informe .docx" : modo === "certificacion_firmas" ? "Descargar certificación .docx" : "Descargar .docx";
  const guardarYContinuar = async () => {
    setGuardando(true);
    try {
      await onGuardar?.();
    } finally {
      setGuardando(false);
    }
  };
  return (
    <section className="resultados" aria-labelledby="res-titulo">
      <div className="resultados-cabecera">
        <h2 id="res-titulo">
          Resultado {numeroIteracion > 1 && <span className="version-badge">versión {numeroIteracion}</span>}
        </h2>
        <div className="acciones">
          <button type="button" className="boton" onClick={() => setMostrarProtocolo((v) => !v)}>
            {mostrarProtocolo ? "Ocultar registro" : "Registrar en el protocolo"}
          </button>
          <button type="button" className="boton" onClick={() => setMostrarExpediente(true)}>
            <Icono nombre="carpeta" tamano={16} /> Guardar en un expediente
          </button>
          <a className="boton primario" href={urlDescarga} download onClick={() => setTimeout(onDescargado, 1500)}>
            <Icono nombre="descargar" tamano={16} /> {nombreDescarga}
          </a>
          {onGuardar && (
            <button type="button" className="boton" onClick={guardarYContinuar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar y continuar después"}
            </button>
          )}
          <button className="boton" onClick={onNuevo}>Nuevo documento</button>
        </div>
      </div>
      <p className="nota importante">
        Al descargar, el servidor completa el documento con los datos reales y <strong>borra la sesión de su memoria</strong>. Guarde el archivo en un lugar seguro: no podrá volver a descargarlo. Si quiere registrarla en el protocolo, hágalo <strong>antes</strong> de descargar.
      </p>
      {mostrarProtocolo && sesionId && (
        <RegistrarProtocoloModal sesionId={sesionId} onCerrar={() => setMostrarProtocolo(false)} onRegistrado={() => {}} />
      )}
      {sesionId && (
        <GuardarEnExpedienteModal abierto={mostrarExpediente} sesionId={sesionId} tipoActo={resultados?.extractor_antecedentes?.resumen?.tipo_acto || "otro"} onCerrar={() => setMostrarExpediente(false)} onAbrirExpediente={onAbrirExpediente} />
      )}
      <div
        className="tabs"
        role="tablist"
        aria-label="Secciones del resultado"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const i = tabs.findIndex(([k]) => k === tab);
          const sig = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length][0];
          setTab(sig);
          document.getElementById(`tab-${sig}`)?.focus();
        }}
      >
        {tabs.map(([k, l]) => (
          <button key={k} id={`tab-${k}`} role="tab" aria-selected={tab === k} aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} className={`tab ${tab === k ? "activa" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "certificacion" && <Certificacion r={resultados?.redactor_certificacion_firmas} />}
        {tab === "minuta" && <Minuta r={resultados?.redactor_minuta_escritura} />}
        {tab === "titulos" && <Titulos r={resultados?.analista_estudio_titulos} />}
        {tab === "fiscal" && <Fiscal r={resultados?.validador_fiscal_registral} />}
      </div>
      {onIterar && <PedirMejora onIterar={onIterar} />}
    </section>
  );
}
