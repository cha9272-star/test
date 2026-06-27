import type { MonthlyResult } from "../lib/types";
import { fmtNum, fmtPct } from "../lib/format";

interface Props {
  rows: MonthlyResult[];
}

function Num({ value }: { value: number }) {
  const cls = value < 0 ? "num neg" : "num";
  return <span className={cls}>{fmtNum(value)}</span>;
}

export default function ResultTable({ rows }: Props) {
  return (
    <div className="table-scroll">
      <table className="result">
        <thead>
          <tr>
            <th>월</th>
            <th>매출</th>
            <th>매출원가</th>
            <th>매출이익</th>
            <th>이익률</th>
            <th>현금유입</th>
            <th>현금유출</th>
            <th>고정운영비</th>
            <th>순현금</th>
            <th>누적자금</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className={r.cumulativeCash < 0 ? "deficit" : ""}>
              <td>{r.month}</td>
              <td><Num value={r.revenue} /></td>
              <td><Num value={r.cogs} /></td>
              <td><Num value={r.grossProfit} /></td>
              <td>{r.revenue ? fmtPct(r.grossProfit / r.revenue) : "-"}</td>
              <td><Num value={r.cashIn} /></td>
              <td><Num value={r.cashOut} /></td>
              <td><Num value={r.fixedOpex} /></td>
              <td><Num value={r.netCash} /></td>
              <td><Num value={r.cumulativeCash} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
