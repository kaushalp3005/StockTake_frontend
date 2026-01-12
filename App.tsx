import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot, Root } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import StartAudit from "./pages/StartAudit";
import FloorSelection from "./pages/FloorSelection";
import AddItem from "./pages/AddItem";
import EntriesSummary from "./pages/EntriesSummary";
import SubmissionSuccess from "./pages/SubmissionSuccess";
import ManagerReview from "./pages/ManagerReview";
import AllEntriesSummary from "./pages/AllEntriesSummary";
import ResultsheetView from "./pages/ResultsheetView";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

export function RootApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Audit Workflow Routes */}
            <Route path="/audit/start" element={<StartAudit />} />
            <Route path="/audit/floor-selection" element={<FloorSelection />} />
            <Route path="/audit/add-item" element={<AddItem />} />
            <Route path="/audit/entries" element={<EntriesSummary />} />
            <Route path="/audit/submitted" element={<SubmissionSuccess />} />
            <Route path="/review" element={<ManagerReview />} />
            <Route path="/summary" element={<AllEntriesSummary />} />
            <Route path="/resultsheet" element={<ResultsheetView />} />
            <Route path="/resultsheet/:date" element={<ResultsheetView />} />

            {/* Placeholder routes - to be implemented */}
            <Route path="/reports" element={<NotFound />} />
            <Route path="/admin/users" element={<NotFound />} />
            <Route path="/admin/floors" element={<NotFound />} />
            <Route path="/admin/items" element={<NotFound />} />
            <Route path="/admin/exports" element={<NotFound />} />
            {/* Catch all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// Store root instance globally to prevent multiple root creation on HMR
declare global {
  var __APP_ROOT__: Root | undefined;
}

const container = document.getElementById("root");
if (container) {
  if (!globalThis.__APP_ROOT__) {
    globalThis.__APP_ROOT__ = createRoot(container);
  }
  globalThis.__APP_ROOT__.render(<RootApp />);
}
