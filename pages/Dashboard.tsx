import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader, LogOut, Package, FileText, Calendar, Warehouse, Edit2, TrendingUp, BarChart3, Activity, CheckCircle2, Clock, AlertCircle, ChevronRight, Trash2, Download } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { stocktakeEntriesAPI } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
}

interface FloorSession {
  id: string;
  warehouse: string;
  floor?: string;
  floorName?: string;
  authority: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  items: any[];
  status?: string;
  createdAt: string;
  submittedAt?: string;
  isEditing?: boolean;
  originalSessionId?: string;
  originalStatus?: string;
}

interface RecentEntry {
  id: number;
  entryId: string | null;
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
  enteredByEmail: string;
  authority: string;
  stockType: string;
  createdAt: string;
  updatedAt: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userSessions, setUserSessions] = useState<FloorSession[]>([]);
  const [pendingSession, setPendingSession] = useState<any>(null);
  const [downloadingSession, setDownloadingSession] = useState<string | null>(null);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [loadingRecentEntries, setLoadingRecentEntries] = useState(false);

  // Memoized submitted sessions calculations
  const { submittedSessions, submittedItems, submittedWeight } = useMemo(() => {
    const filteredSessions = userSessions.filter(
      session => session.status === "SUBMITTED" || session.status === "APPROVED"
    );
    
    const totalItems = filteredSessions.reduce(
      (sum, session) => sum + (session.items?.length || 0),
      0
    );
    
    const totalWeight = filteredSessions.reduce((sum, session) => {
      const sessionWeight = session.items?.reduce(
        (itemSum: number, item: any) => itemSum + (item.totalWeight || 0),
        0
      ) || 0;
      return sum + sessionWeight;
    }, 0);

    return {
      submittedSessions: filteredSessions,
      submittedItems: totalItems,
      submittedWeight: totalWeight
    };
  }, [userSessions]);

  // Memoized function to render individual items
  const renderItem = useCallback((item: any, idx: number, sessionId: string) => {
    try {
      // For custom category items (no subcategory), the category field contains the item name
      const isCustomCategory = item.category && !item.subcategory;
      const itemName = isCustomCategory 
        ? item.category 
        : (item.description || item.subcategory || item.category || "Unknown Item");
      
      return (
        <div
          key={`${sessionId}-item-${idx}`}
          className="p-3 sm:p-4 bg-muted/50 rounded-lg text-sm border border-border/50"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <p className="font-semibold text-foreground text-sm sm:text-base">
                {itemName}
              </p>
              {!isCustomCategory && item.category && item.subcategory && (
                <p className="text-xs text-muted-foreground mt-1">
                  {item.category} → {item.subcategory}
                </p>
              )}
              {isCustomCategory && (
                <p className="text-xs text-muted-foreground mt-1">
                  Unlisted Item
                </p>
              )}
            </div>
            <span className="font-bold text-primary ml-2 text-base sm:text-lg">
              {item.totalWeight?.toFixed(2) || "0.00"} kg
            </span>
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-2">
            {item.entryId && (
              <span className="font-medium text-primary">
                ID: {item.entryId}
              </span>
            )}
            {item.packageSize && (
              <span>
                UOM: {item.packageSize?.toFixed(3) || "0.000"} kg
              </span>
            )}
            {item.units && (
              <span>Qty: {item.units || 0}</span>
            )}
            {item.stockType && (
              <span className="capitalize">
                Type: {item.stockType}
              </span>
            )}
            {item.itemType && (
              <span className="uppercase">
                {item.itemType}
              </span>
            )}
          </div>
        </div>
      );
    } catch (error) {
      console.error('Error rendering item:', error, item);
      return (
        <div key={`${sessionId}-error-${idx}`} className="p-2 bg-red-50 text-red-600 rounded">
          Error rendering item {idx + 1}
        </div>
      );
    }
  }, []);

  // Check for draft entries in DB and show as pending session
  const checkDraftEntries = async (userEmail: string) => {
    try {
      const response = await stocktakeEntriesAPI.getDraftEntries({
        enteredByEmail: userEmail,
      });
      if (response.entries && response.entries.length > 0) {
        // Group drafts by warehouse+floor to form a pending session
        const firstEntry = response.entries[0];
        const draftSession = {
          id: `draft-session-${firstEntry.warehouse}-${firstEntry.floorName}`,
          warehouse: firstEntry.warehouse,
          floorName: firstEntry.floorName,
          authority: firstEntry.authority || "FLOOR_MANAGER",
          userEmail: firstEntry.enteredByEmail || userEmail,
          userName: firstEntry.enteredBy || "",
          items: response.entries.map((entry: any, index: number) => ({
            id: `item-${entry.id}-${index}`,
            databaseId: String(entry.id),
            category: entry.itemCategory,
            subcategory: entry.itemSubcategory,
            description: entry.itemName,
            packageSize: entry.unitUom,
            units: entry.totalQuantity,
            totalWeight: entry.totalWeight,
            stockType: entry.stockType,
            itemType: entry.itemType,
          })),
          createdAt: firstEntry.createdAt,
          isDraft: true, // Flag to identify this is from DB drafts
        };

        // Also ensure localStorage has the session metadata so AddItem can load it
        const currentSession = localStorage.getItem("currentFloorSession");
        if (!currentSession) {
          localStorage.setItem("currentFloorSession", JSON.stringify({
            id: draftSession.id,
            warehouse: draftSession.warehouse,
            floorName: draftSession.floorName,
            authority: draftSession.authority,
            userEmail: draftSession.userEmail,
            userName: draftSession.userName,
            items: draftSession.items,
            createdAt: draftSession.createdAt,
          }));
        }

        setPendingSession(draftSession);
        console.log("Found draft entries in DB, showing as pending session:", response.entries.length);
      } else {
        // No drafts in DB - also check localStorage for backward compatibility
        const currentSession = localStorage.getItem("currentFloorSession");
        if (currentSession) {
          const sessionData = JSON.parse(currentSession);
          if (sessionData.items && sessionData.items.length > 0 && !sessionData.submittedAt) {
            setPendingSession(sessionData);
          } else {
            setPendingSession(null);
          }
        } else {
          setPendingSession(null);
        }
      }
    } catch (err) {
      console.error("Failed to check draft entries:", err);
      // Fallback to localStorage check
      const currentSession = localStorage.getItem("currentFloorSession");
      if (currentSession) {
        const sessionData = JSON.parse(currentSession);
        if (sessionData.items && sessionData.items.length > 0 && !sessionData.submittedAt) {
          setPendingSession(sessionData);
        }
      }
    }
  };

  const loadUserSessions = async () => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr);

        // Check for draft entries in DB
        await checkDraftEntries(parsedUser.email);

        // Fetch entries from database API instead of localStorage cache
        const userIdentifier = parsedUser.username || parsedUser.email;
        console.log("Fetching entries from database for user:", userIdentifier);
        
        const response = await stocktakeEntriesAPI.getEntries({
          enteredBy: userIdentifier
        });
        
        console.log("Fetched entries from database:", response);
        
        // API returns { success: true, entries: [...], count: number }
        const entries = response?.entries || [];
        
        if (entries.length === 0) {
          console.log("No entries found for user");
          setUserSessions([]);
          return;
        }
        
        console.log(`✅ Found ${entries.length} entries for user`);
        
        // Group entries by session (warehouse + floor + date)
        const sessionsMap = new Map<string, FloorSession>();
        
        entries.forEach((entry: any) => {
          const sessionDate = entry.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0];
          const sessionKey = `${entry.warehouse}-${entry.floorName}-${entry.enteredBy}-${sessionDate}`;
          
          if (!sessionsMap.has(sessionKey)) {
            sessionsMap.set(sessionKey, {
              id: `session-${Date.parse(entry.createdAt || new Date().toISOString())}`,
              warehouse: entry.warehouse,
              floorName: entry.floorName,
              floor: entry.floorName,
              authority: entry.authority || parsedUser.role || "FLOOR_MANAGER",
              userId: parsedUser.id || parsedUser.email,
              userEmail: entry.enteredByEmail || parsedUser.email,
              userName: entry.enteredBy || parsedUser.name,
              items: [],
              status: "SUBMITTED",
              createdAt: entry.createdAt,
              submittedAt: entry.updatedAt || entry.createdAt
            });
          }
          
          const session = sessionsMap.get(sessionKey)!;
          session.items.push({
            id: `item-${entry.id}-${Date.now()}`, // Local ID for UI
            databaseId: entry.id.toString(), // Store database ID for updates
            entryId: entry.entryId || null, // Batch entry ID (YYMM0001 format)
            category: entry.itemCategory,
            subcategory: entry.itemSubcategory,
            description: entry.itemName,
            packageSize: entry.unitUom,
            units: entry.totalQuantity,
            totalWeight: entry.totalWeight,
            stockType: entry.stockType || entry.stock_type, // Fallback for safety
            itemType: entry.itemType
          });
        });
        
        const sessions = Array.from(sessionsMap.values());
        
        // Sort by creation date (newest first)
        sessions.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        console.log("Grouped sessions from database:", sessions);
        setUserSessions(sessions);
        
      } catch (err) {
        console.error("Failed to fetch entries from database:", err);
      }
    }
  };

  // Load recent entries for managers (INVENTORY_MANAGER and SUPERUSER)
  const loadRecentEntries = async () => {
    setLoadingRecentEntries(true);
    try {
      const response = await stocktakeEntriesAPI.getRecentEntries(10);
      console.log("Recent entries loaded:", response);
      if (response?.entries) {
        setRecentEntries(response.entries);
      }
    } catch (err) {
      console.error("Failed to fetch recent entries:", err);
    } finally {
      setLoadingRecentEntries(false);
    }
  };

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");

    if (!token) {
      navigate("/login");
      return;
    }

    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr);
        setUser(parsedUser);

        // Load sessions (this also checks for draft entries in DB)
        loadUserSessions();

        // Load recent entries for INVENTORY_MANAGER and SUPERUSER
        if (parsedUser.role === "INVENTORY_MANAGER" || parsedUser.role === "SUPERUSER") {
          loadRecentEntries();
        }
      } catch (err) {
        console.error("Failed to parse user", err);
      }
    }

    setIsLoading(false);
  }, [navigate]);

  // Refresh sessions when component comes into focus (e.g., returning from edit page)
  useEffect(() => {
    const handleFocus = () => {
      // Reload sessions - this also checks for draft entries in DB
      loadUserSessions();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Listen for localStorage changes (for real-time pending session updates)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "currentFloorSession") {
        if (!e.newValue) {
          // Session was removed (submitted or discarded)
          setPendingSession(null);
        }
        // Reload sessions to pick up any changes
        loadUserSessions();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  const handleEditEntry = (session: FloorSession) => {
    // Get the entry_id from the first item (all items in a session should have same entry_id)
    const entryId = session.items?.[0]?.entryId || null;

    // Load the session into currentFloorSession for editing
    const editSession = {
      ...session,
      isEditing: true,
      entryId: entryId, // Track the batch entry_id for this edit session
      originalSessionId: session.id,
      originalStatus: session.status,
      // Store original item IDs to track deletions
      originalItemIds: session.items?.map((item: any) => item.databaseId).filter(Boolean) || []
    };
    localStorage.setItem("currentFloorSession", JSON.stringify(editSession));
    // Navigate to add-item page where user can edit
    navigate("/audit/add-item");
  };

  const handleResumeSession = () => {
    // Session is already in localStorage, just navigate
    navigate("/audit/add-item");
  };

  const handleDiscardSession = async () => {
    // If this is a DB-backed draft session, delete draft entries from database
    if (pendingSession?.isDraft && pendingSession?.items?.length > 0) {
      try {
        for (const item of pendingSession.items) {
          if (item.databaseId) {
            try {
              await stocktakeEntriesAPI.deleteEntry(item.databaseId);
            } catch (err: any) {
              if (err?.status !== 404) {
                console.error(`Failed to delete draft entry ${item.databaseId}:`, err);
              }
            }
          }
        }
        console.log("Deleted draft entries from database");
      } catch (err) {
        console.error("Failed to delete draft entries:", err);
      }
    }
    // Remove the pending session from localStorage
    localStorage.removeItem("currentFloorSession");
    setPendingSession(null);
  };

  const handleViewEntries = () => {
    // Don't clear pending session when just viewing entries
    // Session will only be cleared after actual submission
    navigate("/audit/entries");
  };

  const handleDownloadEntries = async (session: FloorSession) => {
    // Download the items from this specific session (same items shown in view details)
    // Segregates Fresh Stock and Off Grade/Rejection items into separate Excel sheets
    if (!session.warehouse || !session.floorName || !session.items || session.items.length === 0) {
      toast({
        title: "Error",
        description: "Session missing required information or has no items",
        variant: "destructive",
      });
      return;
    }

    setDownloadingSession(session.id);
    try {
      // Dynamic import of exceljs
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      
      // Separate items by stock type for different sheets
      const freshStockItems = session.items.filter(
        (item: any) => item.stockType === "Fresh Stock" || !item.stockType
      );
      const offGradeItems = session.items.filter(
        (item: any) => item.stockType === "Off Grade/Rejection"
      );

      // Helper function to create a worksheet with items
      const createWorksheet = (ws: any, items: any[], sheetTitle: string) => {
        // Add title
        ws.mergeCells('A1:H1');
        const titleCell = ws.getCell('A1');
        titleCell.value = sheetTitle;
        titleCell.font = { bold: true, size: 16, color: { argb: 'FF1e3a8a' } };
        titleCell.alignment = { horizontal: 'center' };
        titleCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFf8fafc' }
        };

        // Add headers
        const headers = [
          "Category",
          "Subcategory", 
          "Description",
          "Package Size (kg)",
          "Units",
          "Total Weight (kg)",
          "Date Submitted",
          "Submitted By"
        ];
        
        ws.getRow(3).values = headers;
        ws.getRow(3).font = { bold: true, color: { argb: 'FF1e3a8a' } };
        ws.getRow(3).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFe0f2fe' }
        };

        // Add data
        items.forEach((item: any, index: number) => {
          const row = ws.getRow(4 + index);
          // For custom category items (no subcategory), the category field contains the item name
          const isCustomCategory = item.category && !item.subcategory;
          const itemName = isCustomCategory ? item.category : (item.description || item.subcategory || item.category || "Unknown Item");
          
          row.values = [
            isCustomCategory ? "Unlisted Item" : item.category,
            isCustomCategory ? "" : item.subcategory,
            itemName,
            item.packageSize?.toFixed(3) || "0.000",
            item.units || 0,
            item.totalWeight?.toFixed(2) || "0.00",
            session.submittedAt ? new Date(session.submittedAt).toLocaleString() : 
              (session.createdAt ? new Date(session.createdAt).toLocaleString() : "N/A"),
            session.userName || session.userEmail || "N/A"
          ];
          
          if (index % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFfcfcfd' }
            };
          }
        });

        // Auto-fit columns
        headers.forEach((_, index) => {
          const column = ws.getColumn(index + 1);
          let maxLength = headers[index].length;
          
          items.forEach((item: any) => {
            const rowData = [
              item.category,
              item.subcategory,
              item.description,
              item.packageSize?.toFixed(3),
              item.units,
              item.totalWeight?.toFixed(2),
              session.submittedAt || session.createdAt,
              session.userName || session.userEmail
            ];
            const cellValue = String(rowData[index] || "");
            maxLength = Math.max(maxLength, cellValue.length);
          });
          
          column.width = Math.min(Math.max(maxLength + 2, 10), 50);
        });

        // Add summary row
        const summaryRowIndex = 4 + items.length + 1;
        const summaryRow = ws.getRow(summaryRowIndex);
        const totalWeight = items.reduce((sum: number, item: any) => sum + (item.totalWeight || 0), 0);
        const totalUnits = items.reduce((sum: number, item: any) => sum + (item.units || 0), 0);
        
        summaryRow.values = ["", "", "TOTAL:", "", totalUnits, totalWeight.toFixed(2), "", ""];
        summaryRow.font = { bold: true };
        summaryRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFe0f2fe' }
        };
      };

      // Create worksheets based on available stock types
      if (freshStockItems.length > 0) {
        const freshStockWs = workbook.addWorksheet("Fresh Stock");
        createWorksheet(freshStockWs, freshStockItems, `Fresh Stock - ${session.warehouse} - ${session.floorName}`);
      }

      if (offGradeItems.length > 0) {
        const offGradeWs = workbook.addWorksheet("Off Grade Rejection");
        createWorksheet(offGradeWs, offGradeItems, `Off Grade Rejection - ${session.warehouse} - ${session.floorName}`);
      }

      // If no items or all items are fresh stock, create a single sheet
      if (freshStockItems.length === 0 && offGradeItems.length === 0) {
        throw new Error("No items found in session");
      }

      // Generate Excel file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      document.body.appendChild(link);
      link.href = url;
      
      // Generate filename
      const dateStr = session.submittedAt
        ? new Date(session.submittedAt).toISOString().split("T")[0]
        : new Date(session.createdAt).toISOString().split("T")[0];
      const warehouse = session.warehouse.replace(/[\\s]/g, "_");
      const floor = session.floorName.replace(/[\\s]/g, "_");
      link.download = `StockTakeEntries_${warehouse}_${floor}_${dateStr}.xlsx`;
      
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Use timeout to prevent toast blocking
      setTimeout(() => {
        toast({
          title: "Success",
          description: `Entries exported successfully${offGradeItems.length > 0 ? " with separate sheets for Fresh Stock and Off Grade items" : ""}`,
        });
      }, 100);

    } catch (error: any) {
      console.error("Download error:", error);
      setTimeout(() => {
        toast({
          title: "Export Failed",
          description: error.message || "Failed to export entries",
          variant: "destructive",
        });
      }, 100);
    } finally {
      setDownloadingSession(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const roleContent: Record<string, any> = {
    FLOOR_MANAGER: {
      title: "Floor Manager Dashboard",
      description: "Enter stock counts for your assigned floor",
      actions: [
        {
          label: "Enter Stock for Floor",
          icon: Package,
          action: () => navigate("/audit/floor-selection"),
        },
      ],
    },
    INVENTORY_MANAGER: {
      title: "Inventory Manager Dashboard",
      description: "Review and manage floor sessions",
      actions: [
        {
          label: "Start Stock-take ",
          icon: Package,
          action: () => {
            // Add smooth transition effect
            const button = document.activeElement as HTMLElement;
            if (button) {
              button.style.transform = "scale(0.95)";
              setTimeout(() => {
                navigate("/review");
              }, 150);
            } else {
              navigate("/review");
            }
          },
        },
        {
          label: "View Summary",
          icon: Package,
          action: () => navigate("/summary"),
        },
        {
          label: "View Resultsheet",
          icon: Package,
          action: () => navigate("/resultsheet"),
        },
        {
          label: "Update Sku",
          icon: Package,
          action: () => navigate("/update-sku"),
        },
      ],
    },
    ADMIN: {
      title: "Admin Dashboard",
      description: "Manage users, floors, and items",
      actions: [
        {
          label: "Manage Users",
          icon: Package,
          action: () => navigate("/admin/users"),
        },
        {
          label: "Manage Floors",
          icon: Package,
          action: () => navigate("/admin/floors"),
        },
        {
          label: "Manage Items",
          icon: Package,
          action: () => navigate("/admin/items"),
        },
        {
          label: "Generate Reports",
          icon: Package,
          action: () => navigate("/reports"),
        },
        {
          label: "Update Sku",
          icon: Package,
          action: () => navigate("/update-sku"),
        },
      ],
    },
    SUPERUSER: {
      title: "Super User Dashboard",
      description: "Full access to all system features",
      actions: [
        {
          label: "Start Stock-take ",
          icon: Package,
          action: () => navigate("/review"),
        },
        {
          label: "Enter Stock for Floor",
          icon: Package,
          action: () => navigate("/audit/floor-selection"),
        },
        {
          label: "Manage Users",
          icon: Package,
          action: () => navigate("/admin/users"),
        },
        {
          label: "View Summary",
          icon: Package,
          action: () => navigate("/summary"),
        },
        {
          label: "View Resultsheet",
          icon: Package,
          action: () => navigate("/resultsheet"),
        },
        {
          label: "Update Sku",
          icon: Package,
          action: () => navigate("/update-sku"),
        },
      ],
    },
  };

  // Debug: log user role to help troubleshoot
  console.log("Dashboard - User role:", user?.role, "Content found:", !!roleContent[user?.role || "FLOOR_MANAGER"]);

  const content = roleContent[user?.role || "FLOOR_MANAGER"] || roleContent["FLOOR_MANAGER"];

  // Calculate total items and weight for all user sessions
  const totalItems = userSessions.reduce(
    (sum, session) => sum + (session.items?.length || 0),
    0
  );
  const totalWeight = userSessions.reduce((sum, session) => {
    const sessionWeight = session.items?.reduce(
      (itemSum: number, item: any) => itemSum + (item.totalWeight || 0),
      0
    ) || 0;
    return sum + sessionWeight;
  }, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 border-b border-border/50 shadow-sm">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#1e3a8a] flex items-center justify-center">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold">
              <span className="text-[#1e3a8a]">STOCK</span>
              <span className="text-[#3b82f6]">TAKE</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-right">
              <p className="font-semibold text-foreground text-sm">{user?.username}</p>
              <p className="text-xs text-muted-foreground">{user?.role}</p>
            </div>
            <Button variant="ghost" onClick={handleLogout} size="sm" className="text-xs sm:text-sm">
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Dashboard Content */}
      <div className="container py-6 sm:py-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2">
              {content?.title || "Dashboard"}
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">{content?.description || "Welcome to your dashboard"}</p>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
            {(content?.actions || []).map((action: any, idx: number) => (
              <Card
                key={idx}
                className="p-5 sm:p-6 hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-border/50 active:scale-[0.97] hover:scale-[1.02] group bg-white/80 backdrop-blur-sm"
                onClick={(e) => {
                  // Add ripple effect
                  const card = e.currentTarget;
                  card.style.transform = "scale(0.95)";
                  setTimeout(() => {
                    card.style.transform = "";
                    action.action();
                  }, 200);
                }}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-3 sm:p-4 bg-[#1e3a8a]/10 rounded-xl flex-shrink-0 group-hover:bg-[#1e3a8a]/20 transition-all duration-300 group-hover:scale-110">
                    <action.icon className="w-5 h-5 sm:w-6 sm:h-6 text-[#1e3a8a] transition-transform duration-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-sm sm:text-base group-hover:text-[#1e3a8a] transition-colors duration-300">
                      {action.label}
                    </h3>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#1e3a8a] transition-colors duration-300" />
                </div>
              </Card>
            ))}
          </div>

          {/* Analytics and Stats - Only for INVENTORY_MANAGER and SUPERUSER */}
          {(user?.role === "INVENTORY_MANAGER" || user?.role === "SUPERUSER") && (
            <div className="mt-8 sm:mt-12 space-y-6">

    

              {/* Recent Activity */}
              <Card className="p-4 sm:p-6 border-border hover:shadow-lg transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    Recent Activity
                  </h3>
                  <span className="text-xs text-muted-foreground">Last 10 entries</span>
                </div>
                <div className="space-y-3">
                  {loadingRecentEntries ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : recentEntries.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No recent entries found</p>
                    </div>
                  ) : (
                    recentEntries.map((entry, idx) => {
                      // Calculate relative time
                      const entryDate = new Date(entry.createdAt);
                      const now = new Date();
                      const diffMs = now.getTime() - entryDate.getTime();
                      const diffMins = Math.floor(diffMs / 60000);
                      const diffHours = Math.floor(diffMs / 3600000);
                      const diffDays = Math.floor(diffMs / 86400000);

                      let timeAgo = "";
                      if (diffMins < 1) timeAgo = "Just now";
                      else if (diffMins < 60) timeAgo = `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
                      else if (diffHours < 24) timeAgo = `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
                      else timeAgo = `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

                      // Determine icon and color based on stock type
                      const isFreshStock = entry.stockType === "Fresh Stock";
                      const Icon = isFreshStock ? CheckCircle2 : AlertCircle;
                      const iconColor = isFreshStock ? "text-green-600" : "text-amber-600";

                      return (
                        <div
                          key={entry.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors animate-in fade-in slide-in-from-left-4"
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <div className={`p-2 rounded-lg bg-background ${iconColor}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {entry.itemName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.floorName} - {entry.warehouse} • {entry.totalQuantity} units • {entry.totalWeight.toFixed(2)} kg
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              By {entry.enteredBy} • {timeAgo}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`text-xs px-2 py-1 rounded ${
                              isFreshStock
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}>
                              {entry.itemType}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>
          )}



          {/* My Entries Section - Only show for FLOOR_MANAGER and SUPERUSER */}
          {(user?.role === "FLOOR_MANAGER" || user?.role === "SUPERUSER") && (
            <div className="mt-8 sm:mt-12">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  My Entries
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground">
                  All stock entries - submitted and in progress
                </p>
              </div>

              {/* Entry Status Tabs */}
              <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg w-fit">
                <Button
                  variant="ghost"
                  size="sm"
                  className="data-[active=true]:bg-background data-[active=true]:shadow-sm"
                  data-active={true}
                >
                  All Entries
                </Button>
              </div>

              {/* Filter sessions to show only submitted/approved entries */}
              <>
                {/* Summary Stats */}
              {(submittedSessions.length > 0 || pendingSession) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
                  <Card className="p-4 sm:p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                      Total Sessions
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-primary">
                      {submittedSessions.length + (pendingSession ? 1 : 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {submittedSessions.length} submitted + {pendingSession ? 1 : 0} pending
                    </p>
                  </Card>
                  <Card className="p-4 sm:p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                      Total Items
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {submittedItems + (pendingSession?.items?.length || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {submittedItems} submitted + {pendingSession?.items?.length || 0} pending
                    </p>
                  </Card>
                  <Card className="p-4 sm:p-6 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                      Total Weight
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
                      {(submittedWeight + (pendingSession?.items?.reduce((sum, item) => sum + (item.totalWeight || 0), 0) || 0)).toFixed(2)} kg
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {submittedWeight.toFixed(2)} submitted + {(pendingSession?.items?.reduce((sum, item) => sum + (item.totalWeight || 0), 0) || 0).toFixed(2)} pending
                    </p>
                  </Card>
                </div>
              )}
                    {/* Entries List */}
                    {submittedSessions.length === 0 && !pendingSession ? (
                <Card className="p-6 sm:p-12 text-center bg-muted/50">
                  <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-base sm:text-lg font-semibold text-foreground mb-1">
                    No submitted entries yet
                  </p>
                  <p className="text-sm sm:text-base text-muted-foreground mb-4">
                    Complete and submit your stock entries to see them here.
                  </p>
                  <Button
                    onClick={() => navigate("/audit/floor-selection")}
                    className="bg-primary hover:bg-primary/90 text-white"
                  >
                    Enter Stock Now
                  </Button>
                </Card>
              ) : (
                <div className="space-y-4 lg:space-y-6">
                  {/* Pending Session Card - Show first if exists */}
                  {pendingSession && (
                    <Card
                      className="p-4 sm:p-6 lg:p-8 border-orange-200 dark:border-orange-800 bg-gradient-to-r from-orange-50/50 to-yellow-50/50 dark:from-orange-950/10 dark:to-yellow-950/10 hover:shadow-md transition-all duration-200"
                    >
                      <div className="space-y-4">
                        {/* Pending Session Header */}
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                                <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                                  {pendingSession.warehouse} - {pendingSession.floorName || 'Floor'}
                                </h3>
                                <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded text-xs font-semibold">
                                  IN PROGRESS
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span>
                                    {new Date(pendingSession.lastModified || pendingSession.createdAt).toLocaleDateString()} at {new Date(pendingSession.lastModified || pendingSession.createdAt).toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* Action Buttons Row */}
                          <div className="flex flex-wrap gap-2 justify-end border-t pt-4">
                            <Button
                              onClick={handleResumeSession}
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700 text-white min-w-[120px]"
                            >
                              Resume Work
                            </Button>
                            <Button
                              onClick={handleDiscardSession}
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20 dark:hover:text-red-300 min-w-[100px]"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Discard
                            </Button>
                          </div>
                        </div>

                        {/* Pending Session Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                          <div className="text-center p-3 bg-orange-100/50 dark:bg-orange-900/20 rounded">
                            <p className="text-xs text-muted-foreground">Items</p>
                            <p className="text-lg font-bold text-orange-800 dark:text-orange-200">
                              {pendingSession.items?.length || 0}
                            </p>
                          </div>
                          <div className="text-center p-3 bg-orange-100/50 dark:bg-orange-900/20 rounded">
                            <p className="text-xs text-muted-foreground">Weight</p>
                            <p className="text-lg font-bold text-orange-800 dark:text-orange-200">
                              {(pendingSession.items?.reduce((sum, item) => sum + (item.totalWeight || 0), 0) || 0).toFixed(1)} kg
                            </p>
                          </div>
                          <div className="text-center p-3 bg-orange-100/50 dark:bg-orange-900/20 rounded">
                            <p className="text-xs text-muted-foreground">Form Status</p>
                            <p className="text-lg font-bold text-orange-800 dark:text-orange-200">
                              {pendingSession.currentFormState?.category ? 'Filling' : 'Ready'}
                            </p>
                          </div>
                          <div className="text-center p-3 bg-orange-100/50 dark:bg-orange-900/20 rounded">
                            <p className="text-xs text-muted-foreground">Auto-Saved</p>
                            <p className="text-lg font-bold text-orange-800 dark:text-orange-200">
                              ✓
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Submitted Sessions */}
                  {submittedSessions.map((session, sessionIndex) => {
                    const sessionWeight = session.items?.reduce(
                      (sum: number, item: any) => sum + (item.totalWeight || 0),
                      0
                    ) || 0;
                    const sessionDate = session.createdAt ? new Date(session.createdAt).toLocaleDateString() : "N/A";
                    const sessionTime = session.createdAt ? new Date(session.createdAt).toLocaleTimeString() : "";

                    // Floor managers can only edit today's entries; previous dates are view-only
                    const todayStr = new Date().toISOString().split('T')[0];
                    const entryDateStr = session.createdAt ? new Date(session.createdAt).toISOString().split('T')[0] : "";
                    const isToday = todayStr === entryDateStr;
                    const isFloorManager = user?.role === "FLOOR_MANAGER";
                    const canEdit = session.status === "SUBMITTED" && (!isFloorManager || isToday);

                    return (
                      <Card
                        key={`${session.id}-${sessionIndex}`}
                        className="p-4 sm:p-6 lg:p-8 border-border hover:shadow-md transition-all duration-200"
                      >
                        <div className="space-y-4">
                          {/* Session Header */}
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Warehouse className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                                  <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                                    {session.warehouse} - {session.floorName || 'Floor'}
                                  </h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                                    <span>{sessionDate} at {sessionTime}</span>
                                  </div>
                                  {session.status && (
                                    <span
                                      className={`px-2 py-1 rounded text-xs font-semibold ${
                                        session.status === "SUBMITTED"
                                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                          : session.status === "APPROVED"
                                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                      }`}
                                    >
                                      {session.status}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-center sm:text-right flex-shrink-0">
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                  Total Weight
                                </p>
                                <p className="text-xl sm:text-2xl font-bold text-primary">
                                  {sessionWeight.toFixed(2)} kg
                                </p>
                              </div>
                            </div>
                            {/* Action Buttons Row */}
                            <div className="flex flex-wrap gap-2 justify-end border-t pt-4">
                              {/* Download Button - Show for both SUBMITTED and APPROVED */}
                              <Button
                                onClick={() => handleDownloadEntries(session)}
                                disabled={downloadingSession === session.id}
                                variant="outline"
                                size="sm"
                                className="min-w-[120px]"
                              >
                                {downloadingSession === session.id ? (
                                  <>
                                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                                    Exporting...
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                  </>
                                )}
                              </Button>
                              {/* Edit Button - Only show for SUBMITTED status and today's date for floor managers */}
                              {canEdit && (
                                <Button
                                  onClick={() => handleEditEntry(session)}
                                  variant="outline"
                                  size="sm"
                                  className="min-w-[100px]"
                                >
                                  <Edit2 className="w-4 h-4 mr-2" />
                                  Edit
                                </Button>
                              )}
                              {session.status === "SUBMITTED" && isFloorManager && !isToday && (
                                <span className="text-xs text-muted-foreground italic self-center">
                                  View only (previous date)
                                </span>
                              )}
                              {session.status === "APPROVED" && (
                                <span className="text-xs text-muted-foreground italic self-center">
                                  Cannot edit approved entries
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Items List */}
                          {session.items && session.items.length > 0 && (
                            <div className="w-full">
                              <details className="w-full">
                                <summary 
                                  className="py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer list-none flex items-center justify-between"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const details = e.currentTarget.parentElement as HTMLDetailsElement;
                                    const wasOpen = details.open;
                                    details.open = !wasOpen;
                                    
                                    // Rotate arrow
                                    const arrow = e.currentTarget.querySelector('svg');
                                    if (arrow) {
                                      arrow.style.transform = details.open ? 'rotate(180deg)' : 'rotate(0deg)';
                                    }
                                  }}
                                >
                                  View {session.items?.length || 0} item(s)
                                  <svg
                                    className="w-4 h-4 transition-transform duration-200"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ transform: 'rotate(0deg)' }}
                                  >
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </summary>
                                <div className="space-y-2 pt-2 border-t border-border">
                                  {session.items?.slice(0, 100)?.map((item: any, idx: number) => 
                                    renderItem(item, idx, session.id)
                                  )}
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
              </>
            </div>
          )}

          {/* Info Card for other roles */}
          {user?.role !== "FLOOR_MANAGER" && user?.role !== "INVENTORY_MANAGER" && user?.role !== "SUPERUSER" && (
            <Card className="p-4 sm:p-6 md:p-8 mt-8 sm:mt-12 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <h3 className="text-base sm:text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Getting Started
            </h3>
              <p className="text-sm sm:text-base text-blue-800 dark:text-blue-200 mb-4">
              This is your dashboard. The features are being built out. Click on the action cards above to explore the application.
            </p>
              <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
              Each role has different permissions and workflows. Floor Managers can enter stock, Inventory Managers review and approve, and Admins manage the system.
            </p>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
