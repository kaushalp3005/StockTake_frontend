import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Package, Loader, Eye, Calendar, Clock, X, Download } from "lucide-react";
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
  group: string;
  subgroup: string;
}

interface Warehouse {
  name: string;
  floors: string[];
}

interface ResultsheetData {
  date: string;
  items: ResultsheetDataItem[];
  warehouses: Warehouse[];
  data: Record<string, Record<string, Record<string, { weight: number; quantity: number }>>>;
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
      // Format date with time for more specific query
      const dateStr = entry.createdAt 
        ? new Date(entry.createdAt).toISOString().split('T')[0]
        : entry.date;
      
      const response = await resultsheetAPI.getData(dateStr);
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

  const handleExportToExcel = async () => {
    if (!sheetData) return;
    
    setExporting(true);
    try {
      // Dynamic import of exceljs
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Resultsheet");

      // Build header rows
      // Row 1: Group | Subgroup | Item Name | Warehouse1 (colspan) | Warehouse2 (colspan) | ... | Total Weight
      const headerRow1 = ["Group", "Subgroup", "Item Name"];
      sheetData.warehouses.forEach((warehouse) => {
        // Add warehouse name spanning all its floors (2 cols per floor: weight + qty)
        for (let i = 0; i < warehouse.floors.length * 2; i++) {
          if (i === 0) {
            headerRow1.push(warehouse.name);
          } else {
            headerRow1.push(""); // Empty cells for colspan
          }
        }
      });
      headerRow1.push("Total Weight (kg)"); // Add total column header
      const row1 = worksheet.addRow(headerRow1);
      row1.font = { bold: true, size: 12 };
      row1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      row1.alignment = { horizontal: "center", vertical: "middle" };

      // Row 2: Floor names (each spanning 2 columns)
      const headerRow2 = ["", "", ""]; // Empty for Group, Subgroup, Item Name
      sheetData.warehouses.forEach((warehouse) => {
        warehouse.floors.forEach((floor) => {
          headerRow2.push(floor);
          headerRow2.push(""); // Empty for colspan
        });
      });
      headerRow2.push(""); // Empty for total column (spans 3 rows)
      const row2 = worksheet.addRow(headerRow2);
      row2.font = { bold: true, size: 11 };
      row2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      row2.alignment = { horizontal: "center", vertical: "middle" };

      // Row 3: Qty | Weight labels
      const headerRow3 = ["", "", ""]; // Empty for Group, Subgroup, Item Name
      sheetData.warehouses.forEach((warehouse) => {
        warehouse.floors.forEach(() => {
          headerRow3.push("Qty");
          headerRow3.push("Weight (kg)");
        });
      });
      headerRow3.push(""); // Empty for total column (spans 3 rows)
      const row3 = worksheet.addRow(headerRow3);
      row3.font = { bold: true, size: 10 };
      row3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
      row3.alignment = { horizontal: "center", vertical: "middle" };

      // Merge cells for warehouse headers
      let colIndex = 2; // Start after "Item Name"
      sheetData.warehouses.forEach((warehouse) => {
        const colspan = warehouse.floors.length * 2;
        worksheet.mergeCells(1, colIndex, 1, colIndex + colspan - 1);
        colIndex += colspan;
      });

      // Merge cells for floor headers
      colIndex = 4; // Start after Group, Subgroup, Item Name
      sheetData.warehouses.forEach((warehouse) => {
        warehouse.floors.forEach(() => {
          worksheet.mergeCells(2, colIndex, 2, colIndex + 1);
          colIndex += 2;
        });
      });
      
      // Merge cells for Total Weight column (spans 3 rows)
      const totalColIndex = colIndex;
      worksheet.mergeCells(1, totalColIndex, 3, totalColIndex);
      const totalHeaderCell = worksheet.getCell(1, totalColIndex);
      totalHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } }; // Green background

      // Add data rows
      sheetData.items.forEach((item) => {
        const itemKey = item.item_name.toUpperCase();
        const row = [item.group, item.subgroup, item.item_name];
        
        // Calculate total weight for this item
        let itemTotalWeight = 0;
        sheetData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach((floor) => {
            const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0 };
            row.push(cellData.quantity > 0 ? cellData.quantity : "-");
            row.push(cellData.weight > 0 ? cellData.weight.toFixed(2) : "-");
            itemTotalWeight += cellData.weight || 0;
          });
        });
        
        // Add total weight column
        row.push(itemTotalWeight > 0 ? itemTotalWeight.toFixed(2) : "-");
        
        const dataRow = worksheet.addRow(row);
        dataRow.alignment = { horizontal: "left", vertical: "middle" };
        // Center align qty and weight columns
        let dataCol = 4; // Start after Group, Subgroup, Item Name
        sheetData.warehouses.forEach((warehouse) => {
          warehouse.floors.forEach(() => {
            dataRow.getCell(dataCol).alignment = { horizontal: "center" }; // Qty
            dataRow.getCell(dataCol + 1).alignment = { horizontal: "center" }; // Weight
            dataCol += 2;
          });
        });
        // Center align total weight column
        dataRow.getCell(dataCol).alignment = { horizontal: "center" };
        dataRow.getCell(dataCol).font = { bold: true };
        dataRow.getCell(dataCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } }; // Light green
      });

      // Add total row
      const totalRow = ["TOTAL", "", ""]; // Group, Subgroup, Item Name
      let grandTotalWeight = 0;
      sheetData.warehouses.forEach((warehouse) => {
        warehouse.floors.forEach((floor) => {
          let totalWeight = 0;
          let totalQuantity = 0;
          sheetData.items.forEach((item) => {
            const itemKey = item.item_name.toUpperCase();
            const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0 };
            totalWeight += cellData.weight || 0;
            totalQuantity += cellData.quantity || 0;
            grandTotalWeight += cellData.weight || 0;
          });
          totalRow.push(totalQuantity > 0 ? totalQuantity : "-");
          totalRow.push(totalWeight > 0 ? totalWeight.toFixed(2) : "-");
        });
      });
      // Add grand total weight
      totalRow.push(grandTotalWeight > 0 ? grandTotalWeight.toFixed(2) : "-");
      const totalRowObj = worksheet.addRow(totalRow);
      totalRowObj.font = { bold: true };
      totalRowObj.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
      totalRowObj.alignment = { horizontal: "left", vertical: "middle" };
      // Center align total columns
      let totalCol = 4; // Start after Group, Subgroup, Item Name
      sheetData.warehouses.forEach((warehouse) => {
        warehouse.floors.forEach(() => {
          totalRowObj.getCell(totalCol).alignment = { horizontal: "center" };
          totalRowObj.getCell(totalCol + 1).alignment = { horizontal: "center" };
          totalCol += 2;
        });
      });
      // Center align grand total weight
      totalRowObj.getCell(totalCol).alignment = { horizontal: "center" };
      totalRowObj.getCell(totalCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } }; // Darker yellow

      // Add borders to all cells
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        });
      });

      // Set column widths
      worksheet.getColumn(1).width = 15; // Group
      worksheet.getColumn(2).width = 15; // Subgroup
      worksheet.getColumn(3).width = 30; // Item Name
      let widthCol = 4; // Start after Group, Subgroup, Item Name
      sheetData.warehouses.forEach((warehouse) => {
        warehouse.floors.forEach(() => {
          worksheet.getColumn(widthCol).width = 10; // Qty
          worksheet.getColumn(widthCol + 1).width = 12; // Weight
          widthCol += 2;
        });
      });
      worksheet.getColumn(widthCol).width = 15; // Total Weight column

      // Freeze first column
      worksheet.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2">
              Resultsheet Summary
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              View saved stock take results by date and time
            </p>
          </div>

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
            <div className="space-y-4">
              {entries.map((entry, index) => (
                <Card key={index} className="border-border overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-lg">
                          <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg sm:text-xl font-bold text-foreground">
                              {formatDate(entry.date)}
                            </span>
                            {entry.time && (
                              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                {formatTime(entry.time)}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-4 text-sm text-muted-foreground">
                            <span>{entry.entryCount} entries</span>
                            <span>•</span>
                            <span className="font-semibold text-primary">
                              {entry.totalWeight.toFixed(2)} kg
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleViewSheet(entry)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Sheet
                      </Button>
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
        <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
            <div className="flex items-center justify-between pr-10">
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Resultsheet - {selectedDate && formatDate(selectedDate)}
              </DialogTitle>
              {sheetData && sheetData.items.length > 0 && (
                <Button
                  onClick={handleExportToExcel}
                  className="bg-green-600 hover:bg-green-700 text-white mr-2"
                  disabled={exporting}
                  size="sm"
                >
                  {exporting ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Download Excel
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full px-6 pb-6">
            {isLoadingSheet ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : sheetData && sheetData.items.length > 0 ? (
              <div className="overflow-x-auto border border-gray-300 w-full" style={{ maxHeight: 'calc(90vh - 200px)' }}>
                <Table className="border-collapse">
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
                      const itemKey = item.item_name.toUpperCase();
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
                          {sheetData.warehouses.map((warehouse) =>
                            warehouse.floors.map((floor) => {
                              const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0 };
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
                      {sheetData.warehouses.map((warehouse) =>
                        warehouse.floors.map((floor) => {
                          let totalWeight = 0;
                          let totalQuantity = 0;
                          sheetData.items.forEach((item) => {
                            const itemKey = item.item_name.toUpperCase();
                            const cellData = sheetData.data[itemKey]?.[warehouse.name]?.[floor] || { weight: 0, quantity: 0 };
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
                            const itemKey = item.item_name.toUpperCase();
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
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No data available for this date
              </div>
            )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
