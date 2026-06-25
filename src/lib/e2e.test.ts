import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook, guessMapping, rowsToDeals } from "./excel";
import { computeMonthly, summarize } from "./calc";
import type { Settings } from "./types";

const settings: Settings = {
  defaultCostRatio: 0.6,
  defaultTermsIn: 1,
  defaultTermsOut: 0,
  fixedMonthlyOpex: 50_000_000,
  weighted: false,
  openingCash: 100_000_000,
  baseYear: 2026,
  quarterMode: "last",
};

/**
 * 실제 "(CD) 고객사 매출관리 대장" 시트 구조를 모사한 워크북을 만들어
 * 파싱 → 자동매핑 → 딜변환 → 월별집계까지 전 과정을 검증한다.
 * (제목 행이 맨 위, 그 아래 헤더 행, 이후 데이터 — 실제 파일과 동일 패턴)
 */
function buildWorkbookBuffer(): ArrayBuffer {
  const aoa = [
    ["2026 매출 Pipeline", null, null, null, null, null, null, null],
    ["상품구분", "고객구분", "고객사", "사업명", "예상매출(VAT제외)", "지출(매입대)", "계산서(월)", "수금(월)"],
    ["Dstation", "교육", "백석대학교", "인터넷망 VDI", 196_363_600, 34_990_906, "1월", "2월"],
    ["HW", "교육", "제주대학교", "GPU 서버", 86_736_000, 75_800_000, "25/12월", "3월"],
    ["Dstation", "공공", "서울대학교", "9.0 업그레이드", 49_090_900, 17_672_724, "1월", "2월"],
    ["Customizing", "민간", "효성", "OTP 연동", 38_318_000, 0, "3월", "4월"],
    ["Dstation", "공공", "한국관광공사", "통합 유지보수", 559_300_000, 548_300_000, "26년 1Q", "26년 2Q"],
    ["Dstation", "민간", "미정고객", "검토중", 50_000_000, 0, "미정", null],
    ["Server", "교육", "제주대학교", "Twin Campus", 527_400_000, null, "5월", "6월"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "(CD) 고객사 매출관리 대장");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}

describe("end-to-end: 실제 구조 모사 파일", () => {
  const parsed = parseWorkbook(buildWorkbookBuffer());
  const sheet = parsed.sheets[parsed.bestSheet];
  const mapping = guessMapping(sheet.headers);
  const { deals, skippedNoMonth } = rowsToDeals(sheet.rows, mapping, {
    baseYear: settings.baseYear,
    quarterMode: settings.quarterMode,
  });
  const rows = computeMonthly(deals, settings);
  const sum = summarize(rows);

  it("헤더 행(2번째)과 데이터 시트를 자동 인식", () => {
    expect(sheet.headerRowIndex).toBe(1);
    expect(parsed.bestSheet).toContain("매출관리");
  });

  it("핵심 컬럼을 자동 매핑", () => {
    expect(mapping.amount).toBe("예상매출(VAT제외)");
    expect(mapping.cost).toBe("지출(매입대)");
    expect(mapping.revenueMonth).toBe("계산서(월)");
    expect(mapping.cashInMonth).toBe("수금(월)");
    // 헤더 순서상 '고객사'가 '사업명'보다 먼저 → 고객사로 매핑 (UI에서 변경 가능)
    expect(mapping.dealName).toBe("고객사");
  });

  it("미정(월 없음) 딜만 제외, 분기는 포함", () => {
    expect(skippedNoMonth).toBe(1); // '미정고객'
    expect(deals).toHaveLength(6); // 7개 데이터 행 - 미정 1
  });

  it("수금월이 현금유입에 정확히 반영된다", () => {
    const feb = rows.find((r) => r.month === "2026-02")!;
    // 백석대(2월 수금) + 서울대(2월 수금) = 196,363,600 + 49,090,900
    expect(feb.cashIn).toBe(196_363_600 + 49_090_900);
    // 제주대 HW는 25/12 계산서, 3월 수금
    const mar = rows.find((r) => r.month === "2026-03")!;
    expect(mar.cashIn).toBe(86_736_000);
  });

  it("매출은 계산서월에, 25/12월 매출은 2025-12에 인식", () => {
    const dec25 = rows.find((r) => r.month === "2025-12")!;
    expect(dec25.revenue).toBe(86_736_000);
    const jan = rows.find((r) => r.month === "2026-01")!;
    expect(jan.revenue).toBe(196_363_600 + 49_090_900);
  });

  it("한국관광공사 분기 딜: 1Q→3월 인식, 2Q→6월 수금", () => {
    // 3월 매출 = 효성(38,318,000) + 한국관광공사 1Q(559,300,000)
    expect(rows.find((r) => r.month === "2026-03")!.revenue).toBe(38_318_000 + 559_300_000);
    // 6월 수금 = 한국관광공사 2Q(559,300,000) + 제주대 Server(527,400,000)
    expect(rows.find((r) => r.month === "2026-06")!.cashIn).toBe(559_300_000 + 527_400_000);
  });

  it("원가 미입력(제주대 Server)은 원가율 60%로 추정", () => {
    // Server 딜 매출 527,400,000 → 원가 추정 316,440,000, 5월 인식
    const may = rows.find((r) => r.month === "2026-05")!;
    expect(may.cogs).toBeCloseTo(527_400_000 * 0.6, 0);
  });

  it("누적 자금 곡선과 요약이 일관적이다", () => {
    // 매출 합계 = 모든 딜 예상매출 합
    const expectedRevenue =
      196_363_600 + 86_736_000 + 49_090_900 + 38_318_000 + 559_300_000 + 527_400_000;
    expect(sum.revenue).toBe(expectedRevenue);
    expect(sum.grossProfit).toBeLessThan(sum.revenue);
    // 마지막 누적자금 = 시작자금 + 전체 순현금 합
    const netSum = rows.reduce((a, r) => a + r.netCash, 0);
    expect(sum.endingCash).toBeCloseTo(settings.openingCash + netSum, 0);
  });
});
