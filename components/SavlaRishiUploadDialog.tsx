/**
 * Upload dialog for the Savla / Rishi monthly stock sheet.
 *
 * These are 3PL cold stores: their stock never passes through the floor-count
 * flow, so the only way their numbers enter the system is this workbook.
 *
 * The dialog deliberately shows the full outcome of an import rather than a
 * bare "success" toast. An import that silently drops 40 rows for a bad
 * storage location looks identical to a clean one otherwise, and the person
 * uploading is the only one positioned to notice and fix the sheet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  savlaRishiAPI,
  APIError,
  isAbortError,
  type SavlaRishiUploadResult,
} from "@/utils/api";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader } from "lucide-react";
import "./SavlaRishiUploadDialog.css";

interface Props {
  /** The warehouse whose card was clicked — "Savla" or "Rishi". */
  warehouse: string | null;
  onClose: () => void;
  /** Fired after a successful import so the caller can refresh its snapshot row. */
  onUploaded?: (result: SavlaRishiUploadResult) => void;
}

const fmtKg = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${m[3]} ${months[Number(m[2]) - 1]} ${m[1]}`;
};

export default function SavlaRishiUploadDialog({ warehouse, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SavlaRishiUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorRows, setErrorRows] = useState<{ row: number; reason: string }[]>([]);
  /** Set when the server could not find a report date in the workbook. */
  const [needsReportDate, setNeedsReportDate] = useState(false);
  const [reportDate, setReportDate] = useState("");
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const open = warehouse !== null;

  // Reset per opening — otherwise the previous import's result greets the next
  // person to open the dialog.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setBusy(false);
    setResult(null);
    setError(null);
    setErrorRows([]);
    setNeedsReportDate(false);
    setReportDate("");
    setDragging(false);
  }, [open, warehouse]);

  // An in-flight upload outlives the dialog otherwise.
  useEffect(() => () => abortRef.current?.abort(), []);

  const pickFile = useCallback((f: File | null) => {
    setFile(f);
    setError(null);
    setErrorRows([]);
    setResult(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) pickFile(f);
    },
    [pickFile]
  );

  async function doUpload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setErrorRows([]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await savlaRishiAPI.upload(file, {
        reportDate: reportDate || undefined,
        signal: controller.signal,
      });
      setResult(res);
      setNeedsReportDate(false);
      onUploaded?.(res);
    } catch (err: any) {
      if (isAbortError(err)) return; // dialog closed mid-flight
      if (err instanceof APIError) {
        setError(err.data?.error || err.message);
        setErrorRows(err.data?.errorDetails ?? []);
        // The server tells us when the only thing missing is the report date.
        if (err.data?.needsReportDate) setNeedsReportDate(true);
      } else {
        setError(err?.message || "Upload failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="srud-dialog">
        <DialogHeader>
          <DialogTitle className="srud-title">
            <FileSpreadsheet className="srud-title-icon" />
            Upload {warehouse} stock sheet
          </DialogTitle>
          <DialogDescription className="srud-subtitle">
            Each upload is stored as a snapshot under its own report date.
            Re-uploading a corrected copy of the same report replaces it.
          </DialogDescription>
        </DialogHeader>

        <div className="srud-body">
          {!result && (
            <>
              <div
                className={`srud-drop ${dragging ? "srud-drop-active" : ""} ${file ? "srud-drop-filled" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="srud-file-input"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <Upload className="srud-drop-icon" />
                {file ? (
                  <>
                    <p className="srud-drop-name">{file.name}</p>
                    <p className="srud-drop-hint">{(file.size / 1024 / 1024).toFixed(2)} MB · click to change</p>
                  </>
                ) : (
                  <>
                    <p className="srud-drop-name">Choose a workbook, or drop it here</p>
                    <p className="srud-drop-hint">.xlsx only, up to 15 MB</p>
                  </>
                )}
              </div>

              {needsReportDate && (
                <div className="srud-note srud-note-warn">
                  <AlertTriangle className="srud-note-icon" />
                  <div>
                    <p className="srud-note-title">This workbook has no report date</p>
                    <p className="srud-note-text">
                      No “Report Date” or “As On Date” cell was found above the table.
                      Set it here and upload again.
                    </p>
                    <Input
                      type="date"
                      className="srud-date-input"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="srud-note srud-note-error">
                  <XCircle className="srud-note-icon" />
                  <div className="srud-note-grow">
                    <p className="srud-note-title">{error}</p>
                    {errorRows.length > 0 && (
                      <ul className="srud-error-list">
                        {errorRows.slice(0, 10).map((e, i) => (
                          <li key={i}>
                            <span className="srud-error-row">Row {e.row}</span> {e.reason}
                          </li>
                        ))}
                        {errorRows.length > 10 && (
                          <li className="srud-error-more">…and {errorRows.length - 10} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="srud-result">
              <div className="srud-note srud-note-ok">
                <CheckCircle2 className="srud-note-icon" />
                <div>
                  <p className="srud-note-title">
                    Imported {result.imported.toLocaleString("en-IN")} rows for {fmtDate(result.reportDate)}
                  </p>
                  <p className="srud-note-text">
                    {result.fileName}
                    {result.reportDateSource ? ` · report date from ${result.reportDateSource}` : ""}
                  </p>
                </div>
              </div>

              <div className="srud-stats">
                <div className="srud-stat">
                  <span className="srud-stat-value">{result.imported.toLocaleString("en-IN")}</span>
                  <span className="srud-stat-label">Rows imported</span>
                </div>
                <div className="srud-stat">
                  <span className="srud-stat-value">{fmtKg(result.totalKgs)}</span>
                  <span className="srud-stat-label">Total kg</span>
                </div>
                <div className={`srud-stat ${result.invalid > 0 ? "srud-stat-bad" : ""}`}>
                  <span className="srud-stat-value">{result.invalid}</span>
                  <span className="srud-stat-label">Rows rejected</span>
                </div>
                <div className="srud-stat">
                  <span className="srud-stat-value">{result.replacedPreviousRows}</span>
                  <span className="srud-stat-label">Previous rows replaced</span>
                </div>
              </div>

              <table className="srud-loc-table">
                <thead>
                  <tr><th>Location</th><th>Rows</th><th>Kg</th></tr>
                </thead>
                <tbody>
                  {Object.entries(result.byLocation).map(([loc, v]) => (
                    <tr key={loc}>
                      <td>{loc}</td>
                      <td>{v.rows.toLocaleString("en-IN")}</td>
                      <td>{fmtKg(v.kgs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* A sheet uploaded from the Savla card can legitimately contain
                  Rishi rows — the source report is combined. Say so plainly
                  rather than letting it look like a mistake. */}
              {warehouse && result.locations.some((l) => l !== warehouse) && (
                <div className="srud-note srud-note-info">
                  <AlertTriangle className="srud-note-icon" />
                  <p className="srud-note-text">
                    This sheet also contained rows for{" "}
                    {result.locations.filter((l) => l !== warehouse).join(", ")}. They were
                    imported too — the source report covers both stores.
                  </p>
                </div>
              )}

              {result.invalid > 0 && (
                <div className="srud-note srud-note-error">
                  <XCircle className="srud-note-icon" />
                  <div className="srud-note-grow">
                    <p className="srud-note-title">
                      {result.invalid} row{result.invalid === 1 ? "" : "s"} could not be imported
                    </p>
                    <ul className="srud-error-list">
                      {result.errorDetails.slice(0, 10).map((e, i) => (
                        <li key={i}>
                          <span className="srud-error-row">Row {e.row}</span> {e.reason}
                        </li>
                      ))}
                      {result.truncatedErrors > 0 && (
                        <li className="srud-error-more">…and {result.truncatedErrors} more</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {result.warnings.length > 0 && (
                <details className="srud-warnings">
                  <summary>
                    {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
                  </summary>
                  <ul>
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    {result.truncatedWarnings > 0 && <li>…and {result.truncatedWarnings} more</li>}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="srud-footer">
          <Button variant="outline" onClick={handleClose} disabled={busy}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={doUpload} disabled={!file || busy} className="srud-submit">
              {busy ? (
                <><Loader className="srud-spin" /> Uploading…</>
              ) : (
                <><Upload className="srud-btn-icon" /> Upload</>
              )}
            </Button>
          )}
          {result && (
            <Button
              variant="outline"
              onClick={() => { setResult(null); setFile(null); setReportDate(""); }}
            >
              Upload another
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
