/* Deterministic formatters (no locale/ICU dependency, so server and client
   render identically — no hydration drift). Hungarian style: space thousands
   separator, comma decimal. Money in Thai Baht (฿). */

export const fmtInt = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const dec2 = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '')).replace('.', ',');
};

/** Compact money: 529 M ฿, 7,65 M ฿, 1,2 Mrd ฿. */
export function fmtTHBshort(n: number): string {
  if (n >= 1e9) return `${dec2(n / 1e9)} Mrd ฿`;
  if (n >= 1e6) return `${dec2(n / 1e6)} M ฿`;
  if (n >= 1e3) return `${fmtInt(n / 1e3)} e ฿`;
  return `${fmtInt(n)} ฿`;
}

/** Full money: 7 650 000 THB. */
export const fmtTHB = (n: number): string => `${fmtInt(n)} THB`;
