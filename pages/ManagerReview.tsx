import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Package, Loader, Check, Clock, Lock, Warehouse, ChevronRight, Save, Edit2, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { stocktakeEntriesAPI, warehousesAPI } from "@/utils/api";
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
  category: string;
  subcategory: string;
  packageSize: number;
  units: number;
  totalWeight: number;
  userName: string;
  sessionId: string;
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
  const [editingQuantity, setEditingQuantity] = useState<{ entryId: string; value: number } | null>(null);
  const [editingItemName, setEditingItemName] = useState<{ itemName: string; newName: string } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressDetectedRef = useRef<boolean>(false);

  useEffect(() => {
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
    
    setIsLoading(false);
  }, []);

  const handleWarehouseClick = async (warehouse: string) => {
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
    setSelectedFloor(floor);
    setSelectedItemName(null);
    setConfirmed(false); // Reset confirmation when changing floors
    setCheckedEntries({}); // Reset checked entries when changing floors
    // Close floors drawer and open items drawer with slight delay for smooth animation
    setDrawerOpen(false);
    setTimeout(() => {
      setItemsDrawerOpen(true);
    }, 200);
  };

  const handleItemClick = (itemName: string) => {
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
    if (!confirmed) {
      alert("Please confirm that all items are accurate before saving.");
      return;
    }
    
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
        alert("Checked entries saved successfully!");
        setSaving(false);
        setConfirmed(false);
      }, 500);
    } catch (err) {
      alert("Failed to save checked entries");
      setSaving(false);
    }
  };

  const handleSaveData = async () => {
    setSavingData(true);
    try {
      // Collect all checked entries from localStorage
      // Keys are in format: checkedEntries_${warehouse}_${floor}_${itemName}
      const allCheckedEntries: Array<{ entryId: string; warehouse: string; floorName: string }> = [];
      
      // Iterate through all localStorage keys
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
              
              // Add all checked entry IDs
              Object.keys(checkedEntriesData).forEach((entryId) => {
                if (checkedEntriesData[entryId] === true) {
                  allCheckedEntries.push({
                    entryId,
                    warehouse,
                    floorName,
                  });
                }
              });
            }
          } catch (e) {
            console.error("Error parsing localStorage key:", key, e);
          }
        }
      }
      
      if (allCheckedEntries.length === 0) {
        toast({
          title: "No entries selected",
          description: "Please check at least one entry before saving.",
          variant: "destructive",
        });
        setSavingData(false);
        return;
      }
      
      // Call API to save to stocktake_resultsheet
      const response = await stocktakeEntriesAPI.saveResultsheet(allCheckedEntries);
      
      toast({
        title: "Success",
        description: `Stock take data saved successfully! ${response.savedCount} items saved.`,
      });
      
      setSavingData(false);
    } catch (err: any) {
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
        setEditingQuantity({ entryId, value: currentValue });
      }
    }, 500); // 500ms for long press
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
    }, 500);
    longPressTimerRef.current = timer;
  };

  const handleSaveEditedQuantity = async (entryId: string, newValue: number) => {
    if (isNaN(newValue) || newValue <= 0) {
      alert("Please enter a valid positive number");
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

      // Calculate new total weight
      const newTotalWeight = entry.packageSize * newValue;

      // Update entry in database
      await stocktakeEntriesAPI.updateEntry(entryId, {
        totalQuantity: newValue,
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
        alert("Status saved successfully!");
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
        ease: [0.22, 1, 0.36, 1],
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      x: -20,
      scale: 0.98,
      transition: {
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
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
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-b from-background to-muted/30"
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
                    className="p-4 sm:p-6 border-border hover:shadow-lg transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.02] hover:border-primary"
                    onClick={() => handleWarehouseClick(warehouse)}
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
        if (!open) {
          setSelectedWarehouse(null);
        }
      }}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDrawerOpen(false)}
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
          <div className="px-4 pb-4 overflow-y-auto">
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
                      className="p-4 border-border hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.01] hover:border-primary"
                      onClick={() => handleFloorClick(floor.floorName)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Package className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {floor.floorName}
                            </h3>
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
        if (!open) {
          setSelectedFloor(null);
          setSelectedItemName(null);
        }
      }}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setItemsDrawerOpen(false);
                  setTimeout(() => {
                    setDrawerOpen(true);
                  }, 200);
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
          <div className="px-4 pb-4 overflow-y-auto">
            {loadingGroupedItems ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <Loader className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading items from database...</p>
              </div>
            ) : getGroupedItems().length > 0 ? (
              <div className="space-y-3">
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
                      className="p-4 border-border hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98] hover:scale-[1.01] hover:border-primary"
                      onMouseDown={(e) => {
                        if (e.button === 0 && !editingItemName) {
                          handleItemNameLongPressStart(groupedItem.description);
                        }
                      }}
                      onMouseUp={(e) => {
                        e.preventDefault();
                        handleLongPressEnd();
                        if (!editingItemName && !longPressDetectedRef.current) {
                          setTimeout(() => {
                            if (!longPressDetectedRef.current) {
                              handleItemClick(groupedItem.description);
                            }
                          }, 150);
                        }
                      }}
                      onMouseLeave={() => handleLongPressEnd()}
                      onTouchStart={() => {
                        if (!editingItemName) {
                          handleItemNameLongPressStart(groupedItem.description);
                        }
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        handleLongPressEnd();
                        if (!editingItemName && !longPressDetectedRef.current) {
                          setTimeout(() => {
                            if (!longPressDetectedRef.current) {
                              handleItemClick(groupedItem.description);
                            }
                          }, 150);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          {editingItemName && editingItemName.itemName === groupedItem.description ? (
                            <div className="flex items-center gap-2">
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
                <p className="text-muted-foreground">No items found for this floor</p>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Item Details Drawer - Shows entries grouped by username with quantity boxes */}
      <Drawer open={itemDetailsOpen} onOpenChange={(open) => {
        setItemDetailsOpen(open);
        if (!open) {
          setSelectedItemName(null);
        }
      }}>
        <DrawerContent className="max-h-[90vh] flex flex-col">
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
                                          value={editingQuantity.value}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            setEditingQuantity({ entryId: entry.id, value: val });
                                          }}
                                          className="text-center text-lg font-bold"
                                          autoFocus
                                          min="1"
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              handleSaveEditedQuantity(entry.id, editingQuantity.value);
                                            } else if (e.key === "Escape") {
                                              handleCancelEdit();
                                            }
                                          }}
                                        />
                                        <div className="flex gap-1 justify-center">
                                          <Button
                                            size="sm"
                                            onClick={() => handleSaveEditedQuantity(entry.id, editingQuantity.value)}
                                            className="h-6 px-2 bg-green-600 hover:bg-green-700"
                                          >
                                            <Check className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handleCancelEdit}
                                            className="h-6 px-2"
                                          >
                                            <X className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      className={`relative bg-primary/10 hover:bg-primary/20 border-2 rounded-lg p-2.5 min-w-[90px] text-center transition-all duration-200 hover:scale-105 cursor-pointer ${
                                        isChecked
                                          ? "border-primary bg-primary/20 shadow-md"
                                          : "border-primary/30"
                                      }`}
                                      onMouseDown={(e) => {
                                        if (e.button === 0 && !editingQuantity) {
                                          handleLongPressStart(entry.id, entry.units, 'quantity');
                                        }
                                      }}
                                      onMouseUp={(e) => {
                                        e.preventDefault();
                                        handleLongPressEnd();
                                        if (!editingQuantity && !longPressDetectedRef.current) {
                                          setTimeout(() => {
                                            if (!longPressDetectedRef.current) {
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
                                        if (!editingQuantity && !longPressDetectedRef.current) {
                                          setTimeout(() => {
                                            if (!longPressDetectedRef.current) {
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
                                      <p className="text-xl font-bold text-black dark:text-white">
                                        {entry.units}
                                      </p>
                                      <p className="text-[9px] text-muted-foreground mt-1">
                                        UOM: {entry.packageSize.toFixed(3)}kg
                                      </p>
                                      <p className="text-[9px] font-semibold text-primary mt-0.5">
                                        {entry.totalWeight.toFixed(2)}kg
                                      </p>
                                    </div>
                                  )}
                                  <div className="absolute -top-1.5 -left-1.5 bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
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
                <div className="sticky bottom-0 bg-background pt-2 border-t border-border -mx-3 px-3 pb-2 mt-3">
                  <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                  <p className="text-[10px] text-blue-900 dark:text-blue-100 font-medium mb-0.5">
                    Checked Entries: <span className="text-black dark:text-white">{
                      getItemEntries(selectedItemName || "").filter(entry => checkedEntries[entry.id]).length
                    }</span> of <span className="text-black dark:text-white">{getItemEntries(selectedItemName || "").length}</span>
                  </p>
                    <p className="text-[9px] text-blue-700 dark:text-blue-300">
                      Click quantity boxes to check/uncheck. Click "Save State" to persist.
                    </p>
                  </div>
                  
                  {/* Confirmation Checkbox */}
                  <div className="mb-2 p-2 bg-muted/50 rounded border border-border">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="confirm-accuracy"
                        checked={confirmed}
                        onCheckedChange={(checked) => setConfirmed(checked === true)}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor="confirm-accuracy"
                        className="text-[10px] font-medium text-foreground cursor-pointer leading-tight flex-1"
                      >
                        I hereby confirm that all items and their quantities are accurate and verified. I have reviewed all entries and certify their correctness before saving.
                      </label>
                    </div>
                  </div>
                  
                  <Button
                    onClick={handleSaveCheckedEntries}
                    disabled={saving || !confirmed}
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
