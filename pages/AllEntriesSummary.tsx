import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Package, Loader, Download, BarChart3 } from "lucide-react";
import { stocktakeEntriesAPI } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { DatePillSelector } from "@/components/DatePillSelector";

interface EntryRow {
  id: number;
  itemName: string;
  itemType: string;
  itemCategory: string;
  itemSubcategory: string;
  floorName: string;
  warehouse: string;
  totalQuantity: number;
  unitUom: number;
  totalWeight: number;
  enteredBy: string;
  enteredByEmail?: string;
  stockType?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  verified?: boolean;
  edits?: any[];
}

interface FloorInfo {
  sessions: { items: EntryRow[]; submittedAt?: string; authority?: string }[];
  totalWeight: number;
  totalQuantity: number;
  itemCount: number;
}

interface WarehouseData {
  [warehouseId: string]: {
    name: string;
    floors: {
      [floorId: string]: FloorInfo;
    };
    totalWeight: number;
    totalItems: number;
    totalQuantity: number;
  };
}

function isFreshStock(stockType?: string): boolean {
  return !stockType || stockType === "Fresh Stock";
}

function isOffGrade(stockType?: string): boolean {
  return stockType === "Off Grade/Rejection";
}

function AnimatedNumber({
  value,
  duration = 600,
  format = (n: number) => n.toLocaleString("en-IN"),
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    let raf = 0;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <>{format(display)}</>;
}

function KpiCard({
  label,
  value,
  suffix,
  gradient,
  textColor,
  onClick,
  format,
}: {
  label: string;
  value: number;
  suffix?: string;
  gradient: string;
  textColor: string;
  onClick?: () => void;
  format?: (n: number) => string;
}) {
  const interactive = !!onClick;
  return (
    <Card
      onClick={onClick}
      className={`p-4 sm:p-6 ${gradient} transition-all duration-150 ${
        interactive ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
      }`}
    >
      <p className="text-xs sm:text-sm text-muted-foreground mb-2">{label}</p>
      <p className={`text-3xl sm:text-4xl font-bold ${textColor}`}>
        <AnimatedNumber
          value={value}
          format={format ?? ((n) => Math.round(n).toLocaleString("en-IN"))}
        />
        {suffix && <span className="text-lg font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
    </Card>
  );
}

type TabKey = "overview" | "warehouses" | "categories" | "ai";

function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "warehouses", label: "Warehouses" },
    { key: "categories", label: "Categories" },
    { key: "ai", label: "AI Insights" },
  ];
  return (
    <div className="border-b border-border mb-6 sm:mb-8 -mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto">
      <div className="flex gap-1 sm:gap-2 min-w-max">
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={`relative px-4 py-3 text-sm sm:text-base font-medium whitespace-nowrap transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`absolute left-2 right-2 -bottom-px h-0.5 rounded-full transition-all duration-200 ${
                  isActive ? "bg-primary opacity-100" : "bg-transparent opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AllEntriesSummary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [warehouseData, setWarehouseData] = useState<WarehouseData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [allEntries, setAllEntries] = useState<EntryRow[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // I4 chart interaction state
  const [i4SortMode, setI4SortMode] = useState<'weight' | 'count'>('weight');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [excludedFloors, setExcludedFloors] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehouseSort, setWarehouseSort] = useState<"weight" | "items" | "name">("weight");
  const [aiHasLoaded, setAiHasLoaded] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [filterBarStuck, setFilterBarStuck] = useState(false);

  const toggleFloor = (key: string) => {
    setExcludedFloors(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Auth check — only managers/admins may view this page
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const u = JSON.parse(userStr);
      const allowed = ["INVENTORY_MANAGER", "SUPERUSER", "ADMIN"];
      if (!allowed.includes(u.role)) {
        navigate("/dashboard");
      }
    }
  }, [navigate]);

  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 800);
      setFilterBarStuck(window.scrollY > 220);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Fetch available dates for the pill selector
    const fetchDates = async () => {
      setLoadingDates(true);
      try {
        const response = await stocktakeEntriesAPI.getAvailableDates();
        if (response?.dates && response.dates.length > 0) {
          const sorted: string[] = response.dates
            .map((d: { date: string }) => d.date)
            .sort(); // ascending for DatePillSelector
          setAvailableDates(sorted);
          // Default to last 3 available dates (most recent)
          setSelectedDates(sorted.slice(-3));
        }
      } catch (err) {
        console.error("Error fetching available dates:", err);
      } finally {
        setLoadingDates(false);
      }
    };

    const fetchEntries = async () => {
      setIsLoading(true);
      try {
        // Fetch all submitted (non-draft) entries — no limit param = backend returns all
        const response = await stocktakeEntriesAPI.getEntries({});
        const entries: EntryRow[] = (response?.entries || []).filter(
          (e: EntryRow) => e.status !== "draft"
        );
        setAllEntries(entries);
        organizeEntries(entries, selectedDates);
      } catch (err: any) {
        console.error("Failed to load entries:", err);
        toast({
          title: "Load failed",
          description: err.message || "Unable to load entries",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchDates();
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-organize when date filter changes (uses already-fetched entries)
  useEffect(() => {
    organizeEntries(allEntries, selectedDates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDates, allEntries]);

  const organizeEntries = (entries: EntryRow[], dateFilter: string | string[]) => {
    const dates = Array.isArray(dateFilter) ? dateFilter : (dateFilter ? [dateFilter] : []);
    const filtered = entries.filter((e) => {
      if (dates.length === 0) return true;
      const d = (e.createdAt || "").split("T")[0];
      return dates.includes(d);
    });

    const organized: WarehouseData = {};

    filtered.forEach((entry) => {
      const warehouseId = entry.warehouse || "Unknown";
      const floorId = (entry.floorName || "Unknown").toUpperCase();

      if (!organized[warehouseId]) {
        organized[warehouseId] = {
          name: warehouseId,
          floors: {},
          totalWeight: 0,
          totalQuantity: 0,
          totalItems: 0,
        };
      }

      if (!organized[warehouseId].floors[floorId]) {
        organized[warehouseId].floors[floorId] = {
          sessions: [],
          totalWeight: 0,
          totalQuantity: 0,
          itemCount: 0,
        };
      }

      const flr = organized[warehouseId].floors[floorId];
      flr.itemCount += 1;
      flr.totalWeight += Number(entry.totalWeight) || 0;
      flr.totalQuantity += Number(entry.totalQuantity) || 0;

      organized[warehouseId].totalWeight += Number(entry.totalWeight) || 0;
      organized[warehouseId].totalQuantity += Number(entry.totalQuantity) || 0;
      organized[warehouseId].totalItems += 1;

      // Group entries by submitter+date for the "sessions" concept
      const sessionKey = `${entry.enteredBy}-${(entry.createdAt || "").split("T")[0]}`;
      let sess = flr.sessions.find((s: any) => s._key === sessionKey);
      if (!sess) {
        sess = { _key: sessionKey, items: [], submittedAt: entry.createdAt, authority: entry.enteredBy } as any;
        flr.sessions.push(sess as any);
      }
      (sess as any).items.push(entry);
    });

    setWarehouseData(organized);
  };

  const handleGenerateAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);
    try {
      const topItems = [...filteredEntries]
        .reduce((acc: { name: string; weight: number }[], e) => {
          const existing = acc.find((i) => i.name === e.itemName);
          if (existing) {
            existing.weight += Number(e.totalWeight) || 0;
          } else {
            acc.push({ name: e.itemName || "Unknown", weight: Number(e.totalWeight) || 0 });
          }
          return acc;
        }, [])
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5);

      const verifiedPct = totalGrandItems > 0 ? (verifiedCount / totalGrandItems) * 100 : 0;

      const payload = {
        totalEntries: totalGrandItems,
        totalWeight: totalGrandWeight,
        verifiedPct,
        floorsCovered: totalFloorsCovered,
        topItems,
        freshWeight: totalFreshWeight,
        offgradeWeight: totalOffGradeWeight,
        dateFilter: selectedDates.length > 0 ? selectedDates.join(",") : null,
      };

      const response = await fetch("/.netlify/functions/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setAiError(data.error || "Request failed");
      } else {
        setAiAnalysis(data.analysis || "No analysis generated.");
      }
    } catch (err: any) {
      setAiError(err.message || "Unknown error");
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "ai" && !aiHasLoaded && !aiAnalysis && !aiLoading && filteredEntries.length > 0) {
      setAiHasLoaded(true);
      handleGenerateAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, aiHasLoaded, aiAnalysis, aiLoading]);

  const handleExportToExcel = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();

      const entries = allEntries.filter((e) => {
        if (selectedDates.length === 0) return true;
        return selectedDates.includes((e.createdAt || "").split("T")[0]);
      });

      const itemMap = new Map<string, Map<string, number>>();
      const floors = new Set<string>();

      entries.forEach((entry) => {
        const floorLabel = (entry.floorName || "Unknown").toUpperCase();
        floors.add(floorLabel);
        const itemKey = `${entry.itemCategory}:::${entry.itemSubcategory}:::${entry.itemName}:::${entry.itemType}`;
        if (!itemMap.has(itemKey)) itemMap.set(itemKey, new Map());
        const current = itemMap.get(itemKey)!.get(floorLabel) || 0;
        itemMap.get(itemKey)!.set(floorLabel, current + (Number(entry.totalWeight) || 0));
      });

      const worksheet = workbook.addWorksheet("Stock Count");
      const headers = ["Category", "Sub-Category", "Description", "Item Type", ...Array.from(floors).sort()];

      const companyRow = worksheet.addRow(["Company: Candor Foods Pvt. Ltd"]);
      companyRow.font = { bold: true, size: 14 };
      worksheet.mergeCells(1, 1, 1, headers.length);
      worksheet.addRow([]);
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };

      Array.from(itemMap.entries()).forEach(([itemKey, floorData]) => {
        const [category, subcategory, description, itemType] = itemKey.split(":::");
        const row = [category, subcategory, description, itemType || "—"];
        Array.from(floors).sort().forEach((floor) => {
          const weight = floorData.get(floor) || 0;
          row.push(weight > 0 ? weight.toFixed(2) : "-");
        });
        worksheet.addRow(row);
      });

      const totalRow = ["TOTAL", "", "", ""];
      Array.from(floors).sort().forEach((floor) => {
        let total = 0;
        itemMap.forEach((fd) => { total += fd.get(floor) || 0; });
        totalRow.push(total.toFixed(2));
      });
      const totalRowObj = worksheet.addRow(totalRow);
      totalRowObj.font = { bold: true };
      totalRowObj.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

      worksheet.columns.forEach((col) => { col.width = 15; });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Stock_Count_${selectedDates.length > 0 ? selectedDates.join("_") : new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export:", err);
      alert("Failed to export to Excel");
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <nav style={{ background: "#111827", minHeight: 52 }} className="sticky top-0 z-50 flex items-center justify-between px-3 sm:px-5 sm:min-h-[56px]">
          <div className="flex items-center gap-2">
            <div style={{ background: "#185FA5", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Package className="w-4 h-4 text-white" />
            </div>
            <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 16 }}>StockTake</span>
          </div>
        </nav>
        <div className="container py-4 sm:py-8 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
            <div className="h-10 w-2/3 bg-muted rounded" />
            <div className="h-6 w-1/3 bg-muted rounded" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted rounded-xl" />
              ))}
            </div>
            <div className="h-44 bg-muted rounded-xl" />
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // ── Derived grand totals
  const totalGrandWeight = Object.values(warehouseData).reduce((s, w) => s + w.totalWeight, 0);
  const totalGrandQuantity = Object.values(warehouseData).reduce((s, w) => s + w.totalQuantity, 0);
  const totalGrandItems = Object.values(warehouseData).reduce((s, w) => s + w.totalItems, 0);
  const totalFloorsCovered = Object.values(warehouseData).reduce((s, w) => s + Object.keys(w.floors).length, 0);

  // I5 – fresh vs off-grade
  const filteredEntries = allEntries.filter((e) => selectedDates.length === 0 || selectedDates.includes((e.createdAt || "").split("T")[0]));
  const totalFreshWeight = filteredEntries.filter((e) => isFreshStock(e.stockType)).reduce((s, e) => s + (Number(e.totalWeight) || 0), 0);
  const totalOffGradeWeight = filteredEntries.filter((e) => isOffGrade(e.stockType)).reduce((s, e) => s + (Number(e.totalWeight) || 0), 0);
  const verifiedCount = filteredEntries.filter((e) => e.verified).length;

  // I4 – Top items by weight + category breakdown
  const itemWeightMap = (() => {
    const m = new Map<string, { weight: number; count: number; itemType: string }>();
    filteredEntries.forEach((e) => {
      const k = e.itemName?.toUpperCase() || 'UNKNOWN';
      const cur = m.get(k) || { weight: 0, count: 0, itemType: e.itemType || '' };
      cur.weight += Number(e.totalWeight) || 0;
      cur.count += 1;
      m.set(k, cur);
    });
    return m;
  })();

  const top10Items = Array.from(itemWeightMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => i4SortMode === 'weight' ? b.weight - a.weight : b.count - a.count)
    .slice(0, 10);

  const top10Filtered = activeCategory
    ? top10Items.filter((item) => {
        const e = filteredEntries.find((x) => x.itemName?.toUpperCase() === item.name);
        return e?.itemCategory?.toUpperCase() === activeCategory;
      })
    : top10Items;

  const i4Max = top10Filtered.length > 0
    ? Math.max(...top10Filtered.map((x) => i4SortMode === 'weight' ? x.weight : x.count))
    : 1;

  // Category breakdown for donut
  const catMap = (() => {
    const m = new Map<string, number>();
    filteredEntries.forEach((e) => {
      const k = (e.itemCategory || 'OTHER').toUpperCase();
      m.set(k, (m.get(k) || 0) + (Number(e.totalWeight) || 0));
    });
    return m;
  })();
  const catData = Array.from(catMap.entries())
    .map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight);
  const catTotal = catData.reduce((s, c) => s + c.weight, 0);
  const DONUT_COLORS = ['#185FA5','#3B6D11','#B45309','#6D28D9','#0E7490','#BE185D','#1D4ED8','#15803D','#92400E','#1E40AF'];

  // SVG donut: radius 70 outer, 44 inner, cx/cy 80
  const donutSegments = (() => {
    let cumAngle = -Math.PI / 2; // start from top
    return catData.map((c, i) => {
      const fraction = catTotal > 0 ? c.weight / catTotal : 0;
      const angle = fraction * 2 * Math.PI;
      const r = activeCategory === c.name ? 74 : 70; // outward on active
      const ri = 44;
      const x1 = 80 + r * Math.cos(cumAngle);
      const y1 = 80 + r * Math.sin(cumAngle);
      const x2 = 80 + r * Math.cos(cumAngle + angle);
      const y2 = 80 + r * Math.sin(cumAngle + angle);
      const x3 = 80 + ri * Math.cos(cumAngle + angle);
      const y3 = 80 + ri * Math.sin(cumAngle + angle);
      const x4 = 80 + ri * Math.cos(cumAngle);
      const y4 = 80 + ri * Math.sin(cumAngle);
      const largeArc = angle > Math.PI ? 1 : 0;
      const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 ${largeArc} 0 ${x4} ${y4} Z`;
      const seg = { path, color: DONUT_COLORS[i % DONUT_COLORS.length], name: c.name, weight: c.weight, fraction };
      cumAngle += angle;
      return seg;
    });
  })();

  // I5 – User activity stats
  const userStatsMap = (() => {
    const m = new Map<string, { entries: number; edits: number; lastActivity: string }>();
    filteredEntries.forEach((e) => {
      const u = e.enteredBy || 'Unknown';
      const cur = m.get(u) || { entries: 0, edits: 0, lastActivity: e.createdAt || '' };
      cur.entries += 1;
      cur.edits += Array.isArray(e.edits) ? e.edits.length : 0;
      if ((e.createdAt || '') > cur.lastActivity) cur.lastActivity = e.createdAt || '';
      m.set(u, cur);
    });
    return m;
  })();
  const userStats = Array.from(userStatsMap.entries())
    .map(([username, v]) => ({
      username,
      ...v,
      editRate: v.entries > 0 ? (v.edits / v.entries) * 100 : 0,
    }))
    .sort((a, b) => b.editRate - a.editRate);

  // I5 – Edit timeline events (20 most recent)
  const timelineEvents = (() => {
    const evts: { type: 'submission' | 'edit'; time: string; user: string; item: string }[] = [];
    filteredEntries.forEach((e) => {
      evts.push({ type: 'submission', time: e.createdAt || '', user: e.enteredBy || '', item: e.itemName || '' });
      if (Array.isArray(e.edits)) {
        e.edits.forEach((ed: any) => {
          if (ed?.editedAt) evts.push({ type: 'edit', time: ed.editedAt, user: ed.editedBy || '', item: e.itemName || '' });
        });
      }
    });
    return evts.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 20);
  })();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* H1: Dark Topbar */}
      <nav style={{ background: "#111827", minHeight: 52 }} className="sticky top-0 z-50 flex items-center justify-between px-3 sm:px-5 sm:min-h-[56px]">
        <div className="flex items-center gap-2">
          <div style={{ background: "#185FA5", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package className="w-4 h-4 text-white" />
          </div>
          <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 16 }}>StockTake</span>
        </div>
        <button onClick={() => navigate("/dashboard")} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, color: "#D1D5DB", fontSize: 12, fontWeight: 500, padding: "6px 10px", cursor: "pointer", touchAction: "manipulation", minHeight: 32 }}>
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back</span>
        </button>
      </nav>

      <div
        className={`sticky top-[52px] sm:top-[56px] z-40 bg-background/95 backdrop-blur border-b border-border transition-all duration-200 ${
          filterBarStuck ? "shadow-sm opacity-100" : "opacity-0 pointer-events-none -translate-y-2"
        }`}
        style={{ minHeight: 48 }}
      >
        <div className="container px-4 sm:px-6 py-2 flex items-center gap-3 max-w-6xl mx-auto">
          <span className="text-xs sm:text-sm font-medium text-foreground truncate">
            {totalGrandItems.toLocaleString("en-IN")} entries · {totalGrandWeight.toFixed(2)} kg
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="text-xs"
            >
              Top
            </Button>
            <Button
              size="sm"
              onClick={handleExportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
              disabled={exporting || totalGrandItems === 0}
            >
              {exporting ? <Loader className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
              Export
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-4 sm:py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2">
                All Stock Entries Summary
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground mb-3">
                Complete warehouse and floor breakdown
              </p>
              <div className="relative z-10">
                <DatePillSelector
                  entryDates={availableDates}
                  selectedDates={selectedDates}
                  onChange={(dates) => setSelectedDates(dates)}
                  loading={loadingDates}
                />
              </div>
            </div>
            <Button
              onClick={handleExportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white text-sm sm:text-base w-full sm:w-auto"
              disabled={exporting || totalGrandItems === 0}
            >
              {exporting ? (
                <><Loader className="w-4 h-4 mr-2 animate-spin" />Exporting...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Export to Excel</>
              )}
            </Button>
          </div>

          {/* ── I1 KPI Strip – 5 cards (animated, classic) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <KpiCard
              label="Warehouses"
              value={Object.keys(warehouseData).length}
              gradient="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20"
              textColor="text-primary"
              onClick={() => setActiveTab("warehouses")}
            />
            <KpiCard
              label="Total Entries"
              value={totalGrandItems}
              gradient="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20"
              textColor="text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              label="Total Weight"
              value={totalGrandWeight}
              suffix="kg"
              gradient="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20"
              textColor="text-green-600 dark:text-green-400"
              format={(n) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            />
            <KpiCard
              label="Verified"
              value={verifiedCount}
              suffix={
                totalGrandItems > 0
                  ? `(${Math.round((verifiedCount / totalGrandItems) * 100)}%)`
                  : undefined
              }
              gradient="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20"
              textColor="text-purple-600 dark:text-purple-400"
            />
            <KpiCard
              label="Floors Covered"
              value={totalFloorsCovered}
              gradient="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20"
              textColor="text-orange-600 dark:text-orange-400"
            />
          </div>

          <TabBar active={activeTab} onChange={setActiveTab} />

          {/* ── I3 Bar chart – weight by warehouse */}
          {activeTab === "overview" && Object.keys(warehouseData).length > 0 && (
            <Card className="p-4 sm:p-6 mb-6 sm:mb-8 border-border">
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-4">Weight Distribution by Warehouse</h2>
              <div className="space-y-3">
                {Object.entries(warehouseData).map(([whId, whInfo]) => {
                  const pct = totalGrandWeight > 0 ? (whInfo.totalWeight / totalGrandWeight) * 100 : 0;
                  return (
                    <div key={whId}>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground truncate mr-2">{whInfo.name}</span>
                        <span className="shrink-0">{whInfo.totalWeight.toFixed(2)} kg ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: "#3B6D11" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── I5 Fresh vs Off-Grade summary */}
          {activeTab === "overview" && Object.keys(warehouseData).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 sm:mb-8">
              <div className="rounded-xl p-4 sm:p-6" style={{ backgroundColor: "#EAF3DE" }}>
                <p className="text-xs sm:text-sm font-medium mb-1" style={{ color: "#3B6D11" }}>Fresh Stock Weight</p>
                <p className="text-2xl sm:text-3xl font-bold" style={{ color: "#3B6D11" }}>{totalFreshWeight.toFixed(2)} kg</p>
              </div>
              <div className="rounded-xl p-4 sm:p-6" style={{ backgroundColor: "#FAEEDA" }}>
                <p className="text-xs sm:text-sm font-medium mb-1" style={{ color: "#633806" }}>Off Grade / Rejection Weight</p>
                <p className="text-2xl sm:text-3xl font-bold" style={{ color: "#633806" }}>{totalOffGradeWeight.toFixed(2)} kg</p>
              </div>
            </div>
          )}

          {/* ── Warehouse Breakdown heading + search/sort */}
          {activeTab === "warehouses" && Object.keys(warehouseData).length > 0 && (
            <>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4 sm:mb-6">Warehouse Breakdown</h2>
              <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:mb-6">
                <input
                  type="text"
                  value={warehouseSearch}
                  onChange={(e) => setWarehouseSearch(e.target.value)}
                  placeholder="Search warehouse…"
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <select
                  value={warehouseSort}
                  onChange={(e) => setWarehouseSort(e.target.value as "weight" | "items" | "name")}
                  className="px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="weight">Sort: Weight ↓</option>
                  <option value="items">Sort: Items ↓</option>
                  <option value="name">Sort: Name A–Z</option>
                </select>
              </div>
            </>
          )}

          {/* ── I2 Floor breakdown table per warehouse */}
          {activeTab === "warehouses" && (Object.keys(warehouseData).length === 0 ? (
            <Card className="p-6 sm:p-12 text-center bg-muted/50">
              <BarChart3 className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-base sm:text-lg font-semibold text-foreground mb-1">No entries found</p>
              <p className="text-sm sm:text-base text-muted-foreground">
                {selectedDates.length > 0 ? `No entries for selected date${selectedDates.length > 1 ? "s" : ""}. Try clearing the date filter.` : "Floor staff need to submit stock entries first."}
              </p>
            </Card>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {Object.entries(warehouseData)
                .filter(([, info]) =>
                  warehouseSearch.trim() === ""
                    ? true
                    : info.name.toLowerCase().includes(warehouseSearch.trim().toLowerCase())
                )
                .sort(([, a], [, b]) => {
                  if (warehouseSort === "weight") return b.totalWeight - a.totalWeight;
                  if (warehouseSort === "items") return b.totalItems - a.totalItems;
                  return a.name.localeCompare(b.name);
                })
                .map(([warehouseId, warehouseInfo]) => {
                const visibleFloorTotal = Object.entries(warehouseInfo.floors).reduce((sum, [floorId, info]) => {
                  return excludedFloors.has(`${warehouseId}::${floorId}`) ? sum : sum + info.totalWeight;
                }, 0);
                const allFloorKeys = Object.keys(warehouseInfo.floors).map(f => `${warehouseId}::${f}`);
                const allExcluded = allFloorKeys.every(k => excludedFloors.has(k));
                const toggleAll = () => {
                  setExcludedFloors(prev => {
                    const next = new Set(prev);
                    if (allExcluded) {
                      allFloorKeys.forEach(k => next.delete(k));
                    } else {
                      allFloorKeys.forEach(k => next.add(k));
                    }
                    return next;
                  });
                };
                return (
                <Card key={warehouseId} className="border-border overflow-hidden">
                  <div className="p-4 sm:p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="text-xl sm:text-2xl font-bold text-foreground">{warehouseInfo.name}</h3>
                      <div className="text-left sm:text-right">
                        <p className="text-xs sm:text-sm text-muted-foreground">Total Weight (selected)</p>
                        <p className="text-xl sm:text-2xl font-bold text-primary">{visibleFloorTotal.toFixed(2)} kg</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-6 overflow-x-auto">
                    <table className="text-sm border-collapse min-w-[560px] w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="py-2 px-3 font-semibold text-foreground whitespace-nowrap text-center" style={{ width: 36 }}>
                            <input
                              type="checkbox"
                              checked={!allExcluded}
                              onChange={toggleAll}
                              className="cursor-pointer"
                              title={allExcluded ? "Select all floors" : "Deselect all floors"}
                            />
                          </th>
                          <th className="text-left py-2 px-3 font-semibold text-foreground whitespace-nowrap" style={{ minWidth: 130 }}>Floor</th>
                          <th className="text-right py-2 px-3 font-semibold text-foreground whitespace-nowrap">Entries</th>
                          <th className="text-right py-2 px-3 font-semibold text-foreground whitespace-nowrap">Fresh Weight</th>
                          <th className="text-right py-2 px-3 font-semibold text-foreground whitespace-nowrap">Off Grade Weight</th>
                          <th className="text-right py-2 px-3 font-semibold text-foreground whitespace-nowrap">Total Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(warehouseInfo.floors)
                          .sort(([a], [b]) => {
                            const na = parseInt(a); const nb = parseInt(b);
                            if (!isNaN(na) && !isNaN(nb)) return na - nb;
                            return a.localeCompare(b);
                          })
                          .map(([floorId, floorInfo]) => {
                            const floorKey = `${warehouseId}::${floorId}`;
                            const isExcluded = excludedFloors.has(floorKey);
                            const floorEntries = filteredEntries.filter(
                              (e) => e.warehouse === warehouseId && (e.floorName || "Unknown").toUpperCase() === floorId
                            );
                            const freshW = floorEntries.filter((e) => isFreshStock(e.stockType)).reduce((s, e) => s + (Number(e.totalWeight) || 0), 0);
                            const offW = floorEntries.filter((e) => isOffGrade(e.stockType)).reduce((s, e) => s + (Number(e.totalWeight) || 0), 0);

                            return (
                              <tr
                                key={floorId}
                                className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${isExcluded ? "opacity-40" : ""}`}
                                onClick={() => toggleFloor(floorKey)}
                              >
                                <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={!isExcluded}
                                    onChange={() => toggleFloor(floorKey)}
                                    className="cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 px-3 font-medium text-foreground whitespace-nowrap">{floorId}</td>
                                <td className="py-2 px-3 text-right text-muted-foreground whitespace-nowrap">{floorInfo.itemCount}</td>
                                <td className="py-2 px-3 text-right font-medium whitespace-nowrap" style={{ color: "#3B6D11" }}>{freshW.toFixed(2)} kg</td>
                                <td className="py-2 px-3 text-right font-medium whitespace-nowrap" style={{ color: "#633806" }}>{offW.toFixed(2)} kg</td>
                                <td className="py-2 px-3 text-right font-bold text-primary whitespace-nowrap">{floorInfo.totalWeight.toFixed(2)} kg</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </Card>
                );
              })}
              {Object.entries(warehouseData).filter(([, info]) =>
                warehouseSearch.trim() === ""
                  ? true
                  : info.name.toLowerCase().includes(warehouseSearch.trim().toLowerCase())
              ).length === 0 && warehouseSearch.trim() !== "" && (
                <Card className="p-6 text-center bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    No warehouses match "{warehouseSearch}".
                  </p>
                </Card>
              )}
            </div>
          ))}

          {/* ── I4 Quantity & Weight Metrics */}
          {activeTab === "categories" && filteredEntries.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-6 sm:mt-8">
              {/* LEFT: Top 10 Items by Weight — horizontal bar chart */}
              <Card className="border-border overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-foreground">Top Items by {i4SortMode === 'weight' ? 'Weight' : 'Count'}</h2>
                  <button
                    onClick={() => setI4SortMode(i4SortMode === 'weight' ? 'count' : 'weight')}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Sort: {i4SortMode === 'weight' ? 'Weight ↕' : 'Count ↕'}
                  </button>
                </div>
                {activeCategory && (
                  <div className="px-4 pt-3 flex items-center gap-2">
                    <span className="text-xs bg-[#185FA5]/10 text-[#185FA5] rounded px-2 py-0.5 font-medium">
                      {activeCategory}
                    </span>
                    <button onClick={() => setActiveCategory(null)} className="text-xs text-muted-foreground hover:text-foreground">✕ Clear</button>
                  </div>
                )}
                <div className="p-4 sm:p-5 space-y-2.5">
                  {top10Filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items for selected category.</p>
                  ) : top10Filtered.map((item, idx) => {
                    const val = i4SortMode === 'weight' ? item.weight : item.count;
                    const pct = i4Max > 0 ? (val / i4Max) * 100 : 0;
                    return (
                      <div key={item.name}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-foreground font-medium truncate mr-2" style={{ maxWidth: 160 }}>{item.name}</span>
                          <span className="text-muted-foreground shrink-0">
                            {i4SortMode === 'weight' ? `${item.weight.toFixed(1)} kg` : `${item.count} entries`}
                          </span>
                        </div>
                        <div className="w-full h-4 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: '#185FA5',
                              transition: `width 0.6s ease-out`,
                              transitionDelay: `${idx * 0.05}s`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* RIGHT: Category Breakdown — pure SVG donut */}
              <Card className="border-border overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-border">
                  <h2 className="text-base font-semibold text-foreground">Category Breakdown</h2>
                </div>
                <div className="p-4 sm:p-5 flex flex-col items-center">
                  {catData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data.</p>
                  ) : (
                    <>
                      <svg viewBox="0 0 160 160" width="160" height="160" style={{ overflow: 'visible' }}>
                        {donutSegments.map((seg) => (
                          <path
                            key={seg.name}
                            d={seg.path}
                            fill={seg.color}
                            opacity={activeCategory && activeCategory !== seg.name ? 0.35 : 1}
                            style={{ cursor: 'pointer', transition: 'opacity 0.2s, d 0.2s' }}
                            onClick={() => setActiveCategory(activeCategory === seg.name ? null : seg.name)}
                          >
                            <title>{seg.name}: {seg.weight.toFixed(1)} kg ({(seg.fraction * 100).toFixed(1)}%)</title>
                          </path>
                        ))}
                        <text x="80" y="76" textAnchor="middle" fontSize="11" fill="currentColor" fontWeight="600">
                          {catTotal.toFixed(0)}
                        </text>
                        <text x="80" y="90" textAnchor="middle" fontSize="9" fill="#9CA3AF">kg total</text>
                      </svg>
                      <div className="mt-3 w-full space-y-1.5">
                        {catData.slice(0, 6).map((c, i) => (
                          <button
                            key={c.name}
                            onClick={() => setActiveCategory(activeCategory === c.name.toUpperCase() ? null : c.name.toUpperCase())}
                            className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded transition-colors text-xs ${
                              activeCategory === c.name.toUpperCase() ? 'bg-muted' : 'hover:bg-muted/60'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                            <span className="flex-1 truncate text-foreground font-medium">{c.name}</span>
                            <span className="text-muted-foreground shrink-0">{c.weight.toFixed(1)} kg</span>
                          </button>
                        ))}
                        {catData.length > 6 && (
                          <p className="text-xs text-muted-foreground px-2">+{catData.length - 6} more categories</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* ── I5 Entry Quality & Edit Analysis */}
          {activeTab === "overview" && filteredEntries.length > 0 && (
            <div className="mt-6 sm:mt-8 space-y-4">
              {/* Part 1: User Activity Table */}
              <Card className="border-border overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-border">
                  <h2 className="text-base font-semibold text-foreground">User Activity</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-sm border-collapse min-w-[480px] w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {['Username','Entries','Edits','Edit Rate','Last Activity'].map((h) => (
                          <th key={h} className={`py-2 px-3 font-semibold text-foreground whitespace-nowrap ${h === 'Username' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {userStats.map((u) => {
                        const isHighRate = u.editRate > 15;
                        return (
                          <tr
                            key={u.username}
                            className="border-b border-border/50 transition-colors"
                            style={isHighRate ? { backgroundColor: '#FAEEDA' } : undefined}
                          >
                            <td className="py-2 px-3 font-medium text-foreground whitespace-nowrap">{u.username}</td>
                            <td className="py-2 px-3 text-right text-muted-foreground whitespace-nowrap">{u.entries}</td>
                            <td className="py-2 px-3 text-right text-muted-foreground whitespace-nowrap">{u.edits}</td>
                            <td className="py-2 px-3 text-right">
                              <span style={{ color: isHighRate ? '#B45309' : '#374151', fontWeight: isHighRate ? 600 : 400 }}>
                                {u.editRate.toFixed(1)}%
                                {isHighRate && ' ⚠'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-muted-foreground whitespace-nowrap">
                              {u.lastActivity ? new Date(u.lastActivity).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Part 2: Edit Timeline */}
              {timelineEvents.length > 0 && (
                <Card className="border-border overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Edit Timeline</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span style={{ color: '#185FA5' }}>●</span> Submission &nbsp;
                      <span style={{ color: '#B45309' }}>●</span> Edit
                    </p>
                  </div>
                  <div className="p-4 sm:p-5 overflow-x-auto">
                    <div className="relative flex items-center min-w-max" style={{ height: 52 }}>
                      {/* connector line */}
                      <div className="absolute top-[18px] left-0 right-0 h-0.5 bg-border" />
                      {timelineEvents.map((evt, i) => {
                        const dotColor = evt.type === 'submission' ? '#185FA5' : '#B45309';
                        const d = new Date(evt.time);
                        const label = isNaN(d.getTime()) ? '—' : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
                        return (
                          <div key={i} className="relative flex flex-col items-center" style={{ minWidth: 44 }}>
                            <div
                              className="relative z-10 rounded-full border-2 border-background"
                              style={{ width: 12, height: 12, background: dotColor, cursor: 'pointer' }}
                              title={`${evt.type === 'submission' ? 'Submit' : 'Edit'} — ${evt.item} by ${evt.user} at ${d.toLocaleString()}`}
                            />
                            <span className="mt-1 text-center leading-tight" style={{ fontSize: 9, color: '#9CA3AF', maxWidth: 40, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              {label}
                            </span>
                            <span className="text-center leading-tight" style={{ fontSize: 8, color: '#9CA3AF', maxWidth: 40, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              {(evt.user || '').slice(0, 8)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ── I7 AI Analysis panel */}
          {activeTab === "ai" && (
          <Card className="mt-6 sm:mt-8 border-border overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-base sm:text-lg font-semibold text-foreground">AI Analysis</h2>
              {!aiLoading && (
                <button
                  onClick={handleGenerateAnalysis}
                  className="px-4 py-2 rounded-md text-white text-sm font-medium bg-[#1B6FC8] hover:bg-[#155ea8] transition-colors w-full sm:w-auto"
                >
                  {aiAnalysis ? "Regenerate" : "Generate Analysis"}
                </button>
              )}
            </div>
            <div className="p-4 sm:p-6">
              {aiLoading && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                  <div className="h-4 bg-muted rounded w-4/6" />
                </div>
              )}
              {aiError && !aiLoading && (
                <p className="text-sm text-red-600">{aiError}</p>
              )}
              {aiAnalysis && !aiLoading && (
                <div>
                  <pre className="whitespace-pre-wrap text-sm text-foreground">{aiAnalysis}</pre>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleGenerateAnalysis}
                      className="px-3 py-1 rounded border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Regenerate
                    </button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(aiAnalysis); }}
                      className="px-3 py-1 rounded border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
              {!aiAnalysis && !aiLoading && !aiError && (
                <p className="text-sm text-muted-foreground">Click "Generate Analysis" to get an AI-powered summary of the current stocktake data.</p>
              )}
            </div>
          </Card>
          )}

          {/* Quantity summary */}
          {totalGrandQuantity > 0 && (
            <p className="mt-4 text-xs text-muted-foreground text-right">
              Total quantity: {totalGrandQuantity.toLocaleString()} units
            </p>
          )}
        </div>
      </div>
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl w-11 h-11 flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5"
          aria-label="Back to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}
