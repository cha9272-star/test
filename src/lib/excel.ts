import * as XLSX from "xlsx";
import type {
  ColumnMapping,
  Deal,
  DealField,
  MonthlyResult,
  MonthParseOptions,
  RawRow,
  Settings,
} from "./types";
import { normalizeMonth } from "./terms";

export interface SheetData {
  /** 헤더 행 인덱스 (aoa 기준, 0-based) */
  headerRowIndex: number;
  /** 정규화된 헤더명 (빈 칸/중복은 자동 보정) */
  headers: string[];
  /** 헤더 이후 데이터 행 (헤더명 → 셀 값) */
  rows: RawRow[];
  /** 원시 2차원 배열 (헤더 행 재선택용) */
  aoa: unknown[][];
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: Record<string, SheetData>;
  /** 데이터 시트로 가장 유력한 시트명 (자동 추정) */
  bestSheet: string;
}

/** 필드별 자동 매핑/헤더 탐지에 쓰는 키워드 (소문자 부분일치) */
const FIELD_KEYWORDS: Record<DealField, string[]> = {
  dealName: ["사업명", "고객사", "거래처", "프로젝트", "건명", "딜명", "opportunity", "client"],
  amount: ["예상매출", "매출액", "매출", "금액", "계약금액", "수주금액", "amount", "revenue", "value"],
  cost: ["지출", "매입", "원가", "비용", "cost", "cogs"],
  revenueMonth: ["계산서", "인식월", "매출월", "발행"],
  cashInMonth: ["수금", "입금", "회수"],
  cashOutMonth: ["지급", "결제", "지출월"],
  probability: ["확률", "성공률", "확도", "prob", "win"],
  stage: ["분류", "진행", "상태", "단계", "stage", "status"],
};

/** 한 행이 헤더로 적합한 정도(키워드 매칭 수) 점수 */
function headerScore(row: unknown[]): number {
  const all = Object.values(FIELD_KEYWORDS).flat();
  let score = 0;
  for (const cell of row) {
    if (cell === null || cell === undefined) continue;
    const t = String(cell).toLowerCase();
    if (t.trim() === "") continue;
    if (all.some((kw) => t.includes(kw.toLowerCase()))) score += 1;
  }
  return score;
}

/** aoa에서 헤더 행 인덱스를 추정 (앞쪽 25행 중 최고 점수) */
export function detectHeaderRow(aoa: unknown[][]): number {
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(25, aoa.length);
  for (let i = 0; i < limit; i++) {
    const s = headerScore(aoa[i]);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return bestScore >= 2 ? best : 0;
}

/** 헤더 배열을 고유한 비어있지 않은 이름으로 정규화 */
function normalizeHeaders(row: unknown[]): string[] {
  const seen = new Map<string, number>();
  return row.map((c, idx) => {
    let name = c === null || c === undefined ? "" : String(c).trim();
    if (name === "") name = `열${idx + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

/** 특정 헤더 행 인덱스로 SheetData를 (재)구성 */
export function buildSheetData(aoa: unknown[][], headerRowIndex: number): SheetData {
  const headerRow = aoa[headerRowIndex] ?? [];
  const headers = normalizeHeaders(headerRow);
  const rows: RawRow[] = [];
  for (let i = headerRowIndex + 1; i < aoa.length; i++) {
    const arr = aoa[i];
    if (!arr || arr.every((c) => c === null || c === undefined || c === "")) continue;
    const obj: RawRow = {};
    headers.forEach((h, idx) => {
      obj[h] = arr[idx] ?? null;
    });
    rows.push(obj);
  }
  return { headerRowIndex, headers, rows, aoa };
}

/** ArrayBuffer(엑셀 파일)를 파싱해 시트별 데이터 추출 */
export function parseWorkbook(data: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheets: Record<string, SheetData> = {};
  let bestSheet = wb.SheetNames[0] ?? "";
  let bestSheetScore = -1;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    const headerRowIndex = detectHeaderRow(aoa);
    sheets[name] = buildSheetData(aoa, headerRowIndex);

    // 데이터 시트 추정: 헤더 점수 × 데이터 행 수 가중
    const score = headerScore(aoa[headerRowIndex] ?? []) * 1000 + sheets[name].rows.length;
    if (sheets[name].rows.length > 0 && score > bestSheetScore) {
      bestSheetScore = score;
      bestSheet = name;
    }
  }

  return { sheetNames: wb.SheetNames, sheets, bestSheet };
}

/** 헤더 목록으로부터 자동 컬럼 매핑을 추측 */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  (Object.keys(FIELD_KEYWORDS) as DealField[]).forEach((field) => {
    const kws = FIELD_KEYWORDS[field];
    const found = headers.find(
      (h) => !used.has(h) && kws.some((kw) => h.toLowerCase().includes(kw.toLowerCase())),
    );
    if (found) {
      mapping[field] = found;
      used.add(found);
    }
  });
  return mapping;
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return undefined;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** 확률을 0~1로 정규화. ">1"이면 백분율로 간주(70 → 0.7) */
function toProbability(v: unknown): number | undefined {
  const n = toNumber(v);
  if (n === undefined) return undefined;
  return n > 1 ? n / 100 : n;
}

export interface MapResult {
  deals: Deal[];
  /** 건너뛴 행 정보 (경고 표시용) */
  warnings: string[];
  /** 월 확정 불가(분기·미정)로 제외된 행 수 */
  skippedNoMonth: number;
}

/** 원시 행 + 컬럼 매핑 → Deal[] 변환 */
export function rowsToDeals(
  rows: RawRow[],
  mapping: ColumnMapping,
  opts: MonthParseOptions,
): MapResult {
  const deals: Deal[] = [];
  const warnings: string[] = [];
  let skippedNoMonth = 0;

  rows.forEach((row, idx) => {
    const get = (f: DealField) => (mapping[f] ? row[mapping[f]!] : undefined);
    const lineNo = idx + 1;

    const amount = toNumber(get("amount"));
    const revenueMonth = normalizeMonth(get("revenueMonth"), opts);
    const cashInMonth = normalizeMonth(get("cashInMonth"), opts);

    // 금액도 월도 전혀 없으면 빈 행으로 보고 조용히 무시
    if (amount === undefined && !revenueMonth && !cashInMonth) return;

    if (amount === undefined) {
      warnings.push(`${lineNo}행: 매출 금액을 읽을 수 없어 건너뜀`);
      return;
    }
    if (!revenueMonth && !cashInMonth) {
      // 금액은 있으나 월 확정 불가 (분기/미정 등) → 집계 제외
      skippedNoMonth += 1;
      return;
    }

    const deal: Deal = {
      dealName: mapping.dealName ? String(get("dealName") ?? `행 ${lineNo}`) : `행 ${lineNo}`,
      amount,
      revenueMonth: revenueMonth ?? cashInMonth!,
    };
    if (cashInMonth) deal.cashInMonth = cashInMonth;
    const cashOutMonth = normalizeMonth(get("cashOutMonth"), opts);
    if (cashOutMonth) deal.cashOutMonth = cashOutMonth;
    const cost = toNumber(get("cost"));
    if (cost !== undefined) deal.cost = cost;
    const prob = toProbability(get("probability"));
    if (prob !== undefined) deal.probability = prob;
    const stage = get("stage");
    if (stage !== undefined && stage !== null && stage !== "") deal.stage = String(stage);

    deals.push(deal);
  });

  return { deals, warnings, skippedNoMonth };
}

/** 월별 집계 결과를 엑셀 파일로 다운로드 */
export function exportResults(
  rows: MonthlyResult[],
  settings: Settings,
  fileName = "재무전망.xlsx",
): void {
  const data = rows.map((r) => ({
    "월": r.month,
    "매출": Math.round(r.revenue),
    "매출원가": Math.round(r.cogs),
    "매출이익": Math.round(r.grossProfit),
    "이익률": r.revenue ? +(r.grossProfit / r.revenue).toFixed(4) : 0,
    "현금유입(수금)": Math.round(r.cashIn),
    "현금유출(지급)": Math.round(r.cashOut),
    "고정운영비": Math.round(r.fixedOpex),
    "순현금": Math.round(r.netCash),
    "누적자금": Math.round(r.cumulativeCash),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "월별전망");

  const settingsRows = [
    { 항목: "기본 원가율", 값: settings.defaultCostRatio },
    { 항목: "기본 입금 오프셋(개월)", 값: settings.defaultTermsIn },
    { 항목: "기본 지급 오프셋(개월)", 값: settings.defaultTermsOut },
    { 항목: "월 고정 운영비", 값: settings.fixedMonthlyOpex },
    { 항목: "시작 자금", 값: settings.openingCash },
    { 항목: "기준 연도", 값: settings.baseYear },
    { 항목: "가중(확률) 모드", 값: settings.weighted ? "예" : "아니오" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingsRows), "설정");
  XLSX.writeFile(wb, fileName);
}
