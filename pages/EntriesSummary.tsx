import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Package, Loader, ArrowRight, Edit2 } from "lucide-react";
import { stocktakeEntriesAPI } from "@/utils/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Item {
  id: string;
  databaseId?: string; // Database entry ID if this item was loaded from database
  entryId?: string; // Batch entry ID (YYMM0001 format)
  category: string;
  subcategory: string;
  description: string;
  packageSize: number;
  units: number;
  totalWeight: number;
  stockType?: string;
  itemType?: string;
}

interface FloorSession {
  id: string;
  warehouse: string;
  floor?: string;
  floorName?: string;
  authority: string;
  itemType?: string;
  items: Item[];
  userName?: string;
  userEmail?: string;
  userId?: string;
  isEditing?: boolean;
  entryId?: string; // Batch entry ID being edited
  originalSessionId?: string;
  originalStatus?: string;
  originalItemIds?: string[]; // Original database IDs for tracking deletions
}

export default function EntriesSummary() {
  const navigate = useNavigate();
  const [floorSession, setFloorSession] = useState<FloorSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Get floor session from localStorage
    const session = localStorage.getItem("currentFloorSession");
    if (!session) {
      navigate("/dashboard");
      return;
    }
    setFloorSession(JSON.parse(session));
  }, [navigate]);

  if (!floorSession) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Group items by category and subcategory
  const groupedItems = floorSession.items.reduce(
    (acc: any, item: Item) => {
      if (!acc[item.category]) {
        acc[item.category] = {};
      }
      if (!acc[item.category][item.subcategory]) {
        acc[item.category][item.subcategory] = [];
      }
      acc[item.category][item.subcategory].push(item);
      return acc;
    },
    {}
  );

  const totalWeight = floorSession.items.reduce(
    (sum, item) => sum + item.totalWeight,
    0
  );

  const handleEditItems = () => {
    navigate("/audit/add-item");
  };

  const handleSubmitEntries = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Get current user info
      const userStr = localStorage.getItem("user");
      const user = userStr ? JSON.parse(userStr) : null;

      // Check if this is an edit operation (editing already-submitted entries)
      const isEditing = floorSession.isEditing && floorSession.originalSessionId;

      let result;
      if (isEditing) {
        // For editing already-submitted entries: keep existing edit logic
        console.log("Updating existing session:", floorSession.originalSessionId);

        const itemsToUpdate: any[] = [];
        const itemsToCreate: any[] = [];
        const itemsToDelete: string[] = [];

        const currentItemDbIds = new Set(
          floorSession.items
            .map((item: Item) => item.databaseId)
            .filter(Boolean)
        );

        const originalItemIds: string[] = floorSession.originalItemIds || [];
        originalItemIds.forEach((originalId: string) => {
          if (!currentItemDbIds.has(originalId)) {
            itemsToDelete.push(originalId);
          }
        });

        for (const dbId of itemsToDelete) {
          try {
            await stocktakeEntriesAPI.deleteEntry(dbId);
          } catch (deleteError: any) {
            if (deleteError?.status !== 404) {
              console.error(`Failed to delete entry ${dbId}:`, deleteError);
            }
          }
        }

        floorSession.items.forEach((item: Item) => {
          if (item.databaseId) {
            itemsToUpdate.push({
              databaseId: item.databaseId,
              itemName: item.description,
              warehouse: floorSession.warehouse,
              floorName: floorSession.floorName || floorSession.floor,
              itemType: (item as any).itemType || floorSession.itemType || "",
              category: item.category,
              subcategory: item.subcategory,
              totalQuantity: item.units,
              unitUom: item.packageSize,
              totalWeight: item.totalWeight,
              stockType: (item as any).stockType,
            });
          } else {
            itemsToCreate.push({
              warehouse: floorSession.warehouse,
              floorName: floorSession.floorName || floorSession.floor,
              itemType: (item as any).itemType || floorSession.itemType || "",
              category: item.category,
              subcategory: item.subcategory,
              description: item.description,
              packageSize: item.packageSize,
              units: item.units,
              totalWeight: item.totalWeight,
              stockType: (item as any).stockType,
              enteredBy: floorSession.userName || floorSession.userEmail,
            });
          }
        });

        for (const item of itemsToUpdate) {
          try {
            await stocktakeEntriesAPI.updateEntry(item.databaseId, item);
          } catch (updateError) {
            console.error(`Failed to update entry ${item.databaseId}:`, updateError);
            throw updateError;
          }
        }

        if (itemsToCreate.length > 0) {
          const createEntries = itemsToCreate.map((item: any) => ({
            item_name: item.description,
            item_type: item.itemType,
            item_category: item.category,
            item_subcategory: item.subcategory,
            floor_name: item.floorName,
            warehouse: item.warehouse,
            total_quantity: item.units,
            unit_uom: item.packageSize,
            total_weight: item.totalWeight,
            entered_by: item.enteredBy,
            entered_by_email: user?.email || floorSession.userEmail || "",
            authority: floorSession.authority || "FLOOR_MANAGER",
            stock_type: item.stockType || "Fresh Stock",
          }));
          result = await stocktakeEntriesAPI.submitEntries(createEntries);
        } else {
          result = { message: "Entries updated successfully" };
        }
      } else {
        // For new entries: Finalize draft entries (change status from 'draft' to 'submitted')
        // Items are already saved in the database as drafts from the AddItem page
        result = await stocktakeEntriesAPI.finalizeDraftEntries({
          warehouse: floorSession.warehouse || "",
          floorName: floorSession.floorName || floorSession.floor || "",
          enteredByEmail: user?.email || floorSession.userEmail || "",
        });
      }

      console.log("Entries submitted successfully:", result);

      // F7: Fire-and-forget email notification — never blocks submission
      try {
        const managerEmail = import.meta.env.VITE_SUBMISSION_EMAIL_RECIPIENT || "b.hrithik@candorfoods.in";
        const emailPayload = {
          floorName: floorSession.floorName || floorSession.floor || "Unknown",
          warehouse: floorSession.warehouse || "Unknown",
          submittedBy: user?.username || user?.name || user?.email || "Unknown",
          submittedByEmail: user?.email || "",
          entryCount: floorSession.items.length,
          totalWeight: totalWeight,
          date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          managerEmail,
        };
        fetch("/.netlify/functions/send-submission-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(emailPayload),
        }).catch((emailErr) => console.warn("[F7] Email send failed (non-blocking):", emailErr));
      } catch (emailSetupErr) {
        console.warn("[F7] Email setup failed (non-blocking):", emailSetupErr);
      }

      // Update floor session status in localStorage
      const updatedSession = {
        ...floorSession,
        id: isEditing ? floorSession.originalSessionId : floorSession.id,
        status: "SUBMITTED",
        submittedAt: new Date().toISOString(),
        userId: user?.id || user?.email || floorSession.userId || "",
        userEmail: user?.email || floorSession.userEmail || "",
        userName: user?.username || user?.email || floorSession.userName || "",
        isEditing: undefined,
        originalSessionId: undefined,
        originalStatus: undefined
      };

      const allSessions = JSON.parse(
        localStorage.getItem("floorSessions") || "[]"
      );

      if (isEditing) {
        const existingSessionIndex = allSessions.findIndex(
          (s: any) => s.id === floorSession.originalSessionId
        );
        if (existingSessionIndex >= 0) {
          allSessions[existingSessionIndex] = updatedSession;
        } else {
          allSessions.push(updatedSession);
        }
      } else {
        allSessions.push(updatedSession);
      }

      localStorage.setItem("floorSessions", JSON.stringify(allSessions));
      localStorage.setItem("submittedFloorSession", JSON.stringify(updatedSession));

      // Clear the current session after successful submission
      localStorage.removeItem("currentFloorSession");

      setIsLoading(false);
      navigate("/audit/submitted", { state: { sessionId: floorSession.id } });
    } catch (err: any) {
      console.error("Submit entries error:", err);
      setError(err.message || err.data?.error || "Failed to submit entries to database");
      setIsLoading(false);
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
        <button onClick={() => navigate("/dashboard")} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, color: "#D1D5DB", fontSize: 12, fontWeight: 500, padding: "6px 10px", cursor: "pointer", touchAction: "manipulation", minHeight: 32 }}>
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back</span>
        </button>
      </nav>

      {/* Main Content */}
      <div className="container py-6 sm:py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Stock Entry Summary
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {floorSession.floorName || 'Floor'} • {floorSession.warehouse}
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 mb-6">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Items List */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              {/* Session Info Card */}
              <Card className="p-4 sm:p-6 border-border">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Floor Name</p>
                    <p className="text-xl sm:text-2xl font-bold text-primary">
                      {floorSession.floorName || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Warehouse</p>
                    <p className="text-base sm:text-lg font-semibold text-foreground break-words">
                      {floorSession.warehouse}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Authority</p>
                    <p className="text-base sm:text-lg font-semibold text-foreground break-words">
                      {floorSession.authority}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Items by Category */}
              <Card className="border-border overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-border bg-muted/30">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground">Items</h2>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {Object.entries(groupedItems).map(
                    ([category, subcats]: any) => {
                      const categoryName = category; // Category name is already stored in the item
                      return (
                        <AccordionItem
                          key={category}
                          value={category}
                          className="border-b last:border-b-0"
                        >
                          <AccordionTrigger className="px-6 hover:bg-muted/50">
                            <span className="font-semibold text-foreground">
                              {categoryName}
                            </span>
                            <span className="text-sm text-muted-foreground ml-2">
                              ({Object.values(subcats).flat().length} items)
                            </span>
                          </AccordionTrigger>
                        <AccordionContent className="px-6 py-4 space-y-4">
                          {Object.entries(subcats).map(
                            ([subcat, items]: any) => (
                              <div key={subcat} className="space-y-3">
                                <p className="text-sm font-semibold text-primary">
                                  {subcat}
                                </p>
                                <div className="space-y-2 pl-4 border-l-2 border-border">
                                  {items.map((item: Item) => (
                                    <div
                                      key={item.id}
                                      className="bg-muted/50 p-3 rounded"
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <p className="font-semibold text-foreground">
                                            {item.subcategory}
                                          </p>
                                          {item.description && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                              {item.description}
                                            </p>
                                          )}
                                        </div>
                                        <span className="font-bold text-primary">
                                          {item.totalWeight.toFixed(2)} kg
                                        </span>
                                      </div>
                                      <div className="text-xs text-muted-foreground flex gap-4">
                                        <span>
                                          Package: {item.packageSize.toFixed(2)} kg
                                        </span>
                                        <span>Units: {item.units}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          )}
                        </AccordionContent>
                        </AccordionItem>
                      );
                    }
                  )}
                </Accordion>
              </Card>
            </div>

            {/* Summary Sidebar */}
            <div>
              <div className="lg:sticky lg:top-20 space-y-4">
                {/* Total Weight Card */}
                <Card className="p-4 sm:p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                    Total Floor Weight
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold text-primary mb-4">
                    {totalWeight.toFixed(2)} kg
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Items:</span>
                      <span className="font-semibold">
                        {floorSession.items.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Categories:</span>
                      <span className="font-semibold">
                        {Object.keys(groupedItems).length}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Action Buttons */}
                <Button
                  onClick={handleEditItems}
                  variant="outline"
                  className="w-full text-sm sm:text-base"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit Items
                </Button>

                <Button
                  onClick={handleSubmitEntries}
                  className="w-full bg-green-600 hover:bg-green-700 text-white text-sm sm:text-base"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Entries
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>

                {/* Info Box */}
                <Card className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    After submission, your entries will be reviewed by the
                    inventory manager. You won't be able to edit them.
                  </p>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
