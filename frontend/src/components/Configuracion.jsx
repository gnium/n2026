import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icono from "./Iconos.jsx";

const PROVEEDORES = [
  { clave: "anthropic", titulo: "Claude (API de Anthropic)", detalle: "Se conecta con la clave de API. Es la opción recomendada hoy.", icono: "nube" },
  { clave: "gemini", titulo: "Google Gemini", detalle: "Se conecta con una clave de Google AI Studio. Atención: en el plan gratuito Google puede usar los datos enviados para mejorar sus modelos; para datos de clientes use el plan pago.", icono: "chip" },
  { clave: "local", titulo: "IA local (Ollama / LM Studio)", detalle: "Un modelo corriendo en esta computadora o en la red de la escribanía. Los datos no salen de la oficina.", icono: "laptop" },
  { clave: "mock", titulo: "Modo simulado", detalle: "Sin IA: salidas de prueba para revisar la interfaz. Sin valor jurídico.", icono: "probeta" },
];

export default function Configuracion({ onCambio }) {
  const [cfg, setCfg] = useState(null);
  const [proveedor, setProveedor] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [borrarClave, setBorrarClave] = useState(false);
  const [modelo, setModelo] = useState("claude-opus-5");
  const [localBaseUrl, setLocalBaseUrl] = useState("");
  const [localModelo, setLocalModelo] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModelo, setGeminiModelo] = useState("gemini-3.1-pro-preview");
  const [verClaveGemini, setVerClaveGemini] = useState(false);
  const [borrarClaveGemini, setBorrarClaveGemini] = useState(false);
  const [modelosGemini, setModelosGemini] = useState([]);

  const listarModelosGemini = async () => {
    setOcupado(true);
    setEstado({ tipo: "info", texto: "Consultando modelos disponibles…" });
    try {
      const r = await api.modelosGemini(geminiApiKey.trim() || undefined);
      setModelosGemini(r.modelos);
      if (!r.modelos.some((m) => m.id === geminiModelo) && r.modelos[0]) setGeminiModelo(r.modelos[0].id);
      setEstado({ tipo: "ok", texto: `${r.modelos.length} modelos disponibles para su clave. Los "flash" funcionan en el plan gratuito; los "pro" requieren facturación activa. Elija uno y pruebe la conexión.` });
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  };
  const [estado, setEstado] = useState(null); // { tipo: ok|error|info, texto }
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    const c = await api.configuracionIA();
    setCfg(c);
    setProveedor(c.proveedor === "auto" ? (c.tieneClave ? "anthropic" : "mock") : c.proveedor);
    setModelo(c.modelo);
    setLocalBaseUrl(c.localBaseUrl);
    setLocalModelo(c.localModelo);
    setGeminiModelo(c.geminiModelo || "gemini-3.1-pro-preview");
  };
  useEffect(() => {
    cargar().catch((e) => setEstado({ tipo: "error", texto: e.message }));
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setEstado(null);
    try {
      const datos = { proveedor, modelo, localBaseUrl, localModelo, geminiModelo };
      if (apiKey.trim()) datos.apiKey = apiKey.trim();
      else if (borrarClave) datos.apiKey = "";
      if (geminiApiKey.trim()) datos.geminiApiKey = geminiApiKey.trim();
      else if (borrarClaveGemini) datos.geminiApiKey = "";
      const c = await api.guardarConfiguracionIA(datos);
      setCfg(c);
      setApiKey("");
      setBorrarClave(false);
      setGeminiApiKey("");
      setBorrarClaveGemini(false);
      setEstado({ tipo: "ok", texto: `Configuración guardada. Modo activo: ${nombreModo(c.modoActivo)}.` });
      onCambio?.();
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  const probar = async () => {
    setOcupado(true);
    setEstado({ tipo: "info", texto: "Probando conexión…" });
    try {
      const r = await api.probarConexionIA({ proveedor, apiKey: apiKey.trim() || undefined, modelo, localBaseUrl, localModelo, geminiApiKey: geminiApiKey.trim() || undefined, geminiModelo });
      if (r.proveedor === "anthropic") setEstado({ tipo: "ok", texto: `Conexión correcta con Claude. Modelo disponible: ${r.nombre || r.modelo} (${r.ms} ms). Recuerde guardar.` });
      else if (r.proveedor === "gemini") setEstado({ tipo: "ok", texto: `Conexión correcta con Gemini. Modelo disponible: ${r.nombre || r.modelo} (${r.ms} ms). Recuerde guardar.` });
      else if (r.proveedor === "local") setEstado({ tipo: r.modeloDisponible === false ? "error" : "ok", texto: r.modeloDisponible === false ? `El servidor responde pero no tiene el modelo "${r.modelo}". Modelos disponibles: ${r.modelosServidor.join(", ") || "ninguno"}.` : `Servidor local accesible (${r.ms} ms)${r.modelosServidor.length ? ". Modelos: " + r.modelosServidor.join(", ") : ""}.` });
      else setEstado({ tipo: "ok", texto: "Modo simulado: no requiere conexión." });
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  if (!cfg) return <p className="vacio">Cargando configuración…</p>;

  return (
    <form className="configuracion" onSubmit={guardar}>
      <h2>Conexión con la IA</h2>
      <p className="nota">
        Modo activo ahora: <strong>{nombreModo(cfg.modoActivo)}</strong>
        {cfg.origenClave === "entorno" && " (clave tomada de la configuración del servidor)"}
        {cfg.claveIlegible && ". La clave guardada no se pudo leer porque cambió el secreto del servidor: vuelva a cargarla."}
      </p>

      <fieldset className="modos">
        <legend>Proveedor</legend>
        {PROVEEDORES.map((p) => (
          <label key={p.clave} className={`modo ${proveedor === p.clave ? "activo" : ""}`}>
            <input type="radio" name="proveedor" value={p.clave} checked={proveedor === p.clave} onChange={() => setProveedor(p.clave)} />
            <span className="modo-icono" aria-hidden="true"><Icono nombre={p.icono} tamano={18} /></span>
            <span className="modo-texto">
              <span className="modo-titulo">{p.titulo}</span>
              <span className="modo-detalle">{p.detalle}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {proveedor === "anthropic" && (
        <>
          <label className="campo">
            <span className="campo-titulo">Clave de API {cfg.tieneClave && <small>(guardada: {cfg.claveEnmascarada})</small>}</span>
            <div className="fila">
              <input type={verClave ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={cfg.tieneClave ? "Dejar vacío para conservar la actual" : "sk-ant-…"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              <button type="button" className="boton" onClick={() => setVerClave(!verClave)}>
                {verClave ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <small className="ayuda">
              Se crea en <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> → API Keys. Es distinta de la suscripción Claude Pro. Se guarda cifrada en el servidor y nunca se muestra completa.
            </small>
            {cfg.tieneClave && cfg.origenClave === "aplicacion" && (
              <label className="chequeo">
                <input type="checkbox" checked={borrarClave} onChange={(e) => setBorrarClave(e.target.checked)} /> Borrar la clave guardada
              </label>
            )}
          </label>
          <label className="campo">
            <span className="campo-titulo">Modelo</span>
            <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
              {cfg.modelosDisponibles.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <small className="ayuda">claude-opus-5 es el más capaz para redacción y análisis jurídico. claude-sonnet-5 es más rápido y económico. Se aplica a todos los pasos.</small>
          </label>
        </>
      )}

      {proveedor === "gemini" && (
        <>
          <label className="campo">
            <span className="campo-titulo">Clave de API de Gemini {cfg.tieneClaveGemini && <small>(guardada: {cfg.claveGeminiEnmascarada})</small>}</span>
            <div className="fila">
              <input type={verClaveGemini ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={cfg.tieneClaveGemini ? "Dejar vacío para conservar la actual" : "AIza…"} value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} />
              <button type="button" className="boton" onClick={() => setVerClaveGemini(!verClaveGemini)}>
                {verClaveGemini ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <small className="ayuda">
              Se crea en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a>. Se guarda cifrada en el servidor.
            </small>
            {cfg.tieneClaveGemini && cfg.origenClaveGemini === "aplicacion" && (
              <label className="chequeo">
                <input type="checkbox" checked={borrarClaveGemini} onChange={(e) => setBorrarClaveGemini(e.target.checked)} /> Borrar la clave guardada
              </label>
            )}
          </label>
          <label className="campo">
            <span className="campo-titulo">Modelo</span>
            <div className="fila">
              {modelosGemini.length ? (
                <select value={geminiModelo} onChange={(e) => setGeminiModelo(e.target.value)}>
                  {modelosGemini.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}{m.gratuito ? " (plan gratuito)" : " (requiere facturación)"}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="text" value={geminiModelo} onChange={(e) => setGeminiModelo(e.target.value)} placeholder="gemini-3.1-pro-preview" />
              )}
              <button type="button" className="boton" onClick={listarModelosGemini} disabled={ocupado}>
                Ver modelos disponibles
              </button>
            </div>
            <small className="ayuda">Google retira y renueva modelos con frecuencia: el botón consulta con su clave cuáles puede usar hoy. Sin facturación activa solo funcionan los modelos "flash"; los "pro" dan más calidad pero requieren tarjeta.</small>
          </label>
        </>
      )}

      {proveedor === "local" && (
        <>
          <label className="campo">
            <span className="campo-titulo">Dirección del servidor local</span>
            <input type="url" value={localBaseUrl} onChange={(e) => setLocalBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
            <small className="ayuda">Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1. Si el backend corre en Docker, use http://host.docker.internal:11434/v1.</small>
          </label>
          <label className="campo">
            <span className="campo-titulo">Modelo</span>
            <input type="text" value={localModelo} onChange={(e) => setLocalModelo(e.target.value)} placeholder="qwen3:32b" />
          </label>
        </>
      )}

      {estado && (
        <p className={`alerta ${estado.tipo === "ok" ? "ok" : estado.tipo === "error" ? "error" : ""}`} role="status">
          {estado.texto}
        </p>
      )}

      <div className="acciones">
        <button type="button" className="boton" onClick={probar} disabled={ocupado}>
          Probar conexión
        </button>
        <button type="submit" className="boton primario" disabled={ocupado}>
          Guardar
        </button>
      </div>
    </form>
  );
}

function nombreModo(m) {
  return { real: "Claude conectado", gemini: "Gemini conectado", local: "IA local", simulado: "simulado (sin IA)" }[m] || m;
}
