import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function ConfigNer() {
  const [cfg, setCfg] = useState(null);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [borrarClave, setBorrarClave] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    try {
      const c = await api.configuracionNer();
      setCfg(c);
      setEndpoint(c.endpoint || "");
      setTimeoutMs(c.timeoutMs || 30000);
    } catch (e) {
      setEstado({ tipo: "error", texto: e.message });
    }
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setEstado(null);
    try {
      const datos = { endpoint, timeoutMs: Number(timeoutMs) };
      if (apiKey.trim()) datos.apiKey = apiKey.trim();
      else if (borrarClave) datos.apiKey = "";
      const c = await api.guardarConfiguracionNer(datos);
      setCfg(c);
      setApiKey("");
      setBorrarClave(false);
      setEstado({ tipo: "ok", texto: "Configuracion de anonimizacion guardada." });
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  const probar = async () => {
    setOcupado(true);
    setEstado({ tipo: "info", texto: "Probando conexion con el servicio NER..." });
    try {
      const r = await api.probarNer({ endpoint: endpoint.trim() || undefined, apiKey: apiKey.trim() || undefined });
      const partes = [`Conexion correcta (${r.ms} ms).`];
      if (r.modelo) partes.push(`Modelo: ${r.modelo}.`);
      if (r.reconocedores) partes.push(`Reconocedores: ${r.reconocedores}.`);
      partes.push(r.entidadesDetectadas ? "Deteccion de entidades verificada." : "El servicio responde pero no detecto entidades en la prueba.");
      setEstado({ tipo: r.entidadesDetectadas ? "ok" : "info", texto: partes.join(" ") });
    } catch (err) {
      setEstado({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  if (!cfg) return <p className="vacio">Cargando configuracion NER...</p>;

  return (
    <form className="configuracion" onSubmit={guardar}>
      <h2>Pre-anonimizacion local (NER)</h2>
      <p className="nota">
        Servicio de reconocimiento de entidades (Presidio + spaCy) que detecta nombres, domicilios y datos personales <strong>antes</strong> de enviar el documento a la IA externa. Los datos reales nunca salen del servidor.
        {!cfg.endpoint && " No configurado: la anonimizacion se realiza con la IA externa (comportamiento actual)."}
        {cfg.endpoint && cfg.origenEndpoint === "entorno" && " Endpoint tomado de la configuracion del servidor."}
      </p>

      <label className="campo">
        <span className="campo-titulo">Endpoint del servicio NER</span>
        <input type="url" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://ner-service.up.railway.app" />
        <small className="ayuda">URL del microservicio de anonimizacion. Debe exponer /health y /analyze.</small>
      </label>

      <label className="campo">
        <span className="campo-titulo">Clave de autenticacion {cfg.tieneApiKey && <small>(guardada: {cfg.apiKeyEnmascarada})</small>}</span>
        <div className="fila">
          <input type={verClave ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={cfg.tieneApiKey ? "Dejar vacio para conservar la actual" : "Bearer token (opcional)"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <button type="button" className="boton" onClick={() => setVerClave(!verClave)}>
            {verClave ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {cfg.tieneApiKey && (
          <label className="chequeo">
            <input type="checkbox" checked={borrarClave} onChange={(e) => setBorrarClave(e.target.checked)} /> Borrar la clave guardada
          </label>
        )}
      </label>

      <label className="campo">
        <span className="campo-titulo">Timeout (ms)</span>
        <input type="number" min="5000" max="120000" step="1000" value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
        <small className="ayuda">Tiempo maximo de espera por documento. 30 000 ms por defecto.</small>
      </label>

      {estado && (
        <p className={`alerta ${estado.tipo === "ok" ? "ok" : estado.tipo === "error" ? "error" : ""}`} role="status">
          {estado.texto}
        </p>
      )}

      <div className="acciones">
        <button type="button" className="boton" onClick={probar} disabled={ocupado || !endpoint.trim()}>
          Probar conexion
        </button>
        <button type="submit" className="boton primario" disabled={ocupado}>
          Guardar
        </button>
      </div>
    </form>
  );
}
