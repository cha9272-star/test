import { describe, it, expect } from "vitest";
import { computeMonthly, fillMonthRange, summarize } from "./calc";
import { addMonths, parsePaymentTerms, normalizeMonth } from "./terms";
import { detectHeaderRow, buildSheetData, guessMapping, rowsToDeals } from "./excel";
import type { Deal, MonthParseOptions, Settings } from "./types";

const baseSettings: Settings = {
  defaultCostRatio: 0.6,
  defaultTermsIn: 1,
  defaultTermsOut: 0,
  fixedMonthlyOpex: 0,
  weighted: false,
  openingCash: 0,
  baseYear: 2026,
  quarterMode: "last",
};

const opts: MonthParseOptions = { baseYear: 2026, quarterMode: "last" };

function rowFor(rows: ReturnType<typeof computeMonthly>, month: string) {
  return rows.find((r) => r.month === month)!;
}

describe("terms.addMonths", () => {
  it("연도 경계를 넘어 더한다", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", 0)).toBe("2026-01");
  });
});

describe("terms.parsePaymentTerms", () => {
  it("숫자/키워드/Net 변환", () => {
    expect(parsePaymentTerms("당월말")).toBe(0);
    expect(parsePaymentTerms("익월말")).toBe(1);
    expect(parsePaymentTerms("Net 60")).toBe(2);
    expect(parsePaymentTerms("기타")).toBeNull();
  });
});

describe("terms.normalizeMonth", () => {
  it("표준 날짜 표기", () => {
    expect(normalizeMonth("2026-03", opts)).toBe("2026-03");
    expect(normalizeMonth("2026/3/15", opts)).toBe("2026-03");
    expect(normalizeMonth("2026년 3월", opts)).toBe("2026-03");
    expect(normalizeMonth("202603", opts)).toBe("2026-03");
    expect(normalizeMonth(new Date(Date.UTC(2026, 2, 15)), opts)).toBe("2026-03");
  });
  it("실무 표기: 연도 없는 월, 2자리 연도, 분기", () => {
    expect(normalizeMonth("5월", opts)).toBe("2026-05");
    expect(normalizeMonth("1 월", opts)).toBe("2026-01");
    expect(normalizeMonth("25/12월", opts)).toBe("2025-12");
    expect(normalizeMonth("26년 3Q", opts)).toBe("2026-09"); // last month
    expect(normalizeMonth("3분기", opts)).toBe("2026-09");
  });
  it("분기 모드 first/exclude", () => {
    expect(normalizeMonth("26년 3Q", { baseYear: 2026, quarterMode: "first" })).toBe("2026-07");
    expect(normalizeMonth("26년 3Q", { baseYear: 2026, quarterMode: "exclude" })).toBeNull();
  });
  it("월 확정 불가 표기는 null", () => {
    expect(normalizeMonth("미정", opts)).toBeNull();
    expect(normalizeMonth("상반기", opts)).toBeNull();
    expect(normalizeMonth("", opts)).toBeNull();
  });
});

describe("fillMonthRange", () => {
  it("중간 빈 월을 채운다", () => {
    expect(fillMonthRange(["2026-01", "2026-04"])).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04",
    ]);
  });
});

describe("computeMonthly", () => {
  it("계산서월에 매출 인식, 원가율로 추정", () => {
    const deals: Deal[] = [{ dealName: "A", amount: 1000, revenueMonth: "2026-01" }];
    const rows = computeMonthly(deals, baseSettings);
    const jan = rowFor(rows, "2026-01");
    expect(jan.revenue).toBe(1000);
    expect(jan.cogs).toBe(600);
    expect(jan.grossProfit).toBe(400);
  });

  it("수금월(cashInMonth)을 현금유입에 직접 사용", () => {
    const deals: Deal[] = [
      { dealName: "A", amount: 1000, cost: 600, revenueMonth: "2026-01", cashInMonth: "2026-03" },
    ];
    const rows = computeMonthly(deals, baseSettings);
    expect(rowFor(rows, "2026-01").cashIn).toBe(0);
    expect(rowFor(rows, "2026-03").cashIn).toBe(1000);
    expect(rowFor(rows, "2026-01").cashOut).toBe(600); // termsOut=0
  });

  it("수금월 없으면 계산서월+입금오프셋으로 보완", () => {
    const deals: Deal[] = [{ dealName: "A", amount: 1000, revenueMonth: "2026-01" }];
    const rows = computeMonthly(deals, baseSettings); // termsIn=1
    expect(rowFor(rows, "2026-02").cashIn).toBe(1000);
  });

  it("가중 모드는 매출/현금에 확률을 곱한다", () => {
    const deals: Deal[] = [
      { dealName: "A", amount: 1000, cost: 600, revenueMonth: "2026-01", probability: 0.5 },
    ];
    const rows = computeMonthly(deals, { ...baseSettings, weighted: true });
    const jan = rowFor(rows, "2026-01");
    expect(jan.revenue).toBe(500);
    expect(jan.cogs).toBe(300);
  });

  it("고정 운영비/시작 자금/누적 반영", () => {
    const deals: Deal[] = [
      { dealName: "A", amount: 1000, cost: 0, revenueMonth: "2026-01", cashInMonth: "2026-01" },
    ];
    const rows = computeMonthly(deals, { ...baseSettings, fixedMonthlyOpex: 100, openingCash: 500 });
    const jan = rowFor(rows, "2026-01");
    expect(jan.netCash).toBe(900);
    expect(jan.cumulativeCash).toBe(1400);
  });
});

describe("summarize", () => {
  it("합계/이익률/최소 누적자금", () => {
    const deals: Deal[] = [
      { dealName: "A", amount: 1000, cost: 600, revenueMonth: "2026-01", cashInMonth: "2026-02" },
    ];
    const rows = computeMonthly(deals, baseSettings);
    const s = summarize(rows);
    expect(s.revenue).toBe(1000);
    expect(s.grossMargin).toBeCloseTo(0.4);
    expect(s.minCumulativeCash).toBe(-600); // 1월 원가 유출 후
    expect(s.endingCash).toBe(400);
  });
});

describe("excel 매핑", () => {
  // 실제 파일을 모사: 위에 제목 행, 그 아래 헤더 행, 데이터 행들
  const aoa: unknown[][] = [
    ["2026 매출 Pipeline", null, null],
    ["상품구분", "고객사", "예상매출(VAT제외)", "지출(매입대)", "계산서(월)", "수금(월)", "분류"],
    ["Dstation", "백석대학교", 196363600, 34990906, "1월", "2월", "신규"],
    ["HW", "제주대학교", 86736000, 75800000, "25/12월", "3월", "신규"],
    ["Dstation", "미정고객", 50000000, 0, "26년 3Q", null, "신규"],
  ];

  it("헤더 행을 자동 탐지한다", () => {
    expect(detectHeaderRow(aoa)).toBe(1);
  });

  it("자동 매핑이 실제 컬럼을 찾는다", () => {
    const sheet = buildSheetData(aoa, 1);
    const m = guessMapping(sheet.headers);
    expect(m.amount).toBe("예상매출(VAT제외)");
    expect(m.cost).toBe("지출(매입대)");
    expect(m.revenueMonth).toBe("계산서(월)");
    expect(m.cashInMonth).toBe("수금(월)");
    expect(m.dealName).toBe("고객사");
    expect(m.stage).toBe("분류");
  });

  it("행→딜 변환: 월 정규화 + 분기 제외 집계", () => {
    const sheet = buildSheetData(aoa, 1);
    const m = guessMapping(sheet.headers);
    const { deals, skippedNoMonth } = rowsToDeals(sheet.rows, m, opts);
    expect(deals).toHaveLength(3); // 분기(3Q)도 월로 인식되어 포함

    const a = deals.find((d) => d.dealName === "백석대학교")!;
    expect(a.amount).toBe(196363600);
    expect(a.revenueMonth).toBe("2026-01");
    expect(a.cashInMonth).toBe("2026-02");

    const b = deals.find((d) => d.dealName === "제주대학교")!;
    expect(b.revenueMonth).toBe("2025-12");
    expect(b.cashInMonth).toBe("2026-03");

    // 분기(3Q→2026-09)는 월로 인식되므로 제외되지 않음
    expect(skippedNoMonth).toBe(0);
  });
});
