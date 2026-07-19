export type NormalizedPaymentMethod = 'cash' | 'card' | 'other';

// Shared bucketing rule for reporting/cuts: raw Sale.paymentMethod is free
// text from the client (desktop/mobile pick their own labels), so every
// place that aggregates by payment method must agree on the same buckets —
// see cash.service.ts's computeTotals and reports.service.ts's KPIs.
export function normalizePaymentMethod(
  method: string,
): NormalizedPaymentMethod {
  const value = method.toLowerCase();
  if (value === 'cash' || value === 'efectivo') return 'cash';
  if (value === 'card' || value === 'tarjeta') return 'card';
  return 'other';
}
