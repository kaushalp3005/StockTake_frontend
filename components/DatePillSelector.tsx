import { useState, useRef, useCallback, useMemo, useEffect } from "react";

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

/** Today as YYYY-MM-DD in local time. Exported so pages can seed their date
 *  filter with today without re-deriving the (timezone-sensitive) format. */
export function todayStr(): string {
  return toDateStr(new Date());
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
  // YYYY-MM of the month chip currently narrowing the pill row, or null for all
  // months. Purely a view filter — it never touches selectedDates. Defaults to
  // the latest month once entryDates load (see the effect below).
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  // Set once the user picks a month (or a quick chip clears the narrowing), so
  // the default below stops overriding their choice.
  const monthTouchedRef = useRef(false);
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

  // Default the row to the most recent month that has entries. entryDates
  // arrive asynchronously, so this can't be a useState initializer — months is
  // empty on the first render. entryDates is sorted ascending, so the last
  // month in the list is the latest.
  useEffect(() => {
    if (monthTouchedRef.current || months.length === 0) return;
    setActiveMonth(months[months.length - 1].key);
  }, [months]);

  // Dates actually rendered as pills. Range/month math below still reads the
  // full entryDates, so narrowing the view never changes what a click selects.
  const visibleDates = useMemo(
    () => (activeMonth ? entryDates.filter((d) => d.startsWith(activeMonth)) : entryDates),
    [entryDates, activeMonth]
  );

  // ── Quick chip actions ──────────────────────────────────────────────────────
  const applyChip = useCallback(
    (chip: string) => {
      const t = today;
      const now = new Date();
      const [ty, tm] = [now.getFullYear(), now.getMonth() + 1];

      let dates: string[] = [];

      if (chip === "Today") {
        // Always select today, even with no entries yet — matches the default
        // filter, so this chip is the way back to the today-only view.
        dates = [t];
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
      // Drop any month narrowing, otherwise a chip can select dates that are
      // hidden behind it and the pill row looks unresponsive.
      monthTouchedRef.current = true;
      setActiveMonth(null);
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

  // ── Month filter ────────────────────────────────────────────────────────────
  // Narrows the pill row to one month. Tapping the active month again clears the
  // narrowing — that re-tap is the only way back to all months. Selection is
  // deliberately untouched; in Month mode you still select a whole month by
  // tapping any date pill inside it.
  const toggleMonth = useCallback(
    (monthKey: string, firstDate: string) => {
      const next = activeMonth === monthKey ? null : monthKey;
      monthTouchedRef.current = true;
      setActiveMonth(next);

      // Re-position after the row re-renders with the new set of pills.
      requestAnimationFrame(() => {
        const row = pillRowRef.current;
        if (!row) return;
        if (next) {
          row.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          row
            .querySelector<HTMLElement>(`[data-date="${firstDate}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        }
      });
    },
    [activeMonth]
  );

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setRangeStart(null);
    onChange([]);
    setActiveChip(null);
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
              const isActive = activeMonth === key;
              return (
                <button
                  key={key}
                  onClick={() => toggleMonth(key, firstDate)}
                  aria-pressed={isActive}
                  title={isActive ? `Showing ${label} only — tap to show all months` : `Show only ${label}`}
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
          {["Today", "This week", "This month", "Last 7 days"].map((chip) => (
            <button
              key={chip}
              onClick={() => applyChip(chip)}
              style={{ touchAction: "manipulation", minHeight: 28 }}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap border transition-all duration-150 ${
                activeChip === chip
                  ? "bg-[#185FA5] text-white border-[#185FA5]"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#185FA5] hover:text-[#185FA5]"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* ── Row 3: Date pills ─────────────────────────────────────────────── */}
      <div
        ref={pillRowRef}
        className="overflow-x-auto pb-3 pt-2.5 px-3"
        style={{ WebkitOverflowScrolling: "touch", scrollSnapType: "x proximity" }}
      >
        <div className="flex gap-2 w-max">
          {visibleDates.map((dateStr) => {
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

      <style>{`
        /* hide scrollbar but keep scrollable */
        .overflow-x-auto::-webkit-scrollbar { display: none; }
        .overflow-x-auto { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
