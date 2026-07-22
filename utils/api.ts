// API utility functions for frontend

// Use environment variable or default to local proxy
// For local development with Render backend, set VITE_API_URL=https://stocktake-backend2.onrender.com


// Debug environment variables
console.log("🔍 VITE_API_URL from env:", import.meta.env.VITE_API_URL);
console.log("🔍 All env vars:", import.meta.env);

const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

// Debug: Log API base URL (remove in production)
console.log("🔗 API Base URL:", API_BASE);

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: any;
  headers?: Record<string, string>;
}

export class APIError extends Error {
  constructor(
    public status: number,
    public data: any,
    message: string
  ) {
    super(message);
  }
}

async function apiFetch(
  endpoint: string,
  options: RequestOptions = {}
): Promise<any> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    console.log("📤 API Request:", {
      url: `${API_BASE}${endpoint}`,
      method: options.method || "GET",
      body: options.body,
      headers: headers
    });
    
    response = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  } catch (networkError: any) {
    console.error("Network error:", networkError);
    throw new APIError(0, { message: networkError.message }, "Network error: Unable to connect to server");
  }

  // Check if response has content
  const contentType = response.headers.get("content-type");
  let data;
  
  try {
  if (contentType && contentType.includes("application/json")) {
      const text = await response.text();
      if (!text) {
        throw new APIError(response.status, { message: "Empty response" }, "Server returned empty response");
      }
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error("JSON parse error. Response text:", text);
        throw new APIError(response.status, { message: text }, "Invalid JSON response from server");
      }
  } else {
    const text = await response.text();
      console.error("Non-JSON response:", {
        status: response.status,
        statusText: response.statusText,
        contentType,
        text: text.substring(0, 500) // Limit log size
      });
      throw new APIError(response.status, { message: text || "Invalid response format" }, `Server returned ${contentType || "unknown"} instead of JSON`);
    }
  } catch (error) {
    // Re-throw APIError, but wrap other errors
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(response.status, { message: String(error) }, "Failed to parse server response");
  }

  if (!response.ok) {
    console.error("API Error:", response.status, data);
    throw new APIError(response.status, data, data?.error || "API Error");
  }

  return data;
}

// Auth API
export const authAPI = {
  login: (username: string, password: string) => {
    console.log("🔐 Login attempt:", { 
      username: username || "[empty]", 
      password: password ? "[provided]" : "[empty]",
      usernameLength: username?.length || 0,
      passwordLength: password?.length || 0
    });
    return apiFetch("/auth/login", {
      method: "POST",
      body: { username, password },
    });
  },

  register: (email: string, password: string, name: string, role?: string) =>
    apiFetch("/auth/register", {
      method: "POST",
      body: { email, password, name, role },
    }),

  me: () => apiFetch("/auth/me"),
};

// Warehouses API
export const warehousesAPI = {
  getUserWarehouses: () => apiFetch("/warehouses"),
  getWarehouse: (warehouseId: string) => apiFetch(`/warehouses/${warehouseId}`),
};

// Floors API
export const floorsAPI = {
  getUserFloors: () => apiFetch("/floors"),

  getAllFloors: () => apiFetch("/floors/all"),

  createFloor: (name: string, location?: string) =>
    apiFetch("/floors", {
      method: "POST",
      body: { name, location },
    }),

  getSessions: (floorId: string) =>
    apiFetch(`/floors/${floorId}/sessions`),

  getTodaySession: (floorId: string, shift?: string) =>
    apiFetch(`/floors/${floorId}/sessions/today`, {
      method: "POST",
      body: { shift },
    }),

  getSession: (sessionId: string) => apiFetch(`/sessions/${sessionId}`),

  submitSession: (sessionId: string) =>
    apiFetch(`/sessions/${sessionId}/submit`, {
      method: "POST",
    }),

  approveSession: (sessionId: string) =>
    apiFetch(`/sessions/${sessionId}/approve`, {
      method: "POST",
    }),
};

// Pallets API
export const palletsAPI = {
  createPallet: (sessionId: string, locationNote?: string) =>
    apiFetch(`/sessions/${sessionId}/pallets`, {
      method: "POST",
      body: { locationNote },
    }),

  updatePallet: (palletId: string, locationNote?: string) =>
    apiFetch(`/pallets/${palletId}`, {
      method: "PATCH",
      body: { locationNote },
    }),

  deletePallet: (palletId: string) =>
    apiFetch(`/pallets/${palletId}`, {
      method: "DELETE",
    }),
};

// Stock Lines API
export const stockAPI = {
  addStockLine: (
    palletId: string,
    itemId: string,
    units: number,
    measuredKg?: number,
    remark?: string
  ) =>
    apiFetch(`/pallets/${palletId}/stock`, {
      method: "POST",
      body: { itemId, units, measuredKg, remark },
    }),

  updateStockLine: (
    stockLineId: string,
    units?: number,
    measuredKg?: number,
    remark?: string
  ) =>
    apiFetch(`/stock/${stockLineId}`, {
      method: "PATCH",
      body: { units, measuredKg, remark },
    }),

  deleteStockLine: (stockLineId: string) =>
    apiFetch(`/stock/${stockLineId}`, {
      method: "DELETE",
    }),

  getItems: () => apiFetch("/items"),

  createItem: (name: string, unitName: string, kgPerUnit: number) =>
    apiFetch("/items", {
      method: "POST",
      body: { name, unitName, kgPerUnit },
    }),
};

// Export API
export const exportsAPI = {
  generateExport: (date: string) =>
    apiFetch("/export/generate", {
      method: "POST",
      body: { date },
    }),

  getExports: () => apiFetch("/exports"),
};

// Categorial Inventory API
export const categorialInvAPI = {
  getByItemType: (itemType: "pm" | "rm" | "fg") =>
    apiFetch(`/categorial-inv/${itemType}`),

  searchDescriptions: (itemType: "pm" | "rm" | "fg", query: string) => {
    const params = new URLSearchParams({ query });
    return apiFetch(`/categorial-inv/${itemType}/search?${params.toString()}`);
  },
};

// StockTake Entries API
export const stocktakeEntriesAPI = {
  submitEntries: (entries: any[]) =>
    apiFetch("/stocktake-entries/submit", {
      method: "POST",
      body: { entries },
    }),

  // Draft entry operations - save items to DB immediately
  addDraftEntry: (entry: any) =>
    apiFetch("/stocktake-entries/draft", {
      method: "POST",
      body: entry,
    }),

  getDraftEntries: (params?: {
    warehouse?: string;
    floorName?: string;
    enteredByEmail?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.warehouse) queryParams.append("warehouse", params.warehouse);
    if (params?.floorName) queryParams.append("floorName", params.floorName);
    if (params?.enteredByEmail) queryParams.append("enteredByEmail", params.enteredByEmail);
    const queryString = queryParams.toString();
    return apiFetch(`/stocktake-entries/drafts${queryString ? `?${queryString}` : ""}`);
  },

  finalizeDraftEntries: (params: {
    warehouse: string;
    floorName: string;
    enteredByEmail?: string;
  }) =>
    apiFetch("/stocktake-entries/finalize-drafts", {
      method: "POST",
      body: params,
    }),


  getEntries: (params?: {
    warehouse?: string;
    floorName?: string;
    itemName?: string;
    enteredBy?: string;
    itemType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.warehouse) queryParams.append("warehouse", params.warehouse);
    if (params?.floorName) queryParams.append("floorName", params.floorName);
    if (params?.itemName) queryParams.append("itemName", params.itemName);
    if (params?.enteredBy) queryParams.append("enteredBy", params.enteredBy);
    if (params?.itemType) queryParams.append("itemType", params.itemType);
    if (params?.startDate) queryParams.append("startDate", params.startDate);
    if (params?.endDate) queryParams.append("endDate", params.endDate);
    if (params?.limit) queryParams.append("limit", params.limit.toString());

    const queryString = queryParams.toString();
    return apiFetch(`/stocktake-entries${queryString ? `?${queryString}` : ""}`);
  },

  // Get recent entries (shorthand for getEntries with limit)
  getRecentEntries: (limit: number = 10) => {
    return apiFetch(`/stocktake-entries?limit=${limit}`);
  },

  getAvailableDates: () => apiFetch("/stocktake-entries/available-dates"),

  getGroupedEntries: (
    warehouse: string,
    floorName: string,
    range?: { startDate?: string; endDate?: string } | string,
  ) => {
    const params = new URLSearchParams({
      warehouse: warehouse,
      floorName: floorName,
    });
    // A bare string is treated as a single-day filter (back-compat); an object
    // scopes the grouped result to the selected [startDate, endDate] range.
    if (typeof range === "string") {
      if (range) params.append("date", range);
    } else if (range) {
      if (range.startDate) params.append("startDate", range.startDate);
      if (range.endDate) params.append("endDate", range.endDate);
    }
    return apiFetch(`/stocktake-entries/grouped?${params.toString()}`);
  },

  updateEntry: (entryId: string, data: any) =>
    apiFetch(`/stocktake-entries/${entryId}`, {
      method: "PUT",
      body: data,
    }),

  deleteEntry: (entryId: string) =>
    apiFetch(`/stocktake-entries/${entryId}`, {
      method: "DELETE",
    }),

  deleteEntriesBySession: (params: {
    warehouse: string;
    floorName: string;
    enteredBy: string;
    sessionId?: string;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.append("warehouse", params.warehouse);
    queryParams.append("floorName", params.floorName);
    queryParams.append("enteredBy", params.enteredBy);
    if (params.sessionId) queryParams.append("sessionId", params.sessionId);
    
    return apiFetch(`/stocktake-entries/delete-session?${queryParams.toString()}`, {
      method: "DELETE",
    });
  },

  getAuditStatus: (warehouse: string) =>
    apiFetch(`/stocktake-entries/audit-status?warehouse=${encodeURIComponent(warehouse)}`),

  saveResultsheet: (entries: Array<{ entryId: string; warehouse: string; floorName: string }>, date?: string) =>
    apiFetch("/stocktake-entries/save-resultsheet", {
      method: "POST",
      body: { entries, date },
    }),

  clearAllEntries: () =>
    apiFetch("/stocktake-entries/clear-all", {
      method: "DELETE",
    }),

  clearWarehouseEntries: (warehouse: string) =>
    apiFetch(`/stocktake-entries/warehouse/${encodeURIComponent(warehouse)}`, {
      method: "DELETE",
    }),

  clearFloorEntries: (warehouse: string, floor: string) =>
    apiFetch(`/stocktake-entries/warehouse/${encodeURIComponent(warehouse)}/floor/${encodeURIComponent(floor)}`, {
      method: "DELETE",
    }),

  exportEntries: async (filters: {
    warehouse?: string;
    floorName?: string;
    startDate?: string;
    endDate?: string;
    enteredBy?: string;
  }) => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/export/stocktake-entries`, {
      method: "POST",
      headers,
      body: JSON.stringify(filters),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Export failed");
    }

    return response; // Return the response for blob handling
  },
};

// Stocktake Resultsheet API
export const resultsheetAPI = {
  getList: () => apiFetch("/stocktake-resultsheet/list"),

  getData: (date: string) => apiFetch(`/stocktake-resultsheet/${encodeURIComponent(date)}`),

  getMergedData: (dates: string[]) =>
    apiFetch(`/stocktake-resultsheet/merged?dates=${dates.join(",")}`),

  delete: (date: string) =>
    apiFetch(`/stocktake-resultsheet/${encodeURIComponent(date)}`, {
      method: "DELETE",
    }),
};

// Audits API
export const auditsAPI = {
  startAudit: (warehouseIdOrName: string, auditDate: string, auditTime?: string, isName: boolean = false) =>
    apiFetch("/audits/start", {
      method: "POST",
      body: isName
        ? { warehouseName: warehouseIdOrName, auditDate, auditTime }
        : { warehouseId: warehouseIdOrName, auditDate, auditTime },
    }),

  getAudit: (auditId: string) => apiFetch(`/audits/${auditId}`),

  getWarehouseAudits: (warehouseId: string) =>
    apiFetch(`/audits/warehouse/${warehouseId}`),
};

export const floorReviewAPI = {
  saveFloorReview: (entryIds: string[]) =>
    apiFetch("/floor-review-records", {
      method: "POST",
      body: { entryIds },
    }),

  getFloorReview: (warehouse: string, floorName: string) =>
    apiFetch(`/floor-review-records?warehouse=${encodeURIComponent(warehouse)}&floorName=${encodeURIComponent(floorName)}`),
};


export interface ManagedUser {
  id: string;
  username: string;
  warehouse: string | null;
  role: string;
  name: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedUserInput {
  username?: string;
  password?: string;
  name?: string | null;
  email?: string | null;
  warehouse?: string | null;
  role?: string;
  isActive?: boolean;
}

// Manage Users CRUD (FLOOR_MANAGER only)
export const usersAPI = {
  list: (): Promise<{ success: boolean; count: number; users: ManagedUser[] }> =>
    apiFetch("/users"),

  create: (payload: ManagedUserInput): Promise<{ success: boolean; user: ManagedUser }> =>
    apiFetch("/users", { method: "POST", body: payload }),

  update: (id: string, payload: ManagedUserInput): Promise<{ success: boolean; user: ManagedUser }> =>
    apiFetch(`/users/${encodeURIComponent(id)}`, { method: "PUT", body: payload }),

  remove: (id: string): Promise<{ success: boolean; deletedId: string }> =>
    apiFetch(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

// Box QR-code lookup (CDPL / CFPL)
export const boxesAPI = {
  /**
   * Look up a box by its QR-code data.
   * Returns item details for StockTake form pre-fill.
   */
  lookup: (boxId: string, txnNo: string): Promise<{
    boxId: string;
    txnNo: string;
    itemName: string;
    itemType: string;
    category: string;
    subcategory: string;
    unitUom: number;
    source: "CDPL" | "CFPL";
  }> =>
    apiFetch(`/boxes/lookup?box_id=${encodeURIComponent(boxId)}&txn_no=${encodeURIComponent(txnNo)}`),
};
