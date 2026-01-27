import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader, LogOut, Package, FileText, Calendar, Warehouse, Edit2, TrendingUp, BarChart3, Activity, CheckCircle2, Clock, AlertCircle, ChevronRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface FloorSession {
  id: string;
  warehouse: string;
  floor?: string;
  floorName?: string;
  authority: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  items: any[];
  status?: string;
  createdAt: string;
  submittedAt?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userSessions, setUserSessions] = useState<FloorSession[]>([]);

  const loadUserSessions = () => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr);

        // Get all floor sessions and filter by current user
        const allSessions = JSON.parse(
          localStorage.getItem("floorSessions") || "[]"
        ) as FloorSession[];

        console.log("All sessions:", allSessions);
        console.log("Current user:", parsedUser);

        // Filter sessions by user email or user ID
        const filteredSessions = allSessions.filter(
          (session) =>
            session.userEmail === parsedUser.email ||
            session.userId === parsedUser.id ||
            session.userId === parsedUser.email
        );

        console.log("Filtered sessions for user:", filteredSessions);

        // Sort by creation date (newest first)
        filteredSessions.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setUserSessions(filteredSessions);
      } catch (err) {
        console.error("Failed to parse user or sessions", err);
      }
    }
  };

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");

    if (!token) {
      navigate("/login");
      return;
    }

    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr);
        setUser(parsedUser);
        loadUserSessions();
      } catch (err) {
        console.error("Failed to parse user", err);
      }
    }

    setIsLoading(false);
  }, [navigate]);

  // Refresh sessions when component comes into focus (e.g., returning from edit page)
  useEffect(() => {
    const handleFocus = () => {
      loadUserSessions();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  const handleEditEntry = (session: FloorSession) => {
    // Load the session into currentFloorSession for editing
    localStorage.setItem("currentFloorSession", JSON.stringify(session));
    // Navigate to add-item page where user can edit
    navigate("/audit/add-item");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const roleContent: Record<string, any> = {
    FLOOR_MANAGER: {
      title: "Floor Manager Dashboard",
      description: "Enter stock counts for your assigned floor",
      actions: [
        {
          label: "Enter Stock for Floor",
          icon: Package,
          action: () => navigate("/audit/floor-selection"),
        },
      ],
    },
    INVENTORY_MANAGER: {
      title: "Inventory Manager Dashboard",
      description: "Review and manage floor sessions",
      actions: [
        {
          label: "Start Audit Session",
          icon: Package,
          action: () => {
            // Add smooth transition effect
            const button = document.activeElement as HTMLElement;
            if (button) {
              button.style.transform = "scale(0.95)";
              setTimeout(() => {
                navigate("/review");
              }, 150);
            } else {
              navigate("/review");
            }
          },
        },
        {
          label: "View Summary",
          icon: Package,
          action: () => navigate("/summary"),
        },
        {
          label: "View Resultsheet",
          icon: Package,
          action: () => navigate("/resultsheet"),
        },
      ],
    },
    ADMIN: {
      title: "Admin Dashboard",
      description: "Manage users, floors, and items",
      actions: [
        {
          label: "Manage Users",
          icon: Package,
          action: () => navigate("/admin/users"),
        },
        {
          label: "Manage Floors",
          icon: Package,
          action: () => navigate("/admin/floors"),
        },
        {
          label: "Manage Items",
          icon: Package,
          action: () => navigate("/admin/items"),
        },
        {
          label: "Generate Reports",
          icon: Package,
          action: () => navigate("/reports"),
        },
      ],
    },
  };

  const content = roleContent[user?.role || "FLOOR_MANAGER"];

  // Calculate total items and weight for all user sessions
  const totalItems = userSessions.reduce(
    (sum, session) => sum + (session.items?.length || 0),
    0
  );
  const totalWeight = userSessions.reduce((sum, session) => {
    const sessionWeight = session.items?.reduce(
      (itemSum: number, item: any) => itemSum + (item.totalWeight || 0),
      0
    ) || 0;
    return sum + sessionWeight;
  }, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 border-b border-border/50 shadow-sm">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#1e3a8a] flex items-center justify-center">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold">
              <span className="text-[#1e3a8a]">STOCK</span>
              <span className="text-[#3b82f6]">TAKE</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-right hidden sm:block">
              <p className="font-semibold text-foreground text-sm">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.role}</p>
            </div>
            <Button variant="ghost" onClick={handleLogout} size="sm" className="text-xs sm:text-sm">
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Dashboard Content */}
      <div className="container py-6 sm:py-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2">
              {content.title}
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">{content.description}</p>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
            {content.actions.map((action: any, idx: number) => (
              <Card
                key={idx}
                className="p-5 sm:p-6 hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-border/50 active:scale-[0.97] hover:scale-[1.02] group bg-white/80 backdrop-blur-sm"
                onClick={(e) => {
                  // Add ripple effect
                  const card = e.currentTarget;
                  card.style.transform = "scale(0.95)";
                  setTimeout(() => {
                    card.style.transform = "";
                    action.action();
                  }, 200);
                }}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-3 sm:p-4 bg-[#1e3a8a]/10 rounded-xl flex-shrink-0 group-hover:bg-[#1e3a8a]/20 transition-all duration-300 group-hover:scale-110">
                    <action.icon className="w-5 h-5 sm:w-6 sm:h-6 text-[#1e3a8a] transition-transform duration-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-sm sm:text-base group-hover:text-[#1e3a8a] transition-colors duration-300">
                      {action.label}
                    </h3>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#1e3a8a] transition-colors duration-300" />
                </div>
              </Card>
            ))}
          </div>

          {/* StockTake Overview - Only for INVENTORY_MANAGER */}
          {user?.role === "INVENTORY_MANAGER" && (
            <div className="mt-8 sm:mt-12 space-y-6">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  StockTake Overview
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Real-time insights and analytics for your inventory management
                </p>
              </div>

              {/* Statistics Cards with Animation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <Card className="p-4 sm:p-6 bg-gradient-to-br from-[#1e3a8a]/10 to-[#1e3a8a]/5 border-2 border-[#1e3a8a]/20 hover:shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 hover:scale-[1.02] bg-white/80 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-[#1e3a8a]/20 rounded-lg">
                      <Package className="w-5 h-5 text-[#1e3a8a]" />
                    </div>
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Sessions</p>
                  <p className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">24</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">+12% from last week</p>
                </Card>

                <Card className="p-4 sm:p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20 hover:shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 delay-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Pending Reviews</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">8</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Requires attention</p>
                </Card>

                <Card className="p-4 sm:p-6 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20 hover:shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 delay-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Approved Today</p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">16</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">+5 from yesterday</p>
                </Card>

                <Card className="p-4 sm:p-6 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20 hover:shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 delay-300">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Warehouse className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Weight (kg)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">12,450</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">+8% from last week</p>
                </Card>
              </div>

              {/* Recent Activity */}
              <Card className="p-4 sm:p-6 border-border hover:shadow-lg transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    Recent Activity
                  </h3>
                </div>
                <div className="space-y-4">
                  {[
                    { type: "approved", user: "John Doe", floor: "Floor 3", warehouse: "W202", time: "2 minutes ago", icon: CheckCircle2, color: "text-green-600" },
                    { type: "submitted", user: "Jane Smith", floor: "Floor 5", warehouse: "A185", time: "15 minutes ago", icon: Clock, color: "text-blue-600" },
                    { type: "approved", user: "Mike Johnson", floor: "Floor 2", warehouse: "F53", time: "1 hour ago", icon: CheckCircle2, color: "text-green-600" },
                    { type: "pending", user: "Sarah Williams", floor: "Floor 1", warehouse: "A68", time: "2 hours ago", icon: AlertCircle, color: "text-amber-600" },
                    { type: "approved", user: "David Brown", floor: "Floor 4", warehouse: "Savla", time: "3 hours ago", icon: CheckCircle2, color: "text-green-600" },
                  ].map((activity, idx) => {
                    const Icon = activity.icon;
                    return (
                      <div 
                        key={idx} 
                        className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors animate-in fade-in slide-in-from-left-4"
                        style={{ animationDelay: `${idx * 100}ms` }}
                      >
                        <div className={`p-2 rounded-lg bg-background ${activity.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {activity.user} {activity.type === "approved" ? "approved" : activity.type === "submitted" ? "submitted" : "has pending"} session
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.floor} - {activity.warehouse} • {activity.time}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* My Entries Section - Only show for FLOOR_MANAGER */}
          {user?.role === "FLOOR_MANAGER" && (
            <div className="mt-8 sm:mt-12">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                  My Entries
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Properly submitted stock entries
                </p>
              </div>

              {/* Filter sessions to show only submitted/approved entries */}
              {(() => {
                const submittedSessions = userSessions.filter(
                  session => session.status === "SUBMITTED" || session.status === "APPROVED"
                );
                const submittedItems = submittedSessions.reduce(
                  (sum, session) => sum + (session.items?.length || 0),
                  0
                );
                const submittedWeight = submittedSessions.reduce((sum, session) => {
                  const sessionWeight = session.items?.reduce(
                    (itemSum: number, item: any) => itemSum + (item.totalWeight || 0),
                    0
                  ) || 0;
                  return sum + sessionWeight;
                }, 0);

                return (
                  <>
                    {/* Summary Stats */}
                    {submittedSessions.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
                        <Card className="p-4 sm:p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                          <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                            Submitted Sessions
                          </p>
                          <p className="text-2xl sm:text-3xl font-bold text-primary">
                            {submittedSessions.length}
                          </p>
                        </Card>
                        <Card className="p-4 sm:p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
                          <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                            Total Items
                          </p>
                          <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                            {submittedItems}
                          </p>
                        </Card>
                        <Card className="p-4 sm:p-6 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                          <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                            Total Weight
                          </p>
                          <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
                            {submittedWeight.toFixed(2)} kg
                          </p>
                        </Card>
                      </div>
                    )}

                    {/* Entries List */}
                    {submittedSessions.length === 0 ? (
                <Card className="p-6 sm:p-12 text-center bg-muted/50">
                  <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-base sm:text-lg font-semibold text-foreground mb-1">
                    No submitted entries yet
                  </p>
                  <p className="text-sm sm:text-base text-muted-foreground mb-4">
                    Complete and submit your stock entries to see them here.
                  </p>
                  <Button
                    onClick={() => navigate("/audit/floor-selection")}
                    className="bg-primary hover:bg-primary/90 text-white"
                  >
                    Enter Stock Now
                  </Button>
                </Card>
              ) : (
                <div className="space-y-4 lg:space-y-6">
                  {submittedSessions.map((session) => {
                    const sessionWeight = session.items?.reduce(
                      (sum: number, item: any) => sum + (item.totalWeight || 0),
                      0
                    ) || 0;
                    const sessionDate = session.createdAt ? new Date(session.createdAt).toLocaleDateString() : "N/A";
                    const sessionTime = session.createdAt ? new Date(session.createdAt).toLocaleTimeString() : "";

                    return (
                      <Card
                        key={session.id}
                        className="p-4 sm:p-6 lg:p-8 border-border hover:shadow-md transition-all duration-200"
                      >
                        <div className="space-y-4">
                          {/* Session Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Warehouse className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                                <h3 className="text-base sm:text-lg font-bold text-foreground">
                                  {session.warehouse} - {session.floorName || 'Floor'}
                                </h3>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span>{sessionDate} at {sessionTime}</span>
                                </div>
                                {session.status && (
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-semibold ${
                                      session.status === "SUBMITTED"
                                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                        : session.status === "APPROVED"
                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                    }`}
                                  >
                                    {session.status}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 sm:gap-6 mt-4 sm:mt-0">
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                  Total Weight
                                </p>
                                <p className="text-2xl sm:text-3xl font-bold text-primary whitespace-nowrap">
                                  {sessionWeight.toFixed(2)} kg
                                </p>
                              </div>
                              {/* Edit Button - Only show for SUBMITTED status */}
                              {session.status === "SUBMITTED" && (
                                <Button
                                  onClick={() => handleEditEntry(session)}
                                  variant="outline"
                                  size="sm"
                                  className="w-full sm:w-auto flex-shrink-0"
                                >
                                  <Edit2 className="w-4 h-4 mr-2" />
                                  Edit
                                </Button>
                              )}
                              {session.status === "APPROVED" && (
                                <span className="text-xs text-muted-foreground italic flex-shrink-0">
                                  Cannot edit approved entries
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Items List */}
                          {session.items && session.items.length > 0 && (
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={session.id} className="border-none">
                                <AccordionTrigger 
                                  className="py-2 text-sm text-muted-foreground hover:no-underline"
                                >
                                  View {session.items.length} item(s)
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-2 pt-2 border-t border-border">
                                    {session.items.map((item: any, idx: number) => {
                                      // For custom category items (no subcategory), the category field contains the item name
                                      const isCustomCategory = item.category && !item.subcategory;
                                      const itemName = isCustomCategory 
                                        ? item.category 
                                        : (item.description || item.subcategory || item.category || "Unknown Item");
                                      
                                      return (
                                        <div
                                          key={idx}
                                          className="p-3 sm:p-4 bg-muted/50 rounded-lg text-sm border border-border/50"
                                        >
                                          <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                              <p className="font-semibold text-foreground text-sm sm:text-base">
                                                {itemName}
                                              </p>
                                              {!isCustomCategory && item.category && item.subcategory && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                  {item.category} → {item.subcategory}
                                                </p>
                                              )}
                                              {isCustomCategory && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                  Unlisted Item
                                                </p>
                                              )}
                                            </div>
                                          <span className="font-bold text-primary ml-2 text-base sm:text-lg">
                                            {item.totalWeight?.toFixed(2) || "0.00"} kg
                                          </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-2">
                                          {item.packageSize && (
                                            <span>
                                              UOM: {item.packageSize?.toFixed(3) || "0.000"} kg
                                            </span>
                                          )}
                                          {item.units && (
                                            <span>Qty: {item.units || 0}</span>
                                          )}
                                          {item.stockType && (
                                            <span className="capitalize">
                                              Type: {item.stockType}
                                            </span>
                                          )}
                                          {item.itemType && (
                                            <span className="uppercase">
                                              {item.itemType}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                    })}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Info Card for other roles */}
          {user?.role !== "FLOOR_MANAGER" && (
            <Card className="p-4 sm:p-6 md:p-8 mt-8 sm:mt-12 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <h3 className="text-base sm:text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Getting Started
            </h3>
              <p className="text-sm sm:text-base text-blue-800 dark:text-blue-200 mb-4">
              This is your dashboard. The features are being built out. Click on the action cards above to explore the application.
            </p>
              <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
              Each role has different permissions and workflows. Floor Managers can enter stock, Inventory Managers review and approve, and Admins manage the system.
            </p>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
