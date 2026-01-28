import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FixedSelect } from "@/components/ui/fixed-select";
import { Trash2, Plus, ArrowLeft, Package, Loader, X, Check, ChevronDown, ChevronRight, Search } from "lucide-react";
import { categorialInvAPI } from "@/utils/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Group {
  name: string;
  subgroups: Subgroup[];
}

interface Subgroup {
  name: string;
  particulars: Particular[];
}

interface Particular {
  name: string;
  uom: number | null;
}

interface AddedItem {
  id: string;
  stockType?: string;
  itemType?: string;
  category: string;
  subcategory: string;
  description: string;
  packageSize: number; // in kg
  units: number;
  totalWeight: number; // auto-calculated
}

// Format UOM for display: always show 3 decimal places
// If < 1kg: show kg value with 3 decimals + "gm" (e.g., 0.250gm)
// If >= 1kg: show kg value with 3 decimals + "kg" (e.g., 1.000kg)
function formatUOM(uom: number): string {
  if (isNaN(uom) || uom === null || uom === undefined) return "";
  
  const formattedValue = uom.toFixed(3);
  
  if (uom < 1) {
    // Show in gm for values less than 1kg
    return `${formattedValue}gm`;
  } else {
    // Show in kg for values >= 1kg
    return `${formattedValue}kg`;
  }
}

export default function AddItem() {
  const navigate = useNavigate();
  const [floorSession, setFloorSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [stockType, setStockType] = useState<"fresh" | "offgrade" | "">("fresh");
  const [itemType, setItemType] = useState<"pm" | "rm" | "fg" | "">("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [packageSize, setPackageSize] = useState("");
  const [units, setUnits] = useState("");

  // Data from API
  const [categorialData, setCategorialData] = useState<Group[]>([]);

  // Added items list
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);

  // Track which item is having quantity added (for inline quantity input)
  const [addingQuantityTo, setAddingQuantityTo] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState("");

  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Track expanded categories
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{group: string; subgroup: string; particulars: string; uom: number | null}>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Description dropdown search
  const [descriptionSearchQuery, setDescriptionSearchQuery] = useState("");
  const [showDescriptionDropdown, setShowDescriptionDropdown] = useState(false);
  
  // Pending search selection (for auto-fill after categorialData loads)
  const [pendingSelection, setPendingSelection] = useState<{group: string; subgroup: string; particulars: string; uom: number | null} | null>(null);

  // Lock fields after search auto-fill
  const [isGroupLocked, setIsGroupLocked] = useState(false);
  const [isSubgroupLocked, setIsSubgroupLocked] = useState(false);

  useEffect(() => {
    // Get floor session from localStorage
    const session = localStorage.getItem("currentFloorSession");
    if (!session) {
      navigate("/dashboard");
      return;
    }
    const parsedSession = JSON.parse(session);
    setFloorSession(parsedSession);
    
    // Restore itemType if it exists in session
    if (parsedSession.itemType) {
      setItemType(parsedSession.itemType.toLowerCase() as "pm" | "rm" | "fg" | "");
    }
    
    // If session has existing items, load them for editing
    if (parsedSession.items && parsedSession.items.length > 0) {
      setAddedItems(parsedSession.items);
    }
    
    // Restore current form state if it exists
    if (parsedSession.currentFormState) {
      const formState = parsedSession.currentFormState;
      console.log("Restoring form state:", formState);
      
      // Restore all form fields
      if (formState.stockType) setStockType(formState.stockType);
      if (formState.itemType) setItemType(formState.itemType);
      if (formState.category) setCategory(formState.category);
      if (formState.customCategory) setCustomCategory(formState.customCategory);
      if (formState.subcategory) setSubcategory(formState.subcategory);
      if (formState.description) setDescription(formState.description);
      if (formState.customItemName) setCustomItemName(formState.customItemName);
      if (formState.packageSize) setPackageSize(formState.packageSize);
      if (formState.units) setUnits(formState.units);
      if (formState.descriptionSearchQuery) setDescriptionSearchQuery(formState.descriptionSearchQuery);
    }
  }, [navigate]);

  // Handle click outside to close description dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-description-dropdown]')) {
        setShowDescriptionDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle browser back button and page unload to save state
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Save current state before page unloads
      if (floorSession) {
        const currentFormState = {
          stockType,
          itemType,
          category,
          customCategory,
          subcategory,
          description,
          customItemName,
          packageSize,
          units,
          descriptionSearchQuery,
          lastFormUpdate: new Date().toISOString()
        };
        
        const updatedSession = {
          ...floorSession,
          items: addedItems,
          currentFormState,
          lastModified: new Date().toISOString(),
          savedOnUnload: true
        };
        
        localStorage.setItem("currentFloorSession", JSON.stringify(updatedSession));
      }
    };

    const handlePopState = () => {
      // Handle browser back button
      handleBeforeUnload({} as BeforeUnloadEvent);
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    // Cleanup event listeners
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [floorSession, addedItems, stockType, itemType, category, customCategory, subcategory, description, customItemName, packageSize, units]);

  // Auto-save items to localStorage whenever addedItems changes
  useEffect(() => {
    if (floorSession && addedItems.length >= 0) {
      const updatedSession = {
        ...floorSession,
        itemType: itemType || floorSession.itemType || "",
        items: addedItems,
        lastModified: new Date().toISOString(), // Add timestamp for better tracking
      };
      localStorage.setItem("currentFloorSession", JSON.stringify(updatedSession));
      
      // Also update in floorSessions array if it exists
      const allSessions = JSON.parse(
        localStorage.getItem("floorSessions") || "[]"
      );
      const sessionIndex = allSessions.findIndex(
        (s: any) => s.id === floorSession.id
      );
      if (sessionIndex !== -1) {
        allSessions[sessionIndex] = updatedSession;
        localStorage.setItem("floorSessions", JSON.stringify(allSessions));
      }
    }
  }, [addedItems, floorSession, itemType]);

  // Auto-save current form state whenever form fields change
  useEffect(() => {
    if (floorSession) {
      const currentFormState = {
        stockType,
        itemType,
        category,
        customCategory,
        subcategory,
        description,
        customItemName,
        packageSize,
        units,
        lastFormUpdate: new Date().toISOString()
      };
      
      const updatedSession = {
        ...floorSession,
        items: addedItems,
        currentFormState,
        lastModified: new Date().toISOString()
      };
      
      localStorage.setItem("currentFloorSession", JSON.stringify(updatedSession));
    }
  }, [floorSession, addedItems, stockType, itemType, category, customCategory, subcategory, description, customItemName, packageSize, units]);

  // Fetch categorial inventory data when item type is selected
  useEffect(() => {
    const fetchCategorialData = async () => {
      if (!itemType) {
        setCategorialData([]);
        setCategory("");
        setSubcategory("");
        setDescription("");
        return;
      }

      setIsLoadingData(true);
      setError("");
      try {
        const data = await categorialInvAPI.getByItemType(itemType as "pm" | "rm" | "fg");
        const previousCategory = category;
        const previousSubcategory = subcategory;
        const previousDescription = description;
        
        setCategorialData(data.groups || []);
        
        // Only reset if itemType changed (not just reloading)
        // If itemType is the same, preserve existing selections if they're valid
        const newData = data.groups || [];
        const categoryExists = newData.find((g) => g.name === previousCategory);
        const subcategoryExists = categoryExists?.subgroups.find((sg) => sg.name === previousSubcategory);
        const descriptionExists = subcategoryExists?.particulars.find((p) => p.name === previousDescription);
        
        if (!categoryExists || !subcategoryExists || !descriptionExists) {
          // Reset only if values don't exist in new data
          setCategory("");
          setSubcategory("");
          setDescription("");
          console.log("Reset fields because values not found in new categorialData");
        } else {
          console.log("Preserved existing selections:", { previousCategory, previousSubcategory, previousDescription });
        }
      } catch (err: any) {
        console.error("Failed to fetch categorial data:", err);
        setError(err.message || "Failed to load inventory data");
        setCategorialData([]);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchCategorialData();
  }, [itemType]);

  // Apply pending selection when categorialData is ready
  useEffect(() => {
    if (pendingSelection && categorialData.length > 0 && !isLoadingData) {
      console.log("Applying pending selection after categorialData loaded:", pendingSelection);
      const groupValue = pendingSelection.group.trim().toUpperCase();
      const subgroupValue = pendingSelection.subgroup.trim().toUpperCase();
      const particularsValue = pendingSelection.particulars.trim().toUpperCase();
      
      const matchedGroup = categorialData.find((g) => g.name === groupValue);
      const matchedSubgroup = matchedGroup?.subgroups.find((sg) => sg.name === subgroupValue);
      const matchedParticular = matchedSubgroup?.particulars.find((p) => p.name === particularsValue);
      
      if (matchedGroup && matchedSubgroup && matchedParticular) {
        // Use setTimeout to ensure sequential updates
        setTimeout(() => {
          setCategory(groupValue);
          setTimeout(() => {
            setSubcategory(subgroupValue);
            setTimeout(() => {
              setDescription(particularsValue);
              if (pendingSelection.uom !== null && pendingSelection.uom !== undefined && !isNaN(pendingSelection.uom)) {
                setPackageSize(pendingSelection.uom.toFixed(3));
              }
              setPendingSelection(null);
              console.log("Pending selection applied successfully");
            }, 100);
          }, 100);
        }, 100);
      }
    }
  }, [pendingSelection, categorialData, isLoadingData]);

  // Reset subcategory and description when category changes
  useEffect(() => {
    if (!category) {
      setSubcategory("");
      setDescription("");
      setCustomItemName("");
    }
    if (category && category !== "OTHER") {
      setCustomCategory("");
    }
  }, [category]);

  // Reset description when subcategory changes
  useEffect(() => {
    if (!subcategory) {
      setDescription("");
      setCustomItemName("");
      setPackageSize("");
    }
  }, [subcategory]);

  // Debug: Log state changes
  useEffect(() => {
    console.log("Category state changed to:", category);
  }, [category]);

  useEffect(() => {
    console.log("Subcategory state changed to:", subcategory);
  }, [subcategory]);

  useEffect(() => {
    console.log("Description state changed to:", description);
  }, [description]);

  // Clear custom item name when regular description is selected
  useEffect(() => {
    if (description && description !== "OTHER") {
      setCustomItemName("");
    }
  }, [description]);

  // Auto-fill UOM when description is selected
  useEffect(() => {
    if (description && description !== "OTHER" && category && subcategory) {
      console.log("UOM Auto-fill effect triggered:", { description, category, subcategory });
      const selectedParticular = categorialData
        .find((g) => g.name === category)
        ?.subgroups.find((sg) => sg.name === subcategory)
        ?.particulars.find((p) => p.name === description);

      if (selectedParticular && selectedParticular.uom !== null && selectedParticular.uom !== undefined) {
        // Format UOM with 3 decimal places
        const formattedUom = selectedParticular.uom.toFixed(3);
        console.log("Auto-filling UOM from categorialData:", formattedUom);
        setPackageSize(formattedUom);
      } else {
        console.log("UOM not found in categorialData, keeping existing value");
        // Don't clear packageSize if it was set from search results
        // setPackageSize("");
      }
    }
  }, [description, category, subcategory, categorialData]);

  // Search items when query changes
  useEffect(() => {
    const searchItems = async () => {
      if (!itemType || !searchQuery || searchQuery.length < 2) {
        setSearchResults([]);
        setShowSearchResults(false);
        return;
      }

      setIsSearching(true);
      try {
        console.log("Searching for:", { itemType, searchQuery });
        const response = await categorialInvAPI.searchDescriptions(
          itemType as "pm" | "rm" | "fg",
          searchQuery
        );
        console.log("Search response:", response);
        console.log("Search results count:", response.results?.length || 0);
        if (response.results && response.results.length > 0) {
          console.log("First result:", response.results[0]);
        }
        setSearchResults(response.results || []);
        setShowSearchResults(true);
      } catch (err: any) {
        console.error("Search error:", err);
        setSearchResults([]);
        setShowSearchResults(false);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(() => {
      searchItems();
    }, 300); // Debounce search by 300ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery, itemType]);

  // Handle item selection from search
  const handleSearchItemSelect = (result: {group: string; subgroup: string; particulars: string; uom: number | null}) => {
    console.log("=== ITEM SELECTED FROM SEARCH ===");
    console.log("handleSearchItemSelect FUNCTION CALLED!");
    console.log("Raw result:", result);
    
    // Validate result
    if (!result || !result.group || !result.subgroup || !result.particulars) {
      console.error("Invalid result object:", result);
      return;
    }
    
    // Normalize values to match Select dropdown values (uppercase)
    const groupValue = result.group ? result.group.trim().toUpperCase() : "";
    const subgroupValue = result.subgroup ? result.subgroup.trim().toUpperCase() : "";
    const particularsValue = result.particulars ? result.particulars.trim().toUpperCase() : "";
    
    console.log("Normalized values:", { groupValue, subgroupValue, particularsValue, uom: result.uom });
    console.log("Current category state:", category);
    console.log("Current subcategory state:", subcategory);
    console.log("Current description state:", description);
    console.log("Categorial data available:", categorialData.length > 0);
    
    if (categorialData.length > 0) {
      const matchedGroup = categorialData.find((g) => g.name === groupValue);
      console.log("Matched group in categorialData:", matchedGroup ? matchedGroup.name : "NOT FOUND");
      
      if (matchedGroup) {
        const matchedSubgroup = matchedGroup.subgroups.find((sg) => sg.name === subgroupValue);
        console.log("Matched subgroup in categorialData:", matchedSubgroup ? matchedSubgroup.name : "NOT FOUND");
        
        if (matchedSubgroup) {
          const matchedParticular = matchedSubgroup.particulars.find((p) => p.name === particularsValue);
          console.log("Matched particular in categorialData:", matchedParticular ? matchedParticular.name : "NOT FOUND");
        }
      }
    }
    
    // Check if categorialData is loaded and has the values
    if (categorialData.length > 0) {
      const matchedGroup = categorialData.find((g) => g.name === groupValue);
      const matchedSubgroup = matchedGroup?.subgroups.find((sg) => sg.name === subgroupValue);
      const matchedParticular = matchedSubgroup?.particulars.find((p) => p.name === particularsValue);
      
      if (matchedGroup && matchedSubgroup && matchedParticular) {
        // Data is ready, set values sequentially with React state batching
        console.log("Setting category to:", groupValue);
        setCategory(groupValue);
        console.log("Setting subcategory to:", subgroupValue);
        setSubcategory(subgroupValue);
        console.log("Setting description to:", particularsValue);
        setDescription(particularsValue);
        
        // Set UOM if available
        if (result.uom !== null && result.uom !== undefined && !isNaN(result.uom)) {
          const uomValue = result.uom.toFixed(3);
          console.log("Setting UOM to:", uomValue);
          setPackageSize(uomValue);
        } else {
          console.log("UOM not available or invalid:", result.uom);
        }
      } else {
        // Data not ready, store pending selection
        console.log("CategorialData not ready, storing pending selection");
        setPendingSelection(result);
        // Still try to set category
        setCategory(groupValue);
      }
    } else {
      // No categorialData yet, store pending selection
      console.log("No categorialData available, storing pending selection");
      setPendingSelection(result);
    }
    
    // Clear search
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    
    console.log("=== END ITEM SELECTION ===");
  };

  // Auto-calculate total weight
  const calculateTotalWeight = (pkgSize: number, qty: number): number => {
    return pkgSize * qty;
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    const isOtherCategory = category === "OTHER";
    const isOtherItem = description === "OTHER";
    
    if (!stockType || !itemType) {
      setError("Stock type and item type are required");
      return;
    }
    
    // Check category
    if (!category) {
      setError("Category is required");
      return;
    }
    if (isOtherCategory && !customCategory) {
      setError("Please enter unlisted item name");
      return;
    }
    
    if (isOtherItem) {
      // For Other items, only custom item name, UOM, and units are required
      if (!customItemName || !packageSize || !units) {
        setError("Custom item name, UOM and units are required for Other items");
        return;
      }
    } else if (!isOtherCategory) {
      // For regular items (not Other category), all fields are required
      if (!category || !subcategory || !description || !packageSize || !units) {
        setError("All fields are required");
        return;
      }
    } else {
      // For Other category items, only UOM and units are required
      if (!packageSize || !units) {
        setError("UOM and units are required");
        return;
      }
    }

    const pkgSizeNum = parseFloat(packageSize);
    const unitsNum = parseFloat(units);

    if (isNaN(pkgSizeNum) || isNaN(unitsNum) || pkgSizeNum <= 0 || unitsNum <= 0) {
      setError("UOM and units must be valid positive numbers (decimals allowed, e.g., 450.25)");
      return;
    }

    const totalWeight = calculateTotalWeight(pkgSizeNum, unitsNum);
    
    const newItem: AddedItem = {
      id: `item-${Date.now()}`,
      stockType: stockType === "fresh" ? "Fresh Stock" : "Off Grade/Rejection",
      itemType: itemType.toUpperCase(),
      category: isOtherCategory ? customCategory.toUpperCase() : (isOtherItem ? "" : category.toUpperCase()),
      subcategory: isOtherItem ? "" : subcategory.toUpperCase(),
      description: isOtherItem ? customItemName.toUpperCase() : description.toUpperCase(),
      packageSize: pkgSizeNum,
      units: unitsNum,
      totalWeight,
    };

    setAddedItems([...addedItems, newItem]);

    // Reset form (keep stock type and item type for convenience)
    setCategory("");
    setCustomCategory("");
    setSubcategory("");
    setDescription("");
    setCustomItemName("");
    setPackageSize("");
    setUnits("");

    // Reset locks (removed UOM lock as it's now permanently read-only when auto-filled)
  };

  const handleRemoveItem = (id: string) => {
    setItemToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteItem = () => {
    if (itemToDelete) {
      setAddedItems(addedItems.filter((item) => item.id !== itemToDelete));
      // If removing item that was being edited, cancel editing
      if (addingQuantityTo === itemToDelete) {
        setAddingQuantityTo(null);
        setNewQuantity("");
      }
      setItemToDelete(null);
    }
    setDeleteConfirmOpen(false);
  };

  const cancelDeleteItem = () => {
    setDeleteConfirmOpen(false);
    setItemToDelete(null);
  };

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Group items by category, then by item (subcategory + description), then collect quantity entries
  const groupedItems = addedItems.reduce((acc, item) => {
    const category = item.category;
    const itemKey = `${item.subcategory}|${item.description}`; // Unique item identifier
    
    if (!acc[category]) {
      acc[category] = {};
    }
    if (!acc[category][itemKey]) {
      acc[category][itemKey] = {
        itemInfo: {
          subcategory: item.subcategory,
          description: item.description,
          packageSize: item.packageSize,
          category: item.category,
          itemType: item.itemType,
          stockType: item.stockType
        },
        quantities: []
      };
    }
    acc[category][itemKey].quantities.push({
      id: item.id,
      units: item.units,
      totalWeight: item.totalWeight
    });
    return acc;
  }, {} as Record<string, Record<string, { itemInfo: any; quantities: Array<{id: string, units: number, totalWeight: number}> }>>);

  const handleAddMoreQt = (itemKey: string) => {
    setAddingQuantityTo(itemKey);
    setNewQuantity("");
    setError("");
  };

  const handleCancelAddQt = () => {
    setAddingQuantityTo(null);
    setNewQuantity("");
  };

  const handleSubmitAddQt = (itemKey: string) => {
    if (!newQuantity || isNaN(parseFloat(newQuantity)) || parseFloat(newQuantity) <= 0) {
      setError("Please enter a valid quantity (decimals allowed, e.g., 450.25)");
      return;
    }

    // Find existing item from the same group using itemKey
    const [subcategory, description] = itemKey.split('|');
    const existingItem = addedItems.find((item) => 
      `${item.subcategory}|${item.description}` === itemKey
    );
    
    if (!existingItem) {
      setError("Item not found");
      return;
    }

    const newUnits = parseFloat(newQuantity);
    const totalWeight = calculateTotalWeight(existingItem.packageSize, newUnits);

    const newItem: AddedItem = {
      id: `item-${Date.now()}`,
      itemType: existingItem.itemType,
      stockType: existingItem.stockType,
      category: existingItem.category,
      subcategory: existingItem.subcategory,
      description: existingItem.description,
      packageSize: existingItem.packageSize,
      units: newUnits,
      totalWeight,
    };

    setAddedItems([...addedItems, newItem]);
    setAddingQuantityTo(null);
    setNewQuantity("");
    setError("");
  };

  const handleSaveAndContinue = async () => {
    if (addedItems.length === 0) {
      setError("Please add at least one item");
      return;
    }

    setIsLoading(true);

    try {
      // Save items to floor session
      const updatedSession = {
        ...floorSession,
        itemType: itemType || floorSession.itemType || "",
        items: addedItems,
      };
      localStorage.setItem("currentFloorSession", JSON.stringify(updatedSession));

      // If this is an existing session (has an id and was in floorSessions), update it
      const allSessions = JSON.parse(
        localStorage.getItem("floorSessions") || "[]"
      );
      const sessionIndex = allSessions.findIndex(
        (s: any) => s.id === floorSession.id
      );
      
      if (sessionIndex !== -1) {
        // Update existing session
        allSessions[sessionIndex] = updatedSession;
        localStorage.setItem("floorSessions", JSON.stringify(allSessions));
      }

      // Redirect to review/entries page
      navigate("/audit/entries");
    } catch (err: any) {
      setError(err.message || "Failed to save items");
    } finally {
      setIsLoading(false);
    }
  };

  const totalFloorWeight = addedItems.reduce((sum, item) => sum + item.totalWeight, 0);

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Form Section */}
          <div className="lg:col-span-2">
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  {addedItems.length > 0 ? "Edit" : "Add"} Item (Articles)
                </h1>
                {addedItems.length > 0 && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded text-xs font-semibold">
                    Editing
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base text-muted-foreground">
                {floorSession?.floorName || 'Floor'} - {floorSession?.warehouse}
              </p>
            </div>

            <Card className="p-4 sm:p-6 md:p-8 border-border">
              <form onSubmit={handleAddItem} className="space-y-6">
                {error && (
                  <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                    {error}
                  </div>
                )}

                {/* Stock Type */}
                <div className="space-y-2">
                  <Label htmlFor="stockType" className="text-foreground font-semibold">
                    Stock Type
                  </Label>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant={stockType === "fresh" ? "default" : "outline"}
                      className={`flex-1 ${
                        stockType === "fresh" 
                          ? "bg-green-600 hover:bg-green-700 text-white" 
                          : "hover:bg-green-50 dark:hover:bg-green-950"
                      }`}
                      onClick={() => setStockType("fresh")}
                    >
                      Fresh Stock
                    </Button>
                    <Button
                      type="button"
                      variant={stockType === "offgrade" ? "default" : "outline"}
                      className={`flex-1 ${
                        stockType === "offgrade" 
                          ? "bg-orange-600 hover:bg-orange-700 text-white" 
                          : "hover:bg-orange-50 dark:hover:bg-orange-950"
                      }`}
                      onClick={() => setStockType("offgrade")}
                    >
                      Off Grade/Rejection
                    </Button>
                  </div>
                </div>

                {/* Item Type */}
                <div className="space-y-2">
                  <Label htmlFor="itemType" className="text-foreground font-semibold">
                    Item Type
                  </Label>
                  <FixedSelect 
                    value={itemType} 
                    onValueChange={(value) => setItemType(value as "pm" | "rm" | "fg" | "")}
                    placeholder="Select item type..."
                    options={[
                      { value: "pm", label: "PM" },
                      { value: "rm", label: "RM" },
                      { value: "fg", label: "FG" }
                    ]}
                    className="bg-input border-input"
                  />
                  {isLoadingData && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader className="w-3 h-3 animate-spin" />
                      Loading inventory data...
                    </p>
                  )}
                </div>

                {/* Search Bar for Item Descriptions */}
                {itemType && (
                  <div className="space-y-2 relative">
                    <Label htmlFor="searchItem" className="text-foreground font-semibold">
                      Search Item Description (Quick Search)
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="searchItem"
                        type="text"
                        placeholder="Type to search item descriptions..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setShowSearchResults(e.target.value.length >= 2);
                        }}
                        onFocus={() => {
                          if (searchResults.length > 0) {
                            setShowSearchResults(true);
                          }
                        }}
                        onBlur={(e) => {
                          // Don't hide if clicking on search results
                          const relatedTarget = e.relatedTarget as HTMLElement;
                          if (!relatedTarget || !relatedTarget.closest('.search-results-container')) {
                            // Delay hiding to allow click on results
                            setTimeout(() => setShowSearchResults(false), 200);
                          }
                        }}
                        className="bg-input border-input pl-10"
                        disabled={!itemType || isLoadingData}
                      />
                      {isSearching && (
                        <Loader className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                      
                      {/* Search Results Dropdown */}
                      {showSearchResults && searchResults.length > 0 && (
                        <div className="search-results-container absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {searchResults.map((result, index) => (
                            <button
                              key={index}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault(); // Prevent onBlur from firing first
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("Search result clicked:", result);
                                handleSearchItemSelect(result);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0 transition-colors cursor-pointer"
                            >
                              <div className="font-semibold text-foreground">{result.particulars}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {result.group} • {result.subgroup}
                                {result.uom !== null && result.uom !== undefined && (
                                  <span className="ml-2">• UOM: {formatUOM(result.uom)}</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {showSearchResults && searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-4 text-center text-sm text-muted-foreground">
                          No items found
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Search for item descriptions to auto-fill category, subcategory, and UOM
                    </p>
                  </div>
                )}

                {/* Category (Group) */}
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-foreground font-semibold">
                    Item Category (Group)
                  </Label>
                  {(!itemType || isLoadingData) ? (
                    <div className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {isLoadingData ? "Loading categories..." : "Select item type first..."}
                    </div>
                  ) : (
                    <>
                      <FixedSelect 
                        value={category || ""} 
                        onValueChange={setCategory}
                        placeholder="Select category..."
                        options={[
                          ...categorialData.map(group => ({
                            value: group.name,
                            label: group.name
                          })),
                          { value: "OTHER", label: "Other (Custom Category)" }
                        ]}
                        className="bg-input border-input"
                      />
                      
                      {/* Custom Category Input - shown when Other is selected */}
                      {category === "OTHER" && (
                        <div className="mt-3 space-y-2">
                          <Label htmlFor="customCategory" className="text-foreground font-semibold text-sm">
                            Unlisted item name
                          </Label>
                          <Input
                            id="customCategory"
                            type="text"
                            placeholder="Enter unlisted item name..."
                            value={customCategory}
                            onChange={(e) => setCustomCategory(e.target.value)}
                            className="bg-input border-input"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Subcategory (Subgroup) */}
                <div className="space-y-2">
                  <Label
                    htmlFor="subcategory"
                    className="text-foreground font-semibold"
                  >
                    Sub-Category (Subgroup)
                  </Label>
                  {(!category || isLoadingData) ? (
                    <div className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {isLoadingData ? "Loading sub-categories..." : "Select category first..."}
                    </div>
                  ) : (
                    <FixedSelect 
                      value={subcategory || ""} 
                      onValueChange={setSubcategory}
                      placeholder="Select sub-category..."
                      options={
                        categorialData
                          .find((g) => g.name === category)
                          ?.subgroups.map((subgroup) => ({
                            value: subgroup.name,
                            label: subgroup.name
                          })) || []
                      }
                      className="bg-input border-input"
                    />
                  )}
                </div>

                {/* Description (Particulars) */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-foreground font-semibold">
                    Item Description (Particulars)
                  </Label>
                  {(!subcategory || isLoadingData) ? (
                    <div className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {isLoadingData ? "Loading descriptions..." : "Select sub-category first..."}
                    </div>
                  ) : (
                    <div className="relative" data-description-dropdown>
                      {/* Search Input */}
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="Search or select description..."
                          value={descriptionSearchQuery || (description && description !== "OTHER" ? description : "")}
                          onChange={(e) => {
                            setDescriptionSearchQuery(e.target.value);
                            if (e.target.value === "" && description) {
                              // Clear selection if search is cleared
                              setDescription("");
                            }
                          }}
                          onFocus={() => setShowDescriptionDropdown(true)}
                          className="bg-input border-input pr-8"
                        />
                        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      </div>
                      
                      {/* Dropdown Results */}
                      {showDescriptionDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-background border border-input rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {(() => {
                            const allOptions = [
                              ...(categorialData
                                .find((g) => g.name === category)
                                ?.subgroups.find((sg) => sg.name === subcategory)
                                ?.particulars.map((particular) => ({
                                  value: particular.name,
                                  label: particular.name,
                                  uom: particular.uom
                                })) || []),
                              { value: "OTHER", label: "Other (Custom Item)", uom: null }
                            ];
                            
                            const filteredOptions = allOptions.filter(option =>
                              option.label.toLowerCase().includes(descriptionSearchQuery.toLowerCase())
                            );
                            
                            if (filteredOptions.length === 0) {
                              return (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  No items found
                                </div>
                              );
                            }
                            
                            return filteredOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                                onClick={() => {
                                  setDescription(option.value);
                                  setDescriptionSearchQuery("");
                                  setShowDescriptionDropdown(false);
                                  
                                  // Auto-fill UOM if available
                                  if (option.value !== "OTHER" && option.uom !== null && option.uom !== undefined) {
                                    setPackageSize(option.uom.toString());
                                  } else if (option.value === "OTHER") {
                                    setPackageSize(""); // Clear UOM for manual entry
                                  }
                                }}
                              >
                                <div className="flex justify-between items-center">
                                  <span>{option.label}</span>
                                  {option.uom !== null && option.uom !== undefined && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatUOM(option.uom)}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Custom Item Name Input - shown when Other is selected */}
                  {description === "OTHER" && (
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="customItemName" className="text-foreground font-semibold text-sm">
                        Custom Item Name
                      </Label>
                      <Input
                        id="customItemName"
                        type="text"
                        placeholder="Enter custom item name..."
                        value={customItemName}
                        onChange={(e) => setCustomItemName(e.target.value)}
                        className="bg-input border-input"
                      />
                      <p className="text-xs text-muted-foreground">
                        This will be saved without category and subcategory
                      </p>
                    </div>
                  )}
                </div>

                {/* UOM */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="packageSize"
                      className="text-foreground font-semibold text-sm sm:text-base"
                    >
                      UOM {packageSize && <span className="text-xs text-blue-600 dark:text-blue-400"></span>}
                    </Label>
                    
                    <Input
                      id="packageSize"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="e.g., 0.250"
                      value={packageSize}
                      onChange={(e) => {
                        // Only allow editing if field is empty (manual entry)
                        if (!packageSize) {
                          const value = e.target.value;
                          if (value === '') {
                            setPackageSize('');
                            return;
                          }
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            setPackageSize(value);
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        // Prevent editing if already has value from search
                        if (packageSize) {
                          e.preventDefault();
                          return;
                        }
                        // Prevent entering minus sign
                        if (e.key === '-' || e.key === 'Minus') {
                          e.preventDefault();
                        }
                      }}
                      className={`bg-input border-input ${packageSize ? 'cursor-not-allowed opacity-70' : ''}`}
                      readOnly={!!packageSize}
                      title={packageSize ? "UOM is auto-filled from search and cannot be edited" : "Enter UOM value"}
                    />
                    {packageSize && !isNaN(parseFloat(packageSize)) && parseFloat(packageSize) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Display: {formatUOM(parseFloat(packageSize))}
                      </p>
                    )}
                    {description === "OTHER" ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Enter UOM manually for custom item</p>
                    ) : !description ? (
                      <p className="text-xs text-muted-foreground">Select description to auto-fill UOM from database</p>
                    ) : null}
                  </div>

                  {/* Units */}
                  <div className="space-y-2">
                    <Label htmlFor="units" className="text-foreground font-semibold text-sm sm:text-base">
                      Number of Units/Qty in kg
                    </Label>
                    <Input
                      id="units"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g., 450.25"
                      value={units}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty value for editing
                        if (value === '') {
                          setUnits('');
                          return;
                        }
                        // Parse the value and check if it's non-negative
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                          setUnits(value);
                        }
                        // If negative or invalid, don't update the state (effectively blocks the input)
                      }}
                      onKeyDown={(e) => {
                        // Prevent entering minus sign
                        if (e.key === '-' || e.key === 'Minus') {
                          e.preventDefault();
                        }
                      }}
                      className="bg-input border-input"
                    />
                  </div>
                </div>

                {/* Auto-calculated Total */}
                {(packageSize || units) && (
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-sm text-muted-foreground mb-1">
                      Total Weight (Auto-calculated)
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {(() => {
                        // Parse both values as floats to preserve decimal precision
                        // If UOM is empty, default to 1.0 (assuming 1 kg per unit)
                        const pkgSize = packageSize ? parseFloat(String(packageSize).trim()) : 1.0;
                        const unitsValue = units ? parseFloat(String(units).trim()) : 0;
                        
                        // Check if values are valid numbers
                        if (isNaN(pkgSize) || isNaN(unitsValue)) {
                          return "0.00";
                        }
                        
                        // Multiply and preserve decimal precision
                        const calculated = pkgSize * unitsValue;
                        // Return with 2 decimal places
                        return calculated.toFixed(2);
                      })()}{" "}
                      kg
                    </p>
                    {!packageSize && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        ⚠ UOM not set - using 1.0 kg per unit as default
                      </p>
                    )}
                  </div>
                )}

                {/* Add Button */}
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Article
                </Button>
              </form>
            </Card>
          </div>

          {/* Summary Section */}
          <div>
            <div className="lg:sticky lg:top-20 space-y-4">
              {/* Summary Card */}
              <Card className="p-4 sm:p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <h3 className="font-semibold text-sm sm:text-base text-blue-900 dark:text-blue-100 mb-4">
                  Items Added: {addedItems.length}
                </h3>

                <div className="space-y-2 max-h-64 sm:max-h-96 overflow-y-auto">
                  {Object.keys(groupedItems).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No items added yet
                    </p>
                  ) : (
                    Object.entries(groupedItems).map(([category, items]) => {
                      const isExpanded = expandedCategories.has(category);
                      const totalItemsInCategory = Object.values(items).reduce((sum, item) => sum + item.quantities.length, 0);
                      return (
                        <div key={category} className="space-y-1">
                          {/* Category Header - Clickable */}
                          <button
                            onClick={() => toggleCategory(category)}
                            className="w-full flex items-center justify-between p-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-md transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-blue-700 dark:text-blue-300" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-blue-700 dark:text-blue-300" />
                              )}
                              <span className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                                {category}
                              </span>
                              <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-200 dark:bg-blue-800 px-2 py-0.5 rounded-full">
                                {totalItemsInCategory} {totalItemsInCategory === 1 ? 'entry' : 'entries'}
                              </span>
                            </div>
                          </button>

                          {/* Category Items - Expandable */}
                          {isExpanded && (
                            <div className="space-y-2 sm:space-y-3 ml-2 sm:ml-4 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                              {Object.entries(items).map(([itemKey, itemData]) => {
                                const { itemInfo, quantities } = itemData;
                                const isAddingQt = addingQuantityTo === itemKey;
                                const totalWeight = quantities.reduce((sum, qty) => sum + qty.totalWeight, 0);
                                
                                return (
                                  <div key={itemKey} className="bg-white dark:bg-slate-950 border border-border rounded-lg overflow-hidden">
                                    {/* Item Header */}
                                    <div className="p-2 sm:p-4 bg-gray-50 dark:bg-slate-800 border-b border-border">
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                                            <div className="flex-1">
                                              <h4 className="font-semibold text-xs sm:text-base text-foreground uppercase leading-tight">
                                                {itemInfo.subcategory}
                                              </h4>
                                              <p className="text-2xs sm:text-sm text-muted-foreground line-clamp-2">
                                                {itemInfo.description}
                                              </p>
                                            </div>
                                            {itemInfo.stockType && (
                                              <span className={`shrink-0 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-2xs sm:text-xs font-semibold ${
                                                itemInfo.stockType === "Fresh Stock" 
                                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                                  : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                                              }`}>
                                                {itemInfo.stockType}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        
                                        {/* Mobile: Stack total and buttons vertically */}
                                        <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-end gap-2 sm:gap-2">
                                          <div className="text-left sm:text-right">
                                            <p className="text-2xs sm:text-xs text-muted-foreground">Total Weight</p>
                                            <p className="font-bold text-primary text-xs sm:text-base">{totalWeight.toFixed(2)} kg</p>
                                          </div>
                                          
                                          <div className="flex items-center gap-2">
                                            {!isAddingQt && (
                                              <button
                                                onClick={() => handleAddMoreQt(itemKey)}
                                                className="flex items-center justify-center w-8 h-8 sm:w-auto sm:h-8 sm:px-3 bg-primary text-white text-xs sm:text-sm font-medium rounded-md hover:bg-primary/90 transition-colors touch-manipulation"
                                                title="Add more quantity"
                                              >
                                                <Plus className="w-4 h-4 sm:w-4 sm:h-4" />
                                                <span className="hidden sm:inline ml-1">Add</span>
                                              </button>
                                            )}
                                            <button
                                              onClick={() => {
                                                // Remove all quantities for this item
                                                const idsToRemove = quantities.map(q => q.id);
                                                setAddedItems(prev => prev.filter(item => !idsToRemove.includes(item.id)));
                                              }}
                                              className="flex items-center justify-center w-8 h-8 sm:w-8 sm:h-8 text-destructive hover:bg-destructive/10 rounded-md transition-colors touch-manipulation"
                                              title="Delete all quantities of this item"
                                            >
                                              <Trash2 className="w-4 h-4 sm:w-3 sm:h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Quantity Rows */}
                                    <div className="divide-y divide-border">
                                      {quantities.map((qty, index) => (
                                        <div key={qty.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-1.5 sm:p-4 hover:bg-muted/30 gap-1 sm:gap-3">
                                          <div className="flex items-center gap-2 sm:gap-3 flex-1">
                                            <span className="w-5 h-5 sm:w-7 sm:h-7 bg-primary/10 text-primary text-2xs sm:text-sm font-bold rounded-full flex items-center justify-center shrink-0">
                                              {index + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs sm:text-base font-medium text-foreground">
                                                {qty.units % 1 === 0 ? qty.units : qty.units.toFixed(2)} units
                                              </p>
                                            </div>
                                          </div>
                                          
                                          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
                                            <span className="text-xs sm:text-base font-semibold text-foreground">
                                              [{qty.totalWeight.toFixed(2)} kg]
                                            </span>
                                            <button
                                              onClick={() => handleRemoveItem(qty.id)}
                                              className="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 text-destructive hover:bg-destructive/10 rounded-md transition-colors touch-manipulation shrink-0"
                                              title="Delete this quantity"
                                            >
                                              <Trash2 className="w-4 h-4 sm:w-3 sm:h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                      
                                      {/* Add Quantity Input Row */}
                                      {isAddingQt && (
                                        <div className="p-1.5 sm:p-4 bg-primary/5 border-t-2 border-primary/20">
                                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-3">
                                            <Input
                                              type="number"
                                              step="0.01"
                                              placeholder="Enter quantity (e.g., 450.25)"
                                              value={newQuantity}
                                              onChange={(e) => setNewQuantity(e.target.value)}
                                              className="h-9 sm:h-9 text-xs sm:text-sm flex-1 bg-background"
                                              autoFocus
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  handleSubmitAddQt(itemKey);
                                                } else if (e.key === "Escape") {
                                                  handleCancelAddQt();
                                                }
                                              }}
                                            />
                                            <div className="flex gap-2">
                                              <Button
                                                size="sm"
                                                onClick={() => handleSubmitAddQt(itemKey)}
                                                className="h-9 sm:h-9 px-3 sm:px-3 bg-green-600 hover:bg-green-700 text-white touch-manipulation flex-1 sm:flex-none text-xs sm:text-sm"
                                                disabled={!newQuantity || parseFloat(newQuantity) <= 0 || isNaN(parseFloat(newQuantity))}
                                              >
                                                <Check className="w-3 h-3 sm:w-3 sm:h-3 sm:mr-1" />
                                                <span className="sm:hidden text-2xs">Add</span>
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={handleCancelAddQt}
                                                className="h-9 sm:h-9 px-3 sm:px-3 touch-manipulation flex-1 sm:flex-none text-xs sm:text-sm"
                                              >
                                                <X className="w-3 h-3 sm:w-3 sm:h-3 sm:mr-1" />
                                                <span className="sm:hidden text-2xs">Cancel</span>
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Total Weight */}
                {addedItems.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">
                      Total Floor Weight
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-primary">
                      {totalFloorWeight.toFixed(2)} kg
                    </p>
                  </div>
                )}
              </Card>

              {/* Action Button */}
              {addedItems.length > 0 && (
                <Button
                  onClick={handleSaveAndContinue}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save & Continue"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteItem}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
