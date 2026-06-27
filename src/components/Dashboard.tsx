import { useMemo } from "react";
import type { Deal, MonthlyResult, Settings } from "../lib/types";
import { computeMonthly, summarize } from "../lib/calc";
import { exportResults } from "../lib/excel";
import { fmtCompact, fmtPct } from "../lib/format";
import ResultTable from "./ResultTable";
import Charts from "./Charts";

interface Props {
  deals: Deal[];
  settings: Settings;
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "neg" | "pos" }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value" style={tone === "neg" ? { color: "var(--negative)" } : tone === "pos" ? { color: "var(--positive)" } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default function Dashboard({ deals, settings }: Props) {
  const rows: MonthlyResult[] = useMemo(
    () => computeMonthly(deals, settings),
    [deals, settings],
  );
  const sum = useMemo(() => summarize(rows), [rows]);

  const deficitMonths = rows.filter((r) => r.cumulativeCash < 0).map((r) => r.month);

  if (deals.length === 0) {
    return (
      <div className="panel">
        <h2>4. 대시보드</h2>
        <p className="muted">
          매핑된 딜이 없습니다. 매출 금액·수주월 컬럼이 올바르게 연결되었는지 확인하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="actions" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>4. 대시보드 ({deals.length}개 딜)</h2>
        <button className="btn secondary" onClick={() => exportResults(rows, settings)}>
          ⬇ 엑셀로 내보내기
        </button>
      </div>

      <div className="cards">
        <Card label="총 매출" value={fmtCompact(sum.revenue)} />
        <Card label="총 매출이익" value={fmtCompact(sum.grossProfit)} />
        <Card label="평균 이익률" value={fmtPct(sum.grossMargin)} />
        <Card
          label="기말 누적자금"
          value={fmtCompact(sum.endingCash)}
          tone={sum.endingCash < 0 ? "neg" : "pos"}
        />
        <Card
          label="최저 누적자금"
          value={fmtCompact(sum.minCumulativeCash)}
          tone={sum.minCumulativeCash < 0 ? "neg" : undefined}
        />
      </div>

      {deficitMonths.length > 0 && (
        <div className="warn">
          ⚠ 자금 부족 발생: <strong>{deficitMonths.join(", ")}</strong> 월에 누적 운영자금이
          마이너스입니다. 입금조건·시작 자금·고정비를 점검하세요.
        </div>
      )}

      <Charts rows={rows} />
      <div style={{ height: 20 }} />
      <ResultTable rows={rows} />
    </div>
  );
}
