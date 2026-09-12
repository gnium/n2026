import Icono from "./Iconos.jsx";

/** Formulario de certificacion de firmas: modalidad, firmantes, representada y documento. */
const CARACTERES = ["presidente del directorio", "vicepresidente en ejercicio de la presidencia", "socio gerente", "administrador", "apoderado", "representante legal", "otro"];

export const DATOS_CERTIFICACION_INICIAL = {
  modalidad: "personal",
  firmantes: [{ nombre: "", dni: "", domicilio: "", caracter: "presidente del directorio" }],
  representada: { denominacion: "", cuit: "", domicilio: "", inscripcion: "", documentosHabilitantes: "" },
  documento: { naturaleza: "", ejemplares: "", fojas: "", destino: "" },
  jurisdiccion: "",
};

export default function FormCertificacion({ datos, onChange }) {
  const set = (parche) => onChange({ ...datos, ...parche });
  const setFirmante = (i, parche) => set({ firmantes: datos.firmantes.map((f, j) => (j === i ? { ...f, ...parche } : f)) });
  const rep = datos.modalidad === "representacion";

  return (
    <div className="cert-form">
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

      <div className="campo">
        <span className="campo-titulo">Firmante{datos.firmantes.length > 1 ? "s" : ""}</span>
        {datos.firmantes.map((f, i) => (
          <div key={i} className="cert-firmante">
            <input type="text" placeholder="Nombre y apellido" value={f.nombre} onChange={(e) => setFirmante(i, { nombre: e.target.value })} />
            <input type="text" placeholder="DNI" value={f.dni} onChange={(e) => setFirmante(i, { dni: e.target.value })} />
            <input type="text" placeholder="Domicilio" value={f.domicilio} onChange={(e) => setFirmante(i, { domicilio: e.target.value })} />
            {rep && (
              <select value={f.caracter} onChange={(e) => setFirmante(i, { caracter: e.target.value })} aria-label="Carácter en que firma">
                {CARACTERES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            {datos.firmantes.length > 1 && (
              <button type="button" className="enlace" onClick={() => set({ firmantes: datos.firmantes.filter((_, j) => j !== i) })}>
                quitar
              </button>
            )}
          </div>
        ))}
        {datos.firmantes.length < 10 && (
          <button type="button" className="enlace" onClick={() => set({ firmantes: [...datos.firmantes, { nombre: "", dni: "", domicilio: "", caracter: "apoderado" }] })}>
            + agregar firmante
          </button>
        )}
      </div>

      {rep && (
        <div className="campo">
          <span className="campo-titulo">Persona representada</span>
          <div className="cert-grid">
            <input type="text" placeholder="Denominación (ej.: Cumbre S.A.)" value={datos.representada.denominacion} onChange={(e) => set({ representada: { ...datos.representada, denominacion: e.target.value } })} />
            <input type="text" placeholder="CUIT" value={datos.representada.cuit} onChange={(e) => set({ representada: { ...datos.representada, cuit: e.target.value } })} />
            <input type="text" placeholder="Sede social" value={datos.representada.domicilio} onChange={(e) => set({ representada: { ...datos.representada, domicilio: e.target.value } })} />
            <input type="text" placeholder="Inscripción (IGJ / DPPJ, número, fecha)" value={datos.representada.inscripcion} onChange={(e) => set({ representada: { ...datos.representada, inscripcion: e.target.value } })} />
          </div>
          <textarea rows={3} placeholder="Documentos habilitantes que se exhiben: estatuto y su inscripción, acta de asamblea de designación, acta de directorio de distribución de cargos, poder (escritura, fecha, escribano, registro)…" value={datos.representada.documentosHabilitantes} onChange={(e) => set({ representada: { ...datos.representada, documentosHabilitantes: e.target.value } })} />
        </div>
      )}

      <div className="campo">
        <span className="campo-titulo">Documento cuya firma se certifica</span>
        <div className="cert-grid">
          <input type="text" placeholder="Naturaleza (ej.: contrato de locación, formulario 08, nota)" value={datos.documento.naturaleza} onChange={(e) => set({ documento: { ...datos.documento, naturaleza: e.target.value } })} />
          <input type="text" placeholder="Ejemplares" value={datos.documento.ejemplares} onChange={(e) => set({ documento: { ...datos.documento, ejemplares: e.target.value } })} />
          <input type="text" placeholder="Fojas" value={datos.documento.fojas} onChange={(e) => set({ documento: { ...datos.documento, fojas: e.target.value } })} />
          <input type="text" placeholder="Destino (ante quién se presenta)" value={datos.documento.destino} onChange={(e) => set({ documento: { ...datos.documento, destino: e.target.value } })} />
        </div>
        <input type="text" placeholder="Jurisdicción (CABA, Provincia de Buenos Aires…)" value={datos.jurisdiccion} onChange={(e) => set({ jurisdiccion: e.target.value })} />
        <small className="ayuda">Si arrastró el documento, se usa como contexto. Todos estos datos se anonimizan antes del análisis.</small>
      </div>
    </div>
  );
}
