// API utility functions for frontend

const API_BASE = "/api";

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

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Check if response has content
  const contentType = response.headers.get("content-type");
  let data;
  
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    console.error("Non-JSON response:", text);
    throw new APIError(response.status, { message: text }, "Invalid response format");
  }

  if (!response.ok) {
    console.error("API Error:", response.status, data);
    throw new APIError(response.status, data, data.error || "API Error");
  }

  return data;
}

// Auth API
export const authAPI = {
  login: (email: string, password: string) =>
    apiFetch("/auth/login", {
      method: "POST",
      body: { email, password },
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
