import { useState } from "react";
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
import { Loader, Package, ArrowLeft } from "lucide-react";

// Mock data - will be replaced with actual API calls
const MOCK_WAREHOUSES = [
  { id: "wh-1", name: "Main Warehouse" },
  { id: "wh-2", name: "Secondary Warehouse" },
  { id: "wh-3", name: "Cold Storage" },
];

const MOCK_AUTHORITIES = [
  { id: "auth-1", name: "John Manager" },
  { id: "auth-2", name: "Sarah Admin" },
  { id: "auth-3", name: "Mike Supervisor" },
];

export default function StartAudit() {
  const navigate = useNavigate();
  const [warehouse, setWarehouse] = useState("");
  const [auditDate, setAuditDate] = useState("");
  const [authority, setAuthority] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!warehouse || !auditDate || !authority) {
      setError("All fields are required");
      return;
    }

    setIsLoading(true);

    try {
      // Store audit session in localStorage for now (demo mode)
      const auditSession = {
        id: `audit-${Date.now()}`,
        warehouse,
        auditDate,
        authority,
        createdAt: new Date().toISOString(),
        status: "ACTIVE",
      };

      localStorage.setItem("currentAudit", JSON.stringify(auditSession));

      // Redirect to floor selection page
      navigate("/audit/floor-selection");
    } catch (err: any) {
      setError(err.message || "Failed to start audit");
    } finally {
      setIsLoading(false);
    }
  };

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
              Start New Audit
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              Select a warehouse and provide audit details to begin the stock
              audit process
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
                <p className="text-xs text-muted-foreground">
                  Choose the warehouse where this audit will be conducted
                </p>
              </div>

              {/* Audit Date */}
              <div className="space-y-2">
                <Label htmlFor="auditDate" className="text-foreground font-semibold">
                  Audit Date
                </Label>
                <Input
                  id="auditDate"
                  type="date"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                  disabled={isLoading}
                  className="bg-input border-input"
                />
                <p className="text-xs text-muted-foreground">
                  The date on which this audit is being conducted
                </p>
              </div>

              {/* Authority Person */}
              <div className="space-y-2">
                <Label htmlFor="authority" className="text-foreground font-semibold">
                  Authority Person (Auditor)
                </Label>
                <Select value={authority} onValueChange={setAuthority}>
                  <SelectTrigger
                    id="authority"
                    className="bg-input border-input"
                    disabled={isLoading}
                  >
                    <SelectValue placeholder="Select authority person..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_AUTHORITIES.map((auth) => (
                      <SelectItem key={auth.id} value={auth.id}>
                        {auth.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The person authorized to conduct and approve this audit
                </p>
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
                      Starting Audit...
                    </>
                  ) : (
                    "Start Audit"
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

          {/* Info Box */}
          <Card className="p-4 sm:p-6 mt-6 sm:mt-8 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <h3 className="font-semibold text-sm sm:text-base text-blue-900 dark:text-blue-100 mb-2">
              About Audit Sessions
            </h3>
            <p className="text-xs sm:text-sm text-blue-800 dark:text-blue-200">
              Once you start an audit, floor managers will be able to access the
              system and enter stock counts for their assigned floors. You can review
              and approve entries once they are submitted.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
