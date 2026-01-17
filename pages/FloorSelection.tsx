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
import { Loader, Package, ArrowLeft, AlertCircle } from "lucide-react";

// Mock data
const MOCK_WAREHOUSES = [
  { id: "W202", name: "W202" },
  { id: "A185", name: "A185" },
  { id: "F53", name: "F53" },
  { id: "A68", name: "A68" },
  { id: "Savla", name: "Savla" },
  { id: "Rishi", name: "Rishi" },
];

export default function FloorSelection() {
  const navigate = useNavigate();
  const [warehouse, setWarehouse] = useState("");
  const [floorName, setFloorName] = useState("");
  const [authority, setAuthority] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [noActiveAudit, setNoActiveAudit] = useState(false);

  useEffect(() => {
    // Check if there's an active audit session
    const currentAudit = localStorage.getItem("currentAudit");
    if (!currentAudit) {
      setNoActiveAudit(true);
    }

    // Check if user is floorhead and lock warehouse
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        // If user has warehouse and role is floorhead (mapped to FLOOR_MANAGER), lock warehouse
        if (user.warehouse && (user.dbRole === "floorhead" || user.role === "FLOOR_MANAGER")) {
          setWarehouse(user.warehouse);
        }
      } catch (err) {
        console.error("Failed to parse user", err);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!warehouse || !floorName || !authority) {
      setError("All fields are required");
      return;
    }

    setIsLoading(true);

    try {
      // Get current user info
      const userStr = localStorage.getItem("user");
      const user = userStr ? JSON.parse(userStr) : null;

      // Create floor session
      const floorSession = {
        id: `session-${Date.now()}`,
        warehouse,
        floorName,
        authority,
        userId: user?.id || user?.email || "",
        userEmail: user?.email || "",
        userName: user?.name || "",
        createdAt: new Date().toISOString(),
        items: [],
      };

      localStorage.setItem("currentFloorSession", JSON.stringify(floorSession));

      // Redirect to add item page
      navigate("/audit/add-item");
    } catch (err: any) {
      setError(err.message || "Failed to select floor");
    } finally {
      setIsLoading(false);
    }
  };

  if (noActiveAudit) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
          <div className="container flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-6 h-6 text-primary" />
              <span className="text-xl font-bold text-foreground">StockTake</span>
            </div>
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        </nav>

        <div className="container py-6 sm:py-12 px-4 sm:px-6">
          <div className="max-w-md mx-auto">
            <Card className="p-4 sm:p-6 md:p-8 border-destructive/50 bg-destructive/5">
              <div className="flex gap-4">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-destructive mb-1">
                    No Active Audit
                  </h3>
                  <p className="text-sm text-destructive/80 mb-4">
                    There is no active audit session. Please ask your inventory
                    manager to start an audit first.
                  </p>
                  <Button
                    onClick={() => navigate("/dashboard")}
                    variant="outline"
                    size="sm"
                  >
                    Return to Dashboard
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2">
              Select Floor Location
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              Enter your warehouse location, floor name, and authority person
              to begin stock entry
            </p>
          </div>

          {/* Form Card */}
          <Card className="p-4 sm:p-6 md:p-8 border-border">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                  {error}
                </div>
              )}

              {/* Warehouse Selection */}
              <div className="space-y-2">
                <Label htmlFor="warehouse" className="text-foreground font-semibold">
                  Warehouse Location
                </Label>
                {(() => {
                  const userStr = localStorage.getItem("user");
                  let isLocked = false;
                  let lockedWarehouse = "";
                  
                  if (userStr) {
                    try {
                      const user = JSON.parse(userStr);
                      if (user.warehouse && (user.dbRole === "floorhead" || user.role === "FLOOR_MANAGER")) {
                        isLocked = true;
                        lockedWarehouse = user.warehouse;
                      }
                    } catch (err) {
                      console.error("Failed to parse user", err);
                    }
                  }

                  if (isLocked) {
                    return (
                      <div>
                        <Input
                          id="warehouse"
                          value={lockedWarehouse}
                          disabled
                          className="bg-muted border-input cursor-not-allowed"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Warehouse is locked based on your role assignment
                        </p>
                      </div>
                    );
                  }

                  return (
                    <Select value={warehouse} onValueChange={setWarehouse}>
                      <SelectTrigger
                        id="warehouse"
                        className="bg-input border-input"
                        disabled={isLoading}
                      >
                        <SelectValue placeholder="Select warehouse..." />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_WAREHOUSES.map((wh) => (
                          <SelectItem key={wh.id} value={wh.id}>
                            {wh.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>

              {/* Floor Name */}
              <div className="space-y-2">
                <Label htmlFor="floorName" className="text-foreground font-semibold">
                  Floor Name
                </Label>
                <Input
                  id="floorName"
                  type="text"
                  placeholder="Enter floor name"
                  value={floorName}
                  onChange={(e) => setFloorName(e.target.value)}
                  disabled={isLoading}
                  className="bg-input border-input"
                />
              </div>

              {/* Authority Person */}
              <div className="space-y-2">
                <Label htmlFor="authority" className="text-foreground font-semibold">
                  Authority Person Name
                </Label>
                <Input
                  id="authority"
                  type="text"
                  placeholder="Enter authority person's name"
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value)}
                  disabled={isLoading}
                  className="bg-input border-input"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-6">
                <Button
                  type="submit"
                  className="flex-1 bg-primary hover:bg-primary/90 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Begin Stock Entry"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/dashboard")}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
