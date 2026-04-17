import { useState, useEffect } from "react";
import { X } from "lucide-react";

const LEGEND_ITEMS = [
  {
    color: "#3B6D11",
    bg: "#EAF3DE",
    border: "#3B6D11",
    label: "Verified",
    desc: "Entry has been reviewed and confirmed by the manager.",
  },
  {
    color: "#B35800",
    bg: "#FAEEDA",
    border: "#B35800",
    label: "Amended",
    desc: "Entry was edited after initial submission — tap ▲ to see the change log.",
  },
  {
    color: "#6B7280",
    bg: "#F3F4F6",
    border: "#6B7280",
    label: "Unverified",
    desc: "Entry is pending review by the manager.",
  },
];

const STOCK_ITEMS = [
  {
    color: "#3B6D11",
    bg: "#EAF3DE",
    label: "Fresh Stock",
    desc: "Standard / prime-quality inventory.",
  },
  {
    color: "#633806",
    bg: "#FAEEDA",
    label: "Off Grade / Rejection",
    desc: "Sub-standard or rejected material tracked separately.",
  },
];

export function ColorLegend() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Fixed trigger button */}
      <button
        className="color-legend-trigger"
        onClick={() => setOpen(true)}
        aria-label="Color guide"
        title="Color guide"
        data-chip
      >
        ?
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel — bottom sheet on mobile, popover on desktop */}
      {open && (
        <div
          className={
            isMobile
              ? "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background border-t border-border shadow-2xl"
              : "fixed bottom-20 right-4 z-50 w-80 rounded-xl bg-background border border-border shadow-2xl"
          }
          style={{ maxHeight: isMobile ? "85vh" : "auto", overflowY: "auto" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
            <h3 className="font-semibold text-base text-foreground">Color Guide</h3>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
              aria-label="Close"
              data-chip
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* Verification states */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Entry Status (left bar)
              </p>
              <div className="space-y-2">
                {LEGEND_ITEMS.map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div
                      className="shrink-0 mt-0.5 rounded"
                      style={{
                        width: 4,
                        height: 40,
                        background: item.color,
                      }}
                    />
                    <div
                      className="flex-1 rounded-lg px-3 py-2"
                      style={{ background: item.bg }}
                    >
                      <p
                        className="text-sm font-semibold"
                        style={{ color: item.color }}
                      >
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stock types */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Stock Type (pill badge)
              </p>
              <div className="space-y-2">
                {STOCK_ITEMS.map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div
                      className="shrink-0 mt-1 w-3 h-3 rounded-full"
                      style={{ background: item.color }}
                    />
                    <div>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: item.bg, color: item.color }}
                      >
                        {item.label}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile drag handle */}
          {isMobile && (
            <div className="flex justify-center pb-3">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
