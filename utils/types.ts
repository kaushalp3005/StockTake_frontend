// Shared frontend types for StockTake application
// Master Prompt V_Final — updated types

// Append-only edit record — entryDate is immutable (G2)
export interface EntryEdit {
  editedAt: string;    // ISO datetime
  editedBy: string;
  field: string;       // "units" | "kg" | "type" | "add_units"
  oldValue: number;
  newValue: number;
  entryDate: string;   // locked — never changes
}

// Reassignment log (E5)
export interface ReassignmentLog {
  fromItem:     string;
  toItem:       string;
  reassignedAt: string;   // ISO datetime
  reassignedBy: string;
  entryIds:     string[];
}

// Deletion log (E7)
export interface DeletionLog {
  entryId:      string;
  itemId:       string;
  itemName:     string;
  deletedAt:    string;
  deletedBy:    string;   // must be INVENTORY_MANAGER
  originalData: {
    qty:       number;
    kg:        number;
    createdBy: string;
    entryDate: string;
    type:      string;
  };
  reason?:      string;
}

// Individual stocktake entry
export interface ItemEntry {
  id: string;
  entryId?: string;
  description: string;
  itemType?: string;    // "FG" | "RM" | "PM"
  category: string;
  subcategory: string;
  packageSize: number;  // kg per unit
  units: number;
  totalWeight: number;
  userName: string;
  userEmail?: string;
  sessionId?: string;
  stockType?: string;   // "Fresh Stock" | "Off Grade/Rejection"
  isChecked?: boolean;
  entryDate?: string;   // original immutable entry date (createdAt)
  verified?: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  remark?: string | null;
  edits?: EntryEdit[];  // append-only edit history
  createdAt?: string;
  updatedAt?: string;
  warehouse?: string;
  floorName?: string;
  status?: "draft" | "submitted";
}

// Grouped entries by item name
export interface GroupedItem {
  description: string;
  category: string;
  subcategory: string;
  itemType?: string;
  entries: ItemEntry[];
  totalEntries: number;
  totalQuantity: number;
  totalWeight: number;
}

// Floor session (from FLOOR_MANAGER dashboard)
export interface FloorSession {
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

// User roles
export type UserRole = "FLOOR_MANAGER" | "INVENTORY_MANAGER" | "ADMIN" | "SUPERUSER";

export interface User {
  id?: string;
  email: string;
  name?: string;
  username?: string;
  role: UserRole;
}
