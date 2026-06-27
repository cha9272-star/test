import type { QuarterMode, Settings } from "../lib/types";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

export default function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  const numInput = (
    key: keyof Settings,
    label: string,
    opts?: { step?: number; hint?: string },
  ) => (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={opts?.step ?? 1}
        value={settings[key] as number}
        onChange={(e) => set(key, (parseFloat(e.target.value) || 0) as never)}
      />
      {opts?.hint && <span className="muted">{opts.hint}</span>}
    </div>
  );

  return (
    <div className="panel">
      <h2>3. 설정</h2>
      <div className="row">
        <div className="field">
          <label>기본 원가율</label>
          <input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={settings.defaultCostRatio}
            onChange={(e) =>
              set("defaultCostRatio", Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))
            }
          />
          <span className="muted">원가(지출) 미입력 딜에 적용 (예: 0.6 = 60%)</span>
        </div>
        {numInput("fixedMonthlyOpex", "월 고정 운영비", { step: 1000000, hint: "인건비/임대료 등" })}
        {numInput("openingCash", "시작 자금 잔고", { step: 1000000 })}
        {numInput("baseYear", "기준 연도", { hint: '"5월" 등 연도없는 월 해석' })}
        {numInput("defaultTermsIn", "입금 오프셋(개월)", { hint: "수금월 없을 때 +N" })}
        {numInput("defaultTermsOut", "지급 오프셋(개월)", { hint: "지급월 없을 때 +N" })}
        <div className="field">
          <label>분기 표기 처리</label>
          <select
            value={settings.quarterMode}
            onChange={(e) => set("quarterMode", e.target.value as QuarterMode)}
          >
            <option value="last">분기 마지막 달 (3Q→9월)</option>
            <option value="first">분기 첫 달 (3Q→7월)</option>
            <option value="exclude">집계 제외</option>
          </select>
        </div>
        <div className="field">
          <label>집계 모드</label>
          <div className="toggle" style={{ paddingTop: 6 }}>
            <input
              id="weighted"
              type="checkbox"
              checked={settings.weighted}
              onChange={(e) => set("weighted", e.target.checked)}
            />
            <label htmlFor="weighted" style={{ color: "var(--text)" }}>수주확률 가중 적용</label>
          </div>
          <span className="muted">
            {settings.weighted ? "매출×확률로 보수적 전망" : "전체 금액(100%) 반영"}
          </span>
        </div>
      </div>
    </div>
  );
}
