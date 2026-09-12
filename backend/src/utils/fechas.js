/**
 * Fechas "de calendario" en la zona horaria de la escribania (Argentina), sin la
 * deriva de toISOString() (UTC): a las 21:00 de Buenos Aires ya es manana en UTC.
 */
const ZONA = process.env.TZ_APP || "America/Argentina/Buenos_Aires";
const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

/** AAAA-MM-DD de hoy en la zona horaria de la app. */
export function hoyLocal() {
  return fmt.format(new Date());
}

/** true si `f` es una fecha AAAA-MM-DD real (rechaza 2026-02-30). */
export function esFechaValida(f) {
  if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

/** Texto saneado: solo strings, recortado; cualquier otro tipo se descarta. */
export function texto(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
