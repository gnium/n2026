export class AppError extends Error {
  constructor(codigo, mensaje, status = 400, detalle = null) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
    this.detalle = detalle;
  }
}
