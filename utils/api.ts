// API utility functions for frontend

// Use environment variable or default to local proxy
// For local development with Render backend, set VITE_API_URL=https://stocktake-backend2.onrender.com
const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

// Debug: Log API base URL (remove in production)
if (import.meta.env.DEV) {
  console.log("🔗 API Base URL:", API_BASE);
}

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
  login: (username: string, password: string) =>
    apiFetch("/auth/login", {
      method: "POST",
      body: { username, password },
    }),

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

  getEntries: (params?: {
    warehouse?: string;
    floorName?: string;
    itemName?: string;
    enteredBy?: string;
    itemType?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.warehouse) queryParams.append("warehouse", params.warehouse);
    if (params?.floorName) queryParams.append("floorName", params.floorName);
    if (params?.itemName) queryParams.append("itemName", params.itemName);
    if (params?.enteredBy) queryParams.append("enteredBy", params.enteredBy);
    if (params?.itemType) queryParams.append("itemType", params.itemType);
    if (params?.startDate) queryParams.append("startDate", params.startDate);
    if (params?.endDate) queryParams.append("endDate", params.endDate);
    
    const queryString = queryParams.toString();
    return apiFetch(`/stocktake-entries${queryString ? `?${queryString}` : ""}`);
  },

  getGroupedEntries: (warehouse: string, floorName: string) =>
    apiFetch(`/stocktake-entries/grouped?warehouse=${encodeURIComponent(warehouse)}&floorName=${encodeURIComponent(floorName)}`),

  updateEntry: (entryId: string, data: any) =>
    apiFetch(`/stocktake-entries/${entryId}`, {
      method: "PUT",
      body: data,
    }),

  deleteEntry: (entryId: string) =>
    apiFetch(`/stocktake-entries/${entryId}`, {
      method: "DELETE",
    }),

  getAuditStatus: (warehouse: string) =>
    apiFetch(`/stocktake-entries/audit-status?warehouse=${encodeURIComponent(warehouse)}`),

  saveResultsheet: (entries: Array<{ entryId: string; warehouse: string; floorName: string }>) =>
    apiFetch("/stocktake-entries/save-resultsheet", {
      method: "POST",
      body: { entries },
    }),

  clearAllEntries: () =>
    apiFetch("/stocktake-entries/clear-all", {
      method: "DELETE",
    }),
};

// Stocktake Resultsheet API
export const resultsheetAPI = {
  getList: () => apiFetch("/stocktake-resultsheet/list"),

  getData: (date: string) => apiFetch(`/stocktake-resultsheet/${encodeURIComponent(date)}`),

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
