import type { ColumnMapping, DealField } from "../lib/types";

interface Props {
  sheetNames: string[];
  activeSheet: string;
  onSheetChange: (name: string) => void;
  headerRowIndex: number;
  maxHeaderRow: number;
  onHeaderRowChange: (idx: number) => void;
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  rowCount: number;
}

const FIELD_LABELS: { field: DealField; label: string; required?: boolean; hint?: string }[] = [
  { field: "dealName", label: "딜/고객·사업명" },
  { field: "amount", label: "예상매출(금액)", required: true },
  { field: "revenueMonth", label: "매출인식월 (계산서월)", required: true, hint: "비우면 수금월로 대체" },
  { field: "cashInMonth", label: "현금유입월 (수금월)", hint: "운영자금 입금 시점" },
  { field: "cost", label: "원가 (지출/매입)" },
  { field: "cashOutMonth", label: "현금유출월 (지급월)", hint: "비우면 계산서월+오프셋" },
  { field: "probability", label: "수주확률" },
  { field: "stage", label: "분류/단계" },
];

export default function ColumnMapper({
  sheetNames,
  activeSheet,
  onSheetChange,
  headerRowIndex,
  maxHeaderRow,
  onHeaderRowChange,
  headers,
  mapping,
  onChange,
  rowCount,
}: Props) {
  const setField = (field: DealField, header: string) => {
    const next = { ...mapping };
    if (header === "") delete next[field];
    else next[field] = header;
    onChange(next);
  };

  return (
    <div className="panel">
      <h2>2. 컬럼 매핑</h2>
      <div className="row" style={{ marginBottom: 14 }}>
        {sheetNames.length > 1 && (
          <div className="field">
            <label>시트 선택</label>
            <select value={activeSheet} onChange={(e) => onSheetChange(e.target.value)}>
              {sheetNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>헤더 행 위치</label>
          <select
            value={headerRowIndex}
            onChange={(e) => onHeaderRowChange(parseInt(e.target.value, 10))}
          >
            {Array.from({ length: maxHeaderRow + 1 }, (_, i) => (
              <option key={i} value={i}>{i + 1}번째 행</option>
            ))}
          </select>
          <span className="muted">제목 행이 위에 있으면 조정</span>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        엑셀의 각 열을 항목에 연결하세요. <strong>예상매출</strong>과{" "}
        <strong>매출인식월</strong>은 필수입니다. ({rowCount}개 데이터 행 감지)
      </p>
      <div className="row">
        {FIELD_LABELS.map(({ field, label, required, hint }) => (
          <div className="field" key={field}>
            <label>
              {label}
              {required && <span style={{ color: "var(--negative)" }}> *</span>}
            </label>
            <select value={mapping[field] ?? ""} onChange={(e) => setField(field, e.target.value)}>
              <option value="">— 선택 안함 —</option>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            {hint && <span className="muted">{hint}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
