import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyResult } from "../lib/types";
import { fmtCompact, fmtNum } from "../lib/format";

interface Props {
  rows: MonthlyResult[];
}

const tooltipFormatter = (v: number | string) =>
  typeof v === "number" ? fmtNum(v) : v;

export default function Charts({ rows }: Props) {
  return (
    <div className="charts">
      <div className="chart-box">
        <h3>월별 매출 · 매출이익</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis tickFormatter={fmtCompact} fontSize={11} width={48} />
            <Tooltip formatter={tooltipFormatter} />
            <Legend />
            <Bar dataKey="revenue" name="매출" fill="#93c5fd" />
            <Bar dataKey="grossProfit" name="매출이익" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-box">
        <h3>월별 순현금 · 누적 운영자금</h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis tickFormatter={fmtCompact} fontSize={11} width={48} />
            <Tooltip formatter={tooltipFormatter} />
            <Legend />
            <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 2" />
            <Bar dataKey="netCash" name="순현금" fill="#a7f3d0" />
            <Line
              type="monotone"
              dataKey="cumulativeCash"
              name="누적자금"
              stroke="#059669"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
