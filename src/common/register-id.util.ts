/**
 * El `registerId` de las cajas que abre un dispositivo **móvil** (specs/22 §3.1, §4.2): el nombre con el que se emparejó
 * (`Device.label`) más un sufijo corto de su id, p. ej. `CAJA-2 #A1B2`.
 *
 * El nombre solo no sirve: no es único en el negocio y el escritorio identifica **su** caja abierta únicamente por
 * `register_id` y usuario (`cash:getCurrentSession`, con `settings.device_name`, `CAJA-1` por omisión). Con el mismo
 * nombre, la sesión que abre el móvil bajaría al escritorio y este la tomaría como propia (podría vender en ella y cerrarla).
 * Con el sufijo, el `registerId` de un móvil no coincide con el de ningún otro equipo, salvo que alguien lo escriba a mano.
 */
export function mobileRegisterId(device: {
  id: string;
  label: string;
}): string {
  const suffix = device.id.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${device.label} #${suffix}`;
}
