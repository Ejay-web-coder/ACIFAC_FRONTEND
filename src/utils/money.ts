// Adds peso amounts in whole centavos so totals never show floating-point noise.
export function sumMoney(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + Math.round(Number(value || 0) * 100), 0) / 100;
}

export function formatPeso(value: number | null | undefined) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
