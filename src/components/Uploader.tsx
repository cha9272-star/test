import { useRef, useState } from "react";
import { parseWorkbook, type ParsedWorkbook } from "../lib/excel";

interface Props {
  onParsed: (wb: ParsedWorkbook, fileName: string) => void;
  fileName?: string;
}

export default function Uploader({ onParsed, fileName }: Props) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = parseWorkbook(buf);
      if (wb.sheetNames.length === 0) {
        setError("시트를 찾을 수 없습니다.");
        return;
      }
      onParsed(wb, file.name);
    } catch (e) {
      setError(`파일을 읽지 못했습니다: ${(e as Error).message}`);
    }
  };

  return (
    <div className="panel">
      <h2>1. 엑셀 업로드</h2>
      <div
        className={`dropzone${drag ? " drag" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        {fileName ? (
          <span>
            현재 파일: <strong>{fileName}</strong> — 다른 파일을 선택하려면 클릭/드롭
          </span>
        ) : (
          <span>
            영업 pipeline 엑셀을 <strong>드래그&드롭</strong>하거나 클릭해서 선택
            <br />
            <span className="muted">(.xlsx / .xls — 데이터는 브라우저에서만 처리됩니다)</span>
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
      {error && <div className="warn" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
