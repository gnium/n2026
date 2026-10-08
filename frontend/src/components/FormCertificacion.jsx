import Icono from "./Iconos.jsx";

const CARACTERES = ["presidente del directorio", "vicepresidente en ejercicio de la presidencia", "socio gerente", "administrador", "apoderado", "representante legal", "otro"];

const JURISDICCIONES = [
  "Ciudad Autónoma de Buenos Aires",
  "Buenos Aires",
  "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos",
  "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones",
  "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz",
  "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

export const DATOS_CERTIFICACION_INICIAL = {
  modalidad: "personal",
  firmantes: [{ nombre: "", dni: "", domicilio: "", caracter: "presidente del directorio", clienteId: null }],
  representada: { denominacion: "", cuit: "", domicilio: "", inscripcion: "", documentosHabilitantes: "" },
  documento: { naturaleza: "", ejemplares: "", fojas: "", destino: "" },
  jurisdiccion: "",
};

export function autoFillFirmante(datos, cliente) {
  const libre = datos.firmantes.findIndex((f) => !f.nombre.trim());
  const firmante = {
    nombre: cliente.nombre || "",
    dni: cliente.documento || "",
    domicilio: cliente.domicilio || "",
    caracter: "apoderado",
    clienteId: cliente.id,
  };
  if (libre >= 0) {
    return { ...datos, firmantes: datos.firmantes.map((f, i) => (i === libre ? firmante : f)) };
  }
  if (datos.firmantes.length < 10) {
    return { ...datos, firmantes: [...datos.firmantes, firmante] };
  }
  return datos;
}

export default function FormCertificacion({ datos, onChange }) {
  const set = (parche) => onChange({ ...datos, ...parche });
  const setFirmante = (i, parche) => set({ firmantes: datos.firmantes.map((f, j) => (j === i ? { ...f, ...parche } : f)) });
  const rep = datos.modalidad === "representacion";

  return (
    <div className="cert-form">
      {/* --- Sección 1: Modalidad --- */}
      <fieldset className="modos">
        <legend>Modalidad</legend>
        <label className={`modo ${!rep ? "activo" : ""}`}>
          <input type="radio" name="modalidad" checked={!rep} onChange={() => set({ modalidad: "personal" })} />
          <span className="modo-icono" aria-hidden="true"><Icono nombre="persona" tamano={18} /></span>
          <span className="modo-texto">
            <span className="modo-titulo">A título personal</span>
            <span className="modo-detalle">El firmante actúa por sí y por derecho propio.</span>
          </span>
        </label>
        <label className={`modo ${rep ? "activo" : ""}`}>
          <input type="radio" name="modalidad" checked={rep} onChange={() => set({ modalidad: "representacion" })} />
          <span className="modo-icono" aria-hidden="true"><Icono nombre="edificio" tamano={18} /></span>
          <span className="modo-texto">
            <span className="modo-titulo">Con representación</span>
            <span className="modo-detalle">El firmante actúa en nombre de una sociedad u otra persona; se acredita la personería con documentos habilitantes.</span>
          </span>
        </label>
      </fieldset>

      {/* --- Sección 2: Firmantes --- */}
      <fieldset className="cert-seccion">
        <legend><Icono nombre="firma" tamano={16} /> Firmante{datos.firmantes.length > 1 ? "s" : ""}</legend>
        {datos.firmantes.map((f, i) => (
          <div key={i} className="cert-firmante-card">
            <div className="cert-firmante-header">
              <span className="cert-firmante-num">{i + 1}</span>
              {f.clienteId && <span className="chip chip-mini"><Icono nombre="persona" tamano={12} /> cliente vinculado</span>}
              {datos.firmantes.length > 1 && (
                <button type="button" className="enlace cert-quitar" onClick={() => set({ firmantes: datos.firmantes.filter((_, j) => j !== i) })}>
                  <Icono nombre="cruz" tamano={14} />
                </button>
              )}
            </div>
            <div className="cert-firmante-campos">
              <label className="campo-inline">
                <span>Nombre y apellido</span>
                <input type="text" value={f.nombre} onChange={(e) => setFirmante(i, { nombre: e.target.value })} />
              </label>
              <label className="campo-inline">
                <span>DNI</span>
                <input type="text" value={f.dni} onChange={(e) => setFirmante(i, { dni: e.target.value })} />
              </label>
              <label className="campo-inline">
                <span>Domicilio</span>
                <input type="text" value={f.domicilio} onChange={(e) => setFirmante(i, { domicilio: e.target.value })} />
              </label>
              {rep && (
                <label className="campo-inline">
                  <span>Carácter</span>
                  <select value={f.caracter} onChange={(e) => setFirmante(i, { caracter: e.target.value })}>
                    {CARACTERES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
        ))}
        {datos.firmantes.length < 10 && (
          <button type="button" className="enlace" onClick={() => set({ firmantes: [...datos.firmantes, { nombre: "", dni: "", domicilio: "", caracter: "apoderado", clienteId: null }] })}>
            <Icono nombre="mas" tamano={14} /> agregar firmante
          </button>
        )}
        <small className="ayuda">Si seleccionó clientes arriba, sus datos se completan automáticamente como firmantes.</small>
      </fieldset>

      {/* --- Sección 3: Persona representada --- */}
      {rep && (
        <fieldset className="cert-seccion">
          <legend><Icono nombre="edificio" tamano={16} /> Persona representada</legend>
          <div className="cert-grid">
            <label className="campo-inline">
              <span>Denominación</span>
              <input type="text" placeholder="Ej.: Cumbre S.A." value={datos.representada.denominacion} onChange={(e) => set({ representada: { ...datos.representada, denominacion: e.target.value } })} />
            </label>
            <label className="campo-inline">
              <span>CUIT</span>
              <input type="text" value={datos.representada.cuit} onChange={(e) => set({ representada: { ...datos.representada, cuit: e.target.value } })} />
            </label>
            <label className="campo-inline">
              <span>Sede social</span>
              <input type="text" value={datos.representada.domicilio} onChange={(e) => set({ representada: { ...datos.representada, domicilio: e.target.value } })} />
            </label>
            <label className="campo-inline">
              <span>Inscripción (IGJ / DPPJ)</span>
              <input type="text" placeholder="Número y fecha" value={datos.representada.inscripcion} onChange={(e) => set({ representada: { ...datos.representada, inscripcion: e.target.value } })} />
            </label>
          </div>
          <label className="campo-inline">
            <span>Documentos habilitantes</span>
            <textarea rows={2} placeholder="Estatuto, acta de asamblea, acta de directorio, poder (escritura, fecha, escribano, registro)…" value={datos.representada.documentosHabilitantes} onChange={(e) => set({ representada: { ...datos.representada, documentosHabilitantes: e.target.value } })} />
          </label>
        </fieldset>
      )}

      {/* --- Sección 4: Documento --- */}
      <fieldset className="cert-seccion">
        <legend><Icono nombre="archivo" tamano={16} /> Documento a certificar</legend>
        <div className="cert-grid">
          <label className="campo-inline">
            <span>Naturaleza</span>
            <input type="text" placeholder="Contrato de locación, formulario 08, nota…" value={datos.documento.naturaleza} onChange={(e) => set({ documento: { ...datos.documento, naturaleza: e.target.value } })} />
          </label>
          <label className="campo-inline">
            <span>Ejemplares</span>
            <input type="text" value={datos.documento.ejemplares} onChange={(e) => set({ documento: { ...datos.documento, ejemplares: e.target.value } })} />
          </label>
          <label className="campo-inline">
            <span>Fojas</span>
            <input type="text" value={datos.documento.fojas} onChange={(e) => set({ documento: { ...datos.documento, fojas: e.target.value } })} />
          </label>
          <label className="campo-inline">
            <span>Destino</span>
            <input type="text" placeholder="Ante quién se presenta" value={datos.documento.destino} onChange={(e) => set({ documento: { ...datos.documento, destino: e.target.value } })} />
          </label>
        </div>
        <label className="campo-inline">
          <span>Jurisdicción</span>
          <select value={datos.jurisdiccion} onChange={(e) => set({ jurisdiccion: e.target.value })}>
            <option value="">Seleccionar jurisdicción…</option>
            {JURISDICCIONES.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </label>
        <small className="ayuda">Si arrastró el documento, se usa como contexto. Todos estos datos se anonimizan antes del análisis.</small>
      </fieldset>
    </div>
  );
}
