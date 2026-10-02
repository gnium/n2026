import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api.js";
import Icono from "../Iconos.jsx";
import ConfirmarDialogo from "../ConfirmarDialogo.jsx";
import { fechaCorta } from "../Expedientes.jsx";
import { PERIODOS, NOMBRE_ROL, textoSuscripcion, soloFecha, cuando, usd, plural } from "./constants.js";
import AdminNav from "./AdminNav.jsx";

export default function AdminAccounts() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();

  const [dias, setDias] = useState("30");
  const [lista, setLista] = useState(null);
  const [q, setQ] = useState("");
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [aDesactivar, setADesactivar] = useState(null);
  const [confirmacionBorrado, setConfirmacionBorrado] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setError(null);
    try {
      const c = await api.soporteCuentas({ dias, q, problemas: soloProblemas ? "1" : "" });
      setLista(c.cuentas);
    } catch (e) {
      setError(`No se pudieron cargar las cuentas: ${e.message}`);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, soloProblemas]);

  // Open account detail from URL param
  useEffect(() => {
    if (paramId && lista) {
      const cuenta = lista.find((c) => String(c.id) === paramId);
      if (cuenta) abrir(cuenta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, lista]);

  const buscar = (e) => {
    e.preventDefault();
    cargar();
  };

  const abrir = async (c) => {
    setError(null);
    try {
      setDetalle(await api.soporteCuenta(c.id, dias));
      navigate(`/admin/accounts/${c.id}`, { replace: true });
      setTimeout(() => document.getElementById("soporte-detalle-titulo")?.focus(), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  const cerrarDetalle = () => {
    setDetalle(null);
    setConfirmacionBorrado("");
    navigate("/admin/accounts", { replace: true });
  };

  const cambiarActivo = async (c, activo) => {
    setADesactivar(null);
    setError(null);
    try {
      const r = await api.soporteCuentaActivo(c.id, activo);
      setDetalle(r);
      setAviso(`${r.email}: cuenta ${activo ? "activada" : "desactivada"}.`);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const eliminarDefinitivamente = async () => {
    setError(null);
    setBorrando(true);
    try {
      const r = await api.soporteEliminarCuenta(detalle.id, confirmacionBorrado);
      setAviso(`Cuenta eliminada de forma definitiva (${r.filas} registros borrados).`);
      setDetalle(null);
      setConfirmacionBorrado("");
      navigate("/admin/accounts", { replace: true });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBorrando(false);
    }
  };

  useEffect(() => { if (aviso) { const t = setTimeout(() => setAviso(""), 6000); return () => clearTimeout(t); } }, [aviso]);

  if (!lista) return <div className="equipo"><h2>Panel general</h2><AdminNav /><p className="vacio" role="status">Cargando...</p>{error && <p className="alerta error" role="alert">{error}</p>}</div>;

  return (
    <div className="equipo">
      <h2>Panel general</h2>
      <AdminNav />
      {error && <p className="alerta error" role="alert"><strong>Error:</strong> {error} <button type="button" className="enlace" onClick={() => setError(null)} aria-label="Cerrar error">{"✕"}</button></p>}
      {aviso && <p className="alerta ok" role="status">{aviso}</p>}

      <div className="acciones agenda-toolbar">
        <div className="segmentado" role="group" aria-label="Periodo">
          {PERIODOS.map(([v, t]) => (
            <button type="button" key={v} className={dias === v ? "activo" : ""} aria-pressed={dias === v} onClick={() => setDias(v)}>{t}</button>
          ))}
        </div>
        <form className="acciones" onSubmit={buscar}>
          <label className="sr-only" htmlFor="soporte-buscar">Buscar por nombre, correo o escribania</label>
          <input id="soporte-buscar" type="search" placeholder="Buscar cuenta o escribania..." value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="boton"><Icono nombre="lupa" tamano={16} /> Buscar</button>
          <label className="chequeo"><input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} /> Solo con problemas</label>
        </form>
      </div>

      <section className="bloque" aria-labelledby="soporte-cuentas-titulo">
        <h3 id="soporte-cuentas-titulo">Cuentas <span className="etiqueta">{lista.length}</span></h3>
        {lista.length === 0 ? (
          <p className="vacio">Ninguna cuenta coincide con la busqueda.</p>
        ) : (
          <div className="tabla-scroll">
            <table aria-labelledby="soporte-cuentas-titulo">
              <thead>
                <tr>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Escribania</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Ultimo acceso</th>
                  <th scope="col" className="num">Documentos</th>
                  <th scope="col">Integraciones</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      {c.nombre || "—"}
                      <span className="recaudo-meta">{c.email}{c.activo ? "" : " · desactivada"}</span>
                    </th>
                    <td>{c.equipo || "—"}<span className="recaudo-meta">{NOMBRE_ROL[c.rol] || c.rol}</span></td>
                    <td>
                      {c.plan || "—"}
                      <span className="recaudo-meta">
                        {textoSuscripcion(c)}
                        {c.enPrueba && c.pruebaTerminaEn && ` hasta ${soloFecha(c.pruebaTerminaEn)}`}
                        {c.pruebaVencida && c.eliminacionEn && ` · se borra el ${soloFecha(c.eliminacionEn)}`}
                      </span>
                    </td>
                    <td>{cuando(c.ultimoAcceso)}</td>
                    <td className="num">{c.documentos}{c.fallidas > 0 && <span className="etiqueta riesgo-alto">{c.fallidas} con error</span>}</td>
                    <td>
                      {c.arca !== "apagado" && <span className="etiqueta">ARCA {c.arca}</span>}
                      {c.googleConectado && <span className="etiqueta">Google</span>}
                      {c.arca === "apagado" && !c.googleConectado && "—"}
                    </td>
                    <td><button type="button" className="enlace" aria-label={`Ver la ficha de soporte de ${c.nombre || c.email}`} onClick={() => abrir(c)}>ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detalle && (
        <section className="bloque" aria-labelledby="soporte-detalle-titulo">
          <div className="protocolo-cabecera">
            <h3 id="soporte-detalle-titulo" tabIndex={-1}>{detalle.nombre || detalle.email} {!detalle.activo && <span className="etiqueta riesgo-alto">desactivada</span>}</h3>
            <div className="acciones">
              {!detalle.esRoot && (
                detalle.activo ? (
                  <button type="button" className="boton chico" onClick={() => setADesactivar(detalle)}>Desactivar cuenta</button>
                ) : (
                  <button type="button" className="boton chico" onClick={() => cambiarActivo(detalle, true)}>Reactivar cuenta</button>
                )
              )}
              <button type="button" className="boton discreto chico" aria-label="Cerrar la ficha" onClick={cerrarDetalle}><Icono nombre="cruz" tamano={16} /></button>
            </div>
          </div>
          <p className="nota">
            {detalle.email} {"·"} alta {fechaCorta(String(detalle.creadoEn).slice(0, 10))} {"·"} ultimo acceso {cuando(detalle.ultimoAcceso)} {"·"} {detalle.equipo ? `${detalle.equipo} (${NOMBRE_ROL[detalle.rol] || detalle.rol})` : "sin escribania"} {"·"} plan {detalle.plan || "—"} ({textoSuscripcion(detalle)})
          </p>
          <p className="ayuda">
            Volumen cargado: {plural(detalle.volumen.clientes, "cliente")}, {plural(detalle.volumen.expedientes, "expediente")}, {plural(detalle.volumen.comprobantes, "comprobante")}. Son conteos: el contenido no se puede consultar desde aca.
          </p>

          {(detalle.enPrueba || detalle.pruebaVencida) && (
            <p className={`alerta ${detalle.pruebaVencida ? "error" : ""}`} role="status">
              {detalle.enPrueba
                ? `En periodo de prueba hasta el ${soloFecha(detalle.pruebaTerminaEn)}. Si no activa una suscripcion, queda bloqueada y sus datos se eliminan al vencer el plazo de gracia.`
                : `Prueba vencida. La cuenta y todo su contenido se eliminan de forma definitiva el ${soloFecha(detalle.eliminacionEn)}.`}
            </p>
          )}

          {!detalle.esRoot && (
            <details className="bloque">
              <summary>Eliminar definitivamente esta cuenta</summary>
              <p className="ayuda">
                Borra la cuenta y <b>todo</b> su contenido: clientes, expedientes, protocolo, caja, comprobantes, legajos UIF y credenciales. No hay copia ni vuelta atras; queda solo una constancia sin datos personales. Si la cuenta era la titular de una escribania, el equipo desaparece con ella (las cuentas de sus integrantes y los datos de cada una no se tocan).
              </p>
              <label>
                Escriba <code>{detalle.email}</code> para confirmar
                <input type="text" autoComplete="off" value={confirmacionBorrado} onChange={(e) => setConfirmacionBorrado(e.target.value)} />
              </label>
              <button
                type="button"
                className="boton peligro chico"
                disabled={borrando || confirmacionBorrado.trim().toLowerCase() !== String(detalle.email).toLowerCase()}
                onClick={eliminarDefinitivamente}
              >
                <Icono nombre="basura" tamano={16} /> {borrando ? "Borrando..." : "Eliminar todo definitivamente"}
              </button>
            </details>
          )}

          {detalle.fallasPorSkill.length > 0 && (
            <>
              <h4>Errores del pipeline en el periodo</h4>
              <ul className="alertas-uif">
                {detalle.fallasPorSkill.map((s, i) => (
                  <li key={i} className="alta"><Icono nombre="alerta" tamano={16} titulo="Error" /><span>{s.skill}: {s.error || "sin codigo"} ({s.n} {s.n === 1 ? "vez" : "veces"})</span></li>
                ))}
              </ul>
            </>
          )}

          <h4>Ultimas ejecuciones</h4>
          {detalle.ejecuciones.length === 0 ? (
            <p className="vacio">Todavia no proceso ningun documento.</p>
          ) : (
            <div className="tabla-scroll">
              <table aria-label="Ultimas ejecuciones de la cuenta">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Estado</th><th scope="col">Tipo de acto</th><th scope="col" className="num">Duracion</th><th scope="col" className="num">Costo</th></tr></thead>
                <tbody>
                  {detalle.ejecuciones.map((e) => (
                    <tr key={e.id}>
                      <td>{cuando(e.iniciadoEn)}</td>
                      <td><span className={`etiqueta ${e.estado === "completada" ? "ok" : e.estado === "fallida" ? "riesgo-alto" : ""}`}>{e.estado}</span></td>
                      <td>{e.tipoActo || "—"}</td>
                      <td className="num">{e.duracionMs ? `${Math.round(e.duracionMs / 1000)} s` : "—"}</td>
                      <td className="num">{e.costoUsd != null ? usd(e.costoUsd) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <ConfirmarDialogo
        abierto={Boolean(aDesactivar)}
        titulo={aDesactivar ? `Desactivar a ${aDesactivar.nombre || aDesactivar.email}` : ""}
        texto="La persona deja de poder ingresar. No se borra nada: sus clientes, expedientes y comprobantes quedan intactos y la cuenta se puede reactivar cuando quiera."
        confirmar="Desactivar"
        destructivo
        onConfirmar={() => cambiarActivo(aDesactivar, false)}
        onCancelar={() => setADesactivar(null)}
      />
    </div>
  );
}
