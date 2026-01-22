import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Package, ArrowRight, Download, Loader } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FloorSession {
  id: string;
  warehouse: string;
  floor?: string;
  floorName?: string;
  items: Array<{
    stockType?: string;
    category: string;
    subcategory: string;
    description: string;
    packageSize: number;
    units: number;
    totalWeight: number;
  }>;
  userName?: string;
  userEmail?: string;
  submittedAt?: string;
  createdAt?: string;
}

export default function SubmissionSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const sessionId = (location.state as any)?.sessionId;
  const [floorSession, setFloorSession] = useState<FloorSession | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const hasAutoDownloadedRef = useRef(false);

  useEffect(() => {
    // Get the submitted session from localStorage
    const sessionStr = localStorage.getItem("currentFloorSession");
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        setFloorSession(session);
      } catch (error) {
        console.error("Error parsing session:", error);
      }
    }
  }, []);

  // Auto-download when page loads and session is available
  useEffect(() => {
    if (
      floorSession &&
      floorSession.items &&
      floorSession.items.length > 0 &&
      !hasAutoDownloadedRef.current &&
      !isExporting
    ) {
      // Small delay to ensure page is fully loaded
      const timer = setTimeout(async () => {
        hasAutoDownloadedRef.current = true;
        setIsExporting(true);
        try {
          // Dynamic import of exceljs
          const ExcelJS = (await import("exceljs")).default;
          const workbook = new ExcelJS.Workbook();
          
          // Separate items by stock type
          const freshStockItems = floorSession.items.filter(
            item => item.stockType === "Fresh Stock" || !item.stockType
          );
          const offGradeItems = floorSession.items.filter(
            item => item.stockType === "Off Grade/Rejection"
          );

          // Helper function to create a worksheet with items
          const createWorksheet = (ws: any, items: any[], sheetTitle: string) => {
            // Add header section
            const headerRow1 = ws.addRow([sheetTitle]);
            headerRow1.font = { bold: true, size: 16 };
            headerRow1.height = 25;
            ws.mergeCells(1, 1, 1, 8);

            const headerRow2 = ws.addRow([
              "Warehouse:",
              floorSession.warehouse || "N/A",
              "",
              "Floor:",
              floorSession.floorName || floorSession.floor || "N/A",
            ]);
            headerRow2.font = { bold: true };
            ws.mergeCells(2, 1, 2, 2);
            ws.mergeCells(2, 4, 2, 5);

            const headerRow3 = ws.addRow([
              "Submitted By:",
              floorSession.userName || "N/A",
              "",
              "Submitted At:",
              floorSession.submittedAt
                ? new Date(floorSession.submittedAt).toLocaleString()
                : new Date().toLocaleString(),
            ]);
            headerRow3.font = { bold: true };
            ws.mergeCells(3, 1, 3, 2);
            ws.mergeCells(3, 4, 3, 5);

            // Empty row
            ws.addRow([]);

            // Table headers
            const headers = [
              "S.No",
              "Category (Group)",
              "Subcategory",
              "Item Description",
              "UOM (kg)",
              "Units",
              "Total Weight (kg)",
            ];
            const headerRow = ws.addRow(headers);
            headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
            headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
            headerRow.alignment = { horizontal: "center", vertical: "middle" };

            // Add data rows
            items.forEach((item: any, index: number) => {
              const row = [
                index + 1,
                item.category,
                item.subcategory,
                item.description,
                item.packageSize.toFixed(3),
                item.units,
                item.totalWeight.toFixed(2),
              ];
              const dataRow = ws.addRow(row);
              dataRow.alignment = { horizontal: "left", vertical: "middle" };
              // Center align numeric columns
              dataRow.getCell(1).alignment = { horizontal: "center" }; // S.No
              dataRow.getCell(5).alignment = { horizontal: "center" }; // UOM
              dataRow.getCell(6).alignment = { horizontal: "center" }; // Units
              dataRow.getCell(7).alignment = { horizontal: "center" }; // Total Weight
            });

            // Add total row
            const totalWeight = items.reduce(
              (sum: number, item: any) => sum + item.totalWeight,
              0
            );
            const totalUnits = items.reduce(
              (sum: number, item: any) => sum + item.units,
              0
            );
            const totalRow = [
              "TOTAL",
              "",
              "",
              "",
              "",
              totalUnits,
              totalWeight.toFixed(2),
            ];
            const totalRowObj = ws.addRow(totalRow);
            totalRowObj.font = { bold: true };
            totalRowObj.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
            totalRowObj.alignment = { horizontal: "left", vertical: "middle" };
            totalRowObj.getCell(6).alignment = { horizontal: "center" };
            totalRowObj.getCell(7).alignment = { horizontal: "center" };

            // Add borders to all cells
            ws.eachRow((row: any, rowNumber: number) => {
              if (rowNumber > 4) {
                // Skip header section
                row.eachCell((cell: any) => {
                  cell.border = {
                    top: { style: "thin", color: { argb: "FF000000" } },
                    left: { style: "thin", color: { argb: "FF000000" } },
                    bottom: { style: "thin", color: { argb: "FF000000" } },
                    right: { style: "thin", color: { argb: "FF000000" } },
                  };
                });
              }
            });

            // Set column widths
            ws.getColumn(1).width = 8; // S.No
            ws.getColumn(2).width = 20; // Category
            ws.getColumn(3).width = 20; // Subcategory
            ws.getColumn(4).width = 35; // Description
            ws.getColumn(5).width = 12; // UOM
            ws.getColumn(6).width = 12; // Units
            ws.getColumn(7).width = 15; // Total Weight

            // Freeze header row
            ws.views = [{ state: "frozen", ySplit: 5 }];
          };

          // Create sheets based on available stock types
          if (freshStockItems.length > 0) {
            const freshSheet = workbook.addWorksheet("Fresh Stock");
            createWorksheet(freshSheet, freshStockItems, "Fresh Stock Entries");
          }
          if (offGradeItems.length > 0) {
            const offGradeSheet = workbook.addWorksheet("Off Grade-Rejection");
            createWorksheet(offGradeSheet, offGradeItems, "Off Grade/Rejection Entries");
          }
          // If no stock types defined, create a default sheet
          if (freshStockItems.length === 0 && offGradeItems.length === 0) {
            const defaultSheet = workbook.addWorksheet("Submitted Entries");
            createWorksheet(defaultSheet, floorSession.items, "Submitted Stock Entries");
          }

          // Save file
          const buffer = await workbook.xlsx.writeBuffer();
          const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          const dateStr = floorSession.submittedAt
            ? new Date(floorSession.submittedAt).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];
          const warehouse = (floorSession.warehouse || "Unknown").replace(/\s/g, "_");
          const floor = (floorSession.floorName || floorSession.floor || "Unknown").replace(/\s/g, "_");
          link.download = `Submitted_Entries_${warehouse}_${floor}_${dateStr}.xlsx`;
          link.click();
          window.URL.revokeObjectURL(url);

          toast({
            title: "Success",
            description: "Submitted entries exported to Excel successfully",
          });
        } catch (err) {
          console.error("Failed to auto-export:", err);
          // Don't show error toast for auto-download to avoid interrupting user
        } finally {
          setIsExporting(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [floorSession, isExporting, toast]);

  const handleDownloadRecord = async () => {
    if (!floorSession || !floorSession.items || floorSession.items.length === 0) {
      toast({
        title: "Error",
        description: "No submitted entries found to download",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      // Dynamic import of exceljs
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      
      // Separate items by stock type
      const freshStockItems = floorSession.items.filter(
        item => item.stockType === "Fresh Stock" || !item.stockType
      );
      const offGradeItems = floorSession.items.filter(
        item => item.stockType === "Off Grade/Rejection"
      );

      // Helper function to create a worksheet with items
      const createWorksheet = (ws: any, items: any[], sheetTitle: string) => {
        // Add header section
        const headerRow1 = ws.addRow([sheetTitle]);
        headerRow1.font = { bold: true, size: 16 };
        headerRow1.height = 25;
        ws.mergeCells(1, 1, 1, 8);

        const headerRow2 = ws.addRow([
          "Warehouse:",
          floorSession.warehouse || "N/A",
          "",
          "Floor:",
          floorSession.floorName || floorSession.floor || "N/A",
        ]);
        headerRow2.font = { bold: true };
        ws.mergeCells(2, 1, 2, 2);
        ws.mergeCells(2, 4, 2, 5);

        const headerRow3 = ws.addRow([
          "Submitted By:",
          floorSession.userName || "N/A",
          "",
          "Submitted At:",
          floorSession.submittedAt
            ? new Date(floorSession.submittedAt).toLocaleString()
            : new Date().toLocaleString(),
        ]);
        headerRow3.font = { bold: true };
        ws.mergeCells(3, 1, 3, 2);
        ws.mergeCells(3, 4, 3, 5);

        // Empty row
        ws.addRow([]);

        // Table headers
        const headers = [
          "S.No",
          "Category (Group)",
          "Subcategory",
          "Item Description",
          "UOM (kg)",
          "Units",
          "Total Weight (kg)",
        ];
        const headerRow = ws.addRow(headers);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
        headerRow.alignment = { horizontal: "center", vertical: "middle" };

        // Add data rows
        items.forEach((item: any, index: number) => {
          const row = [
            index + 1,
            item.category,
            item.subcategory,
            item.description,
            item.packageSize.toFixed(3),
            item.units,
            item.totalWeight.toFixed(2),
          ];
          const dataRow = ws.addRow(row);
          dataRow.alignment = { horizontal: "left", vertical: "middle" };
          // Center align numeric columns
          dataRow.getCell(1).alignment = { horizontal: "center" }; // S.No
          dataRow.getCell(5).alignment = { horizontal: "center" }; // UOM
          dataRow.getCell(6).alignment = { horizontal: "center" }; // Units
          dataRow.getCell(7).alignment = { horizontal: "center" }; // Total Weight
        });

        // Add total row
        const totalWeight = items.reduce(
          (sum: number, item: any) => sum + item.totalWeight,
          0
        );
        const totalUnits = items.reduce(
          (sum: number, item: any) => sum + item.units,
          0
        );
        const totalRow = [
          "TOTAL",
          "",
          "",
          "",
          "",
          totalUnits,
          totalWeight.toFixed(2),
        ];
        const totalRowObj = ws.addRow(totalRow);
        totalRowObj.font = { bold: true };
        totalRowObj.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
        totalRowObj.alignment = { horizontal: "left", vertical: "middle" };
        totalRowObj.getCell(6).alignment = { horizontal: "center" };
        totalRowObj.getCell(7).alignment = { horizontal: "center" };

        // Add borders to all cells
        ws.eachRow((row: any, rowNumber: number) => {
          if (rowNumber > 4) {
            // Skip header section
            row.eachCell((cell: any) => {
              cell.border = {
                top: { style: "thin", color: { argb: "FF000000" } },
                left: { style: "thin", color: { argb: "FF000000" } },
                bottom: { style: "thin", color: { argb: "FF000000" } },
                right: { style: "thin", color: { argb: "FF000000" } },
              };
            });
          }
        });

        // Set column widths
        ws.getColumn(1).width = 8; // S.No
        ws.getColumn(2).width = 20; // Category
        ws.getColumn(3).width = 20; // Subcategory
        ws.getColumn(4).width = 35; // Description
        ws.getColumn(5).width = 12; // UOM
        ws.getColumn(6).width = 12; // Units
        ws.getColumn(7).width = 15; // Total Weight

        // Freeze header row
        ws.views = [{ state: "frozen", ySplit: 5 }];
      };

      // Create sheets based on available stock types
      if (freshStockItems.length > 0) {
        const freshSheet = workbook.addWorksheet("Fresh Stock");
        createWorksheet(freshSheet, freshStockItems, "Fresh Stock Entries");
      }
      if (offGradeItems.length > 0) {
        const offGradeSheet = workbook.addWorksheet("Off Grade-Rejection");
        createWorksheet(offGradeSheet, offGradeItems, "Off Grade/Rejection Entries");
      }
      // If no stock types defined, create a default sheet
      if (freshStockItems.length === 0 && offGradeItems.length === 0) {
        const defaultSheet = workbook.addWorksheet("Submitted Entries");
        createWorksheet(defaultSheet, floorSession.items, "Submitted Stock Entries");
      }

      // Save file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = floorSession.submittedAt
        ? new Date(floorSession.submittedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      const warehouse = (floorSession.warehouse || "Unknown").replace(/\s/g, "_");
      const floor = (floorSession.floorName || floorSession.floor || "Unknown").replace(/\s/g, "_");
      link.download = `Submitted_Entries_${warehouse}_${floor}_${dateStr}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Submitted entries exported to Excel successfully",
      });
    } catch (err) {
      console.error("Failed to export:", err);
      toast({
        title: "Error",
        description: "Failed to export to Excel",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <span className="text-lg sm:text-xl font-bold text-foreground">StockTake</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container py-6 sm:py-12 px-4 sm:px-6">
        <div className="max-w-md mx-auto text-center">
          {/* Success Icon */}
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="p-4 sm:p-6 bg-green-100 dark:bg-green-950/30 rounded-full">
              <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-green-600 dark:text-green-500" />
            </div>
          </div>

          {/* Success Message */}
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Entries Submitted Successfully!
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8">
            Your stock entries have been submitted and are now awaiting review
            by the inventory manager.
          </p>

          {/* Details Card */}
          <Card className="p-4 sm:p-6 mb-6 sm:mb-8 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <div className="text-left space-y-3">
              <div>
                <p className="text-xs text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                  Session ID
                </p>
                <p className="font-mono text-sm text-blue-900 dark:text-blue-100 break-all">
                  {sessionId || "N/A"}
                </p>
              </div>
              <div className="pt-3 border-t border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">
                  What's next?
                </p>
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  The inventory manager will review your entries. You can return
                  to the dashboard and start entering stock for another floor if
                  needed.
                </p>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-3">
            {floorSession && floorSession.items && floorSession.items.length > 0 && (
              <Button
                onClick={handleDownloadRecord}
                disabled={isExporting}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {isExporting ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download Record
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={() => navigate("/dashboard")}
              className="w-full bg-primary hover:bg-primary/90 text-white"
            >
              Return to Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              onClick={() => navigate("/audit/floor-selection")}
              variant="outline"
              className="w-full"
            >
              Enter Stock for Another Floor
            </Button>
          </div>

          {/* Info Section */}
          <Card className="p-4 sm:p-6 mt-6 sm:mt-8 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <h3 className="font-semibold text-sm sm:text-base text-amber-900 dark:text-amber-100 mb-2">
              Important Note
            </h3>
            <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
              Once submitted, your entries cannot be edited. If you need to make
              changes, please contact your inventory manager.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
