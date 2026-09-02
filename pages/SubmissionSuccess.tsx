import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Package, ArrowRight, Download, Loader } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadEntriesAsExcel } from "@/services/excelService";
import { businessDay, businessToday } from "@/lib/utils";

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
    // Get the submitted session from localStorage (temporary storage for download)
    let sessionStr = localStorage.getItem("submittedFloorSession");
    
    // Fallback to currentFloorSession if submittedFloorSession doesn't exist (for backward compatibility)
    if (!sessionStr) {
      sessionStr = localStorage.getItem("currentFloorSession");
    }
    
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        setFloorSession(session);
        
        // Clean up the temporary storage after we've loaded it
        localStorage.removeItem("submittedFloorSession");
      } catch (error) {
        console.error("Error parsing session:", error);
      }
    }
  }, []);

  // Helper: map local session items to the shape expected by downloadEntriesAsExcel.
  // Newly submitted entries are not yet verified, so F1 fields are set to empty/false.
  const buildEntriesFromSession = (session: FloorSession) =>
    (session.items || []).map((item: any) => ({
      entryId: item.id ?? null,
      itemName: item.description || item.subcategory || item.category || "",
      itemType: item.itemType ?? item.stockType ?? "",
      itemCategory: item.category ?? "",
      itemSubcategory: item.subcategory ?? "",
      floorName: session.floorName || session.floor || "",
      warehouse: session.warehouse || "",
      totalQuantity: item.units ?? 0,
      unitUom: item.packageSize ?? 0,
      totalWeight: item.totalWeight ?? 0,
      stockType: item.stockType || "Fresh Stock",
      enteredBy: session.userName || session.userEmail || "",
      createdAt: session.submittedAt || session.createdAt || new Date().toISOString(),
      // F1: freshly submitted — not yet verified
      verified: false,
      verifiedBy: "",
      verifiedAt: null,
      remark: "",
    }));

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
          const entries = buildEntriesFromSession(floorSession);
          const dateStr = businessDay(floorSession.submittedAt) || businessToday();
          const safeWarehouse = (floorSession.warehouse || "Unknown").replace(/\s+/g, "_");
          const safeFloor = (floorSession.floorName || floorSession.floor || "Unknown").replace(/\s+/g, "_");

          await downloadEntriesAsExcel({
            entries,
            title: `${floorSession.warehouse || ""} — ${floorSession.floorName || floorSession.floor || ""}`,
            warehouse: floorSession.warehouse || "",
            floorName: floorSession.floorName || floorSession.floor || "",
            exportedBy: floorSession.userName || floorSession.userEmail || "",
            filename: `Submitted_Entries_${safeWarehouse}_${safeFloor}_${dateStr}.xlsx`,
          });

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
  }, [floorSession]); // Removed toast and isExporting from dependencies

  const handleDownloadRecord = async () => {
    if (!floorSession || !floorSession.items || floorSession.items.length === 0) {
      setTimeout(() => {
        toast({
          title: "Error",
          description: "No submitted entries found to download",
          variant: "destructive",
        });
      }, 100);
      return;
    }

    setIsExporting(true);
    try {
      const entries = buildEntriesFromSession(floorSession);
      const dateStr = businessDay(floorSession.submittedAt) || businessToday();
      const safeWarehouse = (floorSession.warehouse || "Unknown").replace(/\s+/g, "_");
      const safeFloor = (floorSession.floorName || floorSession.floor || "Unknown").replace(/\s+/g, "_");

      await downloadEntriesAsExcel({
        entries,
        title: `${floorSession.warehouse || ""} — ${floorSession.floorName || floorSession.floor || ""}`,
        warehouse: floorSession.warehouse || "",
        floorName: floorSession.floorName || floorSession.floor || "",
        exportedBy: floorSession.userName || floorSession.userEmail || "",
        filename: `Submitted_Entries_${safeWarehouse}_${safeFloor}_${dateStr}.xlsx`,
      });

      setTimeout(() => {
        toast({
          title: "Success",
          description: "Submitted entries exported to Excel successfully",
        });
      }, 100);
    } catch (err) {
      console.error("Failed to export:", err);
      setTimeout(() => {
        toast({
          title: "Error",
          description: "Failed to export to Excel",
          variant: "destructive",
        });
      }, 100);
    } finally {
      setIsExporting(false);
    }
  };

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
