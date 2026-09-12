import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatoUsd } from "./Pipeline.jsx";

const PROVEEDORES = ["anthropic", "gemini", "local", "mock"];
const NOMBRE_PROVEEDOR = { anthropic: "Claude", gemini: "Gemini", local: "IA local", mock: "Simulado" };

function fecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Consumo({ esAdmin }) {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState(null);
  const [precios, setPrecios] = useState(null);
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null); // {proveedor, modelo, entrada, salida, cache, aproximado} | null
  const [mostrarPrecios, setMostrarPrecios] = useState(false);

  const cargar = async () => {
    setError(null);
    try {
      const [c, p] = await Promise.all([api.consumo(dias), esAdmin ? api.precios() : Promise.resolve(null)]);
      setDatos(c);
      setPrecios(p);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const guardarPrecio = async (e) => {
    e.preventDefault();
    try {
      const p = await api.guardarPrecio({ ...editando, entrada: Number(editando.entrada), salida: Number(editando.salida), cache: editando.cache === "" ? null : Number(editando.cache) });
      setPrecios(p);
      setEditando(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const borrarPrecio = async (proveedor, modelo) => {
    try {
      await api.borrarPrecio(proveedor, modelo);
      setPrecios(await api.precios());
    } catch (err) {
      setError(err.message);
    }
  };

  if (!datos || (esAdmin && !precios)) return <p className="vacio">Cargando consumo…</p>;

  return (
    <div className="consumo">
      <div className="resultados-cabecera">
        <h2>{esAdmin ? "Consumo de IA (todas las cuentas)" : "Su consumo de IA"}</h2>
        <label className="campo">
          <span className="sr-only">Período</span>
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
            <option value={365}>Último año</option>
          </select>
        </label>
      </div>

      {error && (
        <p className="alerta error" role="alert">
          {error}
        </p>
      )}

      <div className="consumo-cards">
        <div className="consumo-card">
          <span className="consumo-card-valor">
            {datos.total.conPrecioFaltante ? "~" : ""}
            {formatoUsd(datos.total.costoUsd)}
          </span>
          <span className="consumo-card-etiqueta">costo estimado del período</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{datos.total.ejecuciones}</span>
          <span className="consumo-card-etiqueta">documentos procesados</span>
        </div>
        <div className="consumo-card">
          <span className="consumo-card-valor">{(Number(datos.total.tokensEntrada) + Number(datos.total.tokensSalida)).toLocaleString("es-AR")}</span>
          <span className="consumo-card-etiqueta">tokens totales</span>
        </div>
      </div>
      {datos.total.conPrecioFaltante && (
        <p className="nota">Algunas llamadas usaron un modelo sin precio cargado: el total es parcial.{esAdmin ? ' Cárguelo abajo en "Precios por modelo".' : " Avise a la administradora del sistema."}</p>
      )}

      {esAdmin && datos.porUsuario && (
        <>
          <h3>Por cuenta</h3>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Documentos procesados</th>
                  <th>Costo</th>
                </tr>
              </thead>
              <tbody>
                {datos.porUsuario.map((u) => (
                  <tr key={u.usuarioId}>
                    <td>{u.nombre || u.email}</td>
                    <td>{u.ejecuciones}</td>
                    <td>{formatoUsd(u.costoUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Por modelo</h3>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Modelo</th>
              <th>Llamadas</th>
              <th>Tokens entrada</th>
              <th>Tokens salida</th>
              <th>Costo</th>
            </tr>
          </thead>
          <tbody>
            {datos.porModelo.length === 0 && (
              <tr>
                <td colSpan={6} className="vacio">
                  Sin actividad en este período.
                </td>
              </tr>
            )}
            {datos.porModelo.map((r) => (
              <tr key={`${r.proveedor}::${r.modelo}`}>
                <td>{NOMBRE_PROVEEDOR[r.proveedor] || r.proveedor}</td>
                <td>{r.modelo}</td>
                <td>{r.llamadas}</td>
                <td>{Number(r.tokensEntrada).toLocaleString("es-AR")}</td>
                <td>{Number(r.tokensSalida).toLocaleString("es-AR")}</td>
                <td>
                  {r.conPrecioFaltante ? "~" : ""}
                  {formatoUsd(r.costoUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{esAdmin ? "Últimas ejecuciones" : "Sus últimos documentos"}</h3>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Acto detectado</th>
              <th>Tokens</th>
              <th>Duración</th>
              <th>Costo</th>
            </tr>
          </thead>
          <tbody>
            {datos.recientes.length === 0 && (
              <tr>
                <td colSpan={6} className="vacio">
                  Sin ejecuciones en este período.
                </td>
              </tr>
            )}
            {datos.recientes.map((r) => (
              <tr key={r.id}>
                <td>{fecha(r.iniciadoEn)}</td>
                <td>{r.estado}</td>
                <td>{r.tipoActo || "—"}</td>
                <td>{(Number(r.tokensEntrada) + Number(r.tokensSalida)).toLocaleString("es-AR")}</td>
                <td>{r.duracionMs != null ? `${(r.duracionMs / 1000).toFixed(0)} s` : "—"}</td>
                <td>{formatoUsd(r.costoUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {esAdmin && (
        <>
          <div className="resultados-cabecera">
            <h3>Precios por modelo</h3>
            <button type="button" className="boton" onClick={() => setMostrarPrecios(!mostrarPrecios)}>
              {mostrarPrecios ? "Ocultar" : "Ver / editar"}
            </button>
          </div>
          {mostrarPrecios && (
            <>
              <p className="nota">
                USD por millón de tokens. Los precios de Gemini cambian con frecuencia: verifíquelos en{" "}
                <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">
                  ai.google.dev/gemini-api/docs/pricing
                </a>{" "}
                si el costo no coincide con su factura. IA local y modo simulado no tienen costo.
              </p>
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Modelo</th>
                      <th>Entrada</th>
                      <th>Salida</th>
                      <th>Cache</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {precios.map((p) => (
                      <tr key={`${p.proveedor}::${p.modelo}`}>
                        <td>{NOMBRE_PROVEEDOR[p.proveedor] || p.proveedor}</td>
                        <td>
                          {p.modelo}
                          {p.aproximado ? " (aprox.)" : ""}
                        </td>
                        <td>US$ {Number(p.entrada).toFixed(4)}</td>
                        <td>US$ {Number(p.salida).toFixed(4)}</td>
                        <td>{p.cache == null ? "= entrada" : `US$ ${Number(p.cache).toFixed(4)}`}</td>
                        <td>
                          <button type="button" className="enlace" onClick={() => setEditando({ proveedor: p.proveedor, modelo: p.modelo, entrada: p.entrada, salida: p.salida, cache: p.cache ?? "", aproximado: Boolean(p.aproximado) })}>
                            editar
                          </button>{" "}
                          {p.proveedor !== "local" && p.proveedor !== "mock" && (
                            <button type="button" className="enlace" onClick={() => borrarPrecio(p.proveedor, p.modelo)}>
                              quitar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" className="boton" onClick={() => setEditando({ proveedor: "gemini", modelo: "", entrada: "", salida: "", cache: "", aproximado: true })}>
                Agregar modelo
              </button>

              {editando && (
                <form className="cert-form form-inline" onSubmit={guardarPrecio}>
                  <div className="cert-grid">
                    <select aria-label="Proveedor" value={editando.proveedor} onChange={(e) => setEditando({ ...editando, proveedor: e.target.value })}>
                      {PROVEEDORES.map((p) => (
                        <option key={p} value={p}>
                          {NOMBRE_PROVEEDOR[p]}
                        </option>
                      ))}
                    </select>
                    <input type="text" aria-label="Nombre exacto del modelo" placeholder="Nombre exacto del modelo" value={editando.modelo} onChange={(e) => setEditando({ ...editando, modelo: e.target.value })} required />
                    <input type="number" step="0.0001" min="0" aria-label="Precio de entrada, US$ por millón de tokens" placeholder="Precio entrada (US$/millón)" value={editando.entrada} onChange={(e) => setEditando({ ...editando, entrada: e.target.value })} required />
                    <input type="number" step="0.0001" min="0" aria-label="Precio de salida, US$ por millón de tokens" placeholder="Precio salida (US$/millón)" value={editando.salida} onChange={(e) => setEditando({ ...editando, salida: e.target.value })} required />
                    <input type="number" step="0.0001" min="0" aria-label="Precio de caché, opcional" placeholder="Precio cache (opcional)" value={editando.cache} onChange={(e) => setEditando({ ...editando, cache: e.target.value })} />
                    <label className="chequeo">
                      <input type="checkbox" checked={editando.aproximado} onChange={(e) => setEditando({ ...editando, aproximado: e.target.checked })} /> Aproximado (verificar)
                    </label>
                  </div>
                  <div className="acciones">
                    <button type="submit" className="boton primario">
                      Guardar precio
                    </button>
                    <button type="button" className="boton" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
