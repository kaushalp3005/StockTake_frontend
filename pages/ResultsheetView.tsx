import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Package, Loader, Eye, Calendar, Clock, X, Download, Trash2, Layers } from "lucide-react";
import { DatePillSelector, todayStr } from "@/components/DatePillSelector";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resultsheetAPI } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ResultsheetEntry {
  date: string | null;
  time: string;
  entryCount: number;
  totalWeight: number;
  createdAt: string | null;
}

interface ResultsheetDataItem {
  item_name: string;
  item_type: string;
  group: string;
  subgroup: string;
  stock_type?: string;
  is_verified?: boolean;
}

interface Warehouse {
  name: string;
  floors: string[];
}

interface StockTypeData {
  items: ResultsheetDataItem[];
  warehouses: Warehouse[];
  data: Record<string, Record<string, Record<string, { weight: number; quantity: number; uom: number }>>>;
}

interface ResultsheetData {
  date: string;
  items: ResultsheetDataItem[];
  warehouses: Warehouse[];
  data: Record<string, Record<string, Record<string, { weight: number; quantity: number; uom: number }>>>;
  // Separated data by stock type
  freshStock?: StockTypeData;
  rejection?: StockTypeData;
}

export default function ResultsheetView() {
  const navigate = useNavigate();
  const { date } = useParams<{ date: string }>();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ResultsheetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<ResultsheetData | null>(null);
  const [isSheetDialogOpen, setIsSheetDialogOpen] = useState(false);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Multi-date merge state
  // Default filter is today only — see AllEntriesSummary for the rationale.
  const [mergeSelectedDates, setMergeSelectedDates] = useState<string[]>(() => [todayStr()]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedSheetData, setMergedSheetData] = useState<ResultsheetData | null>(null);
  const [isMergedDialogOpen, setIsMergedDialogOpen] = useState(false);
  const [exportingMerged, setExportingMerged] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const response = await resultsheetAPI.getList();
      console.log("Resultsheet API response:", response);
      // Handle both response formats: { entries: [...] } or { success: true, entries: [...] }
      const entries = response.entries || [];
      console.log("Parsed entries:", entries, "Count:", entries.length);
      setEntries(entries);
      // Extract unique dates for DatePillSelector
      const dates = entries
        .map((e: ResultsheetEntry) => e.date)
        .filter(Boolean)
        .map((d: string) => d.split("T")[0])
        .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
        .sort() as string[];
      setAvailableDates(dates);
    } catch (error: any) {
      console.error("Error fetching resultsheet entries:", error);
      console.error("Error details:", error.status, error.data);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch resultsheet entries",
        variant: "destructive",
      });
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewSheet = async (entry: ResultsheetEntry) => {
    if (!entry.date) return;
    
    setSelectedDate(entry.date);
    setIsSheetDialogOpen(true);
    setIsLoadingSheet(true);

    try {
      const response = await resultsheetAPI.getData(entry.date);
      setSheetData(response);
    } catch (error: any) {
      console.error("Error fetching sheet data:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch sheet data",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return "";
    // Time format: HH:MM:SS or HH:MM
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return timeStr;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleDeleteEntry = async (entry: ResultsheetEntry) => {
    if (!entry.date) return;

    // Confirm deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete the resultsheet for ${formatDate(entry.date)}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(entry.date);
    try {
      await resultsheetAPI.delete(entry.date);
      
      toast({
        title: "Success",
        description: "Resultsheet entry deleted successfully",
      });

      // Refresh the entries list
      await fetchEntries();
    } catch (error: any) {
      console.error("Error deleting resultsheet entry:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete resultsheet entry",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleExportToExcel = async () => {
    if (!sheetData) return;

    setExporting(true);
    try {
      // Dynamic import of exceljs
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();

      // Helper function to create a worksheet for a given stock type data
      const createWorksheet = (
        worksheetName: string,
        stockData: StockTypeData,
        headerColor: string,
        totalHeaderColor: string
      ) => {
        if (stockData.items.length === 0) return; // Skip if no data

        const worksheet = workbook.addWorksheet(worksheetName);

        // Build header rows
        const headerRow1 = ["Group", "Subgroup", "Item Name", "UOM (kg)", "Item Type", "Status"];
        stockData.warehouses.forEach((warehouse) => {
          for (let i = 0; i < warehouse.floors.length * 2; i++) {
            if (i === 0) {
              headerRow1.push(warehouse.name);
            } else {
              headerRow1.push("");
            }
          }
        });
        headerRow1.push("Total Weight (kg)");
        const row1 = worksheet.addRow(headerRow1);
        row1.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        row1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerColor } };
        row1.alignment = { horizontal: "center", vertical: "middle" };

        // Row 2: Floor names
        const headerRow2 = ["", "", "", "", "", ""];
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach((floor) => {
            headerRow2.push(floor);
            headerRow2.push("");
          });
        });
        headerRow2.push("");
        const row2 = worksheet.addRow(headerRow2);
        row2.font = { bold: true, size: 11 };
        row2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
        row2.alignment = { horizontal: "center", vertical: "middle" };

        // Row 3: Qty | Weight labels
        const headerRow3 = ["", "", "", "", "", ""];
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach(() => {
            headerRow3.push("Qty");
            headerRow3.push("Weight (kg)");
          });
        });
        headerRow3.push("");
        const row3 = worksheet.addRow(headerRow3);
        row3.font = { bold: true, size: 10 };
        row3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
        row3.alignment = { horizontal: "center", vertical: "middle" };

        // Merge cells
        worksheet.mergeCells(1, 4, 3, 4);
        worksheet.mergeCells(1, 5, 3, 5);
        worksheet.mergeCells(1, 6, 3, 6);

        let colIndex = 7;
        stockData.warehouses.forEach((warehouse) => {
          const colspan = warehouse.floors.length * 2;
          if (colspan > 0) {
            worksheet.mergeCells(1, colIndex, 1, colIndex + colspan - 1);
          }
          colIndex += colspan;
        });

        colIndex = 7;
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach(() => {
            worksheet.mergeCells(2, colIndex, 2, colIndex + 1);
            colIndex += 2;
          });
        });

        const totalColIndex = colIndex;
        worksheet.mergeCells(1, totalColIndex, 3, totalColIndex);
        const totalHeaderCell = worksheet.getCell(1, totalColIndex);
        totalHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: totalHeaderColor } };

        // Add data rows
        stockData.items.forEach((item) => {
          // Use same key as backend - item_name + group + subgroup (NOT including item_type)
          const itemKey = `${item.item_name.toUpperCase()}_${(item.group || "").toUpperCase()}_${(item.subgroup || "").toUpperCase()}`;

          let uom = 0;
          for (const warehouse of stockData.warehouses) {
            for (const floor of warehouse.floors) {
              const cellData = stockData.data[itemKey]?.[warehouse.name]?.[floor];
              if (cellData && cellData.uom) {
                uom = cellData.uom;
                break;
              }
            }
            if (uom > 0) break;
          }

          const statusText = item.is_verified ? "Verified" : "Not Verified";
          // Numeric cells are pushed as numbers, not pre-rounded strings.
          // .toFixed()/.toString() made Excel store them as text, so SUM,
          // VLOOKUP and sorting all failed on the exported file. Rounding is
          // now a display concern handled by numFmt below, and the empty
          // placeholder is a real blank instead of "-" so the column stays
          // numeric end to end.
          const row: (string | number | null)[] = [
            item.group,
            item.subgroup,
            item.item_name,
            uom > 0 ? uom : null,
            (item.item_type && item.item_type.trim()) ? item.item_type : "-",
            statusText,
          ];

          let itemTotalWeight = 0;
          stockData.warehouses.forEach((warehouse) => {
            warehouse.floors.forEach((floor) => {
              const cellData = stockData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0, uom: 0 };
              row.push(cellData.quantity > 0 ? cellData.quantity : null);
              row.push(cellData.weight > 0 ? cellData.weight : null);
              itemTotalWeight += cellData.weight || 0;
            });
          });

          row.push(itemTotalWeight > 0 ? itemTotalWeight : null);

          const dataRow = worksheet.addRow(row);
          // Formats: 3dp for pack size, whole-ish for units, 2dp for kg.
          dataRow.getCell(4).numFmt = "#,##0.000";
          dataRow.alignment = { horizontal: "left", vertical: "middle" };
          dataRow.getCell(4).alignment = { horizontal: "center" };
          dataRow.getCell(5).alignment = { horizontal: "center" };
          dataRow.getCell(6).alignment = { horizontal: "center" };
          dataRow.getCell(6).font = { bold: true, color: { argb: item.is_verified ? "FF228B22" : "FFB22222" } };
          dataRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: item.is_verified ? "FFE2EFDA" : "FFFCE4EC" } };

          let dataCol = 7;
          stockData.warehouses.forEach((warehouse) => {
            warehouse.floors.forEach(() => {
              dataRow.getCell(dataCol).alignment = { horizontal: "center" };
              dataRow.getCell(dataCol).numFmt = "#,##0.###";
              dataRow.getCell(dataCol + 1).alignment = { horizontal: "center" };
              dataRow.getCell(dataCol + 1).numFmt = "#,##0.00";
              dataCol += 2;
            });
          });
          dataRow.getCell(dataCol).alignment = { horizontal: "center" };
          dataRow.getCell(dataCol).numFmt = "#,##0.00";
          dataRow.getCell(dataCol).font = { bold: true };
          dataRow.getCell(dataCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
        });

        // Add total row
        const totalRow: (string | number | null)[] = ["TOTAL", "", "", "", "", ""];
        let grandTotalWeight = 0;
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach((floor) => {
            let totalWeight = 0;
            let totalQuantity = 0;
            stockData.items.forEach((item) => {
              // Use correct key format: item_name_group_subgroup (same as backend)
              const itemKey = `${item.item_name.toUpperCase()}_${(item.group || "").toUpperCase()}_${(item.subgroup || "").toUpperCase()}`;
              const cellData = stockData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0, uom: 0 };
              totalWeight += cellData.weight || 0;
              totalQuantity += cellData.quantity || 0;
            });
            grandTotalWeight += totalWeight;
            totalRow.push(totalQuantity > 0 ? totalQuantity : null);
            totalRow.push(totalWeight > 0 ? totalWeight : null);
          });
        });
        totalRow.push(grandTotalWeight > 0 ? grandTotalWeight : null);

        const totalRowObj = worksheet.addRow(totalRow);
        totalRowObj.font = { bold: true };
        totalRowObj.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
        totalRowObj.alignment = { horizontal: "left", vertical: "middle" };
        totalRowObj.getCell(4).alignment = { horizontal: "center" };
        totalRowObj.getCell(5).alignment = { horizontal: "center" };

        let totalCol = 7;
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach(() => {
            totalRowObj.getCell(totalCol).alignment = { horizontal: "center" };
            totalRowObj.getCell(totalCol).numFmt = "#,##0.###";
            totalRowObj.getCell(totalCol + 1).alignment = { horizontal: "center" };
            totalRowObj.getCell(totalCol + 1).numFmt = "#,##0.00";
            totalCol += 2;
          });
        });
        totalRowObj.getCell(totalCol).numFmt = "#,##0.00";
        totalRowObj.getCell(totalCol).alignment = { horizontal: "center" };
        totalRowObj.getCell(totalCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };

        // Add borders
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin", color: { argb: "FF000000" } },
              left: { style: "thin", color: { argb: "FF000000" } },
              bottom: { style: "thin", color: { argb: "FF000000" } },
              right: { style: "thin", color: { argb: "FF000000" } },
            };
          });
        });

        // Set column widths
        worksheet.getColumn(1).width = 15;
        worksheet.getColumn(2).width = 15;
        worksheet.getColumn(3).width = 30;
        worksheet.getColumn(4).width = 12;
        worksheet.getColumn(5).width = 12;
        worksheet.getColumn(6).width = 14;
        let widthCol = 7;
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach(() => {
            worksheet.getColumn(widthCol).width = 10;
            worksheet.getColumn(widthCol + 1).width = 12;
            widthCol += 2;
          });
        });
        worksheet.getColumn(widthCol).width = 15;

        worksheet.views = [{ state: "frozen", xSplit: 6, ySplit: 3 }];
      };

      const hasRejection = !!sheetData.rejection && sheetData.rejection.items.length > 0;

      // Create Fresh Stock worksheet (green header)
      if (sheetData.freshStock && sheetData.freshStock.items.length > 0) {
        createWorksheet("Fresh Stock", sheetData.freshStock, "FF228B22", "FF92D050");
      } else if (!hasRejection) {
        // Only fall back to the combined bucket when the payload was never
        // split at all (older backend). If a rejection bucket IS present, an
        // empty fresh bucket genuinely means "no fresh stock" — dumping the
        // combined data here would have written every off-grade row into the
        // Fresh Stock sheet AND again into Rejection, double-counting it.
        const fallbackData: StockTypeData = {
          items: sheetData.items,
          warehouses: sheetData.warehouses,
          data: sheetData.data,
        };
        createWorksheet("Fresh Stock", fallbackData, "FF228B22", "FF92D050");
      }

      // Create Rejection worksheet (red header)
      if (hasRejection) {
        createWorksheet("Rejection", sheetData.rejection!, "FFB22222", "FFFF6B6B");
      }

      // Save file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = selectedDate ? formatDate(selectedDate).replace(/\s/g, "_") : "resultsheet";
      link.download = `Resultsheet_${dateStr}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Resultsheet exported to Excel successfully",
      });
    } catch (err) {
      console.error("Failed to export:", err);
      toast({
        title: "Error",
        description: "Failed to export to Excel",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  // ── Merged view handler ──────────────────────────────────────────
  const handleViewMerged = async () => {
    if (mergeSelectedDates.length === 0) return;
    setIsMerging(true);
    try {
      const response = await resultsheetAPI.getMergedData(mergeSelectedDates);
      setMergedSheetData(response as ResultsheetData);
      setIsMergedDialogOpen(true);
    } catch (error: any) {
      console.error("Error fetching merged data:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch merged resultsheet",
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
  };

  // ── Merged export handler ──────────────────────────────────────────
  const handleExportMergedToExcel = async () => {
    if (!mergedSheetData) return;
    setExportingMerged(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();

      const createWorksheet = (
        worksheetName: string,
        stockData: StockTypeData,
        headerColor: string,
        totalHeaderColor: string
      ) => {
        if (stockData.items.length === 0) return;
        const worksheet = workbook.addWorksheet(worksheetName);

        const headerRow1 = ["Group", "Subgroup", "Item Name", "UOM (kg)", "Item Type", "Status"];
        stockData.warehouses.forEach((warehouse) => {
          for (let i = 0; i < warehouse.floors.length * 2; i++) {
            headerRow1.push(i === 0 ? warehouse.name : "");
          }
        });
        headerRow1.push("Total Weight (kg)");
        const row1 = worksheet.addRow(headerRow1);
        row1.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        row1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerColor } };
        row1.alignment = { horizontal: "center", vertical: "middle" };

        const headerRow2 = ["", "", "", "", "", ""];
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach((floor) => { headerRow2.push(floor); headerRow2.push(""); });
        });
        headerRow2.push("");
        const row2 = worksheet.addRow(headerRow2);
        row2.font = { bold: true, size: 11 };
        row2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
        row2.alignment = { horizontal: "center", vertical: "middle" };

        const headerRow3 = ["", "", "", "", "", ""];
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach(() => { headerRow3.push("Qty"); headerRow3.push("Weight (kg)"); });
        });
        headerRow3.push("");
        const row3 = worksheet.addRow(headerRow3);
        row3.font = { bold: true, size: 10 };
        row3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
        row3.alignment = { horizontal: "center", vertical: "middle" };

        worksheet.mergeCells(1, 4, 3, 4);
        worksheet.mergeCells(1, 5, 3, 5);
        worksheet.mergeCells(1, 6, 3, 6);

        let colIndex = 7;
        stockData.warehouses.forEach((warehouse) => {
          const colspan = warehouse.floors.length * 2;
          if (colspan > 1) worksheet.mergeCells(1, colIndex, 1, colIndex + colspan - 1);
          warehouse.floors.forEach((_, fi) => {
            worksheet.mergeCells(2, colIndex + fi * 2, 2, colIndex + fi * 2 + 1);
          });
          colIndex += colspan;
        });

        // Numbers are written as numbers with a display format, not as
        // pre-rounded strings — otherwise Excel stores the whole grid as text
        // and neither SUM nor VLOOKUP works on the exported file.
        const applyNumberFormats = (r: any) => {
          r.getCell(4).numFmt = "#,##0.000"; // UOM (pack size)
          let col = 7;
          stockData.warehouses.forEach((warehouse) => {
            warehouse.floors.forEach(() => {
              r.getCell(col).numFmt = "#,##0.###";     // Qty (units)
              r.getCell(col + 1).numFmt = "#,##0.00";  // Weight (kg)
              col += 2;
            });
          });
          r.getCell(col).numFmt = "#,##0.00";          // Total weight
        };

        stockData.items.forEach((item) => {
          const itemKey = `${item.item_name?.toUpperCase()}_${item.group?.toUpperCase()}_${item.subgroup?.toUpperCase()}`;
          const row: (string | number | null)[] = [item.group, item.subgroup, item.item_name, null, item.item_type || "", ""];
          let totalWeight = 0;
          let uomVal = 0;
          stockData.warehouses.forEach((warehouse) => {
            warehouse.floors.forEach((floor) => {
              const cell = stockData.data?.[itemKey]?.[warehouse.name]?.[floor];
              const qty = cell?.quantity || 0;
              const wt = cell?.weight || 0;
              if (cell?.uom) uomVal = cell.uom;
              row.push(qty > 0 ? qty : null);
              row.push(wt > 0 ? wt : null);
              totalWeight += wt;
            });
          });
          row[3] = uomVal > 0 ? uomVal : null;
          row.push(totalWeight > 0 ? totalWeight : null);
          applyNumberFormats(worksheet.addRow(row));
        });

        const totalRow: (string | number | null)[] = ["", "", "TOTAL", null, "", ""];
        let grandTotal = 0;
        stockData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach((floor) => {
            let floorTotal = 0;
            // Quantities were previously never totalled here — the Qty column
            // of the TOTAL row was pushed as a blank string, so every floor's
            // unit total came out empty in the merged sheet.
            let floorQty = 0;
            stockData.items.forEach((item) => {
              const itemKey = `${item.item_name?.toUpperCase()}_${item.group?.toUpperCase()}_${item.subgroup?.toUpperCase()}`;
              const cell = stockData.data?.[itemKey]?.[warehouse.name]?.[floor];
              floorTotal += cell?.weight || 0;
              floorQty += cell?.quantity || 0;
            });
            totalRow.push(floorQty > 0 ? floorQty : null);
            totalRow.push(floorTotal > 0 ? floorTotal : null);
            grandTotal += floorTotal;
          });
        });
        totalRow.push(grandTotal > 0 ? grandTotal : null);
        const tRow = worksheet.addRow(totalRow);
        applyNumberFormats(tRow);
        tRow.font = { bold: true };
        tRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: totalHeaderColor } };

        worksheet.columns.forEach((col) => { if (col) col.width = 14; });
        if (worksheet.getColumn(1)) worksheet.getColumn(1).width = 18;
        if (worksheet.getColumn(2)) worksheet.getColumn(2).width = 18;
        if (worksheet.getColumn(3)) worksheet.getColumn(3).width = 28;
      };

      const mergedHasRejection =
        !!mergedSheetData.rejection && mergedSheetData.rejection.items.length > 0;

      if (mergedSheetData.freshStock && mergedSheetData.freshStock.items.length > 0) {
        createWorksheet("Fresh Stock", mergedSheetData.freshStock, "FF228B22", "FF92D050");
      } else if (!mergedHasRejection && mergedSheetData.items && mergedSheetData.items.length > 0) {
        // Combined-bucket fallback only when nothing was split — otherwise the
        // off-grade rows would be written into Fresh Stock and into Rejection,
        // double-counting them across the workbook.
        createWorksheet("Fresh Stock", {
          items: mergedSheetData.items,
          warehouses: mergedSheetData.warehouses,
          data: mergedSheetData.data,
        }, "FF228B22", "FF92D050");
      }
      if (mergedHasRejection) {
        createWorksheet("Rejection", mergedSheetData.rejection!, "FFB22222", "FFFF6B6B");
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Resultsheet_Merged_${mergeSelectedDates.join("_")}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({ title: "Success", description: "Merged resultsheet exported to Excel" });
    } catch (err) {
      console.error("Failed to export merged:", err);
      toast({ title: "Error", description: "Failed to export merged resultsheet", variant: "destructive" });
    } finally {
      setExportingMerged(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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

      {/* Main Content */}
      <div className="container py-6 sm:py-8 lg:py-12 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="w-full">
          {/* Header */}
          <div className="mb-6 sm:mb-8 lg:mb-10">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-2">
              Resultsheet Summary
            </h1>
            <p className="text-sm sm:text-base lg:text-lg text-muted-foreground">
              View saved stock take results by date and time
            </p>
          </div>

          {/* Multi-date merge section */}
          {availableDates.length > 1 && (
            <div className="mb-6">
              <Card className="p-4 border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Merge & Download Multiple Dates</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Select dates below to view a combined resultsheet across multiple stocktake sessions
                </p>
                <div className="relative z-10 mb-3">
                  <DatePillSelector
                    entryDates={availableDates}
                    selectedDates={mergeSelectedDates}
                    onChange={(dates) => setMergeSelectedDates(dates)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleViewMerged}
                    disabled={mergeSelectedDates.length === 0 || isMerging}
                    className="bg-primary hover:bg-primary/90 text-white flex-1 sm:flex-none"
                    size="sm"
                  >
                    {isMerging ? (
                      <><Loader className="w-4 h-4 mr-2 animate-spin" />Merging...</>
                    ) : (
                      <><Eye className="w-4 h-4 mr-2" />View Merged ({mergeSelectedDates.length} date{mergeSelectedDates.length !== 1 ? "s" : ""})</>
                    )}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Entries List */}
          {entries.length === 0 ? (
            <Card className="p-6 sm:p-12 text-center bg-muted/50">
              <Calendar className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-base sm:text-lg font-semibold text-foreground mb-1">
                No resultsheet entries yet
              </p>
              <p className="text-sm sm:text-base text-muted-foreground">
                Save data from the review page to see entries here.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
              {entries.map((entry, index) => (
                <Card key={index} className="border-border overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/50">
                  <div className="p-4 sm:p-6">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="p-3 bg-primary/10 rounded-lg flex-shrink-0">
                          <Calendar className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-lg font-bold text-foreground mb-1">
                            {formatDate(entry.date)}
                          </div>
                          {entry.time && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                              <Clock className="w-4 h-4 flex-shrink-0" />
                              {formatTime(entry.time)}
                            </div>
                          )}
                          <div className="flex gap-3 text-sm text-muted-foreground">
                            <span>{entry.entryCount} entries</span>
                            <span>•</span>
                            <span className="font-semibold text-primary">
                              {entry.totalWeight.toFixed(2)} kg
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleViewSheet(entry)}
                          className="bg-green-600 hover:bg-green-700 text-white flex-1"
                          size="sm"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Sheet
                        </Button>
                        <Button
                          onClick={() => handleDeleteEntry(entry)}
                          variant="destructive"
                          disabled={deleting === entry.date}
                          className="bg-red-600 hover:bg-red-700 text-white flex-1"
                          size="sm"
                        >
                          {deleting === entry.date ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sheet Dialog */}
      <Dialog open={isSheetDialogOpen} onOpenChange={setIsSheetDialogOpen}>
        <DialogContent className="max-w-[95vw] lg:max-w-[98vw] h-[90vh] lg:h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-4 flex-shrink-0 border-b bg-background">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 lg:gap-6 pr-8 sm:pr-10 lg:pr-12">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg lg:text-xl font-bold">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-primary" />
                <span className="break-words">Resultsheet - {selectedDate && formatDate(selectedDate)}</span>
              </DialogTitle>
              {sheetData && sheetData.items.length > 0 && (
                <Button
                  onClick={handleExportToExcel}
                  className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto lg:px-8 lg:py-5 lg:text-base shadow-md"
                  disabled={exporting}
                  size="sm"
                >
                  {exporting ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      <span className="sm:inline">Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Download Excel</span>
                      <span className="sm:hidden">Export</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {isLoadingSheet ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : sheetData && sheetData.items.length > 0 ? (
              <div className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6">
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="border-2 border-gray-300 rounded-lg inline-block min-w-full shadow-sm" style={{ maxHeight: 'calc(95vh - 200px)' }}>
                    <Table className="border-collapse w-full min-w-[1000px]">
                  <TableHeader>
                    {/* Row 1: Warehouse Names */}
                    <TableRow className="border-b-2 border-gray-400">
                      <TableHead 
                        rowSpan={3}
                        className="sticky left-0 z-10 bg-gray-100 border border-gray-400 min-w-[120px] align-middle font-bold text-center text-xs py-2"
                      >
                        Group
                      </TableHead>
                      <TableHead 
                        rowSpan={3}
                        className="sticky left-[120px] z-10 bg-gray-100 border border-gray-400 min-w-[120px] align-middle font-bold text-center text-xs py-2"
                      >
                        Subgroup
                      </TableHead>
                      <TableHead 
                        rowSpan={3}
                        className="sticky left-[240px] z-10 bg-gray-100 border border-gray-400 min-w-[200px] align-middle font-bold text-center text-xs py-2"
                      >
                        Item Name
                      </TableHead>
                      <TableHead 
                        rowSpan={3}
                        className="sticky left-[440px] z-10 bg-gray-100 border border-gray-400 min-w-[100px] align-middle font-bold text-center text-xs py-2"
                      >
                        UOM (kg)
                      </TableHead>
                      <TableHead
                        rowSpan={3}
                        className="sticky left-[540px] z-10 bg-gray-100 border border-gray-400 min-w-[100px] align-middle font-bold text-center text-xs py-2"
                      >
                        Item Type
                      </TableHead>
                      <TableHead
                        rowSpan={3}
                        className="sticky left-[640px] z-10 bg-gray-100 border border-gray-400 min-w-[100px] align-middle font-bold text-center text-xs py-2"
                      >
                        Status
                      </TableHead>
                      {sheetData.warehouses.map((warehouse) => (
                        <TableHead
                          key={warehouse.name}
                          colSpan={warehouse.floors.length * 2}
                          className="text-center bg-blue-100 border border-gray-400 font-bold text-xs py-2"
                        >
                          {warehouse.name}
                        </TableHead>
                      ))}
                      <TableHead
                        rowSpan={3}
                        className="text-center bg-green-100 border border-gray-400 font-bold text-xs min-w-[100px] align-middle py-2"
                      >
                        Total Weight (kg)
                      </TableHead>
                    </TableRow>
                    {/* Row 2: Floor Names */}
                    <TableRow className="border-b border-gray-400">
                      {sheetData.warehouses.map((warehouse) =>
                        warehouse.floors.map((floor) => (
                          <TableHead
                            key={`${warehouse.name}-${floor}`}
                            colSpan={2}
                            className="text-center bg-gray-200 border border-gray-400 font-semibold text-xs py-1"
                          >
                            {floor}
                          </TableHead>
                        ))
                      )}
                    </TableRow>
                    {/* Row 3: Qty | Weight Labels */}
                    <TableRow className="border-b-2 border-gray-400">
                      {sheetData.warehouses.map((warehouse) =>
                        warehouse.floors.map((floor) => (
                          <React.Fragment key={`${warehouse.name}-${floor}-labels`}>
                            <TableHead className="text-center text-xs bg-gray-50 border border-gray-400 min-w-[70px] font-semibold py-1">
                              Qty
                            </TableHead>
                            <TableHead className="text-center text-xs bg-gray-50 border border-gray-400 min-w-[70px] font-semibold py-1">
                              Weight (kg)
                            </TableHead>
                          </React.Fragment>
                        ))
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheetData.items.map((item) => {
                      // IMPORTANT: Use the same key format as the backend: item_name_group_subgroup
                      // Backend uses: `${entry.item_name?.toUpperCase() || ""}_${(entry.group || "").toUpperCase()}_${(entry.subgroup || "").toUpperCase()}`
                      const itemKey = `${item.item_name.toUpperCase()}_${(item.group || "").toUpperCase()}_${(item.subgroup || "").toUpperCase()}`;
                      
                      // Calculate total weight for this item across all warehouses and floors
                      let itemTotalWeight = 0;
                      sheetData.warehouses.forEach((warehouse) => {
                        warehouse.floors.forEach((floor) => {
                          const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0 };
                          itemTotalWeight += cellData.weight || 0;
                        });
                      });
                      
                      return (
                        <TableRow key={itemKey} className="border-b border-gray-300 hover:bg-gray-50">
                          <TableCell className="sticky left-0 z-10 bg-white border border-gray-400 text-xs py-1 px-2">
                            {item.group}
                          </TableCell>
                          <TableCell className="sticky left-[120px] z-10 bg-white border border-gray-400 text-xs py-1 px-2">
                            {item.subgroup}
                          </TableCell>
                          <TableCell className="sticky left-[240px] z-10 bg-white border border-gray-400 text-xs py-1 px-2 font-medium">
                            {item.item_name}
                          </TableCell>
                          <TableCell className="sticky left-[440px] z-10 bg-white border border-gray-400 text-xs py-1 px-2 text-center">
                            {(() => {
                              // Get UOM from first available data entry for this item
                              let uom = 0;
                              for (const warehouse of sheetData.warehouses) {
                                for (const floor of warehouse.floors) {
                                  const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor];
                                  if (cellData && cellData.uom) {
                                    uom = cellData.uom;
                                    break;
                                  }
                                }
                                if (uom > 0) break;
                              }
                              
                              return uom > 0 ? uom.toFixed(3) : "-";
                            })()}
                          </TableCell>
                          <TableCell className="sticky left-[540px] z-10 bg-white border border-gray-400 text-xs py-1 px-2 text-center font-medium">
                            {item.item_type && item.item_type.trim() ? item.item_type : "-"}
                          </TableCell>
                          <TableCell className={`sticky left-[640px] z-10 border border-gray-400 text-xs py-1 px-2 text-center font-bold ${
                            item.is_verified
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}>
                            {item.is_verified ? "Verified" : "Not Verified"}
                          </TableCell>
                          {sheetData.warehouses.map((warehouse) =>
                            warehouse.floors.map((floor) => {
                              const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0, uom: 0 };
                              const weight = cellData.weight || 0;
                              const quantity = cellData.quantity || 0;
                              
                              return (
                                <React.Fragment key={`${warehouse.name}-${floor}`}>
                                  <TableCell className="text-center font-semibold text-purple-700 bg-white border border-gray-400 text-xs py-1 px-2">
                                    {quantity > 0 ? quantity.toLocaleString() : "-"}
                                  </TableCell>
                                  <TableCell className="text-center border border-gray-400 bg-white text-xs py-1 px-2">
                                    {weight > 0 ? weight.toFixed(2) : "-"}
                                  </TableCell>
                                </React.Fragment>
                              );
                            })
                          )}
                          <TableCell className="text-center font-bold bg-green-50 border border-gray-400 text-xs py-1 px-2">
                            {itemTotalWeight > 0 ? itemTotalWeight.toFixed(2) : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Total Row */}
                    <TableRow className="bg-yellow-100 border-t-2 border-gray-400 font-bold">
                      <TableCell className="sticky left-0 z-10 bg-yellow-100 border border-gray-400 text-xs py-1 px-2">
                        TOTAL
                      </TableCell>
                      <TableCell className="sticky left-[120px] z-10 bg-yellow-100 border border-gray-400 text-xs py-1 px-2">
                        
                      </TableCell>
                      <TableCell className="sticky left-[240px] z-10 bg-yellow-100 border border-gray-400 text-xs py-1 px-2">
                        
                      </TableCell>
                      <TableCell className="sticky left-[440px] z-10 bg-yellow-100 border border-gray-400 text-xs py-1 px-2">
                        
                      </TableCell>
                      <TableCell className="sticky left-[540px] z-10 bg-yellow-100 border border-gray-400 text-xs py-1 px-2">

                      </TableCell>
                      <TableCell className="sticky left-[640px] z-10 bg-yellow-100 border border-gray-400 text-xs py-1 px-2">

                      </TableCell>
                      {sheetData.warehouses.map((warehouse) =>
                        warehouse.floors.map((floor) => {
                          let totalWeight = 0;
                          let totalQuantity = 0;
                          sheetData.items.forEach((item) => {
                            // Use correct key format: item_name_group_subgroup (same as backend)
                            const itemKey = `${item.item_name.toUpperCase()}_${(item.group || "").toUpperCase()}_${(item.subgroup || "").toUpperCase()}`;
                            const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0, uom: 0 };
                            totalWeight += cellData.weight || 0;
                            totalQuantity += cellData.quantity || 0;
                          });
                          return (
                            <React.Fragment key={`${warehouse.name}-${floor}-total`}>
                              <TableCell className="text-center font-bold text-purple-700 bg-yellow-100 border border-gray-400 text-xs py-1 px-2">
                                {totalQuantity > 0 ? totalQuantity.toLocaleString() : "-"}
                              </TableCell>
                              <TableCell className="text-center font-bold border border-gray-400 bg-yellow-100 text-xs py-1 px-2">
                                {totalWeight > 0 ? totalWeight.toFixed(2) : "-"}
                              </TableCell>
                            </React.Fragment>
                          );
                        })
                      )}
                      <TableCell className="text-center font-bold bg-yellow-200 border border-gray-400 text-xs py-1 px-2">
                        {(() => {
                          let grandTotalWeight = 0;
                          sheetData.items.forEach((item) => {
                            // Use correct key format: item_name_group_subgroup (same as backend)
                            const itemKey = `${item.item_name.toUpperCase()}_${(item.group || "").toUpperCase()}_${(item.subgroup || "").toUpperCase()}`;
                            sheetData.warehouses.forEach((warehouse) => {
                              warehouse.floors.forEach((floor) => {
                                const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0 };
                                grandTotalWeight += cellData.weight || 0;
                              });
                            });
                          });
                          return grandTotalWeight > 0 ? grandTotalWeight.toFixed(2) : "-";
                        })()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No data available for this date
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Merged Sheet Dialog */}
      <Dialog open={isMergedDialogOpen} onOpenChange={setIsMergedDialogOpen}>
        <DialogContent className="max-w-[95vw] lg:max-w-[98vw] h-[90vh] lg:h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-4 flex-shrink-0 border-b bg-background">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pr-8 sm:pr-10">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
                <Layers className="w-5 h-5 text-primary" />
                Merged Resultsheet — {mergeSelectedDates.length} date{mergeSelectedDates.length !== 1 ? "s" : ""}
              </DialogTitle>
              {mergedSheetData && mergedSheetData.items && mergedSheetData.items.length > 0 && (
                <Button
                  onClick={handleExportMergedToExcel}
                  className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                  disabled={exportingMerged}
                  size="sm"
                >
                  {exportingMerged ? (
                    <><Loader className="w-4 h-4 mr-2 animate-spin" />Exporting...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" />Download Merged Excel</>
                  )}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {mergeSelectedDates.map(d => (
                <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {formatDate(d)}
                </span>
              ))}
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {!mergedSheetData ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : mergedSheetData.items && mergedSheetData.items.length > 0 ? (
              <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="border-2 border-gray-300 rounded-lg inline-block min-w-full shadow-sm" style={{ maxHeight: 'calc(85vh - 150px)' }}>
                    <Table className="border-collapse w-full min-w-[1000px]">
                      <TableHeader>
                        <TableRow className="bg-blue-700 border-b-2 border-gray-400">
                          <TableHead className="sticky left-0 z-10 bg-blue-700 text-white text-center border border-gray-400 text-xs py-1 px-2" style={{ minWidth: 120 }}>Group</TableHead>
                          <TableHead className="sticky left-[120px] z-10 bg-blue-700 text-white text-center border border-gray-400 text-xs py-1 px-2" style={{ minWidth: 120 }}>Subgroup</TableHead>
                          <TableHead className="sticky left-[240px] z-10 bg-blue-700 text-white text-center border border-gray-400 text-xs py-1 px-2" style={{ minWidth: 200 }}>Item Name</TableHead>
                          <TableHead className="bg-blue-700 text-white text-center border border-gray-400 text-xs py-1 px-2" style={{ minWidth: 80 }}>UOM</TableHead>
                          <TableHead className="bg-blue-700 text-white text-center border border-gray-400 text-xs py-1 px-2" style={{ minWidth: 60 }}>Type</TableHead>
                          {mergedSheetData.warehouses.map(wh => (
                            wh.floors.map(floor => (
                              <React.Fragment key={`${wh.name}-${floor}`}>
                                <TableHead className="bg-blue-600 text-white text-center border border-gray-400 text-[10px] py-1 px-1" style={{ minWidth: 50 }}>
                                  {wh.name}<br/>{floor}<br/>Qty
                                </TableHead>
                                <TableHead className="bg-blue-600 text-white text-center border border-gray-400 text-[10px] py-1 px-1" style={{ minWidth: 60 }}>
                                  {wh.name}<br/>{floor}<br/>Wt(kg)
                                </TableHead>
                              </React.Fragment>
                            ))
                          ))}
                          <TableHead className="bg-green-700 text-white text-center border border-gray-400 text-xs py-1 px-2" style={{ minWidth: 90 }}>Total Wt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mergedSheetData.items.map((item, idx) => {
                          const itemKey = `${item.item_name?.toUpperCase()}_${item.group?.toUpperCase()}_${item.subgroup?.toUpperCase()}`;
                          let totalWt = 0;
                          return (
                            <TableRow key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <TableCell className="sticky left-0 z-10 border border-gray-300 text-xs py-1 px-2 font-medium" style={{ background: idx % 2 === 0 ? "#fff" : "#f9fafb" }}>{item.group}</TableCell>
                              <TableCell className="sticky left-[120px] z-10 border border-gray-300 text-xs py-1 px-2" style={{ background: idx % 2 === 0 ? "#fff" : "#f9fafb" }}>{item.subgroup}</TableCell>
                              <TableCell className="sticky left-[240px] z-10 border border-gray-300 text-xs py-1 px-2 font-medium" style={{ background: idx % 2 === 0 ? "#fff" : "#f9fafb" }}>{item.item_name}</TableCell>
                              <TableCell className="text-center border border-gray-300 text-xs py-1 px-2">
                                {(() => {
                                  for (const wh of mergedSheetData.warehouses) {
                                    for (const fl of wh.floors) {
                                      const c = mergedSheetData.data?.[itemKey]?.[wh.name]?.[fl];
                                      if (c?.uom) return c.uom.toFixed(3);
                                    }
                                  }
                                  return "-";
                                })()}
                              </TableCell>
                              <TableCell className="text-center border border-gray-300 text-xs py-1 px-2 uppercase">{item.item_type || "-"}</TableCell>
                              {mergedSheetData.warehouses.map(wh =>
                                wh.floors.map(floor => {
                                  const cell = mergedSheetData.data?.[itemKey]?.[wh.name]?.[floor];
                                  const wt = cell?.weight || 0;
                                  const qty = cell?.quantity || 0;
                                  totalWt += wt;
                                  return (
                                    <React.Fragment key={`${wh.name}-${floor}`}>
                                      <TableCell className="text-center border border-gray-300 text-xs py-1 px-1 text-purple-700 font-semibold">
                                        {qty > 0 ? qty : "-"}
                                      </TableCell>
                                      <TableCell className="text-center border border-gray-300 text-xs py-1 px-1">
                                        {wt > 0 ? wt.toFixed(2) : "-"}
                                      </TableCell>
                                    </React.Fragment>
                                  );
                                })
                              )}
                              <TableCell className="text-center font-bold bg-green-50 border border-gray-300 text-xs py-1 px-2">
                                {totalWt > 0 ? totalWt.toFixed(2) : "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No data available for selected dates
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
