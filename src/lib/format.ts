/** 통화/숫자 포맷 유틸 */

const nf = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

export function fmtNum(n: number): string {
  return nf.format(Math.round(n));
}

/** 큰 금액을 읽기 쉽게 (백만/억 단위 축약) */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return fmtNum(n);
}

export function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
