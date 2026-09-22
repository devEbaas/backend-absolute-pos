// `x * 100` en punto flotante arrastra ruido (`10.005 * 100 = 1000.4999999999999`), y redondear eso da `10.00` cuando
// Postgres, que recibe "10.005" como texto, guardaría `10.01`. `toPrecision(15)` quita el ruido antes de redondear para
// que lo que se responde sea exactamente lo que se guarda.
function roundTo(value: number, factor: number): number {
  return Math.round(Number((value * factor).toPrecision(15))) / factor;
}

/** Redondea a 2 decimales (la nube guarda `Decimal(12,2)`, specs/05 D1). */
export function round2(value: number): number {
  return roundTo(value, 100);
}

/** Redondea una cantidad de inventario a 4 decimales (`Decimal(12,4)`) para mostrarla sin ruido de flotantes. */
export function round4(value: number): number {
  return roundTo(value, 10000);
}
