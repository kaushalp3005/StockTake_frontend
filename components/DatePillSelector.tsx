import { useState, useRef, useCallback, useMemo } from "react";
import { X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode = "multi" | "range" | "month";

interface DatePillSelectorProps {
  /** Sorted array of YYYY-MM-DD strings that have at least one entry */
  entryDates: string[];
  selectedDates: string[];
  onChange: (dates: string[]) => void;
  loading?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return toDateStr(new Date());
}

function formatDisplayDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_ABBR[d.getMonth()]}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DatePillSelector({
  entryDates,
  selectedDates,
  onChange,
  loading,
}: DatePillSelectorProps) {
  const [mode, setMode] = useState<Mode>("multi");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const pillRowRef = useRef<HTMLDivElement>(null);
  const today = todayStr();

  // Unique months extracted from entryDates
  const months = useMemo(() => {
    const seen = new Set<string>();
    const result: { key: string; label: string; firstDate: string }[] = [];
    for (const d of entryDates) {
      const key = d.slice(0, 7); // YYYY-MM
      if (!seen.has(key)) {
        seen.add(key);
        const monthIdx = parseInt(d.slice(5, 7), 10) - 1;
        result.push({ key, label: MONTH_ABBR[monthIdx], firstDate: d });
      }
    }
    return result;
  }, [entryDates]);

  // ── Quick chip actions ──────────────────────────────────────────────────────
  const applyChip = useCallback(
    (chip: string) => {
      const t = today;
      const now = new Date();
      const [ty, tm] = [now.getFullYear(), now.getMonth() + 1];

      let dates: string[] = [];

      if (chip === "Today") {
        dates = entryDates.filter((d) => d === t);
      } else if (chip === "This week") {
        const sun = new Date(now);
        sun.setDate(now.getDate() - now.getDay());
        const sat = new Date(now);
        sat.setDate(now.getDate() + (6 - now.getDay()));
        const sw = toDateStr(sun);
        const ew = toDateStr(sat);
        dates = entryDates.filter((d) => d >= sw && d <= ew);
      } else if (chip === "This month") {
        const monthKey = `${ty}-${String(tm).padStart(2, "0")}`;
        dates = entryDates.filter((d) => d.startsWith(monthKey));
      } else if (chip === "Last 7 days") {
        const d7 = new Date(now);
        d7.setDate(now.getDate() - 6);
        const from7 = toDateStr(d7);
        dates = entryDates.filter((d) => d >= from7 && d <= t);
      }

      setActiveChip(dates.length > 0 ? chip : null);
      setMode("multi");
      setRangeStart(null);
      onChange(dates);
    },
    [entryDates, today, onChange]
  );

  // ── Pill click handler ──────────────────────────────────────────────────────
  const handlePillClick = useCallback(
    (dateStr: string) => {
      setActiveChip(null);

      if (mode === "multi") {
        const isSelected = selectedDates.includes(dateStr);
        onChange(
          isSelected
            ? selectedDates.filter((d) => d !== dateStr)
            : [...selectedDates, dateStr].sort()
        );
      } else if (mode === "range") {
        if (!rangeStart) {
          setRangeStart(dateStr);
          onChange([dateStr]);
        } else if (rangeStart === dateStr) {
          setRangeStart(null);
          onChange([]);
        } else {
          const start = rangeStart < dateStr ? rangeStart : dateStr;
          const end = rangeStart < dateStr ? dateStr : rangeStart;
          const inRange = entryDates.filter((d) => d >= start && d <= end);
          setRangeStart(null);
          onChange(inRange);
        }
      } else if (mode === "month") {
        const monthKey = dateStr.slice(0, 7);
        const monthDates = entryDates.filter((d) => d.startsWith(monthKey));
        onChange(monthDates);
      }
    },
    [mode, selectedDates, rangeStart, entryDates, onChange]
  );

  // ── Month jump ──────────────────────────────────────────────────────────────
  const scrollToMonth = useCallback((firstDate: string) => {
    if (!pillRowRef.current) return;
    const el = pillRowRef.current.querySelector<HTMLElement>(
      `[data-date="${firstDate}"]`
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });

    // In Month mode, also select all dates for that month
    if (mode === "month") {
      const monthKey = firstDate.slice(0, 7);
      const monthDates = entryDates.filter((d) => d.startsWith(monthKey));
      setActiveChip(null);
      onChange(monthDates);
    }
  }, [mode, entryDates, onChange]);

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setRangeStart(null);
    onChange([]);
    setActiveChip(null);
  };

  // ── Active filter bar ───────────────────────────────────────────────────────
  const removeDate = (dateStr: string) => {
    setActiveChip(null);
    onChange(selectedDates.filter((d) => d !== dateStr));
  };

  const clearAll = () => {
    onChange([]);
    setActiveChip(null);
    setRangeStart(null);
  };

  // ── Pill visual state ───────────────────────────────────────────────────────
  const getPillStyle = (dateStr: string): { bg: string; text: string; border: string; opacity?: number } => {
    const isSelected = selectedDates.includes(dateStr);

    if (!isSelected) {
      // In range mode with a rangeStart chosen but end not yet picked — dim all others
      if (mode === "range" && rangeStart && rangeStart !== dateStr) {
        return { bg: "#F4F6FA", text: "#9CA3AF", border: "#E5E7EB", opacity: 0.4 };
      }
      return { bg: "#F4F6FA", text: "#374151", border: "#E5E7EB" };
    }

    // Selected — check if it's an intermediate range pill or an endpoint/solo
    const sorted = [...selectedDates].sort();
    const isEndpoint =
      dateStr === sorted[0] || dateStr === sorted[sorted.length - 1];

    if (mode === "range" && selectedDates.length > 1 && !isEndpoint) {
      return { bg: "#E6F1FB", text: "#185FA5", border: "#85B7EB" };
    }

    return { bg: "#185FA5", text: "#FFFFFF", border: "#185FA5" };
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center gap-2">
        <div className="w-4 h-4 border-2 border-[#185FA5] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-500">Loading dates…</span>
      </div>
    );
  }

  if (entryDates.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-400 text-center">
        No entry dates found — add some entries first.
      </div>
    );
  }

  const hasToday = entryDates.includes(today);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* ── Row 1: Mode toggle + Month jump chips ─────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800">
        {/* Mode toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0">
          {(["multi", "range", "month"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              style={{ touchAction: "manipulation", minHeight: 28, minWidth: 44 }}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-150 capitalize ${
                mode === m
                  ? "bg-[#185FA5] text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Month jump chips — scroll horizontally */}
        <div className="flex-1 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="flex gap-1.5 w-max">
            {months.map(({ key, label, firstDate }) => {
              const isActive = selectedDates.some((d) => d.startsWith(key));
              return (
                <button
                  key={key}
                  onClick={() => scrollToMonth(firstDate)}
                  style={{ touchAction: "manipulation", minHeight: 26 }}
                  className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full border transition-all duration-150 whitespace-nowrap ${
                    isActive
                      ? "bg-[#185FA5] text-white border-[#185FA5]"
                      : "bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-600 hover:border-[#185FA5] hover:text-[#185FA5]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 2: Quick chips ────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex gap-1.5 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {["Today", "This week", "This month", "Last 7 days"].map((chip) => {
            const disabled = chip === "Today" && !hasToday;
            return (
              <button
                key={chip}
                onClick={() => !disabled && applyChip(chip)}
                disabled={disabled}
                style={{ touchAction: "manipulation", minHeight: 28 }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap border transition-all duration-150 ${
                  disabled
                    ? "opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700"
                    : activeChip === chip
                    ? "bg-[#185FA5] text-white border-[#185FA5]"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#185FA5] hover:text-[#185FA5]"
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Row 3: Date pills ─────────────────────────────────────────────── */}
      <div
        ref={pillRowRef}
        className="overflow-x-auto pb-3 pt-2.5 px-3"
        style={{ WebkitOverflowScrolling: "touch", scrollSnapType: "x proximity" }}
      >
        <div className="flex gap-2 w-max">
          {entryDates.map((dateStr) => {
            const d = parseLocalDate(dateStr);
            const { bg, text, border, opacity } = getPillStyle(dateStr);
            return (
              <button
                key={dateStr}
                data-date={dateStr}
                onClick={() => handlePillClick(dateStr)}
                style={{
                  width: 44,
                  height: 56,
                  borderRadius: 10,
                  border: `1px solid ${border}`,
                  background: bg,
                  color: text,
                  opacity: opacity ?? 1,
                  scrollSnapAlign: "start",
                  touchAction: "manipulation",
                  transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                  flexShrink: 0,
                }}
                className="flex flex-col items-center justify-center active:scale-[0.94]"
              >
                <span style={{ fontSize: 9, fontWeight: 500, lineHeight: 1, marginBottom: 2 }}>
                  {DAY_ABBR[d.getDay()]}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
                  {d.getDate()}
                </span>
                <span
                  style={{
                    marginTop: 3,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#22C55E",
                    display: "block",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active filter bar ─────────────────────────────────────────────── */}
      {selectedDates.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #E5E7EB",
            background: "#F4F6FA",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            animation: "filterBarIn 0.2s ease forwards",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", whiteSpace: "nowrap" }}>
            Stocktake filter:
          </span>
          {selectedDates.length <= 4 ? (
            selectedDates.map((d) => (
              <span
                key={d}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "#E6F1FB",
                  color: "#0C447C",
                  border: "0.5px solid #85B7EB",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {formatDisplayDate(d)}
                <button
                  onClick={() => removeDate(d)}
                  style={{ touchAction: "manipulation", lineHeight: 1 }}
                >
                  <X size={10} />
                </button>
              </span>
            ))
          ) : (
            <span
              style={{
                padding: "2px 10px",
                borderRadius: 20,
                background: "#E6F1FB",
                color: "#0C447C",
                border: "0.5px solid #85B7EB",
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {selectedDates.length} days selected
            </span>
          )}
          <button
            onClick={clearAll}
            style={{
              fontSize: 11,
              color: "#185FA5",
              fontWeight: 500,
              textDecoration: "underline",
              touchAction: "manipulation",
              marginLeft: "auto",
              whiteSpace: "nowrap",
            }}
          >
            Clear all
          </button>
        </div>
      )}

      <style>{`
        @keyframes filterBarIn {
          from { opacity: 0; max-height: 0; }
          to   { opacity: 1; max-height: 200px; }
        }
        /* hide scrollbar but keep scrollable */
        .overflow-x-auto::-webkit-scrollbar { display: none; }
        .overflow-x-auto { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
