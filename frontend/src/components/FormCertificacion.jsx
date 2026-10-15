import { useEffect, useState } from "react";
import { api } from "../api.js";
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
  documento: { naturaleza: "", ejemplares: "", fojas: "", destino: "", parcialmenteEnBlanco: true, redactadoPorEscribano: false },
  jurisdiccion: "",
  acta: "",
  folio: "",
  libro: "",
  libroFirmas: "",
  fojaActuacion: "",
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

function BuscadorCliente({ onSeleccionar }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await api.clientesListar(q.trim());
        setResultados(r.slice(0, 8));
      } catch { setResultados([]); }
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="cert-buscador-cliente">
      <input
        type="search"
        placeholder="Buscar cliente por nombre o DNI…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {buscando && <small className="ayuda">Buscando…</small>}
      {resultados.length > 0 && (
        <ul className="cert-buscador-resultados">
          {resultados.map((c) => (
            <li key={c.id}>
              <button type="button" className="enlace" onClick={() => { onSeleccionar(c); setQ(""); setResultados([]); }}>
                {c.nombre}{c.documento ? ` — DNI ${c.documento}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FormCertificacion({ datos, onChange }) {
  const set = (parche) => onChange({ ...datos, ...parche });
  const setFirmante = (i, parche) => set({ firmantes: datos.firmantes.map((f, j) => (j === i ? { ...f, ...parche } : f)) });
  const setDoc = (parche) => set({ documento: { ...datos.documento, ...parche } });
  const rep = datos.modalidad === "representacion";

  const agregarCliente = (cliente) => {
    const nuevo = autoFillFirmante(datos, cliente);
    onChange(nuevo);
  };

  return (
    <div className="cert-form">
      {/* --- Sección 1: Modalidad --- */}
      <fieldset className="modos">
        <legend>Carácter en el que firma</legend>
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
            <span className="modo-titulo">En representación</span>
            <span className="modo-detalle">El firmante actúa en nombre de una sociedad u otra persona; se acredita la personería con documentos habilitantes.</span>
          </span>
        </label>
      </fieldset>

      {/* --- Sección 2: Firmantes --- */}
      <fieldset className="cert-seccion">
        <legend><Icono nombre="firma" tamano={16} /> Firmante{datos.firmantes.length > 1 ? "s" : ""}</legend>
        <BuscadorCliente onSeleccionar={agregarCliente} />
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
                <input type="text" value={f.nombre} onChange={(e) => setFirmante(i, { nombre: e.target.value })} required />
              </label>
              <label className="campo-inline">
                <span>DNI</span>
                <input type="text" value={f.dni} onChange={(e) => setFirmante(i, { dni: e.target.value })} required />
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
      </fieldset>

      {/* --- Sección 3: Persona representada --- */}
      {rep && (
        <fieldset className="cert-seccion">
          <legend><Icono nombre="edificio" tamano={16} /> Persona representada</legend>
          <div className="cert-grid">
            <label className="campo-inline">
              <span>Denominación</span>
              <input type="text" placeholder="Ej.: Cumbre S.A." value={datos.representada.denominacion} onChange={(e) => set({ representada: { ...datos.representada, denominacion: e.target.value } })} required />
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

      {/* --- Sección 4: Documento a certificar --- */}
      <fieldset className="cert-seccion">
        <legend><Icono nombre="archivo" tamano={16} /> Instrumento a certificar</legend>
        <div className="cert-grid">
          <label className="campo-inline">
            <span>Descripción del instrumento</span>
            <input type="text" placeholder="Formulario 08 N° …, contrato de locación, nota…" value={datos.documento.naturaleza} onChange={(e) => setDoc({ naturaleza: e.target.value })} required />
          </label>
          <label className="campo-inline">
            <span>Ejemplares</span>
            <input type="text" value={datos.documento.ejemplares} onChange={(e) => setDoc({ ejemplares: e.target.value })} />
          </label>
          <label className="campo-inline">
            <span>Fojas</span>
            <input type="text" value={datos.documento.fojas} onChange={(e) => setDoc({ fojas: e.target.value })} />
          </label>
          <label className="campo-inline">
            <span>Destino</span>
            <input type="text" placeholder="Ante quién se presenta" value={datos.documento.destino} onChange={(e) => setDoc({ destino: e.target.value })} />
          </label>
        </div>

        <div className="cert-opciones-doc">
          <fieldset className="cert-radio-grupo">
            <legend>Estado del documento</legend>
            <label className="chequeo">
              <input type="radio" name="parcialmenteEnBlanco" checked={datos.documento.parcialmenteEnBlanco !== false} onChange={() => setDoc({ parcialmenteEnBlanco: true })} />
              Documento parcialmente en blanco
            </label>
            <label className="chequeo">
              <input type="radio" name="parcialmenteEnBlanco" checked={datos.documento.parcialmenteEnBlanco === false} onChange={() => setDoc({ parcialmenteEnBlanco: false })} />
              Documento no parcialmente en blanco
            </label>
          </fieldset>

          <fieldset className="cert-radio-grupo">
            <legend>Autoría de la redacción</legend>
            <label className="chequeo">
              <input type="radio" name="redactadoPorEscribano" checked={datos.documento.redactadoPorEscribano === true} onChange={() => setDoc({ redactadoPorEscribano: true })} />
              Redactado por el escribano actuante
            </label>
            <label className="chequeo">
              <input type="radio" name="redactadoPorEscribano" checked={datos.documento.redactadoPorEscribano !== true} onChange={() => setDoc({ redactadoPorEscribano: false })} />
              No redactado por el escribano actuante
            </label>
          </fieldset>
        </div>
      </fieldset>

      {/* --- Sección 5: Datos registrales --- */}
      <fieldset className="cert-seccion">
        <legend><Icono nombre="capas" tamano={16} /> Datos registrales</legend>
        <div className="cert-grid">
          <label className="campo-inline">
            <span>Acta Nº</span>
            <input type="text" placeholder="Ej.: 1475/6" value={datos.acta || ""} onChange={(e) => set({ acta: e.target.value })} />
          </label>
          <label className="campo-inline">
            <span>Folio</span>
            <input type="text" placeholder="Ej.: 246" value={datos.folio || ""} onChange={(e) => set({ folio: e.target.value })} />
          </label>
          <label className="campo-inline">
            <span>Libro</span>
            <input type="text" placeholder="Ej.: A" value={datos.libro || ""} onChange={(e) => set({ libro: e.target.value })} />
          </label>
          <label className="campo-inline">
            <span>Libro de Registro de Firmas Nº</span>
            <input type="text" placeholder="Ej.: 4" value={datos.libroFirmas || ""} onChange={(e) => set({ libroFirmas: e.target.value })} />
          </label>
          <label className="campo-inline">
            <span>Foja de Actuación Especial Nº</span>
            <input type="text" placeholder="Ej.: E-00868414" value={datos.fojaActuacion || ""} onChange={(e) => set({ fojaActuacion: e.target.value })} />
          </label>
        </div>
        <label className="campo-inline">
          <span>Jurisdicción</span>
          <select value={datos.jurisdiccion} onChange={(e) => set({ jurisdiccion: e.target.value })}>
            <option value="">Seleccionar jurisdicción…</option>
            {JURISDICCIONES.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </label>
      </fieldset>
    </div>
  );
}
