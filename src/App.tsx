import { useEffect, useMemo, useState } from "react";
import Uploader from "./components/Uploader";
import ColumnMapper from "./components/ColumnMapper";
import SettingsPanel from "./components/SettingsPanel";
import Dashboard from "./components/Dashboard";
import { buildSheetData, guessMapping, rowsToDeals, type ParsedWorkbook } from "./lib/excel";
import type { ColumnMapping, Settings } from "./lib/types";

const DEFAULT_SETTINGS: Settings = {
  defaultCostRatio: 0.6,
  defaultTermsIn: 1,
  defaultTermsOut: 0,
  fixedMonthlyOpex: 0,
  weighted: false,
  openingCash: 0,
  baseYear: 2026,
  quarterMode: "last",
};

const LS_SETTINGS = "spf.settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as object) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [fileName, setFileName] = useState<string>();
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  const sheet = workbook && activeSheet ? workbook.sheets[activeSheet] : null;
  const headers = sheet?.headers ?? [];
  const maxHeaderRow = sheet ? Math.min(24, sheet.aoa.length - 1) : 0;

  const { deals, warnings, skippedNoMonth } = useMemo(() => {
    if (!sheet) return { deals: [], warnings: [] as string[], skippedNoMonth: 0 };
    return rowsToDeals(sheet.rows, mapping, {
      baseYear: settings.baseYear,
      quarterMode: settings.quarterMode,
    });
  }, [sheet, mapping, settings.baseYear, settings.quarterMode]);

  const handleParsed = (wb: ParsedWorkbook, name: string) => {
    setWorkbook(wb);
    setFileName(name);
    const best = wb.bestSheet || wb.sheetNames[0];
    const s = wb.sheets[best];
    setActiveSheet(best);
    setHeaderRowIndex(s.headerRowIndex);
    setMapping(guessMapping(s.headers));
  };

  const handleSheetChange = (name: string) => {
    setActiveSheet(name);
    const s = workbook!.sheets[name];
    setHeaderRowIndex(s.headerRowIndex);
    setMapping(guessMapping(s.headers));
  };

  const handleHeaderRowChange = (idx: number) => {
    if (!workbook || !activeSheet) return;
    const rebuilt = buildSheetData(workbook.sheets[activeSheet].aoa, idx);
    // 시트 데이터 교체 (헤더/행 재계산)
    workbook.sheets[activeSheet] = rebuilt;
    setWorkbook({ ...workbook });
    setHeaderRowIndex(idx);
    setMapping(guessMapping(rebuilt.headers));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>영업 Pipeline 재무 대시보드</h1>
        <p>
          영업 pipeline 엑셀로 월단위 매출 · 매출이익 · 운영자금 수지를 자동 집계합니다.
          (수금월 기반 현금흐름)
        </p>
      </header>

      <Uploader onParsed={handleParsed} fileName={fileName} />

      {workbook && (
        <>
          <ColumnMapper
            sheetNames={workbook.sheetNames}
            activeSheet={activeSheet}
            onSheetChange={handleSheetChange}
            headerRowIndex={headerRowIndex}
            maxHeaderRow={maxHeaderRow}
            onHeaderRowChange={handleHeaderRowChange}
            headers={headers}
            mapping={mapping}
            onChange={setMapping}
            rowCount={sheet?.rows.length ?? 0}
          />
          <SettingsPanel settings={settings} onChange={setSettings} />
          {(warnings.length > 0 || skippedNoMonth > 0) && (
            <div className="warn">
              {skippedNoMonth > 0 && (
                <div>
                  월 확정이 안 된(미정/제외) {skippedNoMonth}개 딜은 월별 집계에서 제외됨.
                </div>
              )}
              {warnings.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {warnings.length > 5 && <li>… 외 {warnings.length - 5}건</li>}
                </ul>
              )}
            </div>
          )}
          <Dashboard deals={deals} settings={settings} />
        </>
      )}
    </div>
  );
}
