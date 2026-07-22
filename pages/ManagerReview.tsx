/* MODIFIED: [E1/E2/E3/E6/E7/G4/G5] — compact item cards, auto-sort, auto-verify, verify/remark, delete modal, amber indicator, changelog */
import "./ManagerReview.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Package, Loader, Check, Warehouse, ChevronRight, Save, X, Upload, Plus, Search, Download, Trash2, ChevronDown, AlertTriangle, LayoutGrid, LayoutList } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { stocktakeEntriesAPI, categorialInvAPI, floorReviewAPI } from "@/utils/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DatePillSelector } from "@/components/DatePillSelector";
import { ColorLegend } from "@/components/ColorLegend";

interface FloorSession {
  id: string;
  warehouse: string;
  floor?: string;
  floorName?: string;
  authority: string;
  items: any[];
  status: string;
  submittedAt: string;
  totalWeight?: number;
  userName?: string;
  userEmail?: string;
  userId?: string;
}

// Append-only edit record — entryDate is always the original, immutable date
interface EntryEdit {
  editedAt: string;
  editedBy: string;
  field: string;
  oldValue: number;
  newValue: number;
  entryDate: string; // locked — never changes
}

interface ItemEntry {
  id: string;
  description: string;
  itemType?: string;
  category: string;
  subcategory: string;
  packageSize: number;
  units: number;
  totalWeight: number;
  userName: string;
  userEmail?: string;
  sessionId: string;
  stockType?: string;
  isChecked?: boolean;
  entryDate?: string;   // original immutable entry date
  verified?: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  remark?: string | null;
  edits?: EntryEdit[];  // append-only edit history
  createdAt?: string;
  updatedAt?: string;
  status?: "draft" | "submitted";
}

interface GroupedItem {
  description: string;
  category: string;
  subcategory: string;
  entries: ItemEntry[];
  totalEntries: number;
  totalQuantity: number;
  totalWeight: number;
}

interface WarehouseData {
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
}

const WAREHOUSES = ["W202", "A185", "F53", "A68", "Savla", "Rishi"];

export default function ManagerReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Floor entries live on their own route (/review/floor). The component is the
  // same, but on this path it renders the item list as a full page instead of a
  // drawer, and hydrates warehouse/floor from the URL (the route remounts on nav).
  const isFloorPage = location.pathname === "/review/floor";
  // The floor picker also has its own route (/review/floors) so it renders as a
  // full page instead of a bottom drawer.
  const isFloorsPage = location.pathname === "/review/floors";
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [warehouseFloors, setWarehouseFloors] = useState<{
    floorName: string;
    itemCount: number;
    totalWeight: number;
    hasUnchecked: boolean;
  }[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);
  // Name of the warehouse currently being fetched — drives the card spinner
  // while floors load, before the drawer is opened (see handleWarehouseClick).
  const [loadingWarehouseName, setLoadingWarehouseName] = useState<string | null>(null);
  // Seed from URL so a direct hit / refresh of /review/floor (and the remount
  // that happens on every route change) restores context without a round-trip
  // through the warehouse picker. The grouped-items effect keys off these, so
  // setting them here is enough to trigger the fetch on mount.
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(() => searchParams.get("warehouse"));
  const [selectedFloor, setSelectedFloor] = useState<string | null>(() => searchParams.get("floor"));
  const [isLoading, setIsLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingData, setSavingData] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [itemsDrawerOpen, setItemsDrawerOpen] = useState(false);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [itemDetailsOpen, setItemDetailsOpen] = useState(false);
  const [checkedEntries, setCheckedEntries] = useState<Record<string, boolean>>({});
  const [editingQuantity, setEditingQuantity] = useState<{ entryId: string; value: string } | null>(null);
  const [downloadingWarehouse, setDownloadingWarehouse] = useState(false);
  const [savingFloorReview, setSavingFloorReview] = useState(false);
  // Multi-date selection — source of truth is URL ?dates= param
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    const param = searchParams.get("dates");
    return param ? param.split(",").filter(Boolean) : [];
  });
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressDetectedRef = useRef<boolean>(false);

  // Add Item state
  const [addItemDrawerOpen, setAddItemDrawerOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemStockType, setNewItemStockType] = useState<"Fresh Stock" | "Off Grade/Rejection">("Fresh Stock");
  const [newItemForm, setNewItemForm] = useState({
    itemType: "" as "pm" | "rm" | "fg" | "",
    category: "",
    subcategory: "",
    description: "",
    quantity: "",
    uom: "",
  });
  const [addItemCategorialData, setAddItemCategorialData] = useState<Array<{
    name: string;
    subgroups: Array<{
      name: string;
      particulars: Array<{ name: string; uom: number | null }>;
    }>;
  }>>([]);
  const [loadingCategorialData, setLoadingCategorialData] = useState(false);

  // Search state for Add Item
  const [addItemSearchQuery, setAddItemSearchQuery] = useState("");
  const [addItemSearchResults, setAddItemSearchResults] = useState<Array<{
    name: string;
    group: string;
    subgroup: string;
    uom: number | null;
  }>>([]);
  const [addItemIsSearching, setAddItemIsSearching] = useState(false);
  const [addItemShowSearchResults, setAddItemShowSearchResults] = useState(false);
  const [isOtherDescription, setIsOtherDescription] = useState(false);
  const [customDescription, setCustomDescription] = useState("");

  // Manager quick-add entry state (within item details drawer)
  const [showQuickAddEntry, setShowQuickAddEntry] = useState(false);
  const [quickAddUnits, setQuickAddUnits] = useState("");
  const [quickAddStockType, setQuickAddStockType] = useState<"Fresh Stock" | "Off Grade/Rejection">("Fresh Stock");
  const [submittingQuickAdd, setSubmittingQuickAdd] = useState(false);
  
  // E7: Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; itemName: string; units: number; totalWeight: number; userName: string; stockType: string; createdAt?: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(1);

  // G5: Changelog panel state
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogEntry, setChangelogEntry] = useState<{ itemName: string; edits: any[] } | null>(null);

  // E5: Reassignment state (INVENTORY_MANAGER only)
  const [reassignDrawerOpen, setReassignDrawerOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<{ entryId: string; currentDescription: string; itemType: string } | null>(null);
  const [reassignSearchQuery, setReassignSearchQuery] = useState("");
  const [reassignResults, setReassignResults] = useState<Array<{ name: string; group: string; subgroup: string; uom: number | null }>>([]);
  const [reassignSearching, setReassignSearching] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  // E6: Verify remark state
  const [verifyRemarkInput, setVerifyRemarkInput] = useState("");
  const [showVerifyRemark, setShowVerifyRemark] = useState(false);

  // D1: Warehouse last-entry stats { [warehouse]: { lastDate: string|null, hasEntries: boolean } }
  const [warehouseStats, setWarehouseStats] = useState<Record<string, { lastDate: string | null; hasEntries: boolean }>>({});
  // D1: Grid/List view toggle — default list on mobile, grid on desktop
  const [warehouseViewMode, setWarehouseViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('warehouseViewMode');
    if (saved === 'grid' || saved === 'list') return saved as 'grid' | 'list';
    return typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'grid';
  });

  // Touch sensitivity improvement
  const isScrollingRef = useRef<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    // Get user data
    const userStr = localStorage.getItem("user");
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
    
    // Initialize with hardcoded warehouses
    setWarehouses(WAREHOUSES.map(name => ({ id: name, name })));

    // Fetch all dates that have at least one entry — fetched once, never re-fetched on filter change
    const fetchAvailableDates = async () => {
      setLoadingDates(true);
      try {
        const response = await stocktakeEntriesAPI.getAvailableDates();
        if (response?.dates && response.dates.length > 0) {
          const sorted: string[] = response.dates
            .map((d: { date: string }) => d.date)
            .sort();
          setAvailableDates(sorted);
          // Auto-select last 3 dates if no date is already selected via URL param
          const currentParam = searchParams.get("dates");
          if (!currentParam) {
            const defaultDates = sorted.slice(-3); // last 3 most recent
            if (defaultDates.length > 0) {
              setSelectedDates(defaultDates);
              setSearchParams(prev => { prev.set("dates", defaultDates.join(",")); return prev; }, { replace: true });
            }
          }
        }
      } catch (err) {
        console.error("Error fetching available dates:", err);
      } finally {
        setLoadingDates(false);
      }
    };
    fetchAvailableDates();

    // D1: Fetch latest entry date per warehouse for warehouse card badges
    const fetchWarehouseStats = async () => {
      try {
        const response = await stocktakeEntriesAPI.getEntries({ limit: 2000 });
        const entries: any[] = response?.entries ?? [];
        const stats: Record<string, { lastDate: string | null; hasEntries: boolean }> = {};
        WAREHOUSES.forEach((wh) => {
          const whEntries = entries.filter((e: any) => (e.warehouse || "").toLowerCase() === wh.toLowerCase());
          if (whEntries.length === 0) {
            stats[wh] = { lastDate: null, hasEntries: false };
          } else {
            const latest = whEntries.reduce((max: any, e: any) =>
              new Date(e.createdAt || 0) > new Date(max.createdAt || 0) ? e : max, whEntries[0]);
            stats[wh] = { lastDate: latest.createdAt || null, hasEntries: true };
          }
        });
        setWarehouseStats(stats);
      } catch (err) {
        console.error("[D1] Failed to fetch warehouse stats:", err);
      }
    };
    fetchWarehouseStats();

    // Initialize checked items from localStorage if exists (UI state only)
    const savedChecks = localStorage.getItem("checkedItems");
    if (savedChecks) {
      setCheckedItems(JSON.parse(savedChecks));
    }
    
    // Initialize checked entries from localStorage if exists (UI state only)
    const savedCheckedEntries = localStorage.getItem("checkedEntries");
    if (savedCheckedEntries) {
      setCheckedEntries(JSON.parse(savedCheckedEntries));
    }
    
    // Add scroll detection to prevent accidental clicks during scroll
    const handleScroll = () => {
      isScrollingRef.current = true;
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 200); // Increased from 150ms to 200ms for better stability
    };
    
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartRef.current) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
        const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
        
        // If moved more than 8px in any direction, consider it scrolling
        // Reduced threshold for more sensitive scroll detection
        if (deltaX > 8 || deltaY > 8) {
          isScrollingRef.current = true;
        }
      }
    };
    
    const handleTouchEnd = () => {
      setTimeout(() => {
        isScrollingRef.current = false;
        touchStartRef.current = null;
      }, 100);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    setIsLoading(false);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // On the floors page (direct hit, refresh, or arriving from a warehouse tap or
  // the item page's "Back" button), load that warehouse's floor list from the
  // ?warehouse= param. The route remounts per navigation, so this runs each time.
  useEffect(() => {
    if (!isFloorsPage) return;
    const wh = searchParams.get("warehouse");
    if (wh) fetchFloors(wh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D1: Persist view mode preference
  useEffect(() => {
    localStorage.setItem('warehouseViewMode', warehouseViewMode);
  }, [warehouseViewMode]);

  // Sync selectedDates to URL params
  useEffect(() => {
    if (selectedDates.length > 0) {
      setSearchParams({ dates: selectedDates.join(",") }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [selectedDates, setSearchParams]);

  // Helper: derive start/end date strings for API range queries
  const getDateRange = useCallback(() => {
    if (selectedDates.length === 0) return {};
    const sorted = [...selectedDates].sort();
    return {
      startDate: `${sorted[0]}T00:00:00.000Z`,
      endDate: `${sorted[sorted.length - 1]}T23:59:59.999Z`,
    };
  }, [selectedDates]);

  // Helper: single date for grouped-entries API
  const getPrimaryDate = useCallback(() => {
    if (selectedDates.length === 0) return undefined;
    return [...selectedDates].sort()[0];
  }, [selectedDates]);

  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch the unique floors for a warehouse from the database. Data only — the
  // floors now live on their own page (/review/floors), which calls this on
  // mount. No drawer / navigation side effects here.
  const fetchFloors = async (warehouse: string) => {
    setSelectedWarehouse(warehouse);
    setLoadingWarehouseName(warehouse);
    setLoadingFloors(true);

    try {
      const fetchParams: any = { warehouse, ...getDateRange() };
      const entriesResponse = await stocktakeEntriesAPI.getEntries(fetchParams);

      if (entriesResponse && entriesResponse.entries && entriesResponse.entries.length > 0) {
        // Group entries by floor name
        const floorMap: Record<string, { itemCount: number; totalWeight: number; uncheckedCount: number }> = {};

        entriesResponse.entries.forEach((entry: any) => {
          const floorName = (entry.floorName || "Unknown").toUpperCase();
          if (!floorMap[floorName]) {
            floorMap[floorName] = { itemCount: 0, totalWeight: 0, uncheckedCount: 0 };
          }
          floorMap[floorName].itemCount += 1;
          floorMap[floorName].totalWeight += entry.totalWeight || 0;
          // "check = verify": an entry is complete once verified. A floor is
          // incomplete (red dot) if any of its entries is still unverified.
          if (entry.verified !== true) floorMap[floorName].uncheckedCount += 1;
        });

        // Convert to array
        const floors = Object.entries(floorMap).map(([floorName, data]) => ({
          floorName,
          itemCount: data.itemCount,
          totalWeight: data.totalWeight,
          hasUnchecked: data.uncheckedCount > 0,
        }));

        setWarehouseFloors(floors);
      } else {
        setWarehouseFloors([]);
      }
    } catch (err) {
      console.error("Error loading floors:", err);
      setWarehouseFloors([]);
    } finally {
      setLoadingFloors(false);
      setLoadingWarehouseName(null);
    }
  };

  // Warehouse card → open the floors PAGE (context in the URL, refresh-safe).
  const handleWarehouseClick = (warehouse: string) => {
    if (isScrollingRef.current) return;
    const params = new URLSearchParams();
    params.set("warehouse", warehouse);
    if (selectedDates.length > 0) params.set("dates", selectedDates.join(","));
    navigate(`/review/floors?${params.toString()}`);
  };

  const handleFloorClick = (floor: string) => {
    // Prevent clicks during scrolling
    if (isScrollingRef.current) {
      return;
    }
    
    // The item list is now its own page. Navigate to /review/floor with the
    // context in the URL (refresh-safe, back-button friendly) instead of opening
    // a nested drawer. The route remounts and hydrates from these params.
    const params = new URLSearchParams();
    if (selectedWarehouse) params.set("warehouse", selectedWarehouse);
    params.set("floor", floor);
    if (selectedDates.length > 0) params.set("dates", selectedDates.join(","));
    setDrawerOpen(false);
    navigate(`/review/floor?${params.toString()}`);
  };

  const handleSaveFloorReview = async () => {
    if (!selectedWarehouse || !selectedFloor) {
      toast({ title: "Missing info", description: "Warehouse and floor are required", variant: "destructive" });
      return;
    }

    const allItems = getGroupedItems();
    if (allItems.length === 0) {
      toast({ title: "No items", description: "No items to save for this floor", variant: "destructive" });
      return;
    }

    // Collect only the checked entry IDs
    const checkedEntryIds: string[] = [];

    for (const item of allItems) {
      const itemNameUpper = item.description.toUpperCase();
      const storageKey = `checkedEntries_${selectedWarehouse}_${selectedFloor}_${itemNameUpper}`;
      const savedChecked = localStorage.getItem(storageKey);
      const checkedMap: Record<string, boolean> = savedChecked ? JSON.parse(savedChecked) : {};

      for (const entry of item.entries) {
        if (checkedMap[entry.id] === true && entry.id) {
          checkedEntryIds.push(entry.id);
        }
      }
    }

    setSavingFloorReview(true);
    try {
      // Skip the API call when nothing is checked — the backend SQL would build an
      // invalid `WHERE id IN ()` clause. Still treat it as a successful save so the
      // user can proceed (Excel download will flag unchecked rows).
      if (checkedEntryIds.length > 0) {
        await floorReviewAPI.saveFloorReview(checkedEntryIds);
      }

      toast({
        title: "Floor saved",
        description:
          checkedEntryIds.length > 0
            ? `${checkedEntryIds.length} entries marked as checked. Downloading Excel…`
            : `No entries were checked. Downloading Excel with all rows flagged as "Unchecked"…`,
      });

      // Auto-download this floor's Excel right after a successful save.
      // Scoped to selectedFloor so only the saved floor is exported, not the whole warehouse.
      // Wrapped in try/catch so a download failure doesn't undo the save toast.
      try {
        await handleDownloadWarehouseEntries(selectedFloor);
      } catch (dlErr: any) {
        console.error("Auto-download after save failed:", dlErr);
      }
    } catch (err: any) {
      console.error("Save floor review error:", err);
      toast({
        title: "Save failed",
        description: err.message || "Failed to save floor review",
        variant: "destructive",
      });
    } finally {
      setSavingFloorReview(false);
    }
  };

  const handleItemClick = (itemName: string) => {
    // Prevent clicks during scrolling
    if (isScrollingRef.current) {
      return;
    }
    
    setSelectedItemName(itemName);
    setConfirmed(false); // Reset confirmation when changing items
    
    // Load checked entries from localStorage for this specific item
    // Use a key that includes warehouse/floor/item for persistence
    const storageKey = `checkedEntries_${selectedWarehouse}_${selectedFloor}_${itemName.toUpperCase()}`;
    const savedCheckedEntries = localStorage.getItem(storageKey);
    
    const currentItemEntries = getItemEntries(itemName);
    
    setCheckedEntries((prev) => {
      const updated: Record<string, boolean> = {};

      let saved: Record<string, boolean> = {};
      if (savedCheckedEntries) {
        try {
          saved = JSON.parse(savedCheckedEntries);
        } catch (e) {
          saved = {};
        }
      }

      // DB is the source of truth (check = verify): an entry is ticked if it is
      // checked/verified in the DB, or has a pending local tick not yet cleared.
      currentItemEntries.forEach((entry) => {
        const dbChecked = entry.verified === true || entry.isChecked === true;
        updated[entry.id] = dbChecked || saved[entry.id] === true;
      });

      return updated;
    });
    
    setItemDetailsOpen(true);
  };

  // Persist localStorage tick state (used by Save Floor + Excel export helpers)
  const persistCheckedLocal = (map: Record<string, boolean>) => {
    if (selectedWarehouse && selectedFloor && selectedItemName) {
      const storageKey = `checkedEntries_${selectedWarehouse}_${selectedFloor}_${selectedItemName.toUpperCase()}`;
      localStorage.setItem(storageKey, JSON.stringify(map));
    }
    localStorage.setItem("checkedEntries", JSON.stringify(map));
  };

  // Reflect a check's state in the grouped data so the item-row status dot
  // (driven by `verified`) and the auto-sort update immediately, no refetch.
  const applyCheckToGrouped = (
    entryId: string,
    checked: boolean,
    verifiedBy: string | null,
    verifiedAt: string | null,
  ) => {
    setGroupedItemsData((prev) =>
      prev.map((group) => ({
        ...group,
        entries: group.entries.map((e) =>
          e.id === entryId
            ? { ...e, verified: checked, isChecked: checked, verifiedBy, verifiedAt }
            : e,
        ),
      })),
    );
  };

  // A manager's tick = "check + verify". Persist immediately to the DB so
  // is_checked / verified reflect the tick and the red dot clears at once.
  const handleEntryCheck = async (entryId: string, checked: boolean) => {
    // Prevent actions during scrolling
    if (isScrollingRef.current) {
      return;
    }

    const prevChecked = checkedEntries[entryId] || false;
    const verifiedBy = checked ? (user?.username || user?.name || user?.email || "MANAGER") : null;
    const verifiedAt = checked ? new Date().toISOString() : null;

    // Optimistic UI: tick badge, counter, localStorage, and the status dot.
    setCheckedEntries((prev) => {
      const updated = { ...prev, [entryId]: checked };
      persistCheckedLocal(updated);
      return updated;
    });
    applyCheckToGrouped(entryId, checked, verifiedBy, verifiedAt);

    try {
      await stocktakeEntriesAPI.updateEntry(entryId, {
        isChecked: checked,
        verified: checked,
        verifiedBy,
        verifiedAt,
      });
    } catch (err: any) {
      console.error("Failed to persist entry check:", err);
      // Revert optimistic updates so the UI stays truthful to the DB.
      setCheckedEntries((prev) => {
        const reverted = { ...prev, [entryId]: prevChecked };
        persistCheckedLocal(reverted);
        return reverted;
      });
      applyCheckToGrouped(entryId, prevChecked, prevChecked ? verifiedBy : null, prevChecked ? verifiedAt : null);
      toast({
        title: "Save failed",
        description: err.message || "Could not save the check. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveData = async () => {
    // Prevent clicks during scrolling
    if (isScrollingRef.current) {
      return;
    }
    console.log("=== SAVE BUTTON CLICKED ===");
    console.log("Timestamp:", new Date().toISOString());
    setSavingData(true);
    try {
      // Send just the date - backend will fetch entries from DB directly
      // This avoids the 413 payload-too-large error on API Gateway
      const response = await stocktakeEntriesAPI.saveResultsheet([], getPrimaryDate());
      console.log("API Response received:", response);

      toast({
        title: "Success",
        description: `Stock take data saved successfully! ${response.savedCount || 0} entries saved to resultsheet.`,
      });

      setSavingData(false);
    } catch (err: any) {
      console.error("=== SAVE ERROR ===");
      console.error("Error saving data:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to save stock take data",
        variant: "destructive",
      });
      setSavingData(false);
    }
  };







  // Long press handlers
  const handleLongPressStart = (entryId: string, currentValue: number, type: 'quantity') => {
    longPressDetectedRef.current = false;
    const timer = setTimeout(() => {
      longPressDetectedRef.current = true;
      if (type === 'quantity') {
        setEditingQuantity({ entryId, value: currentValue.toString() });
      }
    }, 800); // 800ms for long press
    longPressTimerRef.current = timer;
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // Reset after a short delay to allow checking if long press was detected
    setTimeout(() => {
      if (!longPressDetectedRef.current) {
        // Normal click - don't do anything here, let onClick handle it
      }
      longPressDetectedRef.current = false;
    }, 100);
  };




  const handleSaveEditedQuantity = async (entryId: string, newValue: number) => {
    if (isNaN(newValue) || newValue <= 0) {
      alert("Please enter a valid positive number (decimals allowed, e.g., 55.6)");
      return;
    }

    try {
      // Find the entry in grouped items
      const entry = groupedItemsData
        .flatMap((g) => g.entries)
        .find((e) => e.id === entryId);

      if (!entry) {
        alert("Entry not found");
        return;
      }

      // Parse the value as float to preserve decimal precision
      const parsedValue = parseFloat(String(newValue)) || 0;
      
      // Calculate new total weight
      const newTotalWeight = entry.packageSize * parsedValue;

      // Update entry in database
      await stocktakeEntriesAPI.updateEntry(entryId, {
        totalQuantity: parsedValue,
        totalWeight: newTotalWeight,
      });

      // Refresh grouped items data
      if (selectedWarehouse && selectedFloor) {
        const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, getDateRange());
        setGroupedItemsData(data.groups || []);
      }

      setEditingQuantity(null);
    } catch (err: any) {
      console.error("Error updating entry:", err);
      alert(err.message || "Failed to update entry");
    }
  };

  // E7: Open delete modal (INVENTORY_MANAGER only — enforced in UI)
  const openDeleteModal = (entry: ItemEntry) => {
    setDeleteTarget({
      id: entry.id,
      itemName: entry.description,
      units: entry.units,
      totalWeight: entry.totalWeight,
      userName: entry.userName,
      stockType: entry.stockType || "Fresh Stock",
      createdAt: entry.createdAt,
    });
    setDeleteReason("");
    setDeleteConfirmStep(1);
    setDeleteModalOpen(true);
  };

  // E7: Confirm delete with log
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmStep === 1) {
      setDeleteConfirmStep(2);
      return;
    }
    setIsDeleting(true);
    try {
      await stocktakeEntriesAPI.updateEntry(deleteTarget.id, {
        edits: [
          {
            editedAt: new Date().toISOString(),
            editedBy: user?.username || user?.name || "MANAGER",
            field: "deleted",
            oldValue: deleteTarget.units,
            newValue: 0,
            entryDate: deleteTarget.createdAt || new Date().toISOString(),
            reason: deleteReason || undefined,
          }
        ]
      });
      await stocktakeEntriesAPI.deleteEntry(deleteTarget.id);

      if (selectedWarehouse && selectedFloor) {
        const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, getDateRange());
        setGroupedItemsData(data.groups || []);
      }
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      setEditingQuantity(null);
      toast({ title: "Entry deleted", description: `${deleteTarget.itemName} entry removed.` });

      if (selectedItemName) {
        const updatedEntries = getItemEntries(selectedItemName);
        if (updatedEntries.length <= 1) {
          setItemDetailsOpen(false);
          setSelectedItemName(null);
        }
      }
    } catch (err: any) {
      console.error("Error deleting entry:", err);
      toast({ title: "Delete failed", description: err.message || "Failed to delete entry", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    // Legacy — now uses modal; kept for backward compat
    const entry = groupedItemsData.flatMap(g => g.entries).find(e => e.id === entryId);
    if (entry) openDeleteModal(entry);
  };


  const handleCancelEdit = () => {
    setEditingQuantity(null);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressDetectedRef.current = false;
  };

  const handleItemCheck = (itemId: string, checked: boolean) => {
    setCheckedItems((prev) => ({
      ...prev,
      [itemId]: checked,
    }));
  };

  // Search items when query changes for Add Item form
  useEffect(() => {
    const searchItems = async () => {
      if (!newItemForm.itemType || !addItemSearchQuery || addItemSearchQuery.length < 2) {
        setAddItemSearchResults([]);
        setAddItemShowSearchResults(false);
        return;
      }

      setAddItemIsSearching(true);
      try {
        const response = await categorialInvAPI.searchDescriptions(
          newItemForm.itemType as "pm" | "rm" | "fg",
          addItemSearchQuery
        );
        setAddItemSearchResults(response.results || []);
        setAddItemShowSearchResults(true);
      } catch (err) {
        console.error("Error searching items:", err);
        setAddItemSearchResults([]);
      } finally {
        setAddItemIsSearching(false);
      }
    };

    const timeoutId = setTimeout(() => {
      searchItems();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [addItemSearchQuery, newItemForm.itemType]);

  // E5: Debounced search for reassignment
  useEffect(() => {
    const searchReassign = async () => {
      if (!reassignTarget?.itemType || !reassignSearchQuery || reassignSearchQuery.length < 2) {
        setReassignResults([]);
        return;
      }
      setReassignSearching(true);
      try {
        const response = await categorialInvAPI.searchDescriptions(
          (reassignTarget.itemType || "fg") as "pm" | "rm" | "fg",
          reassignSearchQuery
        );
        setReassignResults(response.results || []);
      } catch (err) {
        console.error("Error searching reassign items:", err);
        setReassignResults([]);
      } finally {
        setReassignSearching(false);
      }
    };
    const timeoutId = setTimeout(searchReassign, 300);
    return () => clearTimeout(timeoutId);
  }, [reassignSearchQuery, reassignTarget?.itemType]);

  // Fetch categorial data when item type changes for add item form
  const fetchAddItemCategorialData = async (itemType: "pm" | "rm" | "fg") => {
    setLoadingCategorialData(true);
    try {
      const data = await categorialInvAPI.getByItemType(itemType);
      setAddItemCategorialData(data.groups || []);
    } catch (err) {
      console.error("Failed to fetch categorial data:", err);
      setAddItemCategorialData([]);
    } finally {
      setLoadingCategorialData(false);
    }
  };

  // Get subcategories for selected category
  const getSubcategoriesForCategory = () => {
    const group = addItemCategorialData.find(g => g.name === newItemForm.category);
    return group?.subgroups || [];
  };

  // Get descriptions for selected subcategory
  const getDescriptionsForSubcategory = () => {
    const group = addItemCategorialData.find(g => g.name === newItemForm.category);
    const subgroup = group?.subgroups.find(sg => sg.name === newItemForm.subcategory);
    return subgroup?.particulars || [];
  };

  // Handle item type change
  const handleItemTypeChange = (value: "pm" | "rm" | "fg") => {
    setNewItemForm(prev => ({
      ...prev,
      itemType: value,
      category: "",
      subcategory: "",
      description: "",
      uom: "",
    }));
    fetchAddItemCategorialData(value);
  };

  // Handle category change
  const handleCategoryChange = (value: string) => {
    setNewItemForm(prev => ({
      ...prev,
      category: value,
      subcategory: "",
      description: "",
      uom: "",
    }));
  };

  // Handle subcategory change
  const handleSubcategoryChange = (value: string) => {
    setNewItemForm(prev => ({
      ...prev,
      subcategory: value,
      description: "",
      uom: "",
    }));
    // Reset custom description state when subcategory changes
    setIsOtherDescription(false);
    setCustomDescription("");
  };

  // Handle description change
  const handleDescriptionChange = (value: string) => {
    if (value === "__OTHER__") {
      setIsOtherDescription(true);
      setCustomDescription("");
      setNewItemForm(prev => ({
        ...prev,
        description: "",
        uom: "", // Allow manual UOM entry for custom items
      }));
      return;
    }

    setIsOtherDescription(false);
    setCustomDescription("");

    const group = addItemCategorialData.find(g => g.name === newItemForm.category);
    const subgroup = group?.subgroups.find(sg => sg.name === newItemForm.subcategory);
    const particular = subgroup?.particulars.find(p => p.name === value);

    setNewItemForm(prev => ({
      ...prev,
      description: value,
      uom: particular?.uom?.toString() || "",
    }));
  };

  // Handle search item selection - populate form from search result
  const handleSearchItemSelect = (result: { name: string; group: string; subgroup: string; uom: number | null }) => {
    setNewItemForm(prev => ({
      ...prev,
      category: result.group,
      subcategory: result.subgroup,
      description: result.name,
      uom: result.uom?.toString() || "",
    }));
    setAddItemSearchQuery("");
    setAddItemShowSearchResults(false);
    setAddItemSearchResults([]);
    // Reset custom description state when selecting from search
    setIsOtherDescription(false);
    setCustomDescription("");
  };

  // Handle adding new item
  const handleAddNewItem = async () => {
    if (!selectedWarehouse || !selectedFloor) {
      toast({
        title: "Error",
        description: "Please select warehouse and floor first",
        variant: "destructive",
      });
      return;
    }

    // Get the actual description (custom or selected)
    const actualDescription = isOtherDescription ? customDescription : newItemForm.description;

    if (!newItemForm.itemType || !newItemForm.category || !newItemForm.subcategory || !actualDescription || !newItemForm.quantity || !newItemForm.uom) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setAddingItem(true);
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const quantity = parseFloat(newItemForm.quantity) || 0;
      const uom = parseFloat(newItemForm.uom) || 0;
      const totalWeight = quantity * uom;

      // E3: Auto-verify items added by INVENTORY_MANAGER
      const now = new Date().toISOString();
      const entry = {
        item_name: actualDescription.trim().toUpperCase(),
        item_type: newItemForm.itemType.toUpperCase(),
        item_category: newItemForm.category.trim().toUpperCase(),
        item_subcategory: newItemForm.subcategory.trim().toUpperCase(),
        floor_name: selectedFloor,
        warehouse: selectedWarehouse,
        total_quantity: quantity,
        unit_uom: uom,
        total_weight: totalWeight,
        entered_by: user?.name || user?.email || "MANAGER",
        entered_by_email: user?.email || "",
        authority: "INVENTORY_MANAGER",
        stock_type: newItemStockType,
        // E3: auto-verify for INVENTORY_MANAGER
        verified: true,
        verified_by: user?.username || user?.name || user?.email || "MANAGER",
        verified_at: now,
        remark: verifyRemarkInput.trim() || "Added by manager",
      };

      await stocktakeEntriesAPI.submitEntries([entry]);

      // Refresh grouped items data
      const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, getDateRange());
      setGroupedItemsData(data.groups || []);

      // Reset form and close drawer
      setNewItemForm({
        itemType: "",
        category: "",
        subcategory: "",
        description: "",
        quantity: "",
        uom: "",
      });
      setAddItemCategorialData([]);
      // Reset search state
      setAddItemSearchQuery("");
      setAddItemSearchResults([]);
      setAddItemShowSearchResults(false);
      // Reset custom description state
      setIsOtherDescription(false);
      setCustomDescription("");
      setAddItemDrawerOpen(false);
      setNewItemStockType("Fresh Stock");

      toast({
        title: "Success",
        description: `Item "${entry.item_name}" added successfully`,
      });
    } catch (err: any) {
      console.error("Error adding item:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to add item",
        variant: "destructive",
      });
    } finally {
      setAddingItem(false);
    }
  };

  const handleQuickAddEntry = async () => {
    if (!selectedItemName || !selectedWarehouse || !selectedFloor) return;

    const units = parseFloat(quickAddUnits);
    if (isNaN(units) || units <= 0) {
      toast({ title: "Invalid", description: "Enter a valid quantity > 0", variant: "destructive" });
      return;
    }

    const itemEntries = getItemEntries(selectedItemName);
    if (itemEntries.length === 0) return;

    const refEntry = itemEntries[0];
    const uom = refEntry.packageSize;
    const totalWeight = units * uom;

    setSubmittingQuickAdd(true);
    try {
      const userData = JSON.parse(localStorage.getItem("user") || "{}");
      const entry = {
        item_name: refEntry.description.trim().toUpperCase(),
        item_type: (refEntry.itemType || "").toUpperCase(),
        item_category: refEntry.category.trim().toUpperCase(),
        item_subcategory: refEntry.subcategory.trim().toUpperCase(),
        floor_name: selectedFloor,
        warehouse: selectedWarehouse,
        total_quantity: units,
        unit_uom: uom,
        total_weight: totalWeight,
        entered_by: userData?.name || userData?.email || "MANAGER",
        entered_by_email: userData?.email || "",
        authority: "INVENTORY_MANAGER",
        stock_type: quickAddStockType,
      };

      await stocktakeEntriesAPI.submitEntries([entry]);

      const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, getDateRange());
      setGroupedItemsData(data.groups || []);

      setQuickAddUnits("");
      setQuickAddStockType("Fresh Stock");
      setShowQuickAddEntry(false);

      toast({ title: "Entry added", description: `${units} units added to ${selectedItemName}` });
    } catch (err: any) {
      console.error("Error adding quick entry:", err);
      toast({ title: "Error", description: err.message || "Failed to add entry", variant: "destructive" });
    } finally {
      setSubmittingQuickAdd(false);
    }
  };

  const handleSaveStatus = () => {
    if (!confirmed) {
      alert("Please confirm that all items are accurate before saving.");
      return;
    }
    
    setSaving(true);
    
    try {
      // Save checked items to localStorage (UI state only)
      localStorage.setItem("checkedItems", JSON.stringify(checkedItems));
      
      setTimeout(() => {
        setSaving(false);
        setConfirmed(false);
        // Close drawer after saving
        setItemsDrawerOpen(false);
        setSelectedFloor(null);
      }, 500);
    } catch (err) {
      alert("Failed to save status");
      setSaving(false);
    }
  };

  // Get items for selected warehouse and floor, grouped by item name (description)
  // This function now fetches from database
  const [groupedItemsData, setGroupedItemsData] = useState<GroupedItem[]>([]);
  const [loadingGroupedItems, setLoadingGroupedItems] = useState(false);

  useEffect(() => {
    const fetchGroupedItems = async () => {
      if (!selectedWarehouse || !selectedFloor) {
        setGroupedItemsData([]);
        return;
      }

      setLoadingGroupedItems(true);
      try {
        const data = await stocktakeEntriesAPI.getGroupedEntries(
          selectedWarehouse!,
          selectedFloor!,
          getDateRange()
        );
        setGroupedItemsData(data.groups || []);
        setConfirmed(false);
        setSelectedItemName(null);
      } catch (err: any) {
        console.error("Error fetching grouped entries:", err);
        setGroupedItemsData([]);
      } finally {
        setLoadingGroupedItems(false);
      }
    };

    fetchGroupedItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouse, selectedFloor, selectedDates]);

  const getGroupedItems = (): GroupedItem[] => {
    return groupedItemsData;
  };

  // Get entries for a specific item name
  const getItemEntries = (itemName: string): ItemEntry[] => {
    const grouped = getGroupedItems();
    const item = grouped.find(i => 
      (i.description || "").toUpperCase() === itemName.toUpperCase()
    );
    return item ? item.entries : [];
  };

  // Group entries by username
  const getEntriesByUsername = (entries: ItemEntry[]): Record<string, ItemEntry[]> => {
    const grouped: Record<string, ItemEntry[]> = {};
    
    entries.forEach((entry) => {
      const username = entry.userName;
      if (!grouped[username]) {
        grouped[username] = [];
      }
      grouped[username].push(entry);
    });
    
    return grouped;
  };

  // Helper: check if an entry is checked (local tick OR saved in DB)
  const isEntryChecked = (entryId: string, itemName: string, floorName: string, dbChecked?: boolean): boolean => {
    // First check localStorage (local tick state)
    if (selectedWarehouse) {
      const storageKey = `checkedEntries_${selectedWarehouse}_${floorName}_${itemName.toUpperCase()}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const checkedMap: Record<string, boolean> = JSON.parse(saved);
        if (checkedMap[entryId] === true) return true;
      }
    }
    // Fall back to DB state
    return dbChecked === true;
  };

  // Helper function to check if a floor has any unchecked entries
  const hasUncheckedEntriesInFloor = (floorName: string): boolean => {
    if (!selectedWarehouse) return false;

    const items = getGroupedItems();

    for (const item of items) {
      for (const entry of item.entries) {
        if (!isEntryChecked(entry.id, item.description, floorName, entry.isChecked)) {
          return true;
        }
      }
    }

    return false;
  };

  // Helper function to check if an item has any unchecked entries
  const hasUncheckedEntriesInItem = (itemName: string): boolean => {
    if (!selectedWarehouse || !selectedFloor) return false;

    const entries = getItemEntries(itemName);

    for (const entry of entries) {
      if (!isEntryChecked(entry.id, itemName, selectedFloor, entry.isChecked)) {
        return true;
      }
    }

    return false;
  };


  if (isLoading) {
    return (
      <div className="mr-loading">
        <Loader className="mr-loader" />
      </div>
    );
  }

  // Download warehouse entries as Excel.
  // Pass a `floorFilter` to scope the sheet to a single floor (used by "Save Floor");
  // omit it to export every floor in the warehouse (the "Download All" button).
  const handleDownloadWarehouseEntries = async (floorFilter?: string | null) => {
    if (!selectedWarehouse) {
      toast({
        title: "Error",
        description: "No warehouse selected",
        variant: "destructive",
      });
      return;
    }

    setDownloadingWarehouse(true);
    
    try {
      const downloadParams: any = { warehouse: selectedWarehouse, ...getDateRange() };
      if (floorFilter) downloadParams.floorName = floorFilter;
      const response = await stocktakeEntriesAPI.getEntries(downloadParams);

      // When scoped to a single floor, keep only that floor's rows even if the API
      // returns more. Defense-in-depth so the sheet matches the floor the manager
      // just saved rather than the entire warehouse.
      if (floorFilter && response?.entries) {
        const target = floorFilter.toUpperCase();
        response.entries = response.entries.filter((entry: any) =>
          (entry.floorName || entry.floor_name || "").toUpperCase() === target
        );
      }

      if (!response?.entries || response.entries.length === 0) {
        toast({
          title: "No Data",
          description: floorFilter
            ? `No entries found for floor ${floorFilter} in warehouse ${selectedWarehouse}`
            : `No entries found for warehouse ${selectedWarehouse}`,
          variant: "destructive",
        });
        return;
      }

      // Dynamic import of exceljs to avoid bundle size issues
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();

      // Separate entries by stock type
      const freshStockEntries = response.entries.filter((entry: any) => {
        const stockType = entry.stockType || entry.stock_type || "Fresh Stock";
        return stockType === "Fresh Stock" || stockType === "fresh stock";
      });

      const rejectionEntries = response.entries.filter((entry: any) => {
        const stockType = entry.stockType || entry.stock_type || "Fresh Stock";
        return stockType === "Off Grade/Rejection" || stockType === "Rejection";
      });

      // Define headers — added "Checked" column so unchecked rows are flagged
      const headers = [
        "Entry ID",
        "Checked",
        "Item Name",
        "Item Type",
        "Category",
        "Subcategory",
        "Floor Name",
        "Warehouse",
        "Quantity",
        "UOM (kg)",
        "Total Weight (kg)",
        "Stock Type",
        "Entered By",
        "Authority",
        "Date Created",
        "Date Updated"
      ];

      // Build a single Set of checked entry IDs from localStorage. Used both for
      // the per-row "Checked" column and to compute the overall verification banner.
      const checkedIds = new Set<string>();
      const floorItemMap = new Map<string, Set<string>>();
      response.entries.forEach((entry: any) => {
        const floor = (entry.floorName || entry.floor_name || "Unknown").toUpperCase();
        if (!floorItemMap.has(floor)) floorItemMap.set(floor, new Set());
        floorItemMap.get(floor)!.add((entry.itemName || entry.item_name || "").toUpperCase());
      });

      for (const [floor, itemNames] of floorItemMap) {
        for (const itemName of itemNames) {
          const storageKey = `checkedEntries_${selectedWarehouse}_${floor}_${itemName}`;
          const saved = localStorage.getItem(storageKey);
          if (!saved) continue;
          try {
            const checkedMap = JSON.parse(saved) as Record<string, boolean>;
            for (const [id, isChecked] of Object.entries(checkedMap)) {
              if (isChecked) checkedIds.add(String(id));
            }
          } catch {
            // ignore malformed entries
          }
        }
      }

      const isEntryChecked = (entry: any): boolean => {
        if (entry.id !== undefined && checkedIds.has(String(entry.id))) return true;
        // Fallback: trust the backend's persisted is_checked flag if it's already true
        return entry.isChecked === true || entry.is_checked === true;
      };

      const allVerified = response.entries.length > 0 && response.entries.every(isEntryChecked);

      // Helper function to create a worksheet with data
      const createWorksheet = (sheetName: string, entries: any[], headerColor: string) => {
        if (entries.length === 0) return null;

        const worksheet = workbook.addWorksheet(sheetName);

        // Row 1: Verification status banner
        const statusText = allVerified ? "VERIFIED" : "NOT VERIFIED";
        const statusRow = worksheet.addRow([statusText]);
        worksheet.mergeCells(1, 1, 1, headers.length);
        const statusCell = statusRow.getCell(1);
        statusCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
        statusCell.alignment = { horizontal: "center", vertical: "middle" };
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: allVerified ? "FF28A745" : "FFDC3545" },
        };
        statusRow.height = 36;

        // Row 2: Date and warehouse info
        const infoRow = worksheet.addRow([
          `Warehouse: ${selectedWarehouse}${floorFilter ? `  |  Floor: ${floorFilter}` : ""}  |  Date: ${selectedDates.length > 0 ? selectedDates.join(", ") : "All Dates"}  |  Status: ${statusText}`
        ]);
        worksheet.mergeCells(2, 1, 2, headers.length);
        const infoCell = infoRow.getCell(1);
        infoCell.font = { bold: true, size: 11 };
        infoCell.alignment = { horizontal: "center", vertical: "middle" };
        infoCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F2F2" },
        };

        // Row 3: Empty spacer
        worksheet.addRow([]);

        // Row 4: Headers
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: headerColor },
        };

        // Set border for headers
        headerRow.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });

        // Add data rows
        entries.forEach((entry: any) => {
          const checked = isEntryChecked(entry);
          const dataRow = [
            entry.id || "",
            checked ? "Checked" : "Unchecked",
            entry.itemName || entry.item_name || "",
            entry.itemType || entry.item_type || "",
            entry.itemCategory || entry.item_category || "",
            entry.itemSubcategory || entry.item_subcategory || "",
            entry.floorName || entry.floor_name || "",
            entry.warehouse || "",
            entry.totalQuantity || entry.total_quantity || 0,
            entry.unitUom || entry.unit_uom || 0,
            entry.totalWeight || entry.total_weight || 0,
            entry.stockType || entry.stock_type || "Fresh Stock",
            entry.enteredBy || entry.entered_by || "",
            entry.authority || "",
            entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "",
            entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "",
          ];

          const row = worksheet.addRow(dataRow);

          // Borders on every cell
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });

          // Style the Checked column itself (column index 2) and flag unchecked rows
          const checkedCell = row.getCell(2);
          checkedCell.alignment = { horizontal: "center", vertical: "middle" };
          checkedCell.font = {
            bold: true,
            color: { argb: checked ? "FF1B5E20" : "FFB71C1C" },
          };
          checkedCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: checked ? "FFE2EFDA" : "FFFCE4EC" },
          };

          if (!checked) {
            // Tint the whole row light red so unchecked entries stand out
            row.eachCell((cell, colNumber) => {
              if (colNumber === 2) return; // already styled above
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFDECEA" },
              };
            });
          }
        });

        // Auto-fit columns
        worksheet.columns.forEach((column) => {
          if (column.header === "Item Name") {
            column.width = 30;
          } else if (column.header === "Category" || column.header === "Subcategory") {
            column.width = 20;
          } else if (column.header === "Date Created" || column.header === "Date Updated") {
            column.width = 18;
          } else {
            column.width = 15;
          }
        });

        return worksheet;
      };

      // Create Fresh Stock worksheet (green header)
      createWorksheet("Fresh Stock", freshStockEntries, "FFE2EFDA");

      // Create Rejection worksheet (red header)
      createWorksheet("Rejection", rejectionEntries, "FFFFC0CB");

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      const scopeLabel = floorFilter ? floorFilter.replace(/[^A-Za-z0-9-]+/g, "_") : "All";
      const filename = `${selectedWarehouse}_${scopeLabel}_Entries_${timestamp}.xlsx`;

      // Write to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Complete",
        description: floorFilter
          ? `Exported ${freshStockEntries.length} fresh stock and ${rejectionEntries.length} rejection entries for floor ${floorFilter} (${selectedWarehouse})`
          : `Exported ${freshStockEntries.length} fresh stock and ${rejectionEntries.length} rejection entries from ${selectedWarehouse} in separate sheets`,
      });

    } catch (error: any) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download warehouse entries",
        variant: "destructive",
      });
    } finally {
      setDownloadingWarehouse(false);
    }
  };


  // Animation variants — fade only (no slide/scale) so route changes don't swipe.
  const pageVariants = {
    initial: {
      opacity: 0,
    },
    animate: {
      opacity: 1,
      transition: {
        duration: 0.12,
        ease: [0.22, 1, 0.36, 1] as const,
        staggerChildren: 0.04,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: 0.08,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  const cardVariants = {
    initial: {
      opacity: 0,
      y: 20,
    },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  return (
    <motion.div
      className="mr-page"
      style={{ touchAction: 'pan-y' }}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* ── Dark Topbar (Section 5A) ── */}
      <nav
        style={{ background: "#111827", height: 52 }}
        className="mr-topbar"
      >
        {/* Logo */}
        <div className="mr-topbar-logo">
          <div
            style={{
              background: "#185FA5",
              borderRadius: 8,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Package className="mr-topbar-logo-icon" />
          </div>
          <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 16 }}>StockTake</span>
        </div>

        {/* Right: user chip + back */}
        <div className="mr-topbar-right">
          {user && (
            <div className="mr-topbar-user">
              {/* Avatar circle with initials */}
              <div
                style={{
                  background: "#185FA5",
                  borderRadius: "50%",
                  width: 30,
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {(user.username || user.name || "U").slice(0, 2).toUpperCase()}
              </div>
              <div className="mr-topbar-user-text">
                <p style={{ color: "#F9FAFB", fontSize: 12, fontWeight: 600, lineHeight: 1 }}>
                  {user.username || user.name}
                </p>
                <p style={{ color: "#9CA3AF", fontSize: 10, lineHeight: 1, marginTop: 2 }}>
                  {user.role}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={() => { if (!isScrollingRef.current) navigate("/dashboard"); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: 6,
              color: "#D1D5DB",
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 10px",
              cursor: "pointer",
              touchAction: "manipulation",
              minHeight: 32,
            }}
          >
            <ArrowLeft className="mr-back-icon" />
            <span className="mr-topbar-back-text">Back</span>
          </button>
        </div>
      </nav>

      {/* C3: Breadcrumb Trail */}
      {(selectedWarehouse) && (
        <nav style={{ background: "#111827", borderTop: "1px solid rgba(255,255,255,0.06)" }} className="mr-breadcrumb">
          {(() => {
            // On the floor page the crumbs navigate by route (the component
            // remounts per route, so clearing state alone would leave a blank
            // page). Build the warehouse→floors return URL once.
            const floorsUrl = () => {
              const params = new URLSearchParams();
              if (selectedWarehouse) params.set("warehouse", selectedWarehouse);
              if (selectedDates.length > 0) params.set("dates", selectedDates.join(","));
              return `/review/floors?${params.toString()}`;
            };
            const crumbs: { label: string; onClick?: () => void }[] = [
              {
                label: "Review",
                onClick: () => {
                  if (isFloorPage || isFloorsPage) { navigate("/review"); return; }
                  setItemDetailsOpen(false);
                  setItemsDrawerOpen(false);
                  setDrawerOpen(false);
                  setSelectedWarehouse(null);
                  setSelectedFloor(null);
                  setSelectedItemName(null);
                },
              },
            ];
            if (selectedWarehouse) {
              crumbs.push({
                label: selectedWarehouse,
                onClick: (selectedFloor || selectedItemName)
                  ? () => {
                      if (isFloorPage || isFloorsPage) {
                        // If an item drawer is open, just close it to reveal the
                        // items page; otherwise go back to the floors picker.
                        if (itemDetailsOpen || selectedItemName) {
                          setItemDetailsOpen(false);
                          setSelectedItemName(null);
                        } else {
                          navigate(floorsUrl());
                        }
                        return;
                      }
                      setItemDetailsOpen(false);
                      setItemsDrawerOpen(false);
                      setSelectedFloor(null);
                      setSelectedItemName(null);
                      setTimeout(() => setDrawerOpen(true), 50);
                    }
                  : undefined,
              });
            }
            if (selectedFloor) {
              crumbs.push({
                label: selectedFloor,
                onClick: selectedItemName
                  ? () => {
                      setItemDetailsOpen(false);
                      setSelectedItemName(null);
                      setTimeout(() => setItemsDrawerOpen(true), 50);
                    }
                  : undefined,
              });
            }
            if (selectedItemName) {
              crumbs.push({ label: selectedItemName });
            }

            // Mobile: truncate middle crumbs with "…" if more than 3 deep
            const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
            const displayCrumbs =
              isMobile && crumbs.length > 3
                ? [crumbs[0], { label: "…" }, crumbs[crumbs.length - 1]]
                : crumbs;

            return displayCrumbs.map((crumb, i) => (
              <span key={i} className="mr-breadcrumb-item">
                {i > 0 && (
                  <span style={{ color: "#4B5563", margin: "0 4px", fontSize: 11 }}>›</span>
                )}
                {crumb.onClick ? (
                  <button
                    onClick={crumb.onClick}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "#9CA3AF",
                      fontSize: 11,
                      fontWeight: 500,
                      maxWidth: 120,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    style={{
                      color: "#FFFFFF",
                      fontSize: 11,
                      fontWeight: 600,
                      maxWidth: 160,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "inline-block",
                    }}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ));
          })()}
        </nav>
      )}

      {/* Warehouse picker + floors drawer render only on the /review picker
          route. On /review/floor the item list takes over as a full page. */}
      {(!isFloorPage && !isFloorsPage) && (<>
      {/* Main Content */}
      <div className="mr-main">
        <div className="mr-main-inner">
          {/* Header */}
          <motion.div
            className="mr-header"
            variants={cardVariants}
          >
            <h1 className="mr-title">
              Review Floor Sessions
            </h1>
            <p className="mr-subtitle">
              Select a warehouse to review floor entries
            </p>
          </motion.div>

          {/* Date Filter — Pill-based selector (Section B2) */}
          <motion.div
            className="mr-date-filter"
            variants={cardVariants}
          >
            <DatePillSelector
              entryDates={availableDates}
              selectedDates={selectedDates}
              onChange={(dates) => {
                setSelectedDates(dates);
                setSelectedWarehouse(null);
                setSelectedFloor(null);
                setGroupedItemsData([]);
                setWarehouseFloors([]);
              }}
              loading={loadingDates}
            />
          </motion.div>

          {/* Previous Stocktakes KPI card — shows combined stats for dates NOT currently selected */}
          {(() => {
            const prevDates = availableDates.filter(d => !selectedDates.includes(d));
            if (prevDates.length === 0) return null;
            const prevEntryCount = Object.values(warehouseStats).filter(s => s.hasEntries).length;
            return (
              <motion.div
                className="mr-prev-stocktakes"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div style={{ background: "#1E293B", borderRadius: 12, padding: "12px 16px" }}>
                  <div className="mr-prev-stocktakes-inner">
                    <div>
                      <p style={{ color: "#94A3B8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                        Previous Stocktakes
                      </p>
                      <p style={{ color: "#F1F5F9", fontSize: 13, fontWeight: 500 }}>
                        {prevDates.length} other date{prevDates.length !== 1 ? "s" : ""} with entries — not shown in current view
                      </p>
                    </div>
                    <span style={{ background: "#334155", color: "#94A3B8", fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {prevEntryCount} warehouse{prevEntryCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mr-prev-stocktakes-dates">
                    {prevDates.map(d => (
                      <span
                        key={d}
                        style={{ background: "#0F172A", color: "#64748B", fontSize: 11, fontWeight: 500, borderRadius: 999, padding: "2px 8px", border: "1px solid #334155" }}
                      >
                        {new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    ))}
                  </div>
                  <p style={{ color: "#475569", fontSize: 11, marginTop: 8 }}>
                    Select a date above to review those entries separately.
                  </p>
                </div>
              </motion.div>
            );
          })()}

          {/* D1: Grid / List toggle */}
          <div className="mr-view-toggle-row">
            <span className="mr-view-toggle-label">Warehouses</span>
            <div className="mr-view-toggle-group">
              <button
                onClick={() => setWarehouseViewMode('grid')}
                className={`mr-view-toggle-btn ${warehouseViewMode === 'grid' ? 'active' : ''}`}
                title="Grid view"
              >
                <LayoutGrid className="mr-view-toggle-icon" />
              </button>
              <button
                onClick={() => setWarehouseViewMode('list')}
                className={`mr-view-toggle-btn ${warehouseViewMode === 'list' ? 'active' : ''}`}
                title="List view"
              >
                <LayoutList className="mr-view-toggle-icon" />
              </button>
            </div>
          </div>

          {/* Warehouses Grid */}
          <div className={warehouseViewMode === 'grid' ? "mr-warehouse-grid" : "mr-warehouse-list"}>
            {WAREHOUSES.map((warehouse, index) => {
              const whStats = warehouseStats[warehouse];
              const hasEntries = whStats?.hasEntries ?? true; // default tappable until stats load
              const lastDate = whStats?.lastDate ?? null;
              const lastDateStr = lastDate
                ? (() => {
                    const d = new Date(lastDate);
                    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                    return `${String(d.getDate()).padStart(2,"0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
                  })()
                : null;

              return (
                <motion.div
                  key={warehouse}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <Card
                    className={`mr-wh-card ${warehouseViewMode === 'list' ? 'mr-wh-card-list' : 'mr-wh-card-grid'} ${hasEntries ? 'mr-wh-card-active' : 'mr-wh-card-disabled'}`}
                    onClick={() => {
                      if (hasEntries && !isScrollingRef.current) {
                        handleWarehouseClick(warehouse);
                      }
                    }}
                    style={{
                      touchAction: hasEntries ? 'manipulation' : 'none',
                      ...(hasEntries ? {} : { pointerEvents: 'none' as const }),
                    }}
                    onMouseEnter={(e) => {
                      if (hasEntries) {
                        (e.currentTarget as HTMLElement).style.borderColor = '#85B7EB';
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = '';
                      (e.currentTarget as HTMLElement).style.transform = '';
                    }}
                  >
                    <div className="mr-wh-card-inner">
                      <div className={warehouseViewMode === 'list' ? 'mr-wh-icon-wrap-list' : 'mr-wh-icon-wrap-grid'}>
                        <Warehouse className={warehouseViewMode === 'list' ? 'mr-wh-icon-list' : 'mr-wh-icon-grid'} />
                      </div>
                      <div className="mr-wh-info">
                        <h3 className={warehouseViewMode === 'list' ? 'mr-wh-name-list' : 'mr-wh-name-grid'}>
                          {warehouse}
                        </h3>
                        {warehouseViewMode === 'grid' && lastDateStr && (
                          <p className="mr-wh-last-entry-grid">Last entry: {lastDateStr}</p>
                        )}
                        {warehouseViewMode === 'grid' && whStats && !hasEntries && !lastDateStr && (
                          <p className="mr-wh-no-entries">No entries</p>
                        )}
                        {warehouseViewMode === 'list' && lastDateStr && (
                          <p className="mr-wh-last-entry-list">{lastDateStr}</p>
                        )}
                      </div>
                      {loadingWarehouseName === warehouse ? (
                        <Loader className="mr-loader-sm mr-wh-chevron-spin" />
                      ) : (
                        <ChevronRight className="mr-wh-chevron" />
                      )}
                    </div>

                    {/* Upload Sheet Button for Savla and Rishi — grid mode only */}
                    {warehouseViewMode === 'grid' && (warehouse === "Savla" || warehouse === "Rishi") && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isScrollingRef.current) {
                            // Handle upload sheet functionality
                            alert(`Upload sheet for ${warehouse} - Feature coming soon!`);
                          }
                        }}
                        className="mr-wh-upload-btn"
                        size="sm"
                      >
                        <Upload className="mr-wh-upload-icon" />
                        Upload Sheet
                      </Button>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Stock Take Complete Section */}
          <motion.div
            className="mr-complete-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card className="mr-complete-card">
              <div className="mr-complete-inner">
                <p className="mr-complete-text">
                  Stock take is complete. All items have been checked and verified.
                </p>
                <Button
                  onClick={handleSaveData}
                  disabled={savingData}
                  className="mr-save-btn"
                >
                  {savingData ? (
                    <>
                      <Loader className="mr-save-icon mr-loader-xs" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-save-icon" />
                      Save Data
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </motion.div>


        </div>
      </div>
      </>)}

      {/* Floor picker — full page. Was the "Select Floor" bottom drawer; now its
          own route (/review/floors) so the whole flow is page-based, no drawers. */}
      {isFloorsPage && (
        <div className="mr-main">
          <div className="mr-main-inner">
            <div className="mr-header mr-floor-page-header" style={{ marginBottom: 12 }}>
              <button
                onClick={() => { if (!isScrollingRef.current) navigate("/review"); }}
                className="mr-drawer-back-btn mr-floor-page-back"
              >
                <ArrowLeft className="mr-download-icon" />
                Back
              </button>
              <h1 className="mr-title">{selectedWarehouse} - Select Floor</h1>
              <p className="mr-subtitle">
                Choose a floor to review its entries
              </p>
            {/* C4: Active date filter badge */}
            <div className="mr-date-badge">
              {selectedDates.length > 0 ? (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#1D4ED8",
                  color: "#EFF6FF",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 999,
                  padding: "3px 10px",
                }}>
                  {selectedDates.length} date{selectedDates.length !== 1 ? "s" : ""} selected
                </span>
              ) : (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#374151",
                  color: "#D1D5DB",
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: 999,
                  padding: "3px 10px",
                }}>
                  All dates
                </span>
              )}
            </div>
            </div>
          <div className="mr-drawer-body">
            {loadingFloors ? (
              <div className="mr-floor-loading">
                <Loader className="mr-loader" />
                <p className="mr-floor-loading-text">Loading floors from database...</p>
              </div>
            ) : warehouseFloors.length > 0 ? (
              <>
                <div className="mr-floor-list">
                  {(() => {
                    const maxFloorItemCount = Math.max(...warehouseFloors.map(f => f.itemCount), 1);
                    return warehouseFloors.map((floor, index) => {
                      // Per-floor completion is precomputed from the warehouse fetch
                      // (groupedItemsData only ever holds the one open floor).
                      const hasUnchecked = floor.hasUnchecked;
                      const allChecked = !hasUnchecked && floor.itemCount > 0;
                      const progressPct = Math.round((floor.itemCount / maxFloorItemCount) * 100);
                      return (
                    <motion.div
                      key={floor.floorName}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: 0.15,
                        delay: index * 0.03,
                      }}
                    >
                      <Card
                        className="mr-floor-card"
                        onClick={() => {
                          if (!isScrollingRef.current && !longPressDetectedRef.current) {
                            handleFloorClick(floor.floorName);
                          }
                        }}
                        style={{ touchAction: 'manipulation' }}
                      >
                        <div className="mr-floor-card-inner">
                          <div className="mr-floor-card-header">
                            {/* D2: Status dot — green if all checked, red if has unchecked */}
                            <div
                              className="mr-floor-status-dot"
                              style={{ background: allChecked ? '#22C55E' : '#EF4444' }}
                            />
                            <div className="mr-floor-left">
                              <div className="mr-floor-icon-wrap">
                                <Package className="mr-floor-icon" />
                              </div>
                              {/* D2: Two-line layout */}
                              <div>
                                <h3 className="mr-floor-name">
                                  {floor.floorName}
                                </h3>
                                <p className="mr-floor-meta">
                                  {floor.itemCount} entries • {floor.totalWeight.toFixed(2)} kg
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="mr-floor-chevron" />
                          </div>
                        </div>
                        {/* D2: Progress bar at bottom of card */}
                        <div style={{ height: 3, background: '#E5E7EB', borderRadius: '0 0 4px 4px' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${progressPct}%`,
                              background: '#185FA5',
                              borderRadius: '0 0 4px 4px',
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                      </Card>
                    </motion.div>
                      );
                    });
                  })()}
                </div>
                
                {/* Download Button */}
                <div className="mr-download-sticky">
                  <Button
                    onClick={() => handleDownloadWarehouseEntries()}
                    disabled={downloadingWarehouse}
                    className="mr-download-btn"
                    size="lg"
                  >
                    {downloadingWarehouse ? (
                      <>
                        <Loader className="mr-download-icon mr-loader-sm" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-download-icon" />
                        Download All {selectedWarehouse} Entries
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <p className="mr-empty-center">
                No floors available for this warehouse
              </p>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Floor items — full page. Replaces the old items-list drawer; opens as
          its own route (/review/floor) so it is refresh-safe and back-navigable. */}
      {isFloorPage && (
        <div className="mr-main">
          <div className="mr-main-inner">
            <div className="mr-header mr-floor-page-header" style={{ marginBottom: 12 }}>
              <button
                onClick={() => {
                  if (isScrollingRef.current) return;
                  // Return to the floor picker page for this warehouse.
                  const params = new URLSearchParams();
                  if (selectedWarehouse) params.set("warehouse", selectedWarehouse);
                  if (selectedDates.length > 0) params.set("dates", selectedDates.join(","));
                  navigate(`/review/floors?${params.toString()}`);
                }}
                className="mr-drawer-back-btn mr-floor-page-back"
              >
                <ArrowLeft className="mr-download-icon" />
                Back to Floors
              </button>
              <h1 className="mr-title">{selectedWarehouse} - {selectedFloor}</h1>
              <p className="mr-subtitle">
                Select an item to view all entries with usernames and quantities
              </p>
              <div className="mr-search-wrap">
                <Search className="mr-search-icon" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="mr-search-input"
                />
                {itemSearchQuery && (
                  <button
                    onClick={() => setItemSearchQuery("")}
                    className="mr-search-clear"
                  >
                    <X className="mr-search-clear-icon" />
                  </button>
                )}
              </div>
            </div>
          <div className="mr-drawer-body">
            {loadingGroupedItems ? (
              <div className="mr-floor-loading">
                <Loader className="mr-loader" />
                <p className="mr-floor-loading-text">Loading items from database...</p>
              </div>
            ) : (() => {
              const allItems = getGroupedItems();
              const filteredItems = itemSearchQuery
                ? allItems.filter(item => item.description.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                : allItems;
              return allItems.length > 0 ? (
              <div className="mr-items-space">
                {/* Compact toolbar — Save Floor + Add Item in a single row */}
                {!itemSearchQuery && (
                  <motion.div
                    className="mr-floor-toolbar"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ display: 'flex', gap: 8, marginBottom: 12 }}
                  >
                    <button
                      onClick={handleSaveFloorReview}
                      disabled={savingFloorReview}
                      style={{
                        flex: 1,
                        minHeight: 40,
                        borderRadius: 8,
                        border: '1px solid #1B6FC8',
                        background: savingFloorReview ? '#94B8DD' : '#1B6FC8',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: savingFloorReview ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        touchAction: 'manipulation',
                      }}
                    >
                      {savingFloorReview ? (
                        <Loader style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Save style={{ width: 14, height: 14 }} />
                      )}
                      {savingFloorReview ? 'Saving…' : 'Save Floor'}
                    </button>
                    <button
                      onClick={() => setAddItemDrawerOpen(true)}
                      style={{
                        flex: 1,
                        minHeight: 40,
                        borderRadius: 8,
                        border: '1px dashed #9CA3AF',
                        background: '#F4F6FA',
                        color: '#1F2937',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        touchAction: 'manipulation',
                      }}
                    >
                      <Plus style={{ width: 14, height: 14 }} />
                      Add Item
                    </button>
                  </motion.div>
                )}

                {filteredItems.length === 0 ? (
                  <div className="mr-no-results">
                    <Search className="mr-no-results-icon" />
                    <p className="mr-no-results-text">No items matching "{itemSearchQuery}"</p>
                  </div>
                ) : (
                  <div className="mr-items-grid">
                  {(() => {
                  // E2/#7: Auto-sort — items with any unchecked/unverified entry float
                  // to the top so the manager never has to scroll to find remaining work;
                  // fully-checked items sink to the bottom (ties: more unchecked first).
                  const uncheckedCount = (it: any) =>
                    it.entries.filter((e: any) => e.verified !== true).length;
                  const sortedItems = [...filteredItems].sort((a, b) => {
                    const au = uncheckedCount(a);
                    const bu = uncheckedCount(b);
                    const aDone = au === 0;
                    const bDone = bu === 0;
                    if (aDone !== bDone) return aDone ? 1 : -1; // any unchecked → top
                    return bu - au;
                  });
                  return sortedItems.map((groupedItem, index) => {
                    const allVerified = groupedItem.entries.every((e: any) => e.verified);
                    const hasEdits = groupedItem.entries.some((e: any) => e.edits && e.edits.length > 0);
                    const isOffGrade = groupedItem.entries.some((e: any) => e.stockType === "Off Grade/Rejection" || e.stockType === "Rejection");
                    // E1: left bar color: Green=verified, Amber=amended, Grey=unverified
                    const leftBarColor = allVerified ? "#3B6D11" : hasEdits ? "#BA7517" : "#9CA3AF";
                    return (
                    <motion.div
                      key={groupedItem.description}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.04 }}
                      style={{ transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)' }}
                    >
                      <Card
                        className="mr-item-card"
                        style={{
                          touchAction: 'manipulation',
                          borderLeft: `3px solid ${leftBarColor}`,
                          minHeight: 52,
                          maxHeight: 56,
                          background: hasEdits && !allVerified ? '#FFFDF8' : undefined,
                          borderColor: hasEdits ? '#EF9F27' : undefined,
                        }}
                        onClick={() => { if (!isScrollingRef.current) handleItemClick(groupedItem.description); }}
                      >
                        {/* E1: Compact horizontal card layout */}
                        <div className="mr-item-card-inner">
                          {/* Left: item name + category */}
                          <div className="mr-item-name-col">
                            <p className="mr-item-name">
                              {groupedItem.description}
                            </p>
                            <p className="mr-item-category">
                              {groupedItem.entries[0]?.category || ""}{groupedItem.entries[0]?.subcategory ? ` · ${groupedItem.entries[0].subcategory}` : ""}
                            </p>
                          </div>
                          {/* Right: units + kg */}
                          <div className="mr-item-stats">
                            <p className="mr-item-pcs">{groupedItem.totalQuantity} pcs</p>
                            <p className="mr-item-kg">{groupedItem.totalWeight.toFixed(1)} kg</p>
                          </div>
                          {/* G4: Amber triangle if edited */}
                          {hasEdits && (
                            <button
                              style={{ position: 'relative', minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const firstEdited = groupedItem.entries.find((e: any) => e.edits && e.edits.length > 0);
                                if (firstEdited) {
                                  setChangelogEntry({ itemName: groupedItem.description, edits: firstEdited.edits || [] });
                                  setChangelogOpen(true);
                                }
                              }}
                            >
                              <AlertTriangle style={{ width: 14, height: 14, color: '#BA7517' }} />
                            </button>
                          )}
                          {/* Status dot */}
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: allVerified ? '#3B6D11' : hasEdits ? '#BA7517' : '#E24B4A', flexShrink: 0 }} />
                          <ChevronRight className="mr-item-chevron" />
                        </div>
                        {/* G4: Amended tag below if edited */}
                        {hasEdits && (
                          <div style={{ padding: '2px 12px 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              fontSize: 10, color: '#854F0B', background: '#FAEEDA',
                              border: '0.5px solid #EF9F27', borderRadius: 20, padding: '1px 8px',
                              letterSpacing: 0
                            }}>
                              ✎ Amended · tap ▲ for log
                            </span>
                          </div>
                        )}
                      </Card>
                    </motion.div>
                  );
                });
                })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="mr-empty">
                <Package className="mr-empty-icon" />
                <p className="mr-empty-text">No items found for this floor</p>
                <Button
                  onClick={() => setAddItemDrawerOpen(true)}
                  className="mr-submit-btn"
                  style={{ width: 'auto', display: 'inline-flex' }}
                >
                  <Plus className="mr-submit-icon" />
                  Add First Item
                </Button>
              </div>
            );
            })()}
          </div>
          </div>
        </div>
      )}

      {/* Add Item Drawer */}
      <Drawer open={addItemDrawerOpen} snapPoints={[0.7, 1]} onOpenChange={(open) => {
        setAddItemDrawerOpen(open);
        if (!open) {
          // Reset form when closing
          setNewItemForm({
            itemType: "",
            category: "",
            subcategory: "",
            description: "",
            quantity: "",
            uom: "",
          });
          setAddItemCategorialData([]);
          // Reset search state
          setAddItemSearchQuery("");
          setAddItemSearchResults([]);
          setAddItemShowSearchResults(false);
          // Reset custom description state
          setIsOtherDescription(false);
          setCustomDescription("");
        }
      }}>
        <DrawerContent className="mr-drawer-content">
          <DrawerHeader className="mr-drawer-header">
            <div className="mr-drawer-back-row">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddItemDrawerOpen(false)}
                className="mr-drawer-back-btn"
              >
                <ArrowLeft className="mr-download-icon" />
                Back
              </Button>
            </div>
            <DrawerTitle className="mr-drawer-title">
              Add New Item
            </DrawerTitle>
            <DrawerDescription>
              Add a new item to {selectedWarehouse} - {selectedFloor}
            </DrawerDescription>
          </DrawerHeader>
          <div className="mr-drawer-body">
            <div className="mr-form-space">
              {/* Item Type */}
              <div>
                <label className="mr-form-label">
                  Item Type <span className="mr-form-required">*</span>
                </label>
                <Select
                  value={newItemForm.itemType}
                  onValueChange={(value) => handleItemTypeChange(value as "pm" | "rm" | "fg")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select item type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pm">PM (Packing Material)</SelectItem>
                    <SelectItem value="rm">RM (Raw Material)</SelectItem>
                    <SelectItem value="fg">FG (Finished Goods)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search Input */}
              {newItemForm.itemType && (
                <div style={{ position: 'relative' }}>
                  <label className="mr-form-label">
                    Quick Search
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Search className="mr-search-icon" />
                    <Input
                      placeholder="Search item by name..."
                      value={addItemSearchQuery}
                      onChange={(e) => setAddItemSearchQuery(e.target.value)}
                      style={{ paddingLeft: '2.25rem' }}
                    />
                    {addItemIsSearching && (
                      <Loader className="mr-loader-sm" style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                    )}
                  </div>
                  <p className="mr-form-hint">
                    Type at least 2 characters to search
                  </p>

                  {/* Search Results */}
                  {addItemShowSearchResults && addItemSearchResults.length > 0 && (
                    <div className="mr-search-results-dropdown">
                      {addItemSearchResults.map((result, index) => (
                        <div
                          key={`${result.name}-${index}`}
                          className="mr-search-result-item"
                          onClick={() => handleSearchItemSelect(result)}
                        >
                          <p className="mr-search-result-name">
                            {result.name}
                          </p>
                          <p className="mr-search-result-meta">
                            {result.group} / {result.subgroup}
                            {result.uom && ` • ${result.uom.toFixed(3)} kg`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {addItemShowSearchResults && addItemSearchResults.length === 0 && addItemSearchQuery.length >= 2 && !addItemIsSearching && (
                    <div className="mr-search-results-dropdown" style={{ padding: '0.75rem' }}>
                      <p className="mr-no-results-text" style={{ textAlign: 'center' }}>
                        No items found
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Divider */}
              {newItemForm.itemType && (
                <div className="mr-divider">
                  <div className="mr-divider-line">
                    <span className="mr-divider-border" />
                  </div>
                  <div className="mr-divider-text-wrap">
                    <span className="mr-divider-text">or select manually</span>
                  </div>
                </div>
              )}

              {/* Category */}
              <div>
                <label className="mr-form-label">
                  Category <span className="mr-form-required">*</span>
                </label>
                <Select
                  value={newItemForm.category}
                  onValueChange={handleCategoryChange}
                  disabled={!newItemForm.itemType || loadingCategorialData}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingCategorialData ? "Loading..." : "Select category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {addItemCategorialData.map((group) => (
                      <SelectItem key={group.name} value={group.name}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subcategory */}
              <div>
                <label className="mr-form-label">
                  Subcategory <span className="mr-form-required">*</span>
                </label>
                <Select
                  value={newItemForm.subcategory}
                  onValueChange={handleSubcategoryChange}
                  disabled={!newItemForm.category}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    {getSubcategoriesForCategory().map((subgroup) => (
                      <SelectItem key={subgroup.name} value={subgroup.name}>
                        {subgroup.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Item Description */}
              <div>
                <label className="mr-form-label">
                  Item Description <span className="mr-form-required">*</span>
                </label>
                <Select
                  value={isOtherDescription ? "__OTHER__" : newItemForm.description}
                  onValueChange={handleDescriptionChange}
                  disabled={!newItemForm.subcategory}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {getDescriptionsForSubcategory().map((particular) => (
                      <SelectItem key={particular.name} value={particular.name}>
                        {particular.name} {particular.uom ? `(${particular.uom.toFixed(3)} kg)` : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="__OTHER__" style={{ borderTop: '1px solid hsl(var(--border))', marginTop: '0.25rem', paddingTop: '0.25rem', color: 'hsl(var(--primary))', fontWeight: 500 }}>
                      + Other (Custom Item)
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Custom Description Input */}
                {isOtherDescription && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <Input
                      placeholder="Enter custom item description..."
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      className="w-full"
                      autoFocus
                    />
                    <p className="mr-form-hint">
                      Enter a custom item name not in the list
                    </p>
                  </div>
                )}
              </div>

              {/* Quantity and UOM in a row */}
              <div className="mr-qty-uom-grid">
                <div>
                  <label className="mr-form-label">
                    Quantity <span className="mr-form-required">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Units"
                    value={newItemForm.quantity}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mr-form-label">
                    UOM (kg) <span className="mr-form-required">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder="Weight per unit"
                    value={newItemForm.uom}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, uom: e.target.value }))}
                    className="w-full"
                    disabled={!isOtherDescription && !!newItemForm.description && parseFloat(newItemForm.uom) > 0}
                  />
                  {!isOtherDescription && newItemForm.description && parseFloat(newItemForm.uom) > 0 && (
                    <p className="mr-form-hint">Auto-filled from item</p>
                  )}
                  {isOtherDescription && (
                    <p className="mr-form-hint">Enter weight per unit in kg</p>
                  )}
                </div>
              </div>

              {/* Stock Type Toggle — Fresh vs Off Grade */}
              <div>
                <label className="mr-form-label-sm">Stock Type</label>
                <div className="mr-stock-type-row">
                  <button
                    type="button"
                    onClick={() => setNewItemStockType("Fresh Stock")}
                    className={`mr-stock-type-btn ${newItemStockType === "Fresh Stock" ? "fresh-active" : ""}`}
                  >
                    🟢 Fresh Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewItemStockType("Off Grade/Rejection")}
                    className={`mr-stock-type-btn ${newItemStockType === "Off Grade/Rejection" ? "reject-active" : ""}`}
                  >
                    🟡 Off Grade
                  </button>
                </div>
              </div>

              {/* Total Weight Preview */}
              {newItemForm.quantity && newItemForm.uom && (
                <div className="mr-weight-preview">
                  <p className="mr-weight-preview-text">
                    Total Weight: <span className="mr-weight-preview-value">
                      {((parseFloat(newItemForm.quantity) || 0) * (parseFloat(newItemForm.uom) || 0)).toFixed(2)} kg
                    </span>
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <Button
                onClick={handleAddNewItem}
                disabled={addingItem || !newItemForm.itemType || !newItemForm.category || !newItemForm.subcategory || (!newItemForm.description && !isOtherDescription) || (isOtherDescription && !customDescription.trim()) || !newItemForm.quantity || !newItemForm.uom}
                className="mr-submit-btn"
              >
                {addingItem ? (
                  <>
                    <Loader className="mr-submit-icon mr-loader-sm" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-submit-icon" />
                    Add Item
                  </>
                )}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Item Details Drawer - Shows entries grouped by username with quantity boxes */}
      <Drawer open={itemDetailsOpen} snapPoints={[0.7, 1]} onOpenChange={(open) => {
        if (!open && deleteModalOpen) return; // keep open while delete modal is active
        setItemDetailsOpen(open);
        if (!open) {
          setSelectedItemName(null);
          setShowQuickAddEntry(false);
          setQuickAddUnits("");
        }
      }}>
        <DrawerContent
          className="mr-details-drawer"
          containerClassName="warehouse-entries-drawer"
        >
          <DrawerHeader className="mr-details-header">
            <div className="mr-details-back-row">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setItemDetailsOpen(false);
                  setShowQuickAddEntry(false);
                  setTimeout(() => {
                    setItemsDrawerOpen(true);
                  }, 200);
                }}
                className="mr-details-back-btn"
              >
                <ArrowLeft className="mr-details-back-icon" />
                <span className="mr-details-back-text">Back</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQuickAddEntry(!showQuickAddEntry)}
                className="mr-details-add-btn"
              >
                <Plus className="mr-details-add-icon" />
                <span className="mr-details-add-text">Add Units</span>
              </Button>
            </div>
            <DrawerTitle className="mr-details-title">
              {selectedItemName}
            </DrawerTitle>
            {selectedItemName && (
              <div className="mr-details-counter">
                <span className="mr-details-counter-label">
                  <span className="mr-details-counter-value">
                    {getItemEntries(selectedItemName).filter(entry => checkedEntries[entry.id]).length}
                  </span> of{" "}
                  <span className="mr-details-counter-value">
                    {getItemEntries(selectedItemName).length}
                  </span> entries checked
                </span>
              </div>
            )}
          </DrawerHeader>
          <div className="mr-drawer-body-compact">
            {/* Quick Add Entry Form */}
            {showQuickAddEntry && selectedItemName && (
              <div className="mr-quick-add">
                <p className="mr-quick-add-title">Add new entry for this item</p>
                <div className="mr-quick-add-stock-row">
                  <button
                    type="button"
                    onClick={() => setQuickAddStockType("Fresh Stock")}
                    className={`mr-quick-add-stock-btn ${quickAddStockType === "Fresh Stock" ? "fresh-active" : ""}`}
                  >
                    Fresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickAddStockType("Off Grade/Rejection")}
                    className={`mr-quick-add-stock-btn ${quickAddStockType === "Off Grade/Rejection" ? "reject-active" : ""}`}
                  >
                    Rejection
                  </button>
                </div>
                <div className="mr-quick-add-input-row">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Units / Qty"
                    value={quickAddUnits}
                    onChange={(e) => setQuickAddUnits(e.target.value)}
                    className="mr-quick-add-input"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleQuickAddEntry();
                      } else if (e.key === "Escape") {
                        setShowQuickAddEntry(false);
                        setQuickAddUnits("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleQuickAddEntry}
                    disabled={submittingQuickAdd || !quickAddUnits || parseFloat(quickAddUnits) <= 0}
                    className="mr-quick-add-submit"
                  >
                    {submittingQuickAdd ? <Loader className="mr-loader-xs" /> : <Check className="mr-details-add-icon" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowQuickAddEntry(false); setQuickAddUnits(""); }}
                    className="mr-quick-add-cancel"
                  >
                    <X className="mr-details-add-icon" />
                  </Button>
                </div>
                {quickAddUnits && !isNaN(parseFloat(quickAddUnits)) && parseFloat(quickAddUnits) > 0 && selectedItemName && getItemEntries(selectedItemName).length > 0 && (
                  <p className="mr-quick-add-weight">
                    Weight: {(parseFloat(quickAddUnits) * getItemEntries(selectedItemName)[0].packageSize).toFixed(2)} kg
                    {" "}(UOM: {getItemEntries(selectedItemName)[0].packageSize.toFixed(3)}kg)
                  </p>
                )}
              </div>
            )}
            {selectedItemName && getItemEntries(selectedItemName).length > 0 ? (
              <>
                <div className="mr-entries-space">
                  {Object.entries(getEntriesByUsername(getItemEntries(selectedItemName))).map(([username, entries]) => {
                    const userTotalQuantity = entries.reduce((sum, e) => sum + e.units, 0);
                    const userTotalWeight = entries.reduce((sum, e) => sum + e.totalWeight, 0);
                    
                    return (
                      <motion.div
                        key={username}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Card className="mr-entry-card">
                          <div style={{ marginBottom: '0.5rem' }}>
                            <p className="mr-entry-username">
                              {username}
                            </p>
                            <p className="mr-entry-summary">
                              <span className="mr-entry-summary-count">
                                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                              </span>
                              <span className="mr-entry-summary-detail">
                                {' '}• {userTotalQuantity} units • {userTotalWeight.toFixed(2)} kg
                              </span>
                            </p>
                          </div>
                          
                          {/* Quantity Boxes */}
                          <div className="mr-qty-boxes">
                            {entries.map((entry, idx) => {
                              const isChecked = checkedEntries[entry.id] || false;
                              const isEditing = editingQuantity?.entryId === entry.id;
                              return (
                                <div
                                  key={entry.id}
                                  className="mr-qty-box-wrap"
                                >
                                  {isEditing ? (
                                    <div className="mr-qty-editing">
                                      <Input
                                        type="number"
                                        step="0.1"
                                        value={editingQuantity.value}
                                        onChange={(e) => {
                                          setEditingQuantity({ entryId: entry.id, value: e.target.value });
                                        }}
                                        className="mr-qty-edit-input"
                                        autoFocus
                                        min="0.1"
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            const val = parseFloat(editingQuantity.value) || 0;
                                            handleSaveEditedQuantity(entry.id, val);
                                          } else if (e.key === "Escape") {
                                            handleCancelEdit();
                                          }
                                        }}
                                      />
                                      <div className="mr-qty-edit-actions">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const val = parseFloat(editingQuantity.value) || 0;
                                            handleSaveEditedQuantity(entry.id, val);
                                          }}
                                          onTouchEnd={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            const val = parseFloat(editingQuantity.value) || 0;
                                            handleSaveEditedQuantity(entry.id, val);
                                          }}
                                          className="mr-qty-edit-save"
                                        >
                                          <Check className="mr-qty-edit-icon" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCancelEdit();
                                          }}
                                          onTouchEnd={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleCancelEdit();
                                          }}
                                          className="mr-qty-edit-cancel"
                                        >
                                          <X className="mr-qty-edit-icon" />
                                        </button>
                                        {/* E7: Delete via modal — INVENTORY_MANAGER only */}
                                        {(user?.role === 'INVENTORY_MANAGER' || user?.role === 'ADMIN' || user?.role === 'SUPERUSER') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openDeleteModal(entry);
                                          }}
                                          onTouchEnd={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            openDeleteModal(entry);
                                          }}
                                          className="mr-qty-edit-delete"
                                        >
                                          <Trash2 className="mr-qty-edit-icon" />
                                        </button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      className={`mr-qty-box ${
                                        (entry as any).stockType === "Off Grade/Rejection" || (entry as any).stockType === "Rejection"
                                          ? isChecked ? "mr-qty-box-reject-checked" : "mr-qty-box-reject"
                                          : isChecked ? "mr-qty-box-fresh-checked" : "mr-qty-box-fresh"
                                      } ${
                                        (user?.role === 'INVENTORY_MANAGER' || user?.role === 'ADMIN' || user?.role === 'SUPERUSER')
                                          ? 'mr-qty-box-with-delete'
                                          : ''
                                      }`}
                                      onMouseDown={(e) => {
                                        if (e.button === 0 && !editingQuantity) {
                                          handleLongPressStart(entry.id, entry.units, 'quantity');
                                        }
                                      }}
                                      onMouseUp={(e) => {
                                        e.preventDefault();
                                        handleLongPressEnd();
                                        if (!editingQuantity && !longPressDetectedRef.current && !isScrollingRef.current) {
                                          setTimeout(() => {
                                            if (!longPressDetectedRef.current && !isScrollingRef.current) {
                                              handleEntryCheck(entry.id, !isChecked);
                                            }
                                          }, 150);
                                        }
                                      }}
                                      onMouseLeave={() => handleLongPressEnd()}
                                      onTouchStart={(e) => {
                                        if (!editingQuantity) {
                                          handleLongPressStart(entry.id, entry.units, 'quantity');
                                        }
                                      }}
                                      onTouchEnd={(e) => {
                                        e.preventDefault();
                                        handleLongPressEnd();
                                        if (!editingQuantity && !longPressDetectedRef.current && !isScrollingRef.current) {
                                          setTimeout(() => {
                                            if (!longPressDetectedRef.current && !isScrollingRef.current) {
                                              handleEntryCheck(entry.id, !isChecked);
                                            }
                                          }, 150);
                                        }
                                      }}
                                    >
                                      {isChecked && (
                                        <div className="mr-qty-check-badge">
                                          <Check className="mr-qty-check-icon" />
                                        </div>
                                      )}
                                      <p className="mr-qty-hint">
                                        Long press to edit
                                      </p>
                                      {(entry as any).floorName && (
                                        <div
                                          className="mr-qty-floor-link"

                                        >
                                          Floor: {(entry as any).floorName}
                                        </div>
                                      )}
                                      <p className="mr-qty-value">
                                        {entry.units % 1 === 0 ? entry.units : entry.units.toFixed(1)}
                                      </p>
                                      <p className="mr-qty-uom-text">
                                        UOM: {entry.packageSize.toFixed(3)}kg
                                      </p>
                                      <p className={
                                        (entry as any).stockType === "Off Grade/Rejection" || (entry as any).stockType === "Rejection"
                                          ? "mr-qty-weight-reject"
                                          : "mr-qty-weight-fresh"
                                      }>
                                        {entry.totalWeight.toFixed(2)}kg
                                      </p>
                                      {/* Stock Type Badge */}
                                      {((entry as any).stockType === "Off Grade/Rejection" || (entry as any).stockType === "Rejection") && (
                                        <p className="mr-qty-reject-badge">
                                          Rejection
                                        </p>
                                      )}
                                      {/* E5: Change item button — INVENTORY_MANAGER only */}
                                      {user?.role === "INVENTORY_MANAGER" && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setReassignTarget({
                                              entryId: entry.id,
                                              currentDescription: entry.description,
                                              itemType: (entry.itemType || "fg").toLowerCase(),
                                            });
                                            setReassignSearchQuery("");
                                            setReassignResults([]);
                                            setReassignDrawerOpen(true);
                                          }}
                                          onTouchEnd={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            setReassignTarget({
                                              entryId: entry.id,
                                              currentDescription: entry.description,
                                              itemType: (entry.itemType || "fg").toLowerCase(),
                                            });
                                            setReassignSearchQuery("");
                                            setReassignResults([]);
                                            setReassignDrawerOpen(true);
                                          }}
                                          style={{
                                            background: "none",
                                            border: "none",
                                            padding: 0,
                                            cursor: "pointer",
                                            color: "#1B6FC8",
                                            fontSize: 9,
                                            fontWeight: 500,
                                            marginTop: 4,
                                            display: "block",
                                            textDecoration: "underline",
                                          }}
                                        >
                                          Change item
                                        </button>
                                      )}
                                      {/* Direct delete — INVENTORY_MANAGER, no edit mode needed */}
                                      {(user?.role === 'INVENTORY_MANAGER' || user?.role === 'ADMIN' || user?.role === 'SUPERUSER') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openDeleteModal(entry);
                                          }}
                                          onTouchEnd={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            openDeleteModal(entry);
                                          }}
                                          className="mr-qty-delete-btn"
                                          title="Delete entry"
                                        >
                                          <Trash2 className="mr-qty-delete-icon" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <div className={`mr-qty-box-index ${
                                    (entry as any).stockType === "Off Grade/Rejection" || (entry as any).stockType === "Rejection"
                                      ? "mr-qty-box-index-reject"
                                      : "mr-qty-box-index-fresh"
                                  }`}>
                                    {idx + 1}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
                
                {/* Checks persist immediately on each tick — no manual save needed */}
              </>
            ) : (
              <div className="mr-empty">
                <Package className="mr-empty-icon" />
                <p className="mr-empty-text">No entries found for this item</p>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>


      {/* E7: Delete Confirmation Modal — uses Dialog for proper focus mgmt over nested drawers */}
      <Dialog open={deleteModalOpen && !!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteModalOpen(false); setDeleteConfirmStep(1); } }}>
        <DialogContent className="max-w-md w-full p-5 z-[99999]">
          {deleteTarget && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle style={{ color: '#A32D2D', width: 20, height: 20 }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Delete this entry?</h3>
              </div>
              <div style={{ background: '#F4F6FA', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Item: {deleteTarget.itemName}</p>
                <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>Qty: {deleteTarget.units} units · {deleteTarget.totalWeight.toFixed(2)} kg</p>
                <p style={{ fontSize: 12, color: '#6B7280' }}>By: {deleteTarget.userName} {deleteTarget.createdAt ? `· ${new Date(deleteTarget.createdAt).toLocaleDateString()}` : ''}</p>
                <p style={{ fontSize: 12, color: '#6B7280' }}>Type: {deleteTarget.stockType}</p>
              </div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Reason (optional, max 120 chars):</label>
              <input
                type="text"
                maxLength={120}
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="Reason for deletion..."
                style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 8, boxSizing: 'border-box', minHeight: 44 }}
              />
              {deleteConfirmStep === 2 && (
                <p style={{ fontSize: 12, color: '#A32D2D', marginBottom: 8, fontWeight: 500 }}>
                  This is permanent. A log is recorded. Click Delete again to confirm.
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setDeleteModalOpen(false); setDeleteConfirmStep(1); }}
                  style={{ flex: 1, minHeight: 44, borderRadius: 8, border: '1px solid #D1D5DB', background: '#F4F6FA', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}
                >Cancel</button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  style={{ flex: 1, minHeight: 44, borderRadius: 8, border: '1px solid #F09595', background: '#FCEBEB', color: '#791F1F', fontSize: 14, cursor: 'pointer', fontWeight: 600, opacity: isDeleting ? 0.6 : 1 }}
                >{isDeleting ? 'Deleting…' : deleteConfirmStep === 1 ? 'Delete entry' : 'Confirm delete'}</button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* G5: Changelog Panel */}
      {changelogOpen && changelogEntry && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#111827', borderRadius: '12px 12px 0 0', padding: 0, paddingBottom: 'env(safe-area-inset-bottom)', width: '100%', maxWidth: 520, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#F9FAFB' }}>Change log — {changelogEntry.itemName}</p>
              <button onClick={() => setChangelogOpen(false)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ background: '#fff', flex: 1, overflowX: 'auto', overflowY: 'auto', borderRadius: 12, margin: '0 8px 8px' }}>
              {changelogEntry.edits.length === 0 ? (
                <p style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>No edits recorded.</p>
              ) : (
                <table style={{ minWidth: 520, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F4F6FA' }}>
                      {['Entry date','Amended on','By','Field','Before','After'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...changelogEntry.edits].reverse().map((edit: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '8px 10px', color: '#6B7280', whiteSpace: 'nowrap' }}>{edit.entryDate ? new Date(edit.entryDate).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ background: '#FAEEDA', color: '#633806', borderRadius: 12, padding: '2px 8px', fontSize: 11 }}>
                            {edit.editedAt ? new Date(edit.editedAt).toLocaleString() : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{edit.editedBy || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{edit.field || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#A32D2D', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>{edit.oldValue ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#27500A', fontWeight: 500, whiteSpace: 'nowrap' }}>{edit.newValue ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={{ padding: '8px 12px', fontSize: 11, color: '#9CA3AF', borderTop: '1px solid #F3F4F6' }}>Entry date is locked. Edits are append-only.</p>
            </div>
          </div>
        </div>
      )}
      {/* H8: Color legend floating button */}
      <ColorLegend />

      {/* E5: Reassign Entry Drawer (INVENTORY_MANAGER only) */}
      <Drawer open={reassignDrawerOpen} snapPoints={[0.7, 1]} onOpenChange={(open) => {
        setReassignDrawerOpen(open);
        if (!open) {
          setReassignTarget(null);
          setReassignSearchQuery("");
          setReassignResults([]);
        }
      }}>
        <DrawerContent className="mr-drawer-content">
          <DrawerHeader className="mr-drawer-header">
            <div className="mr-drawer-back-row">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReassignDrawerOpen(false)}
                className="mr-drawer-back-btn"
              >
                <ArrowLeft className="mr-download-icon" />
                Back
              </Button>
            </div>
            <DrawerTitle className="mr-drawer-title">Reassign Entry</DrawerTitle>
            {reassignTarget && (
              <DrawerDescription>
                Currently: {reassignTarget.currentDescription}
              </DrawerDescription>
            )}
          </DrawerHeader>
          <div className="mr-drawer-body">
            <div className="mr-reassign-search">
              <Search className="mr-search-icon" />
              <Input
                placeholder="Search items..."
                value={reassignSearchQuery}
                onChange={(e) => setReassignSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.25rem' }}
                autoFocus
              />
              {reassignSearching && (
                <Loader className="mr-loader-sm" style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
              )}
            </div>
            {reassignResults.length > 0 ? (
              <div className="mr-reassign-results">
                {reassignResults.map((result, index) => (
                  <button
                    key={`${result.name}-${index}`}
                    disabled={reassigning}
                    onClick={async () => {
                      if (!reassignTarget) return;
                      setReassigning(true);
                      try {
                        await stocktakeEntriesAPI.updateEntry(reassignTarget.entryId, {
                          itemName: result.name,
                          itemCategory: result.group,
                          itemSubcategory: result.subgroup,
                        });
                        if (selectedWarehouse && selectedFloor) {
                          const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, getDateRange());
                          setGroupedItemsData(data.groups || []);
                        }
                        toast({ title: "Entry reassigned", description: `Reassigned to "${result.name}"` });
                        setReassignDrawerOpen(false);
                      } catch (err: any) {
                        console.error("Reassign error:", err);
                        toast({ title: "Reassign failed", description: err.message || "Failed to reassign entry", variant: "destructive" });
                      } finally {
                        setReassigning(false);
                      }
                    }}
                    className="mr-reassign-btn"
                  >
                    <p className="mr-reassign-name">{result.name}</p>
                    <p className="mr-reassign-meta">
                      {result.group} / {result.subgroup}
                      {result.uom != null && ` • ${result.uom.toFixed(3)} kg`}
                    </p>
                  </button>
                ))}
              </div>
            ) : reassignSearchQuery.length >= 2 && !reassignSearching ? (
              <p className="mr-reassign-empty">No items found</p>
            ) : (
              <p className="mr-reassign-hint">Type at least 2 characters to search</p>
            )}
            {reassigning && (
              <div className="mr-reassign-loading">
                <Loader className="mr-reassign-loading-icon" />
                <span className="mr-reassign-loading-text">Reassigning…</span>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </motion.div>
  );
}
