import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot, Root } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
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
import UpdateSku from "./pages/UpdateSku";
import ManageUsers from "./pages/ManageUsers";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// C2: Animated route wrapper — page transitions 0.22s cubic-bezier(0.4,0,0.2,1)
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<ErrorBoundary pageName="Home"><PageTransition><Index /></PageTransition></ErrorBoundary>} />
        <Route path="/login" element={<ErrorBoundary pageName="Login"><PageTransition><Login /></PageTransition></ErrorBoundary>} />
        <Route path="/dashboard" element={<ErrorBoundary pageName="Dashboard"><PageTransition><Dashboard /></PageTransition></ErrorBoundary>} />

        {/* Stocktake Workflow Routes */}
        <Route path="/audit/start" element={<ErrorBoundary pageName="Start Stocktake"><PageTransition><StartAudit /></PageTransition></ErrorBoundary>} />
        <Route path="/audit/floor-selection" element={<ErrorBoundary pageName="Floor Selection"><PageTransition><FloorSelection /></PageTransition></ErrorBoundary>} />
        <Route path="/audit/add-item" element={<ErrorBoundary pageName="Add Item"><PageTransition><AddItem /></PageTransition></ErrorBoundary>} />
        <Route path="/audit/entries" element={<ErrorBoundary pageName="Entries Summary"><PageTransition><EntriesSummary /></PageTransition></ErrorBoundary>} />
        <Route path="/audit/submitted" element={<ErrorBoundary pageName="Submission"><PageTransition><SubmissionSuccess /></PageTransition></ErrorBoundary>} />
        <Route path="/review" element={<ErrorBoundary pageName="Manager Review"><PageTransition><ManagerReview /></PageTransition></ErrorBoundary>} />
        <Route path="/summary" element={<ErrorBoundary pageName="All Entries Summary"><PageTransition><AllEntriesSummary /></PageTransition></ErrorBoundary>} />
        <Route path="/resultsheet" element={<ErrorBoundary pageName="Resultsheet"><PageTransition><ResultsheetView /></PageTransition></ErrorBoundary>} />
        <Route path="/resultsheet/:date" element={<ErrorBoundary pageName="Resultsheet"><PageTransition><ResultsheetView /></PageTransition></ErrorBoundary>} />
        <Route path="/update-sku" element={<ErrorBoundary pageName="Update SKU"><PageTransition><UpdateSku /></PageTransition></ErrorBoundary>} />
        <Route path="/manage-users" element={<ErrorBoundary pageName="Manage Users"><PageTransition><ManageUsers /></PageTransition></ErrorBoundary>} />

        {/* Placeholder routes */}
        <Route path="/reports" element={<NotFound />} />
        <Route path="/admin/users" element={<ErrorBoundary pageName="Manage Users"><PageTransition><ManageUsers /></PageTransition></ErrorBoundary>} />
        <Route path="/admin/floors" element={<NotFound />} />
        <Route path="/admin/items" element={<NotFound />} />
        <Route path="/admin/exports" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
}

export function RootApp() {
  return (
    <ErrorBoundary pageName="App">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <AnimatedRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
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
