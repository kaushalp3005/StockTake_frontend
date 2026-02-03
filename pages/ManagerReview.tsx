import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Package, Loader, Check, Clock, Lock, Warehouse, ChevronRight, Save, Edit2, X, Upload, Plus, Search } from "lucide-react";
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
  const [editingItemName, setEditingItemName] = useState<{ itemName: string; newName: string } | null>(null);
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
      const entriesResponse = await stocktakeEntriesAPI.getEntries({ warehouse });
      
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
      // Collect all checked entries from ALL warehouses/floors
      // Structure: Map of warehouse_floor -> Set of checked entry IDs
      const checkedEntriesByLocation = new Map<string, Set<string>>();
      const warehouseFloorSet = new Set<string>();
      
      // Iterate through ALL localStorage keys to collect checked entries
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("checkedEntries_")) {
          try {
            const checkedEntriesData = JSON.parse(localStorage.getItem(key) || "{}");
            
            // Extract warehouse, floor, and itemName from key
            // Format: checkedEntries_${warehouse}_${floor}_${itemName}
            const parts = key.replace("checkedEntries_", "").split("_");
            if (parts.length >= 2) {
              const itemName = parts.slice(2).join("_"); // Item name might contain underscores
              const floorName = parts[1];
              const warehouse = parts[0];
              const locationKey = `${warehouse}_${floorName}`;
              
              warehouseFloorSet.add(locationKey);
              
              // Initialize Set for this location if not exists
              if (!checkedEntriesByLocation.has(locationKey)) {
                checkedEntriesByLocation.set(locationKey, new Set<string>());
              }
              
              // Add checked entry IDs for this location
              Object.keys(checkedEntriesData).forEach((entryId) => {
                if (checkedEntriesData[entryId] === true) {
                  checkedEntriesByLocation.get(locationKey)!.add(entryId);
                }
              });
            }
          } catch (e) {
            console.error("Error parsing localStorage key:", key, e);
          }
        }
      }
      
      // If no entries are checked, show error
      let totalCheckedCount = 0;
      checkedEntriesByLocation.forEach((ids, location) => {
        totalCheckedCount += ids.size;
        console.log(`Location ${location}: ${ids.size} checked entries`, Array.from(ids));
      });
      
      if (totalCheckedCount === 0) {
        console.warn("No checked entries found in localStorage. Available keys:", 
          Array.from({length: localStorage.length}, (_, i) => localStorage.key(i)).filter(k => k?.startsWith("checkedEntries_"))
        );
        toast({
          title: "No entries selected",
          description: "Please check at least one entry before saving. Make sure you have selected entries by clicking on the quantity boxes.",
          variant: "destructive",
        });
        setSavingData(false);
        return;
      }
      
      console.log(`Found ${totalCheckedCount} checked entries across ${warehouseFloorSet.size} locations`);
      
      // First, add entries from current groupedItemsData if available (for current warehouse/floor)
      const allEntriesMap = new Map<string, ItemEntry>(); // entryId -> entry
      
      if (selectedWarehouse && selectedFloor && groupedItemsData.length > 0) {
        groupedItemsData.forEach((group) => {
          group.entries.forEach((entry) => {
            allEntriesMap.set(entry.id, entry);
          });
        });
        console.log(`Added ${allEntriesMap.size} entries from current groupedItemsData`);
      }
      
      // Fetch grouped entries for all warehouse/floor combinations (if not already loaded)
      const fetchPromises = Array.from(warehouseFloorSet).map(async (locationKey) => {
        const [warehouse, floorName] = locationKey.split('_');
        
        // Skip if this is the current warehouse/floor and we already have data
        if (selectedWarehouse && selectedFloor &&
            warehouse.toUpperCase() === selectedWarehouse.toUpperCase() &&
            floorName.toUpperCase() === selectedFloor.toUpperCase() &&
            allEntriesMap.size > 0) {
          console.log(`Skipping fetch for ${warehouse}/${floorName} - already have data from groupedItemsData`);
          return;
        }
        
        try {
          console.log(`Fetching entries for ${warehouse}/${floorName}...`);
          const data = await stocktakeEntriesAPI.getGroupedEntries(warehouse, floorName);
          let entryCount = 0;
          if (data.groups) {
            data.groups.forEach((group: any) => {
              group.entries.forEach((entry: any) => {
                // Store entry with its ID as key (overwrite if exists)
                allEntriesMap.set(entry.id, entry);
                entryCount++;
              });
            });
          }
          console.log(`Fetched ${entryCount} entries for ${warehouse}/${floorName}`);
        } catch (err) {
          console.error(`Error fetching entries for ${warehouse}/${floorName}:`, err);
        }
      });
      
      await Promise.all(fetchPromises);
      
      console.log(`Total entries available: ${allEntriesMap.size} (from UI state and database)`);
      
      // Now collect full entry data for all checked entries
      const allCheckedEntries: Array<{
        entryId?: string;
        warehouse: string;
        floorName: string;
        itemName?: string;
        itemType?: string;
        category?: string;
        subcategory?: string;
        quantity?: number;
        weight?: number;
        uom?: number;
        stockType?: string;
      }> = [];
      
      const notFoundIds: string[] = [];
      
      checkedEntriesByLocation.forEach((checkedIds, locationKey) => {
        const [warehouse, floorName] = locationKey.split('_');
        
        checkedIds.forEach((entryId) => {
          const entry = allEntriesMap.get(entryId);
          if (entry) {
            // Entry exists in database, use its data
            allCheckedEntries.push({
              entryId: entry.id, // Include DB ID for reference
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
          } else {
            const notFoundKey = `${entryId}@${warehouse}/${floorName}`;
            notFoundIds.push(notFoundKey);
            console.warn(`Entry ${entryId} not found in database for ${warehouse}/${floorName}. Available entry IDs for this location:`, 
              Array.from(allEntriesMap.keys()).filter(id => allEntriesMap.get(id)?.userName)
            );
          }
        });
      });
      
      if (notFoundIds.length > 0) {
        console.warn(`${notFoundIds.length} checked entries were not found in database:`, notFoundIds);
        console.warn(`Total entries in database: ${allEntriesMap.size}`);
        console.warn(`Checked entry IDs that were not found:`, 
          Array.from(checkedEntriesByLocation.values()).flatMap(ids => Array.from(ids))
        );
      }
      
      if (allCheckedEntries.length === 0) {
        const message = notFoundIds.length > 0
          ? `None of the ${totalCheckedCount} checked entries were found in the database. The entry IDs in localStorage may be outdated. Please refresh the page (F5) and re-select the entries you want to save.`
          : "No valid entries to save. Please check entries before saving.";
        
        toast({
          title: "No valid entries found",
          description: message,
          variant: "destructive",
        });
        setSavingData(false);
        return;
      }
      
      // If some entries were not found, show warning but continue with valid ones
      if (notFoundIds.length > 0 && allCheckedEntries.length > 0) {
        toast({
          title: "Some entries skipped",
          description: `${notFoundIds.length} checked entries were not found and will be skipped. Saving ${allCheckedEntries.length} valid entries.`,
          variant: "default",
        });
      }
      
      console.log(`=== PREPARING TO SAVE ===`);
      console.log(`Saving ${allCheckedEntries.length} entries with full entry data`);
      console.log("Entries to save:", allCheckedEntries.map(e => ({
        itemName: e.itemName,
        warehouse: e.warehouse,
        floorName: e.floorName,
        quantity: e.quantity,
        weight: e.weight
      })));
      
      // Filter entries with valid entryId
      const validEntries = allCheckedEntries.filter(e => e.entryId);
      
      // Call API to save - backend will insert new entries
      console.log("Calling API: stocktakeEntriesAPI.saveResultsheet()...");
      const response = await stocktakeEntriesAPI.saveResultsheet(validEntries);
      console.log("API Response received:", response);
      
      // After saving, refresh the grouped entries for current warehouse/floor
      if (selectedWarehouse && selectedFloor) {
        try {
          const refreshedData = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor);
          setGroupedItemsData(refreshedData.groups || []);
        } catch (refreshError) {
          console.error("Error refreshing entries after save:", refreshError);
        }
      }
      
      toast({
        title: "Success",
        description: `Stock take data saved successfully! ${response.savedCount} items saved.`,
      });
      
      setSavingData(false);
    } catch (err: any) {
      console.error("=== SAVE ERROR ===");
      console.error("Error saving data:", err);
      console.error("Error status:", err.status);
      console.error("Error message:", err.message);
      console.error("Error data:", err.data);
      
      // Check if it's a 404 error with ID mismatch
      if (err.status === 404 && err.data?.existingIds) {
        const message = err.data.existingIds.length > 0
          ? `The selected entries no longer exist in the database. Please refresh the page and re-select the entries you want to save. (Found ${err.data.totalEntriesInTable} entries with different IDs)`
          : `No entries found in the database. Please refresh the page and try again.`;
        
        toast({
          title: "Entries Not Found",
          description: message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: err.message || "Failed to save stock take data",
          variant: "destructive",
        });
      }
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

  const handleItemNameLongPressStart = (itemName: string) => {
    longPressDetectedRef.current = false;
    const timer = setTimeout(() => {
      longPressDetectedRef.current = true;
      setEditingItemName({ itemName, newName: itemName });
    }, 800);
    longPressTimerRef.current = timer;
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
        const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor);
        setGroupedItemsData(data.groups || []);
      }

      setEditingQuantity(null);
    } catch (err: any) {
      console.error("Error updating entry:", err);
      alert(err.message || "Failed to update entry");
    }
  };

  const handleSaveEditedItemName = async () => {
    if (!editingItemName || !editingItemName.newName.trim()) {
      alert("Please enter a valid item name");
      return;
    }

    try {
      // Find all entries with this item name
      const entriesToUpdate = groupedItemsData
        .flatMap((g) => g.entries)
        .filter((e) => e.description.toUpperCase() === editingItemName.itemName.toUpperCase());

      if (entriesToUpdate.length === 0) {
        alert("No entries found with this item name");
        return;
      }

      // Update all entries in database
      const updatePromises = entriesToUpdate.map((entry) =>
        stocktakeEntriesAPI.updateEntry(entry.id, {
          itemName: editingItemName.newName.trim().toUpperCase(),
        })
      );

      await Promise.all(updatePromises);

      // Refresh grouped items data
      if (selectedWarehouse && selectedFloor) {
        const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor);
        setGroupedItemsData(data.groups || []);
      }

      setEditingItemName(null);
      
      // Update selectedItemName if it was being edited
      if (selectedItemName?.toUpperCase() === editingItemName.itemName.toUpperCase()) {
        setSelectedItemName(editingItemName.newName.trim());
      }
    } catch (err: any) {
      console.error("Error updating item names:", err);
      alert(err.message || "Failed to update item names");
    }
  };

  const handleCancelEdit = () => {
    setEditingQuantity(null);
    setEditingItemName(null);
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
      const data = await stocktakeEntriesAPI.getGroupedEntries(selectedWarehouse, selectedFloor);
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
          selectedFloor!
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
  }, [selectedWarehouse, selectedFloor]);

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
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <span className="text-lg sm:text-xl font-bold text-foreground">StockTake</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {user && (
              <div className="text-right">
                <p className="font-semibold text-foreground text-sm">{user.username}</p>
                <p className="text-xs text-muted-foreground">{user.role}</p>
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
              className="text-xs sm:text-sm touch-manipulation"
              style={{ touchAction: 'manipulation' }}
            >
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container py-6 sm:py-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <motion.div
            className="mb-6 sm:mb-8"
            variants={cardVariants}
          >
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2">
              Review Floor Sessions
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              Select a warehouse to review floor entries
            </p>
          </motion.div>

          {/* Warehouses Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {WAREHOUSES.map((warehouse, index) => {
              return (
                <motion.div
                  key={warehouse}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.1,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <Card
                    className="p-4 sm:p-6 border-border hover:shadow-lg transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.02] hover:border-primary touch-manipulation"
                    onClick={() => {
                      if (!isScrollingRef.current) {
                        handleWarehouseClick(warehouse);
                      }
                    }}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 mb-4">
                      <div className="p-2 sm:p-3 bg-primary/10 rounded-lg">
                        <Warehouse className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg sm:text-xl font-bold text-foreground">
                          {warehouse}
                        </h3>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
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
                        className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                        size="sm"
                      >
                        <Upload className="w-4 h-4 mr-2" />
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
            className="mt-8 sm:mt-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card className="p-4 sm:p-6 border-border bg-muted/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm sm:text-base font-medium text-foreground">
                    Stock take is complete. All items have been checked and verified.
                  </p>
                </div>
                <Button
                  onClick={handleSaveData}
                  disabled={savingData}
                  className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {savingData ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
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
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            {loadingGroupedItems ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <Loader className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading items from database...</p>
              </div>
            ) : getGroupedItems().length > 0 ? (
              <div className="space-y-3">
                {/* Add Item Card */}
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

                {getGroupedItems().map((groupedItem, index) => (
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
                      className={`p-4 border-border hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.01] hover:border-primary touch-manipulation ${
                        groupedItem.entries.some((e: any) => e.stockType === "Off Grade/Rejection" || e.stockType === "Rejection")
                          ? "border-l-4 border-l-red-500"
                          : "border-l-4 border-l-green-500"
                      }`}
                      style={{ touchAction: 'manipulation' }}
                      onMouseDown={(e) => {
                        if (e.button === 0 && !editingItemName) {
                          handleItemNameLongPressStart(groupedItem.description);
                        }
                      }}
                      onTouchStart={(e) => {
                        if (!editingItemName) {
                          handleItemNameLongPressStart(groupedItem.description);
                        }
                      }}
                      onMouseUp={(e) => {
                        e.preventDefault();
                        handleLongPressEnd();
                        if (!editingItemName && !longPressDetectedRef.current && !isScrollingRef.current) {
                          setTimeout(() => {
                            if (!longPressDetectedRef.current && !isScrollingRef.current) {
                              handleItemClick(groupedItem.description);
                            }
                          }, 150);
                        }
                      }}
                      onMouseLeave={() => handleLongPressEnd()}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        handleLongPressEnd();
                        if (!editingItemName && !longPressDetectedRef.current && !isScrollingRef.current) {
                          setTimeout(() => {
                            if (!longPressDetectedRef.current && !isScrollingRef.current) {
                              handleItemClick(groupedItem.description);
                            }
                          }, 150);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between relative">
                        {hasUncheckedEntriesInItem(groupedItem.description) && (
                          <div className="absolute -top-2 -right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></div>
                        )}
                        <div className="flex-1 min-w-0">
                          {editingItemName && editingItemName.itemName === groupedItem.description ? (
                            <div 
                              className="flex items-center gap-2"
                              onMouseDown={(e) => e.stopPropagation()}
                              onMouseUp={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              onTouchEnd={(e) => e.stopPropagation()}
                            >
                              <Input
                                value={editingItemName.newName}
                                onChange={(e) => setEditingItemName({ ...editingItemName, newName: e.target.value })}
                                className="flex-1 text-sm font-semibold"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSaveEditedItemName();
                                  } else if (e.key === "Escape") {
                                    handleCancelEdit();
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleSaveEditedItemName();
                                }}
                                onTouchEnd={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleSaveEditedItemName();
                                }}
                                className="h-8 px-2 bg-green-600 hover:bg-green-700"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleCancelEdit();
                                }}
                                onTouchEnd={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleCancelEdit();
                                }}
                                className="h-8 px-2"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="font-semibold text-foreground text-sm sm:text-base">
                                {groupedItem.description}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Long press to edit name
                              </p>
                            </>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {groupedItem.category} - {groupedItem.subcategory}
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs text-black dark:text-white font-semibold">
                              {groupedItem.totalEntries} {groupedItem.totalEntries === 1 ? 'entry' : 'entries'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Total: {groupedItem.totalQuantity} units
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {groupedItem.totalWeight.toFixed(2)} kg
                            </span>
                          </div>
                          {/* Stock Type Badges */}
                          <div className="flex items-center gap-2 mt-2">
                            {(() => {
                              const freshCount = groupedItem.entries.filter((e: any) => e.stockType === "Fresh Stock" || !e.stockType).length;
                              const rejectionCount = groupedItem.entries.filter((e: any) => e.stockType === "Off Grade/Rejection" || e.stockType === "Rejection").length;
                              return (
                                <>
                                  {freshCount > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">
                                      Fresh: {freshCount}
                                    </span>
                                  )}
                                  {rejectionCount > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
                                      Rejection: {rejectionCount}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        {!editingItemName && (
                          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 ml-2" />
                        )}
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
            )}
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
                  setTimeout(() => {
                    setItemsDrawerOpen(true);
                  }, 200);
                }}
                className="mr-auto h-8"
              >
                <ArrowLeft className="w-3 h-3 mr-1" />
                <span className="text-xs">Back</span>
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
                                    <div className="relative bg-primary/10 border-2 border-primary rounded-lg p-4 min-w-[120px]">
                                      <div className="flex flex-col gap-2">
                                        <Input
                                          type="number"
                                          step="0.1"
                                          value={editingQuantity.value}
                                          onChange={(e) => {
                                            // Store the raw string value to preserve decimal precision
                                            setEditingQuantity({ entryId: entry.id, value: e.target.value });
                                          }}
                                          className="text-center text-lg font-bold"
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
                                        <div className="flex gap-1 justify-center">
                                          <Button
                                            size="sm"
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
                                            className="h-6 px-2 bg-green-600 hover:bg-green-700"
                                          >
                                            <Check className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCancelEdit();
                                            }}
                                            onTouchEnd={(e) => {
                                              e.stopPropagation();
                                              e.preventDefault();
                                              handleCancelEdit();
                                            }}
                                            className="h-6 px-2"
                                          >
                                            <X className="w-3 h-3" />
                                          </Button>
                                        </div>
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
                <div className="sticky bottom-0 bg-background pt-3 border-t border-border -mx-3 px-3 pb-3 mt-4">
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
