import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Package, Loader, Download, BarChart3, FileText } from "lucide-react";
import { resultsheetAPI } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

interface Item {
  id: string;
  category: string;
  subcategory: string;
  description: string;
  totalWeight: number;
  units?: number;
  quantity?: number;
  packageSize?: number;
}

interface FloorSession {
  id: string;
  warehouse: string;
  floor?: string;
  floorName?: string;
  authority: string;
  items: Item[];
  status: string;
  totalWeight?: number;
  createdAt?: string;
  submittedAt?: string;
}

interface WarehouseData {
  [warehouseId: string]: {
    name: string;
    floors: {
      [floorId: string]: {
        sessions: FloorSession[];
        totalWeight: number;
        itemCount: number;
      };
    };
    totalWeight: number;
    totalItems: number;
  };
}

export default function AllEntriesSummary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [warehouseData, setWarehouseData] = useState<WarehouseData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    // Load all floor sessions and organize by warehouse and floor
    const allSessions = JSON.parse(
      localStorage.getItem("floorSessions") || "[]"
    );

    // Filter sessions by selected date
    const filteredSessions = allSessions.filter((session: FloorSession) => {
      if (!selectedDate) return true; // If no date selected, show all
      
      const sessionDate = session.submittedAt || session.createdAt;
      if (!sessionDate) return false;
      
      const sessionDateStr = new Date(sessionDate).toISOString().split("T")[0];
      return sessionDateStr === selectedDate;
    });

    const organized: WarehouseData = {};

    filteredSessions.forEach((session: FloorSession) => {
      const warehouseId = session.warehouse;
      const floorId = session.floorName || session.floor || 'Unknown';

      if (!organized[warehouseId]) {
        organized[warehouseId] = {
          name: session.warehouse,
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

      const sessionTotalWeight = session.items.reduce(
        (sum: number, item: Item) => sum + item.totalWeight,
        0
      );
      const sessionTotalQuantity = session.items.reduce(
        (sum: number, item: Item) => sum + (item.units || item.quantity || 0),
        0
      );

      organized[warehouseId].floors[floorId].sessions.push({
        ...session,
        totalWeight: sessionTotalWeight,
      });

      organized[warehouseId].floors[floorId].totalWeight += sessionTotalWeight;
      organized[warehouseId].floors[floorId].totalQuantity += sessionTotalQuantity;
      organized[warehouseId].floors[floorId].itemCount += session.items.length;

      organized[warehouseId].totalWeight += sessionTotalWeight;
      organized[warehouseId].totalQuantity += sessionTotalQuantity;
      organized[warehouseId].totalItems += session.items.length;
    });

    setWarehouseData(organized);
    setIsLoading(false);
  }, [selectedDate]);

  const handleExportToExcel = async () => {
    setExporting(true);

    try {
      // Dynamic import of exceljs
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();

      // Get all unique items across all sessions
      const allSessions = JSON.parse(
        localStorage.getItem("floorSessions") || "[]"
      );

      const itemMap = new Map<string, Map<string, number>>();
      const floors = new Set<string>();

      // Organize data: itemKey (category:::subcategory:::description) -> (floor -> totalWeight)
      allSessions.forEach((session: FloorSession) => {
        const floorLabel = session.floorName || (session.floor ? `Floor ${session.floor}` : 'Unknown');
        floors.add(floorLabel);

        session.items.forEach((item: Item) => {
          // Create unique key from category, subcategory, and description using ::: separator
          const itemKey = `${item.category}:::${item.subcategory}:::${item.description}`;
          if (!itemMap.has(itemKey)) {
            itemMap.set(itemKey, new Map());
          }
          const floorKey = session.floorName || (session.floor ? `Floor ${session.floor}` : 'Unknown');
          const currentWeight = itemMap.get(itemKey)?.get(floorKey) || 0;
          itemMap.get(itemKey)?.set(floorKey, currentWeight + item.totalWeight);
        });
      });

      // Create worksheet
      const worksheet = workbook.addWorksheet("Stock Audit");

      // Add headers
      const headers = ["Category", "Sub-Category", "Description", ...Array.from(floors).sort()];
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };

      // Add data rows
      Array.from(itemMap.entries()).forEach(([itemKey, floorData]) => {
        const [category, subcategory, description] = itemKey.split(':::');
        const row = [category, subcategory, description];
        Array.from(floors)
          .sort()
          .forEach((floor) => {
            const weight = floorData.get(floor) || 0;
            row.push(weight > 0 ? weight.toFixed(2) : "-");
          });
        worksheet.addRow(row);
      });

      // Add total row
      const totalRow = ["TOTAL", "", ""];
      Array.from(floors)
        .sort()
        .forEach((floor) => {
          let total = 0;
          itemMap.forEach((floorData) => {
            total += floorData.get(floor) || 0;
          });
          totalRow.push(total.toFixed(2));
        });
      const totalRowObj = worksheet.addRow(totalRow);
      totalRowObj.font = { bold: true };
      totalRowObj.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

      // Adjust column widths
      worksheet.columns.forEach((col) => {
        col.width = 15;
      });

      // Save file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Stock_Audit_${new Date().toISOString().split("T")[0]}.xlsx`;
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
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalGrandWeight = Object.values(warehouseData).reduce(
    (sum, wh) => sum + wh.totalWeight,
    0
  );
  const totalGrandQuantity = Object.values(warehouseData).reduce(
    (sum, wh) => sum + (wh.totalQuantity || 0),
    0
  );
  const totalGrandItems = Object.values(warehouseData).reduce(
    (sum, wh) => sum + wh.totalItems,
    0
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <span className="text-lg sm:text-xl font-bold text-foreground">StockTake</span>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            size="sm"
            className="text-xs sm:text-sm"
          >
            <ArrowLeft className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container py-6 sm:py-12 px-4 sm:px-6">
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
              {/* Date Filter */}
              <div className="flex items-center gap-3 flex-wrap">
                <label htmlFor="date-filter" className="text-sm font-medium text-foreground">
                  Filter by Date:
                </label>
                <input
                  id="date-filter"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                />
                {selectedDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                    className="text-xs h-8"
                  >
                    Today
                  </Button>
                )}
              </div>
            </div>
            <Button
              onClick={handleExportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white text-sm sm:text-base w-full sm:w-auto"
              disabled={exporting || totalGrandItems === 0}
            >
              {exporting ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export to Excel
                </>
              )}
            </Button>
          </div>

          {/* Grand Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <Card className="p-4 sm:p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                Total Warehouses
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-primary">
                {Object.keys(warehouseData).length}
              </p>
            </Card>
            <Card className="p-4 sm:p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                Total Items
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-blue-600 dark:text-blue-400">
                {totalGrandItems}
              </p>
            </Card>
            <Card className="p-4 sm:p-6 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                Total Weight
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-green-600 dark:text-green-400">
                {totalGrandWeight.toFixed(2)} kg
              </p>
            </Card>
            <Card className="p-4 sm:p-6 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                Total Quantity
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-purple-600 dark:text-purple-400">
                {totalGrandQuantity.toLocaleString()}
              </p>
            </Card>
          </div>

          {/* Warehouse Breakdown */}
          {Object.keys(warehouseData).length === 0 ? (
            <Card className="p-6 sm:p-12 text-center bg-muted/50">
              <BarChart3 className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-base sm:text-lg font-semibold text-foreground mb-1">
                No entries yet
              </p>
              <p className="text-sm sm:text-base text-muted-foreground">
                Floor staff need to submit stock entries first.
              </p>
            </Card>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {Object.entries(warehouseData).map(
                ([warehouseId, warehouseInfo]) => (
                  <Card key={warehouseId} className="border-border overflow-hidden">
                    <div className="p-4 sm:p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                          {warehouseInfo.name}
                        </h2>
                        <div className="text-left sm:text-right">
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            Total Weight
                          </p>
                          <p className="text-xl sm:text-2xl font-bold text-primary">
                            {warehouseInfo.totalWeight.toFixed(2)} kg
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 sm:p-6">
                      <div className="space-y-4">
                        {Object.entries(warehouseInfo.floors)
                          .sort(([floorA], [floorB]) =>
                            parseInt(floorA) - parseInt(floorB)
                          )
                          .map(([floorId, floorInfo]) => (
                            <div
                              key={floorId}
                              className="p-4 border border-border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="font-semibold text-foreground">
                                    Floor {floorId}
                                  </h3>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {floorInfo.itemCount} items
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xl font-bold text-primary">
                                    {floorInfo.totalWeight.toFixed(2)} kg
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {floorInfo.sessions.filter(
                                      (s) => s.status === "APPROVED"
                                    ).length
                                      ? "✓ Approved"
                                      : "Pending"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </Card>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
