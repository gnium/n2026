import { useEffect, useRef, useState } from "react";
import FormCertificacion, { DATOS_CERTIFICACION_INICIAL } from "./FormCertificacion.jsx";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const MODOS = [
  { clave: "escritura", titulo: "Redactar la escritura", detalle: "Genera la minuta completa a partir del documento base, con control fiscal y registral.", icono: "pluma" },
  { clave: "estudio_titulos", titulo: "Estudio de títulos", detalle: "Reconstruye el tracto sucesivo y detecta riesgos jurídicos. No redacta la escritura.", icono: "lupa" },
  { clave: "completo", titulo: "Análisis completo", detalle: "Estudio de títulos, minuta y validación fiscal en un solo paso.", icono: "capas" },
  { clave: "certificacion_firmas", titulo: "Certificación de firmas", detalle: "Acta de requerimiento y certificación, a título personal o con representación.", icono: "firma" },
];

const EJEMPLOS_INSTRUCCIONES = {
  escritura: "Ej.: Compraventa. Vende el titular a la Sra. que figura en el boleto, precio USD 120.000 de contado. Usar mi modelo de compraventa con cláusula de posesión en el acto.",
  estudio_titulos: "Ej.: Revisar especialmente la donación antecedente y el embargo informado. Jurisdicción: Provincia de Buenos Aires.",
  completo: "Ej.: Escritura de donación de padres a hija con reserva de usufructo. Verificar asentimiento conyugal.",
  certificacion_firmas: "Ej.: El poder fue otorgado en 2021 ante el escribano X, registro Y; verificar que no esté revocado. Certificación para presentar ante el banco.",
};

const EJEMPLO_ANTECEDENTES = `Ej.: Vende Juan Pérez (DNI 20.111.222, casado) a María Gómez (DNI 30.333.444) el inmueble sito en Av. Siempreviva 742, La Plata. Matrícula 55-1234/9. Precio USD 90.000 de contado. Título: compra que Pérez hizo a Carlos Ruiz en 2010, escritura 45, Registro 12. Sin gravámenes conocidos.`;

export default function Configurador({ archivo, modoInicial = "escritura", onProcesar, onCancelar, deshabilitado }) {
  const [modo, setModo] = useState(modoInicial);
  const [certificacion, setCertificacion] = useState(DATOS_CERTIFICACION_INICIAL);
  const [antecedentes, setAntecedentes] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [modelo, setModelo] = useState(null);
  const [modeloBibliotecaId, setModeloBibliotecaId] = useState("");
  const [biblioteca, setBiblioteca] = useState([]);
  const inputModelo = useRef(null);

  useEffect(() => {
    api.bibliotecaListar().then(setBiblioteca).catch(() => setBiblioteca([]));
  }, []);

  const sinContenido = !archivo && !antecedentes.trim() && !(modo === "certificacion_firmas" && certificacion.firmantes.some((f) => f.nombre.trim()));

  return (
    <form
      className="configurador"
      onSubmit={(e) => {
        e.preventDefault();
        onProcesar({ archivo, modo, antecedentes: antecedentes.trim(), instrucciones: instrucciones.trim(), modelo, modeloBibliotecaId: modelo ? null : modeloBibliotecaId || null, datos: modo === "certificacion_firmas" ? certificacion : null });
      }}
    >
      <div className="archivo-elegido">
        {archivo ? (
          <>
            <Icono nombre="archivo" tamano={18} /> <strong>{archivo.name}</strong> <small>({(archivo.size / 1024).toFixed(0)} KB)</small>
          </>
        ) : (
          <span>Sin documento adjunto</span>
        )}
        <button type="button" className="enlace" onClick={onCancelar}>
          cambiar
        </button>
      </div>

      <fieldset className="modos">
        <legend>¿Qué querés generar?</legend>
        {MODOS.map((m) => (
          <label key={m.clave} className={`modo ${modo === m.clave ? "activo" : ""}`}>
            <input type="radio" name="modo" value={m.clave} checked={modo === m.clave} onChange={() => setModo(m.clave)} />
            <span className="modo-icono" aria-hidden="true"><Icono nombre={m.icono} tamano={18} /></span>
            <span className="modo-texto">
              <span className="modo-titulo">{m.titulo}</span>
              <span className="modo-detalle">{m.detalle}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {modo === "certificacion_firmas" && <FormCertificacion datos={certificacion} onChange={setCertificacion} />}

      <label className="campo">
        <span className="campo-titulo">
          Antecedentes escritos <small>{archivo ? "(opcional: se suman al documento)" : "(requerido si no adjuntó un documento)"}</small>
        </span>
        <textarea rows={5} value={antecedentes} onChange={(e) => setAntecedentes(e.target.value)} placeholder={EJEMPLO_ANTECEDENTES} maxLength={20000} />
        <small className="ayuda">
          {archivo
            ? "Puede agregar datos que falten en el documento (por ejemplo, algo que se acordó verbalmente)."
            : "Escriba los hechos del caso: partes, inmueble, precio, título y todo antecedente relevante. Se anonimiza antes de analizarse, igual que un documento."}
        </small>
      </label>

      <label className="campo">
        <span className="campo-titulo">Instrucciones para el asistente <small>(opcional)</small></span>
        <textarea rows={3} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} placeholder={EJEMPLOS_INSTRUCCIONES[modo]} maxLength={6000} />
        <small className="ayuda">Qué hacer con los antecedentes (por ejemplo, el acto y sus condiciones), no los antecedentes en sí. También se anonimiza.</small>
      </label>

      {modo !== "estudio_titulos" && modo !== "certificacion_firmas" && (
        <div className="campo">
          <span className="campo-titulo">Escritura modelo propia <small>(opcional)</small></span>
          {modelo ? (
            <div className="archivo-elegido">
              <Icono nombre="archivo" tamano={18} /> <strong>{modelo.name}</strong>
              <button type="button" className="enlace" onClick={() => setModelo(null)}>
                quitar
              </button>
            </div>
          ) : modeloBibliotecaId ? (
            <div className="archivo-elegido">
              <Icono nombre="biblioteca" tamano={18} /> <strong>{biblioteca.find((b) => String(b.id) === String(modeloBibliotecaId))?.nombre}</strong>
              <button type="button" className="enlace" onClick={() => setModeloBibliotecaId("")}>
                quitar
              </button>
            </div>
          ) : (
            <div className="acciones">
              <button type="button" className="boton" onClick={() => inputModelo.current?.click()}>
                Adjuntar modelo (.doc / .docx)
              </button>
              {biblioteca.length > 0 && (
                <select value={modeloBibliotecaId} onChange={(e) => setModeloBibliotecaId(e.target.value)}>
                  <option value="">o elegí un modelo guardado…</option>
                  {biblioteca.map((b) => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <input ref={inputModelo} type="file" accept=".doc,.docx" hidden onChange={(e) => setModelo(e.target.files?.[0] || null)} />
          <small className="ayuda">Si adjuntás una escritura anterior como modelo (subida ahora o guardada antes en tu biblioteca), se usa su estructura y estilo en lugar de la plantilla estándar. Sus datos también se anonimizan.</small>
        </div>
      )}

      {sinContenido && (
        <p className="nota">Adjunte un documento, escriba los antecedentes{modo === "certificacion_firmas" ? " o cargue al menos un firmante" : ""} para poder procesar.</p>
      )}

      <div className="acciones">
        <button type="submit" className="boton primario" disabled={deshabilitado || sinContenido}>
          Procesar
        </button>
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
