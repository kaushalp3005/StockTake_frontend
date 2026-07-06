import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader, LogOut, Package, FileText, Calendar, Warehouse, TrendingUp, BarChart3, Activity, CheckCircle2, Clock, AlertCircle, ChevronRight, Trash2, Download, Users, X, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { stocktakeEntriesAPI } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { downloadEntriesAsExcel } from "@/services/excelService";
import { DatePillSelector } from "@/components/DatePillSelector";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  dbRole?: string;
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
  const [entriesSelectedDates, setEntriesSelectedDates] = useState<string[]>([]);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<FloorSession | null>(null);
  const [activityExpanded, setActivityExpanded] = useState(false);

  // Memoized submitted sessions calculations
  const { submittedSessions, submittedItems, submittedWeight } = useMemo(() => {
    const allSubmitted = userSessions.filter(
      session => session.status === "SUBMITTED" || session.status === "APPROVED"
    );
    const filteredSessions = entriesSelectedDates.length > 0
      ? allSubmitted.filter(session => {
          const sessionDate = (session.createdAt || session.submittedAt || "").split("T")[0];
          return entriesSelectedDates.includes(sessionDate);
        })
      : allSubmitted;

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
  }, [userSessions, entriesSelectedDates]);

  // Dates on which THIS user has entries — drives DatePillSelector
  const entriesAvailableDates = useMemo(() => {
    const dateSet = new Set<string>();
    userSessions.forEach(s => {
      const d = (s.createdAt || s.submittedAt || "").split("T")[0];
      if (d) dateSet.add(d);
    });
    return Array.from(dateSet).sort();
  }, [userSessions]);


  // Check for draft entries in DB and show as pending session
  const checkDraftEntries = async (userEmail: string) => {
    try {
      const response = await stocktakeEntriesAPI.getDraftEntries({
        enteredByEmail: userEmail,
      });
      if (response.entries && response.entries.length > 0) {
        const firstEntry = response.entries[0];
        const draftItems = response.entries.map((entry: any, index: number) => ({
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
        }));

        const draftSession = {
          id: `draft-session-${firstEntry.warehouse}-${firstEntry.floorName}`,
          warehouse: firstEntry.warehouse,
          floorName: firstEntry.floorName,
          authority: firstEntry.authority || "FLOOR_MANAGER",
          userEmail: firstEntry.enteredByEmail || userEmail,
          userName: firstEntry.enteredBy || "",
          items: draftItems,
          createdAt: firstEntry.createdAt,
          isDraft: true,
        };

        // Always update localStorage with fresh draft data so Resume always has correct info
        localStorage.setItem("currentFloorSession", JSON.stringify({
          id: draftSession.id,
          warehouse: draftSession.warehouse,
          floorName: draftSession.floorName,
          authority: draftSession.authority,
          userEmail: draftSession.userEmail,
          userName: draftSession.userName,
          items: draftItems,
          createdAt: draftSession.createdAt,
        }));

        setPendingSession(draftSession);
        console.log("Found draft entries in DB:", response.entries.length, "items");
      } else {
        // No drafts in DB — clear any stale pending session from localStorage
        localStorage.removeItem("currentFloorSession");
        setPendingSession(null);
      }
    } catch (err) {
      console.error("Failed to check draft entries:", err);
      setPendingSession(null);
    }
  };

  const loadUserSessions = async () => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr);

        // Check for draft entries in DB
        await checkDraftEntries(parsedUser.email);

        // Fetch submitted entries by entered_by. Entries are saved with
        // entered_by = user.username (see AddItem.tsx), so we must query by the
        // username here — not the email — or nothing matches. Mirror the save-side
        // precedence (username first, email fallback) for robustness.
        const enteredByValue = parsedUser.username || parsedUser.email;
        console.log("Fetching submitted entries for entered_by:", enteredByValue);

        const response = await stocktakeEntriesAPI.getEntries({
          enteredBy: enteredByValue,
        });

        const entries = response?.entries || [];
        console.log(`✅ Found ${entries.length} submitted entries for user`);

        if (entries.length === 0) {
          setUserSessions([]);
          return;
        }

        // Group entries by entry_id (batch submission) — each entry_id = one submission
        // Entries without entry_id (edge case) fall back to warehouse+floor+date grouping
        const sessionsMap = new Map<string, FloorSession>();

        entries.forEach((entry: any) => {
          // Use entry_id as the primary session key (most accurate grouping)
          const sessionKey = entry.entryId
            ? `entryid-${entry.entryId}`
            : `${entry.warehouse}-${entry.floorName}-${entry.createdAt?.split('T')[0]}`;

          if (!sessionsMap.has(sessionKey)) {
            sessionsMap.set(sessionKey, {
              id: entry.entryId ? `session-${entry.entryId}` : `session-${Date.parse(entry.createdAt || new Date().toISOString())}`,
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
              submittedAt: entry.updatedAt || entry.createdAt,
            });
          }

          const session = sessionsMap.get(sessionKey)!;
          session.items.push({
            id: `item-${entry.id}`,
            databaseId: entry.id.toString(),
            entryId: entry.entryId || null,
            category: entry.itemCategory,
            subcategory: entry.itemSubcategory,
            description: entry.itemName,
            packageSize: entry.unitUom,
            units: entry.totalQuantity,
            totalWeight: entry.totalWeight,
            stockType: entry.stockType,
            itemType: entry.itemType,
          });
        });

        const sessions = Array.from(sessionsMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        console.log("Grouped submitted sessions:", sessions.length);
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

  // Auto-select last 3 dates when user's sessions first load
  useEffect(() => {
    if (entriesAvailableDates.length > 0 && entriesSelectedDates.length === 0) {
      setEntriesSelectedDates(entriesAvailableDates.slice(-3));
    }
  }, [entriesAvailableDates]);

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

  const handleViewSession = (session: FloorSession) => {
    const entryId = session.items?.[0]?.entryId || null;
    const viewSession = {
      ...session,
      isEditing: false,
      entryId,
      originalSessionId: session.id,
      originalStatus: session.status,
      originalItemIds: session.items?.map((item: any) => item.databaseId).filter(Boolean) || [],
    };
    localStorage.setItem("currentFloorSession", JSON.stringify(viewSession));
    navigate("/audit/add-item");
  };

  const handleSessionCardClick = (session: FloorSession) => {
    setSelectedSession(session);
  };

  const handleResumeSession = async () => {
    // Re-fetch draft entries and refresh localStorage before navigating
    // This ensures AddItem always sees the latest items from DB
    if (user?.email) {
      await checkDraftEntries(user.email);
    }
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

  // F4: Per-session Excel export with F1 (verified cols) + F2 (signature cols + footer)
  const handleDownloadEntries = async (session: FloorSession) => {
    if (!session.warehouse || !session.floorName) {
      toast({
        title: "Error",
        description: "Session missing warehouse or floor information",
        variant: "destructive",
      });
      return;
    }

    setDownloadingSession(session.id);
    try {
      // Fetch entries fresh from API so we get verified / verifiedBy / verifiedAt / remark fields.
      // Match on entered_by (the stored username), same as the list query above.
      const enteredByValue = session.userName || session.userEmail;
      const response = await stocktakeEntriesAPI.getEntries({
        enteredBy: enteredByValue,
        warehouse: session.warehouse,
        floorName: session.floorName,
      });

      const entries: any[] = response?.entries ?? [];

      if (entries.length === 0) {
        throw new Error("No entries found for this session");
      }

      const verifiedCount = entries.filter((e: any) => e.verified).length;
      const unverifiedCount = entries.length - verifiedCount;

      const dateStr = session.submittedAt
        ? new Date(session.submittedAt).toISOString().split("T")[0]
        : new Date(session.createdAt).toISOString().split("T")[0];
      const safeWarehouse = session.warehouse.replace(/\s+/g, "_");
      const safeFloor = (session.floorName || "").replace(/\s+/g, "_");
      const filename = `StockTakeEntries_${safeWarehouse}_${safeFloor}_${dateStr}.xlsx`;

      await downloadEntriesAsExcel({
        entries,
        title: `${session.warehouse} — ${session.floorName}`,
        warehouse: session.warehouse,
        floorName: session.floorName,
        exportedBy: session.userName || session.userEmail || user?.username || "",
        filename,
      });

      setTimeout(() => {
        toast({
          title: "Success",
          description: `Exported ${verifiedCount} verified + ${unverifiedCount} unverified entries`,
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
        {
          label: "Manage Users",
          icon: Users,
          action: () => navigate("/manage-users"),
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
          label: "Manage Users",
          icon: Users,
          action: () => navigate("/manage-users"),
        },
      ],
    },
    ADMIN: {
      title: "Admin Dashboard",
      description: "Manage floors and items",
      actions: [
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

  const rawContent = roleContent[user?.role || "FLOOR_MANAGER"] || roleContent["FLOOR_MANAGER"];
  const isFloorHead = user?.dbRole?.toUpperCase() === "FLOORHEAD" || user?.dbRole?.toUpperCase() === "FLOOR_HEAD";
  const content = isFloorHead
    ? { ...rawContent, actions: rawContent.actions.filter((a) => a.label !== "Manage Users") }
    : rawContent;

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
    <>
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-background">
      {/* H1: Dark Topbar */}
      <nav
        style={{ background: "#111827", minHeight: 52 }}
        className="sticky top-0 z-50 flex items-center justify-between px-3 sm:px-5 sm:min-h-[56px]"
      >
        <div className="flex items-center gap-2">
          <div style={{ background: "#185FA5", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package className="w-4 h-4 text-white" />
          </div>
          <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 16 }}>StockTake</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2">
              <div style={{ background: "#185FA5", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>
                {(user?.username || user?.name || "U").slice(0, 2).toUpperCase()}
              </div>
              <div className="text-right">
                <p style={{ color: "#F9FAFB", fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{user?.username || user?.name}</p>
                <p style={{ color: "#9CA3AF", fontSize: 10, lineHeight: 1, marginTop: 2 }}>{user?.role}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, color: "#D1D5DB", fontSize: 12, fontWeight: 500, padding: "6px 10px", cursor: "pointer", touchAction: "manipulation", minHeight: 32 }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Dashboard Content */}
      <div className="container py-4 sm:py-8 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-3 sm:mb-5">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-1">
              {content?.title || "Dashboard"}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">{content?.description || "Welcome to your dashboard"}</p>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
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
            <div className="mt-4 sm:mt-6 space-y-4">

              {/* Recent Activity */}
              <Card className="border-border hover:shadow-lg transition-all duration-300">
                <button
                  className="w-full flex items-center justify-between p-4 sm:p-6 text-left"
                  onClick={() => setActivityExpanded(prev => !prev)}
                >
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    Recent Activity
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Last 10 entries</span>
                    <ChevronRight
                      className="w-4 h-4 text-muted-foreground transition-transform duration-200"
                      style={{ transform: activityExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                    />
                  </div>
                </button>
                {activityExpanded && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3">
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
                )}
              </Card>
            </div>
          )}



          {/* My Entries Section - Only show for FLOOR_MANAGER and SUPERUSER */}
          {(user?.role === "FLOOR_MANAGER" || user?.role === "SUPERUSER") && (
            <div className="mt-4 sm:mt-6">
              <div className="mb-3">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  My Entries
                </h2>
                <p className="text-sm text-muted-foreground">
                  Stock entries - submitted and in progress
                </p>
              </div>

              {/* DatePillSelector for My Entries — same as Summary page */}
              <div className="mb-4 relative z-10">
                <DatePillSelector
                  entryDates={entriesAvailableDates}
                  selectedDates={entriesSelectedDates}
                  onChange={(dates) => setEntriesSelectedDates(dates)}
                />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ">
                  {/* Pending Session compact card */}
                  {pendingSession && (() => {
                    const pendingWeight = pendingSession.items?.reduce(
                      (sum: number, item: any) => sum + (item.totalWeight || 0), 0
                    ) || 0;
                    return (
                      <div
                        className="relative"
                        onMouseEnter={() => setHoveredSessionId("pending")}
                        onMouseLeave={() => setHoveredSessionId(null)}
                      >
                        <Card
                          className="p-4 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50/50 to-yellow-50/50 dark:from-orange-950/10 dark:to-yellow-950/10 hover:shadow-lg transition-all duration-200 cursor-pointer h-full flex flex-col gap-3"
                          onClick={handleResumeSession}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <Clock className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                                <p className="text-sm font-bold text-foreground truncate">
                                  {pendingSession.warehouse}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {pendingSession.floorName || "Floor"}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded text-[10px] font-semibold shrink-0">
                              IN PROGRESS
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {new Date(pendingSession.lastModified || pendingSession.createdAt).toLocaleDateString("en-GB")}
                            </span>
                          </div>

                          <div className="mt-auto">
                            <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                              {pendingWeight.toFixed(2)} kg
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {pendingSession.items?.length || 0} items
                            </p>
                          </div>

                          <div className="flex gap-2 border-t pt-3 mt-1">
                            <Button
                              onClick={(e) => { e.stopPropagation(); handleResumeSession(); }}
                              size="sm"
                              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs"
                            >
                              Resume
                            </Button>
                            <Button
                              onClick={(e) => { e.stopPropagation(); handleDiscardSession(); }}
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 text-xs"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </Card>

                        {hoveredSessionId === "pending" && pendingSession.items && pendingSession.items.length > 0 && (
                          <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-popover border border-border rounded-lg shadow-xl p-3 pointer-events-none">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">
                              Items in progress ({pendingSession.items.length})
                            </p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {pendingSession.items.slice(0, 5).map((item: any, idx: number) => {
                                const name = item.description || item.subcategory || item.category || "Item";
                                return (
                                  <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="text-foreground truncate flex-1 mr-2">{name}</span>
                                    <span className="text-primary font-semibold shrink-0">
                                      {Number(item.totalWeight || 0).toFixed(2)} kg
                                    </span>
                                  </div>
                                );
                              })}
                              {pendingSession.items.length > 5 && (
                                <p className="text-xs text-muted-foreground text-center pt-1">
                                  +{pendingSession.items.length - 5} more items
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Submitted session compact cards */}
                  {submittedSessions.map((session, sessionIndex) => {
                    const sessionWeight = session.items?.reduce(
                      (sum: number, item: any) => sum + (item.totalWeight || 0), 0
                    ) || 0;
                    const sessionDate = session.createdAt
                      ? new Date(session.createdAt).toLocaleDateString("en-GB")
                      : "N/A";
                    const sessionTime = session.createdAt
                      ? new Date(session.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "";
                    const todayStr = new Date().toISOString().split("T")[0];
                    const entryDateStr = session.createdAt
                      ? new Date(session.createdAt).toISOString().split("T")[0]
                      : "";
                    const isToday = todayStr === entryDateStr;
                    const isFloorManager = user?.role === "FLOOR_MANAGER";
                    const canEdit = session.status === "SUBMITTED" && (!isFloorManager || isToday);
                    const cardId = `${session.id}-${sessionIndex}`;

                    return (
                      <div
                        key={cardId}
                        className="relative"
                        onMouseEnter={() => setHoveredSessionId(cardId)}
                        onMouseLeave={() => setHoveredSessionId(null)}
                      >
                        <Card
                          className="p-4 border-border hover:shadow-lg transition-all duration-200 cursor-pointer h-full flex flex-col gap-3"
                          onClick={() => handleSessionCardClick(session)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <Warehouse className="w-3.5 h-3.5 text-primary shrink-0" />
                                <p className="text-sm font-bold text-foreground truncate">
                                  {session.warehouse}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {session.floorName || session.floor || "Floor"}
                              </p>
                            </div>
                            {session.status && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
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

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>{sessionDate} {sessionTime}</span>
                          </div>

                          <div className="mt-auto">
                            <p className="text-xl font-bold text-primary">
                              {sessionWeight.toFixed(2)} kg
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {session.items?.length || 0} items
                            </p>
                          </div>

                          <div className="border-t pt-3 mt-1 flex justify-end">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadEntries(session);
                              }}
                              disabled={downloadingSession === session.id}
                              variant="outline"
                              size="sm"
                              className="text-xs"
                            >
                              {downloadingSession === session.id ? (
                                <Loader className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </Card>

                        {hoveredSessionId === cardId && session.items && session.items.length > 0 && (
                          <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-popover border border-border rounded-lg shadow-xl p-3 pointer-events-none">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">
                              {session.warehouse} — {session.floorName || "Floor"} ({session.items.length} items)
                            </p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {session.items.slice(0, 5).map((item: any, idx: number) => {
                                const isCustom = item.category && !item.subcategory;
                                const name = isCustom
                                  ? item.category
                                  : item.description || item.subcategory || item.category || "Item";
                                const isFresh = !item.stockType || item.stockType === "Fresh Stock";
                                return (
                                  <div key={idx} className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                                      <span
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ background: isFresh ? "#3B6D11" : "#633806" }}
                                      />
                                      <span className="text-foreground truncate">{name}</span>
                                    </div>
                                    <span className="text-primary font-semibold shrink-0">
                                      {Number(item.totalWeight || 0).toFixed(2)} kg
                                    </span>
                                  </div>
                                );
                              })}
                              {session.items.length > 5 && (
                                <p className="text-xs text-muted-foreground text-center pt-1">
                                  +{session.items.length - 5} more — click to view all
                                </p>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 border-t pt-2">
                              {canEdit ? "Click to edit" : "Click to view"}
                            </p>
                          </div>
                        )}
                      </div>
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

    {/* Session Detail Modal */}

    {selectedSession && (() => {
      const todayStr = new Date().toISOString().split("T")[0];
      const entryDateStr = (selectedSession.createdAt || "").split("T")[0];
      const isToday = todayStr === entryDateStr;
      const isFloorManager = user?.role === "FLOOR_MANAGER";
      const canEdit = selectedSession.status === "SUBMITTED" && (!isFloorManager || isToday);
      const totalWeight = selectedSession.items?.reduce(
        (sum: number, item: any) => sum + (item.totalWeight || 0), 0
      ) || 0;

      return (
        <Dialog open={!!selectedSession} onOpenChange={(open) => { if (!open) setSelectedSession(null); }}>
          <DialogContent className="max-w-lg w-full max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-base font-bold flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate">{selectedSession.warehouse} — {selectedSession.floorName || selectedSession.floor || "Floor"}</span>
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {selectedSession.createdAt ? `${new Date(selectedSession.createdAt).toLocaleDateString("en-GB")}, ${new Date(selectedSession.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "N/A"}
                    </span>
                    {selectedSession.status && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        selectedSession.status === "SUBMITTED"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                          : selectedSession.status === "APPROVED"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}>
                        {selectedSession.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary row */}
              <div className="flex gap-4 mt-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Items</span>
                  <p className="font-bold text-foreground">{selectedSession.items?.length || 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Total Weight</span>
                  <p className="font-bold text-primary">{totalWeight.toFixed(2)} kg</p>
                </div>
              </div>
            </DialogHeader>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {selectedSession.items && selectedSession.items.length > 0 ? (
                selectedSession.items.map((item: any, idx: number) => {
                  const isCustom = item.category && !item.subcategory;
                  const name = isCustom
                    ? item.category
                    : item.description || item.subcategory || item.category || "Unknown Item";
                  const isFresh = !item.stockType || item.stockType === "Fresh Stock";
                  const barColor = isFresh ? "#3B6D11" : "#633806";
                  const bgColor = isFresh ? "#EAF3DE" : "#FAEEDA";

                  return (
                    <div
                      key={idx}
                      className="flex rounded-lg overflow-hidden border border-border/50 text-sm"
                    >
                      <div className="shrink-0 w-1" style={{ background: barColor }} />
                      <div
                        className="flex-1 flex items-center justify-between gap-2 px-3 py-2"
                        style={{ background: bgColor + "44" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground leading-tight truncate">{name}</p>
                          <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-muted-foreground">
                            {item.subcategory && !isCustom && (
                              <span>{item.category} › {item.subcategory}</span>
                            )}
                            {item.itemType && (
                              <span className="uppercase font-medium" style={{ color: "#0C447C" }}>{item.itemType}</span>
                            )}
                            {item.units != null && (
                              <span>{item.units % 1 === 0 ? item.units : Number(item.units).toFixed(2)} pcs</span>
                            )}
                            {item.packageSize && (
                              <span>UOM {Number(item.packageSize).toFixed(3)} kg</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-primary text-base leading-tight">
                            {Number(item.totalWeight || 0).toFixed(2)} kg
                          </p>
                          {!isFresh && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FAEEDA", color: "#633806" }}>
                              Off Grade
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No items found.</p>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t shrink-0 flex gap-2 justify-end">
              <Button
                onClick={() => handleDownloadEntries(selectedSession)}
                disabled={downloadingSession === selectedSession.id}
                variant="outline"
                size="sm"
              >
                {downloadingSession === selectedSession.id ? (
                  <Loader className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Download
              </Button>
              {canEdit && (
                <Button
                  onClick={() => { setSelectedSession(null); handleEditEntry(selectedSession); }}
                  size="sm"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      );
    })()}
    </>
  );
}
