// Mismas claves que absolute-pos-app guarda localmente en su tabla `settings` (ver src/main/ipc/settings.ipc.js:
// 'company_name', 'company_rfc', 'company_phone', 'company_address', 'company_email', 'company_website',
// 'company_logo') — se reusa el nombre para que quede claro que es el mismo dato, aunque aquí vive en Postgres
// (BusinessSetting, key/value por businessId) en vez de en el SQLite de cada caja. A diferencia de esa tabla local,
// esto nunca pasa por /sync — es exclusivamente para que el dashboard del dueño lea/edite el dato central y para que la
// app móvil arme el ticket (specs/22 §3.1).
export type CompanyField =
  'companyName' | 'rfc' | 'phone' | 'address' | 'email' | 'website' | 'logo';

export const FIELD_TO_KEY: Record<CompanyField, string> = {
  companyName: 'company_name',
  rfc: 'company_rfc',
  phone: 'company_phone',
  address: 'company_address',
  email: 'company_email',
  website: 'company_website',
  logo: 'company_logo',
};

const KEY_TO_FIELD = Object.fromEntries(
  Object.entries(FIELD_TO_KEY).map(([field, key]) => [key, field]),
) as Record<string, CompanyField>;

/** Los campos de empresa que una app puede recibir sin descargar el logo (que pesa mucho). */
export const COMPANY_FIELDS_WITHOUT_LOGO = (
  Object.keys(FIELD_TO_KEY) as CompanyField[]
).filter((f) => f !== 'logo');

/** Filas `BusinessSetting` → `{ companyName, rfc, … }` con `null` en lo que no esté cargado. */
export function toCompanyInfo(
  rows: { key: string; value: string | null }[],
  fields: CompanyField[] = Object.keys(FIELD_TO_KEY) as CompanyField[],
): Record<string, string | null> {
  const result: Record<string, string | null> = Object.fromEntries(
    fields.map((f) => [f, null]),
  );
  for (const row of rows) {
    const field = KEY_TO_FIELD[row.key];
    if (field && field in result) result[field] = row.value;
  }
  return result;
}
