import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";

const ESTADOS = { en_custodia: "EN CUSTODIA", devuelto: "DEVUELTO", entregado: "ENTREGADO" };

export default function Verificacion() {
  const { code } = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!code) return;
    api.custodiaVerificar(code)
      .then(setDatos)
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [code]);

  return (
    <div className="verificacion-publica">
      <div className="verificacion-card">
        <div className="verificacion-logo">
          <img src="/favicon.svg" width="48" height="48" alt="" />
          <h1>Doy Fe</h1>
          <p>Verificación de custodia documental</p>
        </div>

        {cargando ? (
          <p className="verificacion-cargando">Verificando código...</p>
        ) : error || !datos ? (
          <div className="verificacion-error">
            <h2>Código no encontrado</h2>
            <p>El código <strong>{code}</strong> no corresponde a ningún registro de custodia vigente. Verifique que el código sea correcto.</p>
          </div>
        ) : (
          <div className="verificacion-resultado">
            <div className={`verificacion-estado ${datos.estado}`}>
              {ESTADOS[datos.estado]}
            </div>

            <dl className="verificacion-datos">
              <dt>Código</dt>
              <dd>{datos.codigo}</dd>

              <dt>Cliente</dt>
              <dd>{datos.clienteNombre}</dd>

              <dt>Documentación</dt>
              <dd>{datos.descripcion}</dd>

              {datos.recibidoEn && (
                <>
                  <dt>Fecha de recepción</dt>
                  <dd>{new Date(datos.recibidoEn).toLocaleString("es-AR")}</dd>
                </>
              )}

              {datos.devueltoEn && (
                <>
                  <dt>Fecha de devolución</dt>
                  <dd>{new Date(datos.devueltoEn).toLocaleString("es-AR")}</dd>
                </>
              )}

              {datos.entregadoEn && (
                <>
                  <dt>Fecha de entrega</dt>
                  <dd>{new Date(datos.entregadoEn).toLocaleString("es-AR")}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        <footer className="verificacion-pie">
          <small>Plataforma Doy Fe &mdash; Gestión notarial con inteligencia artificial</small>
          <small>&copy; {new Date().getFullYear()} Cumbre Tech S.R.L.</small>
        </footer>
      </div>
    </div>
  );
}
