import type { MonthParseOptions } from "./types";

/** 결제조건 → 월 오프셋(개월). 0=당월, 1=익월 ... */
export type PaymentOffsetMonths = number;

/**
 * 결제조건 문자열을 월 오프셋(개월)으로 정규화한다.
 * 수금월/지급월이 비었을 때의 보완 추정에 사용.
 *
 * 지원: 숫자, "당월/즉시"→0, "익월/익월말/다음달"→1, "익익월"→2,
 *       "+N"/"N개월", "net30"/"30일"(30일=1개월).
 * 인식 불가 시 null.
 */
export function parsePaymentTerms(raw: unknown): PaymentOffsetMonths | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (s === "") return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (/(당월말|당월|즉시|현금|선금|선입금)/.test(s)) return 0;
  if (/(익익월|다다음달)/.test(s)) return 2;
  if (/(익월말|익월|다음달|월말|명월)/.test(s)) return 1;
  const monthMatch = s.match(/\+?(\d+)\s*(개월|달|month|months|m)/);
  if (monthMatch) return parseInt(monthMatch[1], 10);
  const plusMatch = s.match(/^\+(\d+)$/);
  if (plusMatch) return parseInt(plusMatch[1], 10);
  const netMatch = s.match(/(?:net)?(\d+)\s*(일|days?|d)?$/);
  if (netMatch && /(net|일|day|d)/.test(s)) {
    return Math.round(parseInt(netMatch[1], 10) / 30);
  }
  return null;
}

/** YYYY-MM 문자열에 개월 수를 더한 새 YYYY-MM 반환 */
export function addMonths(month: string, offset: number): string {
  const [y, m] = month.split("-").map((v) => parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return month;
  const total = y * 12 + (m - 1) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 분기(1~4)를 처리 방식에 따라 월로 변환 */
function quarterToMonth(q: number, mode: MonthParseOptions["quarterMode"]): number | null {
  if (q < 1 || q > 4) return null;
  if (mode === "exclude") return null;
  if (mode === "first") return q * 3 - 2; // 1Q→1, 2Q→4, 3Q→7, 4Q→10
  return q * 3; // last: 1Q→3, 2Q→6, 3Q→9, 4Q→12
}

const DEFAULT_OPTS: MonthParseOptions = { baseYear: 2026, quarterMode: "last" };

/**
 * 다양한 월/날짜/분기 표기를 YYYY-MM으로 정규화. 인식 실패 시 null.
 *
 * 처리 예:
 *  - Date / 엑셀 시리얼 / "2026-03" / "2026/3/15" / "2026년 3월" / "202603"
 *  - "25/12월" → 2025-12 (2자리 연도)
 *  - "5월" / "1 월" → baseYear 적용 (예: 2026-05)
 *  - "26년 3Q" / "3분기" → quarterMode에 따라 월 배치
 *  - "미정" / "상반기" / "하반기" → null (월 확정 불가)
 */
export function normalizeMonth(
  raw: unknown,
  opts: MonthParseOptions = DEFAULT_OPTS,
): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // Date 객체
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return ym(raw.getFullYear(), raw.getMonth() + 1);
  }

  // 엑셀 시리얼 날짜(숫자)
  if (typeof raw === "number" && raw > 59 && raw < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return ym(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }

  const s = String(raw).trim();
  if (s === "") return null;

  // 월 확정 불가 표기
  if (/(미정|미상|상반기|하반기|중반|tbd|n\/?a)/i.test(s)) return null;

  // YYYY-MM(-DD), 구분자 - . /
  const ymd = s.match(/^(\d{4})[-./](\d{1,2})(?:[-./]\d{1,2})?/);
  if (ymd) return ym(parseInt(ymd[1], 10), parseInt(ymd[2], 10));

  // YYYY년 M월
  const krFull = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
  if (krFull) return ym(parseInt(krFull[1], 10), parseInt(krFull[2], 10));

  // YYYYMM (6자리)
  const compact = s.match(/^(\d{4})(\d{2})$/);
  if (compact) return ym(parseInt(compact[1], 10), parseInt(compact[2], 10));

  // 분기: "26년 3Q", "3Q", "3분기" (선택적 2자리 연도)
  const q = s.match(/(?:(\d{2})\s*년)?\s*([1-4])\s*(?:q|분기)/i);
  if (q) {
    const month = quarterToMonth(parseInt(q[2], 10), opts.quarterMode);
    if (month === null) return null;
    const year = q[1] ? 2000 + parseInt(q[1], 10) : opts.baseYear;
    return ym(year, month);
  }

  // "25/12월" 또는 "25.12" → 2자리 연도 + 월
  const yy = s.match(/^(\d{2})\s*[/.]\s*(\d{1,2})\s*월?$/);
  if (yy) return ym(2000 + parseInt(yy[1], 10), parseInt(yy[2], 10));

  // 연도 없는 "5월" / "1 월"
  const bare = s.match(/^(\d{1,2})\s*월$/);
  if (bare) {
    const m = parseInt(bare[1], 10);
    if (m >= 1 && m <= 12) return ym(opts.baseYear, m);
  }

  return null;
}
