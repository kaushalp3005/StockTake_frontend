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
import { Trash2, Plus, ArrowLeft, Package, Loader, X, Check, ChevronDown, ChevronRight } from "lucide-react";
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
  const [itemType, setItemType] = useState<"pm" | "rm" | "fg" | "">("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
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
  }, [navigate]);

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
        setCategorialData(data.groups || []);
        // Reset dependent fields
        setCategory("");
        setSubcategory("");
        setDescription("");
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

  // Reset subcategory and description when category changes
  useEffect(() => {
    if (!category) {
      setSubcategory("");
      setDescription("");
    }
  }, [category]);

  // Reset description when subcategory changes
  useEffect(() => {
    if (!subcategory) {
      setDescription("");
      setPackageSize("");
    }
  }, [subcategory]);

  // Auto-fill UOM when description is selected
  useEffect(() => {
    if (description && category && subcategory) {
      const selectedParticular = categorialData
        .find((g) => g.name === category)
        ?.subgroups.find((sg) => sg.name === subcategory)
        ?.particulars.find((p) => p.name === description);

      if (selectedParticular && selectedParticular.uom !== null && selectedParticular.uom !== undefined) {
        // Format UOM with 3 decimal places
        const formattedUom = selectedParticular.uom.toFixed(3);
        setPackageSize(formattedUom);
      } else {
        setPackageSize("");
      }
    }
  }, [description, category, subcategory, categorialData]);

  // Auto-calculate total weight
  const calculateTotalWeight = (pkgSize: number, qty: number): number => {
    return pkgSize * qty;
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!itemType || !category || !subcategory || !description || !packageSize || !units) {
      setError("All fields are required");
      return;
    }

    const pkgSizeNum = parseFloat(packageSize);
    const unitsNum = parseInt(units, 10);

    if (isNaN(pkgSizeNum) || isNaN(unitsNum) || pkgSizeNum <= 0 || unitsNum <= 0) {
      setError("UOM and units must be valid positive numbers");
      return;
    }

    const totalWeight = calculateTotalWeight(pkgSizeNum, unitsNum);

    const newItem: AddedItem = {
      id: `item-${Date.now()}`,
      itemType: itemType.toUpperCase(),
      category: category.toUpperCase(),
      subcategory: subcategory.toUpperCase(),
      description: description.toUpperCase(),
      packageSize: pkgSizeNum,
      units: unitsNum,
      totalWeight,
    };

    setAddedItems([...addedItems, newItem]);

    // Reset form (keep item type)
    setCategory("");
    setSubcategory("");
    setDescription("");
    setPackageSize("");
    setUnits("");
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

  // Group items by category
  const groupedItems = addedItems.reduce((acc, item) => {
    const category = item.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, AddedItem[]>);

  const handleAddMoreQt = (itemId: string) => {
    setAddingQuantityTo(itemId);
    setNewQuantity("");
    setError("");
  };

  const handleCancelAddQt = () => {
    setAddingQuantityTo(null);
    setNewQuantity("");
  };

  const handleSubmitAddQt = (itemId: string) => {
    if (!newQuantity || isNaN(parseInt(newQuantity, 10)) || parseInt(newQuantity, 10) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }

    const existingItem = addedItems.find((item) => item.id === itemId);
    if (!existingItem) {
      setError("Item not found");
      return;
    }

    const newUnits = parseInt(newQuantity, 10);
    const totalWeight = calculateTotalWeight(existingItem.packageSize, newUnits);

    const newItem: AddedItem = {
      id: `item-${Date.now()}`,
      itemType: existingItem.itemType,
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

                {/* Item Type */}
                <div className="space-y-2">
                  <Label htmlFor="itemType" className="text-foreground font-semibold">
                    Item Type
                  </Label>
                  <Select value={itemType} onValueChange={(value) => setItemType(value as "pm" | "rm" | "fg" | "")}>
                    <SelectTrigger id="itemType" className="bg-input border-input">
                      <SelectValue placeholder="Select item type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pm">PM</SelectItem>
                      <SelectItem value="rm">RM</SelectItem>
                      <SelectItem value="fg">FG</SelectItem>
                    </SelectContent>
                  </Select>
                  {isLoadingData && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader className="w-3 h-3 animate-spin" />
                      Loading inventory data...
                    </p>
                  )}
                </div>

                {/* Category (Group) */}
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-foreground font-semibold">
                    Item Category (Group)
                  </Label>
                  <Select value={category} onValueChange={setCategory} disabled={!itemType || isLoadingData}>
                    <SelectTrigger id="category" className="bg-input border-input">
                      <SelectValue placeholder="Select category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingData ? (
                        <div className="py-6 px-2 flex flex-col items-center justify-center gap-2">
                          <Loader className="w-5 h-5 animate-spin text-primary" />
                          <p className="text-xs text-muted-foreground animate-pulse">Loading categories...</p>
                        </div>
                      ) : categorialData.length === 0 ? (
                        <div className="py-4 px-2 text-center text-sm text-muted-foreground">
                          No categories available
                        </div>
                      ) : (
                        categorialData.map((group, index) => (
                          <SelectItem 
                            key={group.name} 
                            value={group.name}
                          >
                            {group.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subcategory (Subgroup) */}
                <div className="space-y-2">
                  <Label
                    htmlFor="subcategory"
                    className="text-foreground font-semibold"
                  >
                    Sub-Category (Subgroup)
                  </Label>
                  <Select value={subcategory} onValueChange={setSubcategory} disabled={!category || isLoadingData}>
                    <SelectTrigger
                      id="subcategory"
                      className="bg-input border-input"
                      disabled={!category}
                    >
                      <SelectValue placeholder="Select sub-category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingData ? (
                        <div className="py-6 px-2 flex flex-col items-center justify-center gap-2">
                          <Loader className="w-5 h-5 animate-spin text-primary" />
                          <p className="text-xs text-muted-foreground animate-pulse">Loading sub-categories...</p>
                        </div>
                      ) : !category ? (
                        <div className="py-4 px-2 text-center text-sm text-muted-foreground">
                          Please select a category first
                        </div>
                      ) : categorialData.find((g) => g.name === category)?.subgroups.length === 0 ? (
                        <div className="py-4 px-2 text-center text-sm text-muted-foreground">
                          No sub-categories available
                        </div>
                      ) : (
                        categorialData
                          .find((g) => g.name === category)
                          ?.subgroups.map((subgroup) => (
                            <SelectItem 
                              key={subgroup.name} 
                              value={subgroup.name}
                            >
                              {subgroup.name}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description (Particulars) */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-foreground font-semibold">
                    Item Description (Particulars)
                  </Label>
                  <Select value={description} onValueChange={setDescription} disabled={!subcategory || isLoadingData}>
                    <SelectTrigger
                      id="description"
                      className="bg-input border-input"
                      disabled={!subcategory}
                    >
                      <SelectValue placeholder="Select description..." />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingData ? (
                        <div className="py-6 px-2 flex flex-col items-center justify-center gap-2">
                          <Loader className="w-5 h-5 animate-spin text-primary" />
                          <p className="text-xs text-muted-foreground animate-pulse">Loading descriptions...</p>
                        </div>
                      ) : !subcategory ? (
                        <div className="py-4 px-2 text-center text-sm text-muted-foreground">
                          Please select a sub-category first
                        </div>
                      ) : categorialData
                          .find((g) => g.name === category)
                          ?.subgroups.find((sg) => sg.name === subcategory)
                          ?.particulars.length === 0 ? (
                        <div className="py-4 px-2 text-center text-sm text-muted-foreground">
                          No descriptions available
                        </div>
                      ) : (
                        categorialData
                          .find((g) => g.name === category)
                          ?.subgroups.find((sg) => sg.name === subcategory)
                          ?.particulars.map((particular) => (
                            <SelectItem 
                              key={particular.name} 
                              value={particular.name}
                            >
                              {particular.name}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* UOM */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="packageSize"
                      className="text-foreground font-semibold text-sm sm:text-base"
                    >
                      UOM
                    </Label>
                    <Input
                      id="packageSize"
                      type="number"
                      step="0.001"
                      placeholder="e.g., 0.250"
                      value={packageSize}
                      onChange={(e) => setPackageSize(e.target.value)}
                      className="bg-input border-input"
                    />
                    {packageSize && !isNaN(parseFloat(packageSize)) && parseFloat(packageSize) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Display: {formatUOM(parseFloat(packageSize))}
                      </p>
                    )}
                    {!description && (
                      <p className="text-xs text-muted-foreground">Select description to auto-fill UOM from database</p>
                    )}
                  </div>

                  {/* Units */}
                  <div className="space-y-2">
                    <Label htmlFor="units" className="text-foreground font-semibold text-sm sm:text-base">
                      Number of Units
                    </Label>
                    <Input
                      id="units"
                      type="number"
                      placeholder="e.g., 10"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      className="bg-input border-input"
                    />
                  </div>
                </div>

                {/* Auto-calculated Total */}
                {packageSize && units && (
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-sm text-muted-foreground mb-1">
                      Total Weight (Auto-calculated)
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {(
                        parseFloat(packageSize) * parseInt(units, 10)
                      ).toFixed(2)}{" "}
                      kg
                    </p>
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
                      const itemCount = items.length;
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
                                {itemCount} {itemCount === 1 ? 'entry' : 'entries'}
                              </span>
                            </div>
                          </button>

                          {/* Category Items - Expandable */}
                          {isExpanded && (
                            <div className="space-y-2 ml-4 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                              {items.map((item) => {
                                const isAddingQt = addingQuantityTo === item.id;
                                return (
                                  <Card key={item.id} className="p-3 bg-white dark:bg-slate-950">
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-xs sm:text-sm text-foreground">
                                          {item.subcategory}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {item.description}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2">
                                          <p className="text-xs text-muted-foreground">
                                            UOM: {formatUOM(item.packageSize)} × {item.units} units
                                          </p>
                                        </div>
                                        <p className="text-xs font-semibold text-primary mt-1">
                                          Total: {item.totalWeight.toFixed(2)} kg
                                        </p>

                                        {/* Inline Quantity Input */}
                                        {isAddingQt && (
                                          <div className="mt-3 p-2 bg-primary/5 rounded-md border border-primary/20">
                                            <div className="flex items-center gap-2">
                                              <Input
                                                type="number"
                                                placeholder="Enter quantity"
                                                value={newQuantity}
                                                onChange={(e) => setNewQuantity(e.target.value)}
                                                className="h-8 text-xs flex-1 bg-background"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    handleSubmitAddQt(item.id);
                                                  } else if (e.key === "Escape") {
                                                    handleCancelAddQt();
                                                  }
                                                }}
                                              />
                                              <Button
                                                size="sm"
                                                onClick={() => handleSubmitAddQt(item.id)}
                                                className="h-8 px-2 bg-green-600 hover:bg-green-700"
                                                disabled={!newQuantity || parseInt(newQuantity, 10) <= 0}
                                              >
                                                <Check className="w-3 h-3" />
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={handleCancelAddQt}
                                                className="h-8 px-2"
                                              >
                                                <X className="w-3 h-3" />
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex flex-col gap-2 flex-shrink-0">
                                        {!isAddingQt && (
                                          <button
                                            onClick={() => handleAddMoreQt(item.id)}
                                            className="text-xs px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors font-medium"
                                            aria-label="Add more quantity"
                                            title="Add more quantity"
                                          >
                                            Add more qt
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleRemoveItem(item.id)}
                                          className="text-destructive hover:text-destructive/80 transition-colors p-1.5 rounded-md hover:bg-destructive/10 mt-auto"
                                          aria-label="Remove item"
                                          title="Remove item"
                                          disabled={isAddingQt}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </Card>
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
