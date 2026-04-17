/**
 * excelService.ts
 * Shared Excel export utilities for the Stocktake app.
 * Implements:
 *   F1 – Verified columns (Verified / Verified By / Verified At / Remark)
 *   F2 – Digital signature columns + footer block
 */

export function formatDateStr(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm}`;
}

export interface DownloadEntriesParams {
  entries: any[];
  title: string;
  warehouse: string;
  floorName?: string;
  exportedBy?: string;
  filename?: string;
}

export async function downloadEntriesAsExcel(params: DownloadEntriesParams): Promise<void> {
  const { entries, title, warehouse, floorName, exportedBy = "", filename } = params;

  if (!entries || entries.length === 0) return;

  // Dynamic import to keep bundle lean
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  // F6: Sort entries — FG first, RM second, then others
  const sortedEntries = [...entries].sort((a: any, b: any) => {
    const typeOrder = (t: string) => {
      const u = (t || "").toUpperCase();
      if (u === "FG") return 0;
      if (u === "RM") return 1;
      return 2;
    };
    return typeOrder(a.itemType) - typeOrder(b.itemType);
  });

  // Split by stock type
  const freshEntries = sortedEntries.filter(
    (e: any) => !e.stockType || e.stockType === "Fresh Stock"
  );
  const offGradeEntries = sortedEntries.filter(
    (e: any) => e.stockType === "Off Grade/Rejection" || e.stockType === "Rejection"
  );

  const todayStr = formatDateStr(new Date().toISOString());

  // ---------------------------------------------------------------
  // Build one worksheet
  // ---------------------------------------------------------------
  const buildSheet = (ws: any, sheetEntries: any[], sheetTitle: string) => {
    const totalCols = 21; // A..U

    // ── Row 1: Company header ──────────────────────────────────────
    ws.mergeCells(1, 1, 1, totalCols);
    const companyCell = ws.getCell("A1");
    companyCell.value = "Candor Foods Pvt. Ltd";
    companyCell.font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };
    companyCell.alignment = { horizontal: "center", vertical: "middle" };
    companyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
    ws.getRow(1).height = 28;

    // ── Row 2: Title ──────────────────────────────────────────────
    ws.mergeCells(2, 1, 2, totalCols);
    const titleCell = ws.getCell("A2");
    titleCell.value = sheetTitle;
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    ws.getRow(2).height = 22;

    // ── Row 3: Warehouse / Floor / Export date ─────────────────────
    ws.getRow(3).values = [
      "Warehouse:", warehouse || "N/A",
      "", "Floor:", floorName || "N/A",
      "", "Export Date:", todayStr,
    ];
    ws.getRow(3).font = { bold: true };
    ws.getRow(3).height = 18;

    // ── Row 4: Subtitle (entry counts) ────────────────────────────
    const verifiedCount = sheetEntries.filter((e: any) => e.verified).length;
    const unverifiedCount = sheetEntries.length - verifiedCount;
    ws.mergeCells(4, 1, 4, totalCols);
    const subtitleCell = ws.getCell("A4");
    subtitleCell.value = `Includes: ${verifiedCount} verified + ${unverifiedCount} unverified entries`;
    subtitleCell.font = { italic: true, size: 10, color: { argb: "FF555555" } };
    subtitleCell.alignment = { horizontal: "center" };

    // ── Row 5: Empty spacer ───────────────────────────────────────
    ws.addRow([]);

    // ── Row 6: Column headers ─────────────────────────────────────
    const HEADERS = [
      "Entry ID",
      "Item Name",
      "Item Type",
      "Category",
      "Sub-Category",
      "Floor",
      "Warehouse",
      "Qty",
      "UOM (kg)",
      "Total Weight (kg)",
      "Stock Type",
      "Entered By",
      "Date",
      // F1
      "Verified",
      "Verified By",
      "Verified At",
      "Remark",
      // F2
      "Sig: Entry By",
      "Sig: Submitted At",
      "Sig: Verified By",
      "Sig: Verified At",
    ];

    const headerRow = ws.addRow(HEADERS);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 20;

    // Add thin border to header cells
    headerRow.eachCell((cell: any) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    });

    // ── Data rows ─────────────────────────────────────────────────
    const AMBER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFAEEDA" } };

    sheetEntries.forEach((entry: any) => {
      const isVerified = !!entry.verified;

      const rowValues = [
        entry.entryId ?? entry.id ?? "",
        entry.itemName ?? "",
        entry.itemType ?? "",
        entry.itemCategory ?? entry.category ?? "",
        entry.itemSubcategory ?? entry.subcategory ?? "",
        entry.floorName ?? entry.floor ?? "",
        entry.warehouse ?? "",
        entry.totalQuantity ?? entry.units ?? entry.qty ?? 0,
        entry.unitUom ?? entry.packageSize ?? 0,
        entry.totalWeight ?? 0,
        entry.stockType ?? "Fresh Stock",
        entry.enteredBy ?? "",
        formatDateStr(entry.createdAt),
        // F1
        isVerified ? "Yes" : "No",
        entry.verifiedBy ?? "",
        formatDateStr(entry.verifiedAt),
        entry.remark ?? "",
        // F2
        entry.enteredBy ?? "",
        formatDateStr(entry.createdAt),
        entry.verifiedBy ?? "",
        formatDateStr(entry.verifiedAt),
      ];

      const dataRow = ws.addRow(rowValues);

      if (!isVerified) {
        dataRow.eachCell((cell: any) => {
          cell.fill = AMBER_FILL;
        });
      }

      dataRow.eachCell((cell: any) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      });
    });

    // ── Footer block (F2) ─────────────────────────────────────────
    // 3 empty rows
    ws.addRow([]);
    ws.addRow([]);
    ws.addRow([]);

    const GRAY_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF9FAFB" } };

    // Footer row 1: Signature labels
    const footer1 = ws.addRow([
      "Entry Team Signatures:", "", "Verified / Authorised By:", "",
    ]);
    footer1.font = { bold: true };
    footer1.eachCell((cell: any) => { cell.fill = GRAY_FILL; });

    // Footer row 2: Signature lines
    const footer2 = ws.addRow([
      "________________________", "", "________________________", "",
    ]);
    footer2.eachCell((cell: any) => { cell.fill = GRAY_FILL; });

    // Footer row 3: Export metadata
    const footer3 = ws.addRow([
      `Exported by: ${exportedBy}`,
      `Export Date: ${todayStr}`,
      "StockTake — Candor Foods Pvt. Ltd",
      "",
    ]);
    footer3.font = { italic: true, size: 9 };
    footer3.eachCell((cell: any) => { cell.fill = GRAY_FILL; });

    // ── Column widths ─────────────────────────────────────────────
    const COL_WIDTHS = [12, 30, 14, 20, 20, 18, 16, 8, 10, 16, 14, 18, 18,
                        10, 18, 18, 20, 18, 18, 18, 18];
    COL_WIDTHS.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    // Freeze rows 1–6 (company header, title, info, subtitle, spacer, col-header)
    ws.views = [{ state: "frozen", ySplit: 6 }];
  };

  // ── Create worksheets ──────────────────────────────────────────
  if (freshEntries.length > 0) {
    const ws = workbook.addWorksheet("Fresh Stock");
    buildSheet(ws, freshEntries, `${title} — Fresh Stock`);
  }
  if (offGradeEntries.length > 0) {
    const ws = workbook.addWorksheet("Off Grade");
    buildSheet(ws, offGradeEntries, `${title} — Off Grade / Rejection`);
  }
  // Fallback: if neither category detected, put everything in one sheet
  if (freshEntries.length === 0 && offGradeEntries.length === 0) {
    const ws = workbook.addWorksheet("Entries");
    buildSheet(ws, entries, title);
  }

  // ── Write & download ──────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  const safeWarehouse = (warehouse || "Unknown").replace(/\s+/g, "_");
  const safeFloor = (floorName || "").replace(/\s+/g, "_");
  const datePart = new Date().toISOString().split("T")[0];
  const defaultFilename = `StockTake_${safeWarehouse}${safeFloor ? "_" + safeFloor : ""}_${datePart}.xlsx`;
  link.download = filename || defaultFilename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
