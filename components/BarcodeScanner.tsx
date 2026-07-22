/**
 * BarcodeScanner.tsx
 * QR code scanner modal using html5-qrcode.
 *
 * QR code format expected:  {"box_id":"...","txn_no":"..."}
 *
 * On a successful scan it calls the backend /api/boxes/lookup endpoint
 * and returns the resolved item details to the parent via onScanResult.
 *
 * Also supports manual box_id + txn_no entry as a fallback.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, QrCode, Keyboard, Loader, AlertCircle, CheckCircle2, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { boxesAPI } from "@/utils/api";

export interface IMSItemResult {
  barcode: string;   // box_id used as unique key (kept for AddItem.tsx compat)
  boxId: string;
  txnNo: string;
  itemName: string;
  itemType: "FG" | "RM" | "PM" | string;
  category: string;
  subcategory: string;
  /** Net weight per unit/box in kg */
  unitUom: number;
  source?: "CDPL" | "CFPL";
}

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScanResult: (result: IMSItemResult) => void;
  /** When true, render inline in the page flow (no dark backdrop / bottom sheet). */
  inline?: boolean;
}

type ScanMode = "camera" | "manual";
type ScanState = "idle" | "scanning" | "loading" | "success" | "error";

const SCANNER_ID = "qr-scanner-viewport";

export default function BarcodeScanner({ open, onClose, onScanResult, inline = false }: BarcodeScannerProps) {
  const [mode, setMode]             = useState<ScanMode>("camera");
  const [scanState, setScanState]   = useState<ScanState>("idle");
  const [manualBoxId, setManualBoxId] = useState("");
  const [manualTxnNo, setManualTxnNo] = useState("");
  const [errorMsg, setErrorMsg]     = useState("");
  const [lastScanned, setLastScanned] = useState<IMSItemResult | null>(null);
  const [cameraPermission, setCameraPermission] = useState<"unknown" | "granted" | "denied">("unknown");

  const scannerRef         = useRef<any>(null);
  const scannerStartedRef  = useRef(false);
  const processingRef      = useRef(false); // prevent double-scan
  const startGenRef        = useRef(0);     // invalidates in-flight start() calls

  // ── Parse QR JSON and call backend ──────────────────────────────
  const lookupFromQrData = useCallback(async (rawQrText: string): Promise<IMSItemResult> => {
    let boxId = "";
    let txnNo = "";

    // Try to parse JSON first: {"box_id":"...","txn_no":"..."}
    try {
      const parsed = JSON.parse(rawQrText);
      boxId = (parsed.bi || parsed.box_id || parsed.boxId || parsed.BOX_ID || "").toString().trim();
      txnNo = (parsed.tx || parsed.txn_no || parsed.txnNo || parsed.TXN_NO || parsed.transaction_no || "").toString().trim();
    } catch {
      // Not JSON — try pipe-separated "box_id|txn_no" as fallback
      const parts = rawQrText.split("|");
      if (parts.length >= 2) {
        boxId = parts[0].trim();
        txnNo = parts[1].trim();
      } else {
        // Treat the whole string as box_id only
        boxId = rawQrText.trim();
      }
    }

    if (!boxId) throw new Error("QR code does not contain a box_id. Check the QR code format.");

    const data = await boxesAPI.lookup(boxId, txnNo);
    return {
      barcode:     data.boxId, // compat alias
      boxId:       data.boxId,
      txnNo:       data.txnNo,
      itemName:    data.itemName,
      itemType:    data.itemType,
      category:    data.category,
      subcategory: data.subcategory,
      unitUom:     data.unitUom,
      source:      data.source,
    };
  }, []);

  // ── Central scan handler ─────────────────────────────────────────
  const handleQrDecoded = useCallback(async (rawText: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setScanState("loading");
    setErrorMsg("");
    try {
      const result = await lookupFromQrData(rawText);
      setLastScanned(result);
      setScanState("success");
      setTimeout(() => {
        onScanResult(result);
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || "Could not look up box in database.");
      setScanState("error");
      // Allow retry
      if (scannerRef.current && scannerStartedRef.current) {
        try { scannerRef.current.resume(); } catch {}
      }
    } finally {
      processingRef.current = false;
    }
  }, [lookupFromQrData, onScanResult, onClose]);

  // Keep the latest decode handler in a ref so the camera lifecycle effect below
  // does NOT depend on its identity — otherwise every parent re-render (unstable
  // onScanResult/onClose props) would tear down and restart the live camera.
  const handleQrDecodedRef = useRef(handleQrDecoded);
  useEffect(() => { handleQrDecodedRef.current = handleQrDecoded; }, [handleQrDecoded]);

  // ── Start camera scanner ─────────────────────────────────────────
  const startScanner = useCallback(async () => {
    if (scannerStartedRef.current) return;
    const gen = ++startGenRef.current; // this start's generation
    setScanState("scanning");
    setErrorMsg("");
    processingRef.current = false;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (gen !== startGenRef.current) return; // torn down during dynamic import
      const html5QrCode = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          html5QrCode.pause(true); // pause to avoid repeated triggers
          handleQrDecodedRef.current(decodedText);
        },
        () => { /* not-found — fires every frame, ignore */ }
      );
      scannerStartedRef.current = true;

      // If the scanner was closed while start() was still in flight, the camera
      // would otherwise stay live with no UI — stop this just-started stream now.
      if (gen !== startGenRef.current) {
        try { await html5QrCode.stop(); } catch {}
        try { html5QrCode.clear(); } catch {}
        scannerRef.current = null;
        scannerStartedRef.current = false;
        return;
      }
      setCameraPermission("granted");
    } catch (err: any) {
      const msg = String(err.message || err);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("notallowed")) {
        setCameraPermission("denied");
        setErrorMsg("Camera permission denied. Use manual entry below.");
      } else {
        setErrorMsg("Could not start camera. Try manual entry.");
      }
      setScanState("idle");
      setMode("manual");
    }
  }, []);

  // ── Stop camera scanner ──────────────────────────────────────────
  const stopScanner = useCallback(async () => {
    startGenRef.current++; // invalidate any start() still in flight
    const inst = scannerRef.current;
    scannerRef.current = null;
    scannerStartedRef.current = false;
    if (!inst) return;
    try { await inst.stop(); } catch {}  // stop() rejects if not yet running — ignore
    try { inst.clear(); } catch {}
  }, []);

  // ── Mount/unmount effect ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (mode === "camera") {
      const t = setTimeout(() => startScanner(), 150);
      return () => { clearTimeout(t); stopScanner(); };
    }
    return () => { stopScanner(); };
  }, [open, mode, startScanner, stopScanner]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      stopScanner();
      setScanState("idle");
      setErrorMsg("");
      setManualBoxId("");
      setManualTxnNo("");
      setLastScanned(null);
      processingRef.current = false;
    }
  }, [open, stopScanner]);

  // ── Switch mode ──────────────────────────────────────────────────
  const switchMode = async (newMode: ScanMode) => {
    await stopScanner();
    setScanState("idle");
    setErrorMsg("");
    setMode(newMode);
  };

  // ── Manual submit ────────────────────────────────────────────────
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBoxId.trim()) return;
    await handleQrDecoded(
      JSON.stringify({ box_id: manualBoxId.trim(), txn_no: manualTxnNo.trim() })
    );
  };

  // ── Retry camera ─────────────────────────────────────────────────
  const handleRetry = async () => {
    await stopScanner();
    scannerStartedRef.current = false;
    setScanState("idle");
    setErrorMsg("");
    setMode("camera");
    setTimeout(() => startScanner(), 200);
  };

  if (!open) return null;

  const isLoading = scanState === "loading";

  // Inner panel — identical markup for inline and overlay; only the wrapper differs.
  const panel = (
      <div
        className={
          inline
            ? "relative w-full bg-background rounded-2xl border border-border shadow-lg overflow-hidden"
            : "relative w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        }
        style={inline ? undefined : { maxHeight: "92dvh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border" style={{ background: "#111827" }}>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-white text-base">Scan Box QR Code</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#1E3A8A", color: "#93C5FD" }}>
              CDPL / CFPL
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-300" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex border-b border-border">
          <button
            onClick={() => switchMode("camera")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mode === "camera" ? "border-b-2 border-primary text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <QrCode className="w-4 h-4" />
            Camera Scan
          </button>
          <button
            onClick={() => switchMode("manual")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mode === "manual" ? "border-b-2 border-primary text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Keyboard className="w-4 h-4" />
            Manual Entry
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(92dvh - 130px)" }}>

          {/* ── CAMERA MODE ── */}
          {mode === "camera" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                Point camera at the QR code printed on the box label
              </p>

              {/* html5-qrcode mounts here */}
              <div
                id={SCANNER_ID}
                className="relative mx-auto rounded-xl overflow-hidden bg-black"
                style={{ width: "100%", minHeight: 240 }}
              />

              {scanState === "scanning" && (
                <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Scanning for QR code…
                </div>
              )}
              {scanState === "loading" && (
                <div className="flex items-center justify-center gap-2 text-sm text-amber-600">
                  <Loader className="w-4 h-4 animate-spin" />
                  Looking up box in database…
                </div>
              )}
              {scanState === "success" && lastScanned && (
                <SuccessCard result={lastScanned} />
              )}
              {cameraPermission === "denied" && (
                <AlertBanner msg="Camera permission denied. Please enable camera access in browser settings, or use Manual Entry." />
              )}
              {errorMsg && scanState === "error" && (
                <div className="space-y-2">
                  <AlertBanner msg={errorMsg} />
                  <Button variant="outline" size="sm" onClick={handleRetry} className="w-full">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Retry Camera
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── MANUAL MODE ── */}
          {mode === "manual" && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-box-id" className="font-semibold">
                  Box ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="manual-box-id"
                  type="text"
                  placeholder="e.g. 07049856-1"
                  value={manualBoxId}
                  onChange={(e) => setManualBoxId(e.target.value)}
                  autoFocus
                  disabled={isLoading}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-txn-no" className="font-semibold">
                  Transaction No
                </Label>
                <Input
                  id="manual-txn-no"
                  type="text"
                  placeholder="e.g. TR-20260225133247"
                  value={manualTxnNo}
                  onChange={(e) => setManualTxnNo(e.target.value)}
                  disabled={isLoading}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Optional — helps disambiguate when multiple transactions share a box ID.</p>
              </div>

              {errorMsg && <AlertBanner msg={errorMsg} />}
              {scanState === "success" && lastScanned && <SuccessCard result={lastScanned} />}

              <Button type="submit" className="w-full" disabled={!manualBoxId.trim() || isLoading}>
                {isLoading ? (
                  <><Loader className="w-4 h-4 mr-2 animate-spin" />Looking up…</>
                ) : (
                  <><QrCode className="w-4 h-4 mr-2" />Lookup Box</>
                )}
              </Button>
            </form>
          )}

          {/* Info strip */}
          <div className="rounded-lg p-3 text-xs text-muted-foreground space-y-1" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <p className="font-semibold text-foreground">Auto-filled from box QR code:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>Item name / article description</li>
              <li>Item type (FG / RM / PM)</li>
              <li>Category &amp; Sub-category</li>
              <li>Net weight per box (UOM in kg)</li>
            </ul>
            <p className="mt-1 text-amber-600 dark:text-amber-400">
              You will still confirm quantity &amp; stock type before saving.
            </p>
          </div>
        </div>
      </div>
  );

  // Inline mode: render the panel directly in the form flow (no backdrop / bottom sheet).
  if (inline) return panel;

  // Overlay mode (default): dark backdrop + bottom-sheet on mobile, centered on desktop.
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.78)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {panel}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function SuccessCard({ result }: { result: IMSItemResult }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
      <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-semibold text-green-800 dark:text-green-200 break-words">{result.itemName}</p>
        <p className="text-green-700 dark:text-green-300 text-xs mt-0.5">
          {result.itemType}
          {result.category ? ` · ${result.category}` : ""}
          {result.subcategory ? ` · ${result.subcategory}` : ""}
          {result.unitUom ? ` · ${result.unitUom} kg/box` : ""}
        </p>
        <p className="text-green-600 dark:text-green-400 text-xs mt-0.5 font-mono">
          Box: {result.boxId}
          {result.source ? ` (${result.source})` : ""}
        </p>
      </div>
    </div>
  );
}

function AlertBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}
