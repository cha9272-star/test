// 핵심 도메인 타입 정의

/** 영업 pipeline의 딜 1건 (엑셀 1행) */
export interface Deal {
  /** 표시용 식별자 (고객/사업명) */
  dealName: string;
  /** 예상 매출 금액 (VAT 제외) */
  amount: number;
  /** 원가/매입대. 없으면 전역 원가율로 추정 (undefined) */
  cost?: number;
  /** 매출 인식 기준월 = 계산서 발행월 (YYYY-MM) */
  revenueMonth: string;
  /** 현금 유입월 = 수금월 (YYYY-MM). 없으면 계산서월+입금오프셋으로 추정 */
  cashInMonth?: string;
  /** 현금 유출월 = 매입처 지급월 (YYYY-MM). 없으면 계산서월+지급오프셋으로 추정 */
  cashOutMonth?: string;
  /** 수주확률 0~1. 가중 모드에서 사용 (데이터에 없으면 미사용) */
  probability?: number;
  /** 분류/단계 (필터·표시용, 선택) */
  stage?: string;
}

/** 분기 표기 처리 방식 */
export type QuarterMode = "last" | "first" | "exclude";

/** 앱 설정 */
export interface Settings {
  /** 기본 원가율 0~1 (cost 미지정 딜에 적용). 예: 0.6 → 매출의 60%가 원가 */
  defaultCostRatio: number;
  /** 수금월이 없을 때 적용할 입금 오프셋(개월). 계산서월 기준 +N */
  defaultTermsIn: number;
  /** 지급월이 없을 때 적용할 지급 오프셋(개월). 계산서월 기준 +N */
  defaultTermsOut: number;
  /** 월 고정 운영비 */
  fixedMonthlyOpex: number;
  /** 가중 모드: true면 매출/현금에 수주확률을 곱함 */
  weighted: boolean;
  /** 시작 자금 잔고 (누적 자금의 초기값) */
  openingCash: number;
  /** "5월"처럼 연도 없는 월 표기에 적용할 기준 연도 */
  baseYear: number;
  /** 분기/반기 표기 처리 방식 */
  quarterMode: QuarterMode;
}

/** 월/분기 정규화 옵션 */
export interface MonthParseOptions {
  baseYear: number;
  quarterMode: QuarterMode;
}

/** 월별 집계 결과 1행 */
export interface MonthlyResult {
  /** YYYY-MM */
  month: string;
  /** 인식 매출 */
  revenue: number;
  /** 매출원가 */
  cogs: number;
  /** 매출이익 (revenue - cogs) */
  grossProfit: number;
  /** 현금 유입 (수금) */
  cashIn: number;
  /** 현금 유출 (매입 지급) */
  cashOut: number;
  /** 월 고정 운영비 */
  fixedOpex: number;
  /** 순현금 (cashIn - cashOut - fixedOpex) */
  netCash: number;
  /** 누적 자금 잔고 */
  cumulativeCash: number;
}

/** 매핑 가능한 딜 필드 키 */
export type DealField =
  | "dealName"
  | "amount"
  | "cost"
  | "revenueMonth"
  | "cashInMonth"
  | "cashOutMonth"
  | "probability"
  | "stage";

/** 엑셀 컬럼 → 딜 필드 매핑 (값은 엑셀의 헤더명) */
export type ColumnMapping = Partial<Record<DealField, string>>;

/** 엑셀에서 읽은 원시 행 (헤더명 → 셀 값) */
export type RawRow = Record<string, unknown>;
