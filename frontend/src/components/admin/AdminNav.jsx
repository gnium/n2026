import { useNavigate, useLocation } from "react-router-dom";

const TABS = [
  { ruta: "/admin", texto: "Dashboard" },
  { ruta: "/admin/invitations", texto: "Invitaciones" },
  { ruta: "/admin/accounts", texto: "Cuentas" },
  { ruta: "/admin/tickets", texto: "Consultas" },
];

export default function AdminNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const esActivo = (ruta) => {
    if (ruta === "/admin") return pathname === "/admin";
    return pathname.startsWith(ruta);
  };

  return (
    <div className="acciones agenda-toolbar" style={{ marginBottom: "1rem" }}>
      <div className="segmentado" role="group" aria-label="Secciones del panel">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.ruta}
            className={esActivo(t.ruta) ? "activo" : ""}
            aria-pressed={esActivo(t.ruta)}
            onClick={() => navigate(t.ruta)}
          >
            {t.texto}
          </button>
        ))}
      </div>
    </div>
  );
}
