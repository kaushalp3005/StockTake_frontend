/**
 * stockCountExport.ts
 *
 * The article-line ("stock count") workbook: one row per article, one COLUMN
 * PAIR per floor holding Qty (units) and Kg side by side.
 *
 * Shared by the Summary tab and Manager Review so the two can never drift into
 * producing differently-shaped sheets from the same data — the previous
 * arrangement had each page building its own workbook inline, which is how the
 * off-grade sheet came to be missing from one of them.
 *
 * Workbook layout (three sheets, same shape):
 *   1. "Fresh Stock"  — stock_type = Fresh Stock
 *   2. "Off Grade"    — stock_type = Off Grade/Rejection
 *   3. "Compiled"     — both together, per the existing compiled format
 *
 * Sheet layout:
 *
 *   | Category | Sub-Category | Description | Item Type | UOM (kg) |  FLOOR A   |  FLOOR B   |   TOTAL    |
 *   |          |              |             |           |          | Qty  | Kg  | Qty  | Kg  | Qty  | Kg  |
 *
 * The floor name is merged and centred across its two columns, and each floor
 * block carries a medium border so the eye can separate one floor from the next
 * on a wide multi-floor sheet.
 *
 * Every numeric cell is written as a real JS number with a numeric format, not
 * a pre-rounded string, so SUM/VLOOKUP work directly on the file.
 */

export interface StockCountEntry {
  itemCategory?: string | null;
  itemSubcategory?: string | null;
  itemName?: string | null;
  itemType?: string | null;
  floorName?: string | null;
  warehouse?: string | null;
  totalQuantity?: number | string | null;
  unitUom?: number | string | null;
  totalWeight?: number | string | null;
  stockType?: string | null;
}

export interface StockCountExportOptions {
  entries: StockCountEntry[];
  /** Shown in the sheet header block. */
  title?: string;
  warehouse?: string;
  /** The dates the on-screen view is filtered to, echoed into the header. */
  selectedDates?: string[];
  /** Human-readable description of any other active filters. */
  filterSummary?: string;
  exportedBy?: string;
  filename?: string;
}

// ── Number coercion ─────────────────────────────────────────────────────────
// The API returns numerics as JS numbers, but Postgres DECIMAL columns can
// arrive as strings through some paths. Everything is normalised here so the
// workbook only ever receives real numbers.
function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

const QTY_FMT = "#,##0.###";
const KG_FMT = "#,##0.00";
const UOM_FMT = "#,##0.000";

const FRESH = "Fresh Stock";
const OFF_GRADE = "Off Grade/Rejection";

/** Normalise the stock type into exactly two buckets. */
export function stockBucket(entry: StockCountEntry): typeof FRESH | typeof OFF_GRADE {
  const raw = String(entry.stockType ?? FRESH).toLowerCase();
  return raw.includes("off") || raw.includes("reject") ? OFF_GRADE : FRESH;
}

/**
 * Floor columns are scoped by warehouse.
 * Two warehouses can both have a floor called "TEST"; without the prefix their
 * counts would be summed into a single column and silently conflated.
 */
function floorLabel(entry: StockCountEntry): string {
  const wh = String(entry.warehouse ?? "Unknown").toUpperCase().trim();
  const fl = String(entry.floorName ?? "Unknown").toUpperCase().trim();
  return `${wh} - ${fl}`;
}

interface ArticleRow {
  category: string;
  subcategory: string;
  description: string;
  itemType: string;
  /** Representative pack size (the most frequently recorded non-zero value). */
  uom: number;
  /**
   * Every distinct non-zero pack size seen for this article. Usually one; where
   * it is not, the extra values are surfaced as a cell note rather than being
   * silently dropped, because the whole point of the column is reconciling
   * Qty x UOM against Kg.
   */
  uomVariants: number[];
  /** floorLabel -> running { qty, kg } */
  byFloor: Map<string, { qty: number; kg: number }>;
}

/**
 * Fold entries into article rows x floor columns.
 *
 * The article key stays exactly as the existing report defines it — Category,
 * Sub-Category, Description, Item Type — so the set of rows is unchanged from
 * the sheet people already reconcile against. UOM is attached to the row, not
 * folded into the key, which would have split articles into extra lines.
 *
 * In this dataset only 7 of ~1137 articles carry more than one pack size, so a
 * representative value is accurate for virtually every row; the rest are
 * annotated rather than hidden.
 */
export function buildArticleMatrix(entries: StockCountEntry[]) {
  const articles = new Map<string, ArticleRow>();
  const floors = new Set<string>();
  // article key -> pack size -> how many entries recorded it
  const uomTally = new Map<string, Map<number, number>>();

  for (const entry of entries) {
    // Rows carrying neither units nor weight contribute nothing to a stock
    // count. Skipping them keeps placeholder records (e.g. the "UNSPECIFIED"
    // rows with a null floor) from creating an entire blank floor column.
    if (num(entry.totalQuantity) === 0 && num(entry.totalWeight) === 0) continue;

    const label = floorLabel(entry);
    floors.add(label);

    const category = String(entry.itemCategory ?? "").trim();
    const subcategory = String(entry.itemSubcategory ?? "").trim();
    const description = String(entry.itemName ?? "").trim();
    const itemType = String(entry.itemType ?? "").trim();

    const key = `${category}:::${subcategory}:::${description}:::${itemType}`;
    let article = articles.get(key);
    if (!article) {
      article = { category, subcategory, description, itemType, uom: 0, uomVariants: [], byFloor: new Map() };
      articles.set(key, article);
      uomTally.set(key, new Map());
    }

    const uom = num(entry.unitUom);
    if (uom > 0) {
      const tally = uomTally.get(key)!;
      tally.set(uom, (tally.get(uom) ?? 0) + 1);
    }

    const cell = article.byFloor.get(label) ?? { qty: 0, kg: 0 };
    cell.qty += num(entry.totalQuantity);
    cell.kg += num(entry.totalWeight);
    article.byFloor.set(label, cell);
  }

  // Resolve each article's representative pack size: most-recorded wins, with
  // the smaller value breaking ties so the choice is deterministic.
  for (const [key, article] of articles) {
    const tally = uomTally.get(key)!;
    const ranked = Array.from(tally.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    article.uom = ranked.length > 0 ? ranked[0][0] : 0;
    article.uomVariants = Array.from(tally.keys()).sort((a, b) => a - b);
  }

  const sortedFloors = Array.from(floors).sort();
  const sortedArticles = Array.from(articles.values()).sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.subcategory.localeCompare(b.subcategory) ||
      a.description.localeCompare(b.description) ||
      a.itemType.localeCompare(b.itemType),
  );

  return { articles: sortedArticles, floors: sortedFloors };
}

// ── Styling constants ───────────────────────────────────────────────────────
const THIN = { style: "thin" as const, color: { argb: "FFB0B7C3" } };
const MEDIUM = { style: "medium" as const, color: { argb: "FF1E3A8A" } };
const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1E3A8A" } };
const SUBHEAD_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFDCE6F1" } };
const TOTAL_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF2CC" } };
const LABEL_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF2F5FA" } };

/**
 * Fixed leading columns before the per-floor pairs begin.
 *
 * Column order mirrors the resultsheet's house format
 * (Group | Subgroup | Item Name | UOM (kg) | Item Type), so the two reports can
 * be read side by side. UOM is the pack size that converts Qty (units) to Kg.
 */
const LEAD_HEADERS = ["Category", "Sub-Category", "Description", "UOM (kg)", "Item Type"];
const LEAD_COUNT = LEAD_HEADERS.length;
/** 1-based index of the UOM column within the leading block. */
const UOM_COL = 4;

/**
 * Render one sheet of the article matrix.
 * Returns false when there is nothing to render, so the caller can skip the tab.
 */
function buildSheet(
  ws: any,
  entries: StockCountEntry[],
  sheetTitle: string,
  opts: StockCountExportOptions,
): boolean {
  const { articles, floors } = buildArticleMatrix(entries);
  if (articles.length === 0) return false;

  // Leading columns + two per floor + a trailing Total pair.
  const totalCols = LEAD_COUNT + floors.length * 2 + 2;

  // ── Title block ───────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, totalCols);
  const company = ws.getCell(1, 1);
  company.value = "Candor Foods Pvt. Ltd";
  company.font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };
  company.alignment = { horizontal: "center", vertical: "middle" };
  company.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, totalCols);
  const title = ws.getCell(2, 1);
  title.value = sheetTitle;
  title.font = { bold: true, size: 12 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  ws.getRow(2).height = 20;

  // Scope line — records exactly which filters produced this sheet, so a
  // filtered export is never mistaken for a full stock position later.
  ws.mergeCells(3, 1, 3, totalCols);
  const scopeBits = [
    opts.warehouse ? `Warehouse: ${opts.warehouse}` : "Warehouse: All",
    `Dates: ${opts.selectedDates && opts.selectedDates.length > 0 ? opts.selectedDates.join(", ") : "All dates"}`,
    opts.filterSummary ? `Filters: ${opts.filterSummary}` : "Filters: none",
    `Articles: ${articles.length}`,
    `Floors: ${floors.length}`,
  ];
  const scope = ws.getCell(3, 1);
  scope.value = scopeBits.join("   |   ");
  scope.font = { italic: true, size: 9, color: { argb: "FF555555" } };
  scope.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(3).height = 16;

  ws.addRow([]); // row 4 spacer

  // ── Header rows 5 (groups) + 6 (sub-columns) ──────────────────────────────
  const GROUP_ROW = 5;
  const SUB_ROW = 6;

  // Leading columns span both header rows.
  LEAD_HEADERS.forEach((label, i) => {
    const col = i + 1;
    ws.mergeCells(GROUP_ROW, col, SUB_ROW, col);
    const cell = ws.getCell(GROUP_ROW, col);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    if (col === UOM_COL) {
      // Stated on the sheet because it is easy to assume otherwise: Kg is the
      // weighed figure recorded against each entry, not Qty x UOM. Roughly
      // four rows in ten are part-pack, so the two do not agree and the Kg
      // column is the authoritative one.
      cell.note =
        "Nominal pack size (kg per unit), for reference and cross-checking.\n" +
        "Kg columns hold the WEIGHED total recorded for each entry — they are not calculated as Qty x UOM, " +
        "because a partly-filled last pack makes the two differ.";
    }
  });

  // One merged, centred floor name above its Qty/Kg pair.
  const floorStartCol = (index: number) => LEAD_COUNT + index * 2 + 1;

  floors.forEach((floor, i) => {
    const c1 = floorStartCol(i);
    const c2 = c1 + 1;

    ws.mergeCells(GROUP_ROW, c1, GROUP_ROW, c2);
    const head = ws.getCell(GROUP_ROW, c1);
    head.value = floor;
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = HEADER_FILL;
    head.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    const qty = ws.getCell(SUB_ROW, c1);
    qty.value = "Qty (units)";
    const kg = ws.getCell(SUB_ROW, c2);
    kg.value = "Kg";
    [qty, kg].forEach((cell) => {
      cell.font = { bold: true, size: 10 };
      cell.fill = SUBHEAD_FILL;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
  });

  // Trailing grand-total pair.
  const totalCol1 = floorStartCol(floors.length);
  const totalCol2 = totalCol1 + 1;
  ws.mergeCells(GROUP_ROW, totalCol1, GROUP_ROW, totalCol2);
  const totalHead = ws.getCell(GROUP_ROW, totalCol1);
  totalHead.value = "TOTAL";
  totalHead.font = { bold: true, color: { argb: "FF7F6000" } };
  totalHead.fill = TOTAL_FILL;
  totalHead.alignment = { horizontal: "center", vertical: "middle" };
  [ws.getCell(SUB_ROW, totalCol1), ws.getCell(SUB_ROW, totalCol2)].forEach((cell, i) => {
    cell.value = i === 0 ? "Qty (units)" : "Kg";
    cell.font = { bold: true, size: 10, color: { argb: "FF7F6000" } };
    cell.fill = TOTAL_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  ws.getRow(GROUP_ROW).height = 26;
  ws.getRow(SUB_ROW).height = 18;

  // ── Data rows ─────────────────────────────────────────────────────────────
  const firstDataRow = SUB_ROW + 1;

  articles.forEach((article) => {
    const row = ws.addRow([]);

    row.getCell(1).value = article.category;
    row.getCell(2).value = article.subcategory;
    row.getCell(3).value = article.description;
    row.getCell(5).value = article.itemType;
    // Pack size, the factor that turns Qty (units) into Kg. Written as a
    // number so the relationship can be checked with a formula in-sheet.
    const uomCell = row.getCell(UOM_COL);
    uomCell.value = article.uom || null;
    uomCell.numFmt = UOM_FMT;
    uomCell.alignment = { horizontal: "right" };
    if (article.uomVariants.length > 1) {
      // Flagged rather than hidden: this article was counted against more than
      // one pack size, so Qty x UOM will not reconcile to Kg on every floor.
      uomCell.note = `Multiple pack sizes recorded: ${article.uomVariants.join(", ")}. Showing the most frequent.`;
      uomCell.font = { bold: true, color: { argb: "FFC00000" } };
    }

    let rowQty = 0;
    let rowKg = 0;

    floors.forEach((floor, i) => {
      const cell = article.byFloor.get(floor);
      const c1 = floorStartCol(i);

      const qtyCell = row.getCell(c1);
      const kgCell = row.getCell(c1 + 1);

      if (cell && (cell.qty !== 0 || cell.kg !== 0)) {
        qtyCell.value = cell.qty;
        kgCell.value = cell.kg;
        rowQty += cell.qty;
        rowKg += cell.kg;
      } else {
        // Left genuinely empty rather than "-", so the cell stays numeric and
        // SUM/AVERAGE over the column behave.
        qtyCell.value = null;
        kgCell.value = null;
      }
      qtyCell.numFmt = QTY_FMT;
      kgCell.numFmt = KG_FMT;
    });

    const rowTotalQty = row.getCell(totalCol1);
    const rowTotalKg = row.getCell(totalCol2);
    rowTotalQty.value = rowQty;
    rowTotalKg.value = rowKg;
    rowTotalQty.numFmt = QTY_FMT;
    rowTotalKg.numFmt = KG_FMT;
    rowTotalQty.font = { bold: true };
    rowTotalKg.font = { bold: true };
    rowTotalQty.fill = TOTAL_FILL;
    rowTotalKg.fill = TOTAL_FILL;
  });

  const lastDataRow = ws.rowCount;

  // ── Grand total row ───────────────────────────────────────────────────────
  const totalRow = ws.addRow([]);
  totalRow.getCell(1).value = "TOTAL";
  totalRow.font = { bold: true };

  const sumColumn = (col: number) => {
    let sum = 0;
    for (let r = firstDataRow; r <= lastDataRow; r++) {
      const v = ws.getCell(r, col).value;
      if (typeof v === "number") sum += v;
    }
    return sum;
  };

  for (let i = 0; i < floors.length; i++) {
    const c1 = floorStartCol(i);
    const q = totalRow.getCell(c1);
    const k = totalRow.getCell(c1 + 1);
    q.value = sumColumn(c1);
    k.value = sumColumn(c1 + 1);
    q.numFmt = QTY_FMT;
    k.numFmt = KG_FMT;
  }
  const gq = totalRow.getCell(totalCol1);
  const gk = totalRow.getCell(totalCol2);
  gq.value = sumColumn(totalCol1);
  gk.value = sumColumn(totalCol2);
  gq.numFmt = QTY_FMT;
  gk.numFmt = KG_FMT;

  totalRow.eachCell({ includeEmpty: true }, (cell: any) => {
    cell.fill = TOTAL_FILL;
    cell.font = { bold: true };
  });

  // ── Borders ───────────────────────────────────────────────────────────────
  // Thin grid everywhere, then a medium rule down each floor block's edges so
  // adjacent floors stay visually separate across a wide sheet.
  const lastRow = ws.rowCount;

  for (let r = GROUP_ROW; r <= lastRow; r++) {
    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(r, c);
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    }
  }

  const applyBlockBorder = (c1: number, c2: number) => {
    for (let r = GROUP_ROW; r <= lastRow; r++) {
      const left = ws.getCell(r, c1);
      left.border = { ...left.border, left: MEDIUM };
      const right = ws.getCell(r, c2);
      right.border = { ...right.border, right: MEDIUM };
    }
    // Cap the block top and bottom so it reads as one boxed unit.
    for (let c = c1; c <= c2; c++) {
      const top = ws.getCell(GROUP_ROW, c);
      top.border = { ...top.border, top: MEDIUM };
      const bottom = ws.getCell(lastRow, c);
      bottom.border = { ...bottom.border, bottom: MEDIUM };
    }
  };

  floors.forEach((_, i) => applyBlockBorder(floorStartCol(i), floorStartCol(i) + 1));
  applyBlockBorder(totalCol1, totalCol2);
  // The descriptive columns get the same treatment so they read as a block too.
  applyBlockBorder(1, LEAD_COUNT);

  // Label-column shading, applied after borders so it cannot clobber them.
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    for (let c = 1; c <= LEAD_COUNT; c++) {
      ws.getCell(r, c).fill = LABEL_FILL;
    }
  }

  // ── Column widths, freeze pane, autofilter ────────────────────────────────
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 38;
  ws.getColumn(4).width = 11;
  ws.getColumn(5).width = 12;
  for (let c = LEAD_COUNT + 1; c <= totalCols; c++) {
    ws.getColumn(c).width = 13;
  }

  // Freeze the descriptive columns and both header rows: on a sheet with many
  // floors the article name must stay visible while scrolling right.
  ws.views = [{ state: "frozen", xSplit: LEAD_COUNT, ySplit: SUB_ROW }];

  ws.autoFilter = {
    from: { row: SUB_ROW, column: 1 },
    to: { row: SUB_ROW, column: LEAD_COUNT },
  };

  return true;
}

export interface StockCountBuildResult {
  workbook: any;
  sheets: string[];
  fresh: number;
  offGrade: number;
  total: number;
}

/**
 * Build the three-sheet workbook in memory.
 *
 * Kept separate from the download so the layout can be asserted in tests
 * without a DOM — the browser-only Blob/anchor work lives in the wrapper below.
 * `ExcelJSModule` is injectable for the same reason.
 */
export async function buildStockCountWorkbook(
  opts: StockCountExportOptions,
  ExcelJSModule?: any,
): Promise<StockCountBuildResult> {
  const { entries } = opts;

  const ExcelJS = ExcelJSModule ?? (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StockTake — Candor Foods Pvt. Ltd";
  workbook.created = new Date();

  const fresh = entries.filter((e) => stockBucket(e) === FRESH);
  const offGrade = entries.filter((e) => stockBucket(e) === OFF_GRADE);

  const baseTitle = opts.title || "Stock Count";
  const sheets: string[] = [];

  // Sheet order is fixed — Fresh, Off Grade, Compiled — so the file looks the
  // same every time even when one category happens to be empty.
  if (buildSheet(workbook.addWorksheet("Fresh Stock"), fresh, `${baseTitle} — Fresh Stock`, opts)) {
    sheets.push("Fresh Stock");
  } else {
    workbook.removeWorksheet(workbook.getWorksheet("Fresh Stock").id);
  }

  if (buildSheet(workbook.addWorksheet("Off Grade"), offGrade, `${baseTitle} — Off Grade / Rejection`, opts)) {
    sheets.push("Off Grade");
  } else {
    workbook.removeWorksheet(workbook.getWorksheet("Off Grade").id);
  }

  if (buildSheet(workbook.addWorksheet("Compiled"), entries, `${baseTitle} — Compiled (Fresh + Off Grade)`, opts)) {
    sheets.push("Compiled");
  } else {
    workbook.removeWorksheet(workbook.getWorksheet("Compiled").id);
  }

  if (sheets.length === 0) {
    throw new Error("No entries to export");
  }

  return { workbook, sheets, fresh: fresh.length, offGrade: offGrade.length, total: entries.length };
}

/**
 * Build and download the three-sheet stock-count workbook.
 * Returns a small report so the caller can tell the user what was produced.
 */
export async function downloadStockCountWorkbook(
  opts: StockCountExportOptions,
): Promise<{ sheets: string[]; fresh: number; offGrade: number; total: number }> {
  const { workbook, sheets, fresh, offGrade, total } = await buildStockCountWorkbook(opts);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  const datePart =
    opts.selectedDates && opts.selectedDates.length > 0
      ? opts.selectedDates.join("_")
      : new Date().toISOString().split("T")[0];
  const whPart = opts.warehouse ? `${opts.warehouse.replace(/\s+/g, "_")}_` : "";
  link.download = opts.filename || `Stock_Count_${whPart}${datePart}.xlsx`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  return { sheets, fresh, offGrade, total };
}
