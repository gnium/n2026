import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatoUsd } from "./Pipeline.jsx";

const NOMBRE_ESTADO = { sin_suscripcion: "Sin suscripción", pendiente: "Pendiente de autorizar", activa: "Activa", pausada: "Pausada", cancelada: "Cancelada" };

function formatoArs(n) {
  return `AR$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Suscripcion() {
  const [estado, setEstado] = useState(null);
  const [planes, setPlanes] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    setError(null);
    try {
      const [e, p] = await Promise.all([api.miSuscripcion(), api.planesDisponibles()]);
      setEstado(e);
      setPlanes(p);
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => {
    cargar();
  }, []);

  const suscribirse = async (planClave) => {
    setOcupado(true);
    setError(null);
    try {
      const r = await api.suscribirse(planClave);
      if (r.initPoint) {
        window.location.href = r.initPoint;
      } else {
        setAviso("Suscripción creada.");
        await cargar();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await api.cancelarSuscripcion();
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!estado || !planes) return <p className="vacio">Cargando suscripción…</p>;

  return (
    <div className="consumo">
      <div className="resultados-cabecera">
        <h2>Suscripción</h2>
        <span className={`etiqueta ${estado.estado === "activa" ? "ok" : ""}`}>{NOMBRE_ESTADO[estado.estado] || estado.estado}</span>
      </div>

      {error && (
        <p className="alerta error" role="alert">
          {error}
        </p>
      )}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <div className="consumo-cards">
        <div className="consumo-card">
          <span className="consumo-card-valor">{formatoArs(estado.totalPendienteArs)}</span>
          <span className="consumo-card-etiqueta">uso acumulado sin facturar</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{estado.plan ? estado.plan.nombre : "—"}</span>
          <span className="consumo-card-etiqueta">plan actual{estado.plan ? ` · ${formatoArs(estado.plan.precioMensualArs)}/mes` : ""}</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{estado.proximoCobroEn ? new Date(estado.proximoCobroEn).toLocaleDateString("es-AR") : "—"}</span>
          <span className="consumo-card-etiqueta">próximo cobro</span>
        </div>
      </div>

      <p className="nota">
        El fee por uso (un cargo fijo más el costo real de la IA de cada documento) se acumula y se vuelca al cobro del próximo mes, junto con la cuota del plan. No se cobra aparte por cada documento.
      </p>

      {estado.cargosPendientes.length > 0 && (
        <>
          <h3>Documentos procesados este período</h3>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Costo de IA</th>
                  <th>Cargo</th>
                </tr>
              </thead>
              <tbody>
                {estado.cargosPendientes.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.creadoEn).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{formatoUsd(c.costoIaUsd ?? null)}</td>
                    <td>{formatoArs(c.montoArs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Planes disponibles</h3>
      <div className="planes-grid">
        {planes.map((p) => (
          <div key={p.clave} className={`plan-card ${estado.plan?.clave === p.clave ? "activo" : ""}`}>
            <div className="plan-nombre">{p.nombre}</div>
            <div className="plan-precio">{formatoArs(p.precioMensualArs)}/mes</div>
            {p.descripcion && <p className="plan-desc">{p.descripcion}</p>}
            {estado.plan?.clave === p.clave && estado.estado === "activa" ? (
              <span className="etiqueta">plan actual</span>
            ) : (
              <button type="button" className="boton primario" disabled={ocupado} onClick={() => suscribirse(p.clave)}>
                {estado.estado === "activa" ? "Cambiar a este plan" : "Suscribirme"}
              </button>
            )}
          </div>
        ))}
      </div>

      {estado.estado === "activa" && (
        <button type="button" className="boton" disabled={ocupado} onClick={cancelar}>
          Cancelar suscripción
        </button>
      )}
    </div>
  );
}
