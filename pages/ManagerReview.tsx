import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Package, Loader, Check, Clock, Lock, Warehouse, ChevronRight, Save, Edit2, X, Upload, Plus, Search, Download, CalendarDays, Trash2 } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { stocktakeEntriesAPI, warehousesAPI, categorialInvAPI } from "@/utils/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

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
  sessionId: string;
  stockType?: string;
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
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [warehouseFloors, setWarehouseFloors] = useState<{ floorName: string; itemCount: number; totalWeight: number }[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
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
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [availableDates, setAvailableDates] = useState<Map<string, number>>(new Map());
  const [loadingDates, setLoadingDates] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressDetectedRef = useRef<boolean>(false);

  // Add Item state
  const [addItemDrawerOpen, setAddItemDrawerOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
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
  
  // Touch sensitivity improvement
  const isScrollingRef = useRef<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    // Get user data
    const userStr = localStorage.getItem("user");
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
    
    // Initialize with hardcoded warehouses (always show these on frontend)
    setWarehouses(WAREHOUSES.map(name => ({ id: name, name })));

    // Fetch available dates for the date picker
    const fetchAvailableDates = async () => {
      setLoadingDates(true);
      try {
        const response = await stocktakeEntriesAPI.getAvailableDates();
        console.log("Available dates response:", response);
        if (response?.dates && response.dates.length > 0) {
          const dateMap = new Map<string, number>();
          response.dates.forEach((d: { date: string; count: number }) => {
            dateMap.set(d.date, d.count);
          });
          console.log("Date map:", Array.from(dateMap.entries()));
          setAvailableDates(dateMap);
        }
      } catch (err) {
        console.error("Error fetching available dates:", err);
      } finally {
        setLoadingDates(false);
      }
    };
    fetchAvailableDates();
    
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
  
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  const handleWarehouseClick = async (warehouse: string) => {
    // Prevent clicks during scrolling
    if (isScrollingRef.current) {
      return;
    }
    
    setSelectedWarehouse(warehouse);
    setLoadingFloors(true);
    setDrawerOpen(true);
    
    try {
      // Fetch entries for this warehouse to get unique floors from database
      const fetchParams: any = { warehouse };
      if (selectedDate) {
        // Filter by selected date: start of day to end of day
        fetchParams.startDate = `${selectedDate}T00:00:00.000Z`;
        fetchParams.endDate = `${selectedDate}T23:59:59.999Z`;
      }
      const entriesResponse = await stocktakeEntriesAPI.getEntries(fetchParams);
      
      if (entriesResponse && entriesResponse.entries && entriesResponse.entries.length > 0) {
        // Group entries by floor name
        const floorMap: Record<string, { itemCount: number; totalWeight: number }> = {};
        
        entriesResponse.entries.forEach((entry: any) => {
          const floorName = (entry.floorName || "Unknown").toUpperCase();
          if (!floorMap[floorName]) {
            floorMap[floorName] = { itemCount: 0, totalWeight: 0 };
          }
          floorMap[floorName].itemCount += 1;
          floorMap[floorName].totalWeight += entry.totalWeight || 0;
        });
        
        // Convert to array
        const floors = Object.entries(floorMap).map(([floorName, data]) => ({
          floorName,
          itemCount: data.itemCount,
          totalWeight: data.totalWeight,
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
    }
  };

  const handleFloorClick = (floor: string) => {
    // Prevent clicks during scrolling
    if (isScrollingRef.current) {
      return;
    }
    
    setSelectedFloor(floor);
    setSelectedItemName(null);
    setConfirmed(false); // Reset confirmation when changing floors
    setCheckedEntries({}); // Reset checked entries when changing floors
    // Close floors drawer and open items drawer with slight delay for smooth animation
    setDrawerOpen(false);
    setTimeout(() => {
      setItemsDrawerOpen(true);
      // Scroll to top to ensure drawer is visible on all devices
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 200);
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
      
      // Initialize with saved state if exists, otherwise unchecked
      if (savedCheckedEntries) {
        try {
          const saved = JSON.parse(savedCheckedEntries);
          // Load saved state, but only for entries that exist in current item
          currentItemEntries.forEach(entry => {
            updated[entry.id] = saved[entry.id] || false;
          });
        } catch (e) {
          // If parsing fails, initialize as unchecked
          currentItemEntries.forEach(entry => {
            updated[entry.id] = false;
          });
        }
      } else {
        // No saved state, initialize all as unchecked
        currentItemEntries.forEach(entry => {
          updated[entry.id] = false;
        });
      }
      
      return updated;
    });
    
    setItemDetailsOpen(true);
  };

  const handleEntryCheck = (entryId: string, checked: boolean) => {
    // Prevent actions during scrolling
    if (isScrollingRef.current) {
      return;
    }
    
    setCheckedEntries((prev) => {
      const updated = {
        ...prev,
        [entryId]: checked,
      };
      // Save to localStorage immediately with warehouse/floor/item key
      if (selectedWarehouse && selectedFloor && selectedItemName) {
        const storageKey = `checkedEntries_${selectedWarehouse}_${selectedFloor}_${selectedItemName.toUpperCase()}`;
        localStorage.setItem(storageKey, JSON.stringify(updated));
      }
      // Also save to general key for backward compatibility
      localStorage.setItem("checkedEntries", JSON.stringify(updated));
      return updated;
    });
  };

  const handleSaveCheckedEntries = () => {
    setSaving(true);
    try {
      // Save checked entries to localStorage with warehouse/floor/item key
      if (selectedWarehouse && selectedFloor && selectedItemName) {
        const storageKey = `checkedEntries_${selectedWarehouse}_${selectedFloor}_${selectedItemName.toUpperCase()}`;
        localStorage.setItem(storageKey, JSON.stringify(checkedEntries));
      }
      // Also save to general key for backward compatibility
      localStorage.setItem("checkedEntries", JSON.stringify(checkedEntries));
      
      setTimeout(() => {
        setSaving(false);
      }, 500);
    } catch (err) {
      alert("Failed to save checked entries");
      setSaving(false);
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
      // Fetch ALL entries across ALL warehouses and their floors
      const allEntries: Array<{
        entryId: string;
        warehouse: string;
        floorName: string;
        itemName: string;
        itemType: string;
        category: string;
        subcategory: string;
        quantity: number;
        weight: number;
        uom: number;
        stockType: string;
      }> = [];

      // For each warehouse, fetch entries to discover floors, then fetch grouped entries per floor
      const fetchParams: any = {};
      if (selectedDate) {
        fetchParams.startDate = `${selectedDate}T00:00:00.000Z`;
        fetchParams.endDate = `${selectedDate}T23:59:59.999Z`;
      }

      for (const warehouse of WAREHOUSES) {
        try {
          console.log(`Fetching entries for warehouse: ${warehouse}`);
          const entriesResponse = await stocktakeEntriesAPI.getEntries({ warehouse, ...fetchParams });

          if (!entriesResponse?.entries?.length) {
            console.log(`No entries for ${warehouse}, skipping`);
            continue;
          }

          // Get unique floor names from entries
          const floorNames = new Set<string>();
          entriesResponse.entries.forEach((entry: any) => {
            floorNames.add((entry.floorName || "Unknown").toUpperCase());
          });

          // Fetch grouped entries for each floor
          for (const floorName of floorNames) {
            try {
              const groupedData = await stocktakeEntriesAPI.getGroupedEntries(warehouse, floorName, selectedDate || undefined);
              if (groupedData?.groups) {
                groupedData.groups.forEach((group: any) => {
                  group.entries.forEach((entry: any) => {
                    allEntries.push({
                      entryId: entry.id,
                      warehouse,
                      floorName,
                      itemName: entry.description,
                      itemType: entry.itemType || "",
                      category: entry.category,
                      subcategory: entry.subcategory,
                      quantity: entry.units,
                      weight: entry.totalWeight,
                      uom: entry.packageSize,
                      stockType: entry.stockType || "Fresh Stock",
                    });
                  });
                });
              }
              console.log(`  ${warehouse}/${floorName}: ${allEntries.length} entries so far`);
            } catch (floorErr) {
              console.error(`Error fetching grouped entries for ${warehouse}/${floorName}:`, floorErr);
            }
          }
        } catch (whErr) {
          console.error(`Error fetching entries for warehouse ${warehouse}:`, whErr);
        }
      }

      if (allEntries.length === 0) {
        toast({
          title: "No entries found",
          description: "There are no entries to save across any warehouse.",
          variant: "destructive",
        });
        setSavingData(false);
        return;
      }

      console.log(`=== PREPARING TO SAVE ===`);
      console.log(`Saving ALL ${allEntries.length} entries across all warehouses`);

      // Send full entry data to API (pass selectedDate so resultsheet uses the reviewed date, not today)
      const response = await stocktakeEntriesAPI.saveResultsheet(allEntries, selectedDate || undefined);
      console.log("API Response received:", response);

      toast({
        title: "Success",
        description: `Stock take data saved successfully! ${response.savedCount || allEntries.length} entries saved to resultsheet.`,
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
        const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, selectedDate || undefined);
        setGroupedItemsData(data.groups || []);
      }

      setEditingQuantity(null);
    } catch (err: any) {
      console.error("Error updating entry:", err);
      alert(err.message || "Failed to update entry");
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    try {
      await stocktakeEntriesAPI.deleteEntry(entryId);

      // Refresh grouped items data
      if (selectedWarehouse && selectedFloor) {
        const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, selectedDate || undefined);
        setGroupedItemsData(data.groups || []);
      }

      setEditingQuantity(null);

      // If the deleted entry's item group is now empty, close the details drawer
      if (selectedItemName) {
        const updatedEntries = getItemEntries(selectedItemName);
        if (updatedEntries.length <= 1) {
          setItemDetailsOpen(false);
          setSelectedItemName(null);
        }
      }
    } catch (err: any) {
      console.error("Error deleting entry:", err);
      alert(err.message || "Failed to delete entry");
    }
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
        stock_type: "Fresh Stock",
      };

      await stocktakeEntriesAPI.submitEntries([entry]);

      // Refresh grouped items data
      const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, selectedDate || undefined);
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

      const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor, selectedDate || undefined);
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
        // Fetch from database only - no localStorage fallback
        const data = await stocktakeEntriesAPI.getGroupedEntries(
          selectedWarehouse!,
          selectedFloor!,
          selectedDate || undefined
        );
        setGroupedItemsData(data.groups || []);

        // Don't reset checked entries here - they will be loaded when item is clicked
        // Reset confirmation and selected item when loading new floor data
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
  }, [selectedWarehouse, selectedFloor, selectedDate]);

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

  // Helper function to check if a floor has any unchecked entries
  const hasUncheckedEntriesInFloor = (floorName: string): boolean => {
    if (!selectedWarehouse) return false;
    
    // Get all items for this floor
    const items = getGroupedItems();
    
    // Check each item for unchecked entries
    for (const item of items) {
      const itemName = item.description.toUpperCase();
      const storageKey = `checkedEntries_${selectedWarehouse}_${floorName}_${itemName}`;
      const savedCheckedEntries = localStorage.getItem(storageKey);
      
      if (!savedCheckedEntries) {
        // No saved state means unchecked
        return true;
      }
      
      const checkedState = JSON.parse(savedCheckedEntries);
      const entries = item.entries;
      
      // Check if all entries are checked
      for (const entry of entries) {
        if (!checkedState[entry.id]) {
          return true; // Found an unchecked entry
        }
      }
    }
    
    return false;
  };

  // Helper function to check if an item has any unchecked entries
  const hasUncheckedEntriesInItem = (itemName: string): boolean => {
    if (!selectedWarehouse || !selectedFloor) return false;
    
    const storageKey = `checkedEntries_${selectedWarehouse}_${selectedFloor}_${itemName.toUpperCase()}`;
    const savedCheckedEntries = localStorage.getItem(storageKey);
    
    if (!savedCheckedEntries) {
      // No saved state means unchecked
      return true;
    }
    
    const checkedState = JSON.parse(savedCheckedEntries);
    const entries = getItemEntries(itemName);
    
    // Check if all entries are checked
    for (const entry of entries) {
      if (!checkedState[entry.id]) {
        return true; // Found an unchecked entry
      }
    }
    
    return false;
  };


  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Download all warehouse floor entries as Excel
  const handleDownloadWarehouseEntries = async () => {
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
      // Fetch all entries for the selected warehouse (with optional date filter)
      const downloadParams: any = { warehouse: selectedWarehouse };
      if (selectedDate) {
        downloadParams.startDate = `${selectedDate}T00:00:00.000Z`;
        downloadParams.endDate = `${selectedDate}T23:59:59.999Z`;
      }
      const response = await stocktakeEntriesAPI.getEntries(downloadParams);
      
      if (!response?.entries || response.entries.length === 0) {
        toast({
          title: "No Data",
          description: `No entries found for warehouse ${selectedWarehouse}`,
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

      // Define headers
      const headers = [
        "Entry ID",
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

      // Helper function to create a worksheet with data
      const createWorksheet = (sheetName: string, entries: any[], headerColor: string) => {
        if (entries.length === 0) return null;

        const worksheet = workbook.addWorksheet(sheetName);

        // Add headers to worksheet
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
          const dataRow = [
            entry.id || "",
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
          
          // Add borders to data cells
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
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
      const filename = `${selectedWarehouse}_All_Entries_${timestamp}.xlsx`;

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
        description: `Exported ${freshStockEntries.length} fresh stock and ${rejectionEntries.length} rejection entries from ${selectedWarehouse} in separate sheets`,
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


  // Animation variants
  const pageVariants = {
    initial: {
      opacity: 0,
      x: 20,
      scale: 0.98,
    },
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1] as const,
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      x: -20,
      scale: 0.98,
      transition: {
        duration: 0.3,
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
      className="min-h-screen bg-gradient-to-b from-background to-muted/30"
      style={{ touchAction: 'pan-y' }}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="w-full flex h-12 sm:h-14 md:h-16 items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Package className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-primary" />
            <span className="text-base sm:text-lg md:text-xl font-bold text-foreground">StockTake</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
            {user && (
              <div className="text-right hidden sm:block">
                <p className="font-semibold text-foreground text-xs sm:text-sm">{user.username}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{user.role}</p>
              </div>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (!isScrollingRef.current) {
                  navigate("/dashboard");
                }
              }}
              size="sm"
              className="text-xs sm:text-sm touch-manipulation h-8 sm:h-9 px-2 sm:px-3"
              style={{ touchAction: 'manipulation' }}
            >
              <ArrowLeft className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="w-full py-4 sm:py-6 md:py-10 px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div
            className="mb-4 sm:mb-6 md:mb-8"
            variants={cardVariants}
          >
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-1 sm:mb-2">
              Review Floor Sessions
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground">
              Select a warehouse to review floor entries
            </p>
          </motion.div>

          {/* Date Filter */}
          <motion.div
            className="mb-4 sm:mb-6 relative z-10"
            variants={cardVariants}
          >
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen} modal={false}>
              <PopoverTrigger asChild>
                <Card className={`p-3 sm:p-4 border-border cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/50 ${selectedDate ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${selectedDate ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                          {selectedDate
                            ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                            : "All Dates"}
                        </p>
                        <p className="text-[11px] sm:text-xs text-muted-foreground">
                          {selectedDate
                            ? `${availableDates.get(selectedDate) || 0} entries on this day`
                            : "Tap to filter by date"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      {selectedDate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate("");
                            setSelectedWarehouse(null);
                            setSelectedFloor(null);
                            setGroupedItemsData([]);
                            setWarehouseFloors([]);
                          }}
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Card>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[100] max-h-[80vh] overflow-y-auto" align="start" side="bottom" sideOffset={8} avoidCollisions onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
                {loadingDates ? (
                  <div className="p-6 flex items-center justify-center">
                    <Loader className="w-5 h-5 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <div>
                    <style>{`
                      .date-filter-calendar button[disabled] {
                        opacity: 0.15 !important;
                        color: #9ca3af !important;
                        cursor: not-allowed !important;
                      }
                      .date-filter-calendar .has-entries {
                        background: #d1fae5 !important;
                        color: #065f46 !important;
                        font-weight: 700 !important;
                        border-radius: 6px !important;
                      }
                      .date-filter-calendar .has-entries:hover {
                        background: #a7f3d0 !important;
                      }
                      @media (prefers-color-scheme: dark) {
                        .date-filter-calendar .has-entries {
                          background: rgba(16, 185, 129, 0.25) !important;
                          color: #6ee7b7 !important;
                        }
                        .date-filter-calendar .has-entries:hover {
                          background: rgba(16, 185, 129, 0.4) !important;
                        }
                      }
                    `}</style>
                    <div className="date-filter-calendar">
                      <Calendar
                        mode="single"
                        selected={selectedDate ? new Date(selectedDate + "T00:00:00") : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(2, "0");
                            const dd = String(date.getDate()).padStart(2, "0");
                            setSelectedDate(`${yyyy}-${mm}-${dd}`);
                          } else {
                            setSelectedDate("");
                          }
                          setSelectedWarehouse(null);
                          setSelectedFloor(null);
                          setGroupedItemsData([]);
                          setWarehouseFloors([]);
                          setCalendarOpen(false);
                        }}
                        disabled={(date) => {
                          const yyyy = date.getFullYear();
                          const mm = String(date.getMonth() + 1).padStart(2, "0");
                          const dd = String(date.getDate()).padStart(2, "0");
                          return !availableDates.has(`${yyyy}-${mm}-${dd}`);
                        }}
                        modifiers={{
                          hasEntries: (date) => {
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(2, "0");
                            const dd = String(date.getDate()).padStart(2, "0");
                            return availableDates.has(`${yyyy}-${mm}-${dd}`);
                          },
                        }}
                        modifiersClassNames={{
                          hasEntries: "has-entries",
                        }}
                      />
                    </div>
                    <div className="px-2 sm:px-3 pb-2 sm:pb-3 pt-1 border-t flex items-center justify-center gap-2 sm:gap-3">
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-emerald-200 dark:bg-emerald-800 border border-emerald-400"></span>
                        <span className="text-[10px] sm:text-[11px] text-muted-foreground">Has entries</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 opacity-30"></span>
                        <span className="text-[10px] sm:text-[11px] text-muted-foreground">No entries</span>
                      </div>
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </motion.div>

          {/* Warehouses Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
            {WAREHOUSES.map((warehouse, index) => {
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
                    className="p-3 sm:p-4 md:p-5 border-border hover:shadow-lg transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.02] hover:border-primary touch-manipulation h-full flex flex-col"
                    onClick={() => {
                      if (!isScrollingRef.current) {
                        handleWarehouseClick(warehouse);
                      }
                    }}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 flex-1">
                      <div className="p-1.5 sm:p-2 md:p-2.5 bg-primary/10 rounded-lg shrink-0">
                        <Warehouse className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-primary" />
                      </div>
                      <h3 className="text-sm sm:text-base md:text-lg font-bold text-foreground flex-1 truncate">
                        {warehouse}
                      </h3>
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
                    </div>

                    {/* Upload Sheet Button for Savla and Rishi */}
                    {(warehouse === "Savla" || warehouse === "Rishi") && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isScrollingRef.current) {
                            // Handle upload sheet functionality
                            alert(`Upload sheet for ${warehouse} - Feature coming soon!`);
                          }
                        }}
                        className="w-full mt-2 sm:mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                        size="sm"
                      >
                        <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
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
            className="mt-6 sm:mt-8 md:mt-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card className="p-3 sm:p-4 md:p-6 border-border bg-muted/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <p className="text-xs sm:text-sm md:text-base font-medium text-foreground">
                  Stock take is complete. All items have been checked and verified.
                </p>
                <Button
                  onClick={handleSaveData}
                  disabled={savingData}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-xs sm:text-sm"
                >
                  {savingData ? (
                    <>
                      <Loader className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                      Save Data
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </motion.div>


        </div>
      </div>

      {/* Floors Drawer */}
      <Drawer open={drawerOpen} onOpenChange={(open) => {
        setDrawerOpen(open);
        if (open) {
          // Prevent body scroll and ensure proper positioning
          document.body.style.overflow = 'hidden';
          // Scroll to top when drawer opens to ensure visibility on all devices
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 100);
        } else {
          // Restore body scroll
          document.body.style.overflow = '';
          setSelectedWarehouse(null);
        }
      }}>
        <DrawerContent className="flex flex-col max-h-[85vh]">
          <DrawerHeader className="flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!isScrollingRef.current) {
                    setDrawerOpen(false);
                  }
                }}
                className="mr-auto"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
            <DrawerTitle className="text-xl font-bold">
              {selectedWarehouse} - Select Floor
            </DrawerTitle>
            <DrawerDescription>
              Choose a floor to review its entries
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            {loadingFloors ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <Loader className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading floors from database...</p>
              </div>
            ) : warehouseFloors.length > 0 ? (
              <>
                <div className="space-y-3">
                  {warehouseFloors.map((floor, index) => (
                    <motion.div
                      key={floor.floorName}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.3,
                        delay: index * 0.05,
                      }}
                    >
                      <Card
                        className="p-4 border-border hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.01] hover:border-primary touch-manipulation"
                        onClick={() => {
                          if (!isScrollingRef.current && !longPressDetectedRef.current) {
                            handleFloorClick(floor.floorName);
                          }
                        }}
                        style={{ touchAction: 'manipulation' }}
                      >
                        <div className="flex items-center justify-between relative">
                          {hasUncheckedEntriesInFloor(floor.floorName) && (
                            <div className="absolute -top-2 -right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></div>
                          )}
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <Package className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground">
                                {floor.floorName}
                              </h3>
                              <p className="text-xs text-blue-600 dark:text-blue-400 opacity-70">
                                Long press to edit name
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {floor.itemCount} items • {floor.totalWeight.toFixed(2)} kg
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
                
                {/* Download Button */}
                <div className="sticky bottom-0 bg-background pt-4 border-t border-border mt-6">
                  <Button
                    onClick={handleDownloadWarehouseEntries}
                    disabled={downloadingWarehouse}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    size="lg"
                  >
                    {downloadingWarehouse ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Download All {selectedWarehouse} Entries
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No floors available for this warehouse
              </p>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Items List Drawer - Shows unique item names */}
      <Drawer open={itemsDrawerOpen} onOpenChange={(open) => {
        setItemsDrawerOpen(open);
        if (open) {
          // Prevent body scroll and ensure proper positioning
          document.body.style.overflow = 'hidden';
          // Scroll to top when drawer opens to ensure visibility on all devices
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 100);
        } else {
          // Restore body scroll
          document.body.style.overflow = '';
          setSelectedFloor(null);
          setSelectedItemName(null);
          setItemSearchQuery("");
        }
      }}>
        <DrawerContent className="flex flex-col max-h-[85vh]">
          <DrawerHeader className="flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!isScrollingRef.current) {
                    setItemsDrawerOpen(false);
                    setTimeout(() => {
                      setDrawerOpen(true);
                    }, 200);
                  }
                }}
                className="mr-auto"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Floors
              </Button>
            </div>
            <DrawerTitle className="text-xl font-bold">
              {selectedWarehouse} - {selectedFloor}
            </DrawerTitle>
            <DrawerDescription>
              Select an item to view all entries with usernames and quantities
            </DrawerDescription>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search items..."
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {itemSearchQuery && (
                <button
                  onClick={() => setItemSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            {loadingGroupedItems ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <Loader className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading items from database...</p>
              </div>
            ) : (() => {
              const allItems = getGroupedItems();
              const filteredItems = itemSearchQuery
                ? allItems.filter(item => item.description.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                : allItems;
              return allItems.length > 0 ? (
              <div className="space-y-2">
                {/* Add Item Card */}
                {!itemSearchQuery && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card
                    className="p-4 border-2 border-dashed border-primary/50 hover:border-primary hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.01] bg-primary/5 touch-manipulation"
                    onClick={() => setAddItemDrawerOpen(true)}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="flex items-center justify-center gap-3">
                      <div className="p-2 bg-primary/20 rounded-full">
                        <Plus className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold text-primary">Add New Item</span>
                    </div>
                  </Card>
                </motion.div>
                )}

                {filteredItems.length === 0 ? (
                  <div className="text-center py-6">
                    <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No items matching "{itemSearchQuery}"</p>
                  </div>
                ) : filteredItems.map((groupedItem, index) => (
                  <motion.div
                    key={groupedItem.description}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.05,
                    }}
                  >
                    <Card
                      className={`p-3 border-border hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.01] hover:border-primary touch-manipulation ${
                        groupedItem.entries.some((e: any) => e.stockType === "Off Grade/Rejection" || e.stockType === "Rejection")
                          ? "border-l-4 border-l-red-500"
                          : "border-l-4 border-l-green-500"
                      }`}
                      style={{ touchAction: 'manipulation' }}
                      onClick={() => {
                        if (!isScrollingRef.current) {
                          handleItemClick(groupedItem.description);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between relative">
                        {hasUncheckedEntriesInItem(groupedItem.description) && (
                          <div className="absolute -top-2 -right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm leading-tight">
                            {groupedItem.description}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {groupedItem.totalQuantity} units
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {groupedItem.totalWeight.toFixed(2)} kg
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 ml-2" />
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No items found for this floor</p>
                <Button
                  onClick={() => setAddItemDrawerOpen(true)}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Item
                </Button>
              </div>
            );
            })()}
          </div>
          

        </DrawerContent>
      </Drawer>

      {/* Add Item Drawer */}
      <Drawer open={addItemDrawerOpen} onOpenChange={(open) => {
        setAddItemDrawerOpen(open);
        if (open) {
          document.body.style.overflow = 'hidden';
        } else {
          document.body.style.overflow = '';
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
        <DrawerContent className="flex flex-col max-h-[85vh]">
          <DrawerHeader className="flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddItemDrawerOpen(false)}
                className="mr-auto"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
            <DrawerTitle className="text-xl font-bold">
              Add New Item
            </DrawerTitle>
            <DrawerDescription>
              Add a new item to {selectedWarehouse} - {selectedFloor}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            <div className="space-y-4">
              {/* Item Type */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Item Type <span className="text-destructive">*</span>
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
                <div className="relative">
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Quick Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search item by name..."
                      value={addItemSearchQuery}
                      onChange={(e) => setAddItemSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                    {addItemIsSearching && (
                      <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Type at least 2 characters to search
                  </p>

                  {/* Search Results */}
                  {addItemShowSearchResults && addItemSearchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {addItemSearchResults.map((result, index) => (
                        <div
                          key={`${result.name}-${index}`}
                          className="p-3 hover:bg-muted cursor-pointer border-b border-border last:border-b-0"
                          onClick={() => handleSearchItemSelect(result)}
                        >
                          <p className="font-medium text-sm text-foreground truncate">
                            {result.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {result.group} / {result.subgroup}
                            {result.uom && ` • ${result.uom.toFixed(3)} kg`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {addItemShowSearchResults && addItemSearchResults.length === 0 && addItemSearchQuery.length >= 2 && !addItemIsSearching && (
                    <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg p-3">
                      <p className="text-sm text-muted-foreground text-center">
                        No items found
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Divider */}
              {newItemForm.itemType && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or select manually</span>
                  </div>
                </div>
              )}

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Category <span className="text-destructive">*</span>
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
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Subcategory <span className="text-destructive">*</span>
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
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Item Description <span className="text-destructive">*</span>
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
                    <SelectItem value="__OTHER__" className="border-t border-border mt-1 pt-1 text-primary font-medium">
                      + Other (Custom Item)
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Custom Description Input */}
                {isOtherDescription && (
                  <div className="mt-2">
                    <Input
                      placeholder="Enter custom item description..."
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      className="w-full"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter a custom item name not in the list
                    </p>
                  </div>
                )}
              </div>

              {/* Quantity and UOM in a row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Quantity <span className="text-destructive">*</span>
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
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    UOM (kg) <span className="text-destructive">*</span>
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
                    <p className="text-xs text-muted-foreground mt-1">Auto-filled from item</p>
                  )}
                  {isOtherDescription && (
                    <p className="text-xs text-muted-foreground mt-1">Enter weight per unit in kg</p>
                  )}
                </div>
              </div>

              {/* Total Weight Preview */}
              {newItemForm.quantity && newItemForm.uom && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Total Weight: <span className="font-bold text-primary">
                      {((parseFloat(newItemForm.quantity) || 0) * (parseFloat(newItemForm.uom) || 0)).toFixed(2)} kg
                    </span>
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <Button
                onClick={handleAddNewItem}
                disabled={addingItem || !newItemForm.itemType || !newItemForm.category || !newItemForm.subcategory || (!newItemForm.description && !isOtherDescription) || (isOtherDescription && !customDescription.trim()) || !newItemForm.quantity || !newItemForm.uom}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-white"
              >
                {addingItem ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </>
                )}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Item Details Drawer - Shows entries grouped by username with quantity boxes */}
      <Drawer open={itemDetailsOpen} onOpenChange={(open) => {
        setItemDetailsOpen(open);
        if (open) {
          // Prevent body scroll and ensure proper positioning
          document.body.style.overflow = 'hidden';
          // Scroll to top when drawer opens to ensure visibility on all devices
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 100);
        } else {
          // Restore body scroll
          document.body.style.overflow = '';
          setSelectedItemName(null);
          setShowQuickAddEntry(false);
          setQuickAddUnits("");
        }
      }}>
        <DrawerContent 
          className="flex flex-col h-90"
          containerClassName="warehouse-entries-drawer"
        >
          <DrawerHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
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
                className="mr-auto h-8"
              >
                <ArrowLeft className="w-3 h-3 mr-1" />
                <span className="text-xs">Back</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQuickAddEntry(!showQuickAddEntry)}
                className="h-8 px-2.5 border-primary/40 text-primary hover:bg-primary/10"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span className="text-xs">Add Units</span>
              </Button>
            </div>
            <DrawerTitle className="text-sm font-semibold leading-tight">
              {selectedItemName}
            </DrawerTitle>
            {selectedItemName && (
              <div className="mt-1.5 p-1.5 bg-muted/50 rounded text-[10px]">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {getItemEntries(selectedItemName).filter(entry => checkedEntries[entry.id]).length}
                  </span> of{" "}
                  <span className="font-medium text-foreground">
                    {getItemEntries(selectedItemName).length}
                  </span> entries checked
                </span>
              </div>
            )}
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-3 pb-2 min-h-0">
            {/* Quick Add Entry Form */}
            {showQuickAddEntry && selectedItemName && (
              <div className="mb-3 p-3 bg-primary/5 border-2 border-primary/20 rounded-lg">
                <p className="text-xs font-semibold text-foreground mb-2">Add new entry for this item</p>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setQuickAddStockType("Fresh Stock")}
                    className={`flex-1 text-[10px] font-medium py-1.5 rounded-md border transition-colors ${
                      quickAddStockType === "Fresh Stock"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-background text-muted-foreground border-border hover:bg-green-50 dark:hover:bg-green-950"
                    }`}
                  >
                    Fresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickAddStockType("Off Grade/Rejection")}
                    className={`flex-1 text-[10px] font-medium py-1.5 rounded-md border transition-colors ${
                      quickAddStockType === "Off Grade/Rejection"
                        ? "bg-orange-600 text-white border-orange-600"
                        : "bg-background text-muted-foreground border-border hover:bg-orange-50 dark:hover:bg-orange-950"
                    }`}
                  >
                    Rejection
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Units / Qty"
                    value={quickAddUnits}
                    onChange={(e) => setQuickAddUnits(e.target.value)}
                    className="h-9 text-sm flex-1 bg-background"
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
                    className="h-9 px-3 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {submittingQuickAdd ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowQuickAddEntry(false); setQuickAddUnits(""); }}
                    className="h-9 px-3"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {quickAddUnits && !isNaN(parseFloat(quickAddUnits)) && parseFloat(quickAddUnits) > 0 && selectedItemName && getItemEntries(selectedItemName).length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Weight: {(parseFloat(quickAddUnits) * getItemEntries(selectedItemName)[0].packageSize).toFixed(2)} kg
                    {" "}(UOM: {getItemEntries(selectedItemName)[0].packageSize.toFixed(3)}kg)
                  </p>
                )}
              </div>
            )}
            {selectedItemName && getItemEntries(selectedItemName).length > 0 ? (
              <>
                <div className="space-y-2.5">
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
                        <Card className="p-2.5 border-border">
                          <div className="mb-2">
                            <p className="font-medium text-foreground text-xs">
                              {username}
                            </p>
                            <p className="text-[10px] mt-0.5">
                              <span className="text-black dark:text-white font-medium">
                                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                              </span>
                              <span className="text-muted-foreground">
                                {' '}• {userTotalQuantity} units • {userTotalWeight.toFixed(2)} kg
                              </span>
                            </p>
                          </div>
                          
                          {/* Quantity Boxes */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {entries.map((entry, idx) => {
                              const isChecked = checkedEntries[entry.id] || false;
                              const isEditing = editingQuantity?.entryId === entry.id;
                              return (
                                <div
                                  key={entry.id}
                                  className="relative group"
                                >
                                  {isEditing ? (
                                    <div className="relative bg-primary/10 border-2 border-primary rounded-lg p-2 min-w-[90px]">
                                      <Input
                                        type="number"
                                        step="0.1"
                                        value={editingQuantity.value}
                                        onChange={(e) => {
                                          setEditingQuantity({ entryId: entry.id, value: e.target.value });
                                        }}
                                        className="text-center text-sm font-bold h-8 px-1 mb-1.5"
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
                                      <div className="flex gap-0.5 justify-center">
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
                                          className="h-6 w-6 flex items-center justify-center rounded bg-green-600 text-white"
                                        >
                                          <Check className="w-3 h-3" />
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
                                          className="h-6 w-6 flex items-center justify-center rounded bg-muted text-muted-foreground"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteEntry(entry.id);
                                          }}
                                          onTouchEnd={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleDeleteEntry(entry.id);
                                          }}
                                          className="h-6 w-6 flex items-center justify-center rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      className={`relative rounded-lg p-2.5 min-w-[90px] text-center transition-all duration-200 hover:scale-105 cursor-pointer border-2 ${
                                        (entry as any).stockType === "Off Grade/Rejection" || (entry as any).stockType === "Rejection"
                                          ? isChecked
                                            ? "bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/40 border-red-500 shadow-md"
                                            : "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border-red-300 dark:border-red-700"
                                          : isChecked
                                            ? "bg-primary/20 hover:bg-primary/30 border-primary shadow-md"
                                            : "bg-primary/10 hover:bg-primary/20 border-primary/30"
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
                                        <div className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow-md">
                                          <Check className="w-3 h-3 text-green-600 stroke-[2.5]" />
                                        </div>
                                      )}
                                      <p className="text-[9px] text-muted-foreground mb-0.5">
                                        Long press to edit
                                      </p>
                                      {(entry as any).floorName && (
                                        <div 
                                          className="text-[8px] text-blue-600 dark:text-blue-400 mb-1 cursor-pointer hover:underline"

                                        >
                                          Floor: {(entry as any).floorName}
                                        </div>
                                      )}
                                      <p className="text-xl font-bold text-black dark:text-white">
                                        {entry.units % 1 === 0 ? entry.units : entry.units.toFixed(1)}
                                      </p>
                                      <p className="text-[9px] text-muted-foreground mt-1">
                                        UOM: {entry.packageSize.toFixed(3)}kg
                                      </p>
                                      <p className={`text-[9px] font-semibold mt-0.5 ${
                                        (entry as any).stockType === "Off Grade/Rejection" || (entry as any).stockType === "Rejection"
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-primary"
                                      }`}>
                                        {entry.totalWeight.toFixed(2)}kg
                                      </p>
                                      {/* Stock Type Badge */}
                                      {((entry as any).stockType === "Off Grade/Rejection" || (entry as any).stockType === "Rejection") && (
                                        <p className="text-[8px] font-bold text-red-600 dark:text-red-400 mt-1 uppercase">
                                          Rejection
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  <div className={`absolute -top-1.5 -left-1.5 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity ${
                                    (entry as any).stockType === "Off Grade/Rejection" || (entry as any).stockType === "Rejection"
                                      ? "bg-red-500"
                                      : "bg-primary"
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
                
                {/* Save Button */}
                <div className="bg-background pt-3 border-t border-border -mx-3 px-3 pb-3 mt-4">
                  {/* <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-900 dark:text-blue-100 font-semibold mb-1">
                      Checked Entries: <span className="text-primary">{
                        getItemEntries(selectedItemName || "").filter(entry => checkedEntries[entry.id]).length
                      }</span> of <span className="text-primary">{getItemEntries(selectedItemName || "").length}</span>
                    </p>
                    <p className="text-[10px] text-blue-700 dark:text-blue-300">
                      Click quantity boxes to check/uncheck. Click "Save State" to persist.
                    </p>
                  </div> */}
                  
                  <Button
                    onClick={handleSaveCheckedEntries}
                    disabled={saving}
                    className="w-full h-9 bg-primary hover:bg-primary/90 text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <Loader className="w-3 h-3 mr-1.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-3 h-3 mr-1.5" />
                        Save State
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No entries found for this item</p>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>


    </motion.div>
  );
}
