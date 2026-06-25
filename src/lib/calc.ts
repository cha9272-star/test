import type { Deal, MonthlyResult, Settings } from "./types";
import { addMonths } from "./terms";

/** 가중 모드일 때 적용할 확률 계수 반환 (확률 없으면 1) */
function weight(deal: Deal, settings: Settings): number {
  if (!settings.weighted) return 1;
  const p = deal.probability;
  if (p === undefined || p === null || !Number.isFinite(p)) return 1;
  return Math.max(0, Math.min(1, p));
}

/** 딜의 원가 산출: cost가 있으면 사용, 없으면 매출 × 기본 원가율 */
function cogsOf(deal: Deal, settings: Settings): number {
  if (deal.cost !== undefined && Number.isFinite(deal.cost)) return deal.cost;
  return deal.amount * settings.defaultCostRatio;
}

function emptyRow(month: string): MonthlyResult {
  return {
    month,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    cashIn: 0,
    cashOut: 0,
    fixedOpex: 0,
    netCash: 0,
    cumulativeCash: 0,
  };
}

/**
 * 딜 목록 + 설정으로 월별 매출/매출이익/현금수지를 집계한다.
 * 순수 함수 — 입력을 변경하지 않는다.
 *
 * 매출 인식: 계산서월(revenueMonth). 없으면 수금월로 대체.
 * 현금 유입: 수금월(cashInMonth). 없으면 계산서월 + 입금 오프셋.
 * 현금 유출: 지급월(cashOutMonth). 없으면 계산서월 + 지급 오프셋.
 */
export function computeMonthly(
  deals: Deal[],
  settings: Settings,
): MonthlyResult[] {
  const map = new Map<string, MonthlyResult>();

  const touch = (month: string): MonthlyResult => {
    let row = map.get(month);
    if (!row) {
      row = emptyRow(month);
      map.set(month, row);
    }
    return row;
  };

  for (const deal of deals) {
    // 매출 인식월: 계산서월 우선, 없으면 수금월로 대체
    const recogMonth = deal.revenueMonth || deal.cashInMonth;
    if (!recogMonth) continue;

    const w = weight(deal, settings);
    const revenue = deal.amount * w;
    const cogs = cogsOf(deal, settings) * w;

    // 1) 매출/매출이익은 인식월에 계상
    const recog = touch(recogMonth);
    recog.revenue += revenue;
    recog.cogs += cogs;

    // 2) 현금 유입: 수금월 직접 사용, 없으면 계산서월 + 오프셋
    const inMonth = deal.cashInMonth ?? addMonths(recogMonth, settings.defaultTermsIn);
    touch(inMonth).cashIn += revenue;

    // 3) 현금 유출: 지급월 직접 사용, 없으면 계산서월 + 오프셋
    const outMonth = deal.cashOutMonth ?? addMonths(recogMonth, settings.defaultTermsOut);
    touch(outMonth).cashOut += cogs;
  }

  const months = fillMonthRange([...map.keys()]);

  let cumulative = settings.openingCash;
  const results: MonthlyResult[] = [];
  for (const month of months) {
    const row = map.get(month) ?? emptyRow(month);
    row.grossProfit = row.revenue - row.cogs;
    row.fixedOpex = settings.fixedMonthlyOpex;
    row.netCash = row.cashIn - row.cashOut - row.fixedOpex;
    cumulative += row.netCash;
    row.cumulativeCash = cumulative;
    results.push(row);
  }
  return results;
}

/** 최소~최대 월 사이의 모든 월(YYYY-MM)을 연속 생성 */
export function fillMonthRange(monthKeys: string[]): string[] {
  if (monthKeys.length === 0) return [];
  const sorted = [...monthKeys].sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const out: string[] = [];
  let cur = start;
  for (let i = 0; i < 600; i++) {
    out.push(cur);
    if (cur === end) break;
    cur = addMonths(cur, 1);
  }
  return out;
}

/** 전체 합계 (대시보드 요약용) */
export function summarize(rows: MonthlyResult[]) {
  const totals = rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue;
      acc.cogs += r.cogs;
      acc.grossProfit += r.grossProfit;
      acc.cashIn += r.cashIn;
      acc.cashOut += r.cashOut;
      acc.fixedOpex += r.fixedOpex;
      acc.netCash += r.netCash;
      return acc;
    },
    { revenue: 0, cogs: 0, grossProfit: 0, cashIn: 0, cashOut: 0, fixedOpex: 0, netCash: 0 },
  );
  const minCash = rows.reduce(
    (m, r) => Math.min(m, r.cumulativeCash),
    rows.length ? rows[0].cumulativeCash : 0,
  );
  return {
    ...totals,
    grossMargin: totals.revenue ? totals.grossProfit / totals.revenue : 0,
    endingCash: rows.length ? rows[rows.length - 1].cumulativeCash : 0,
    minCumulativeCash: minCash,
  };
}
