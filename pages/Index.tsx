import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Package,
  BarChart3,
  CheckCircle,
  Users,
  ArrowRight,
  Zap,
  Shield,
} from "lucide-react";

export default function Index() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user is logged in by checking localStorage
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
  }, []);

  const features = [
    {
      icon: Package,
      title: "Pallet-Based Stock Entry",
      description:
        "Organize stock by logical pallet groupings. Simple, efficient, and non-intrusive tracking.",
    },
    {
      icon: BarChart3,
      title: "Unified Reporting",
      description:
        "Generate consolidated Excel reports across all floors. One unified view of your entire inventory.",
    },
    {
      icon: CheckCircle,
      title: "Multi-Level Approval",
      description:
        "Floor managers submit, inventory managers review and approve. Ensures accuracy at every step.",
    },
    {
      icon: Users,
      title: "Role-Based Access",
      description:
        "Floor Managers, Inventory Managers, and Admins—each with specific permissions and workflows.",
    },
    {
      icon: Zap,
      title: "Real-Time Edits",
      description:
        "Edit items and measurements before approval. Lock everything once approved for data integrity.",
    },
    {
      icon: Shield,
      title: "Audit Trail",
      description:
        "Complete logs of all changes, approvals, and exports. Full transparency and accountability.",
    },
  ];

  const stats = [
    {
      number: "7",
      label: "Floors Supported",
    },
    {
      number: "100%",
      label: "Audit Coverage",
    },
    {
      number: "Real-Time",
      label: "Synchronization",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <span className="text-lg sm:text-xl font-bold text-foreground">StockTake</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {isLoggedIn ? (
              <>
                <Link to="/dashboard">
                  <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                    <span className="hidden sm:inline">Dashboard</span>
                    <span className="sm:hidden">Dash</span>
                  </Button>
                </Link>
                <Button
                  onClick={() => {
                    localStorage.removeItem("token");
                    setIsLoggedIn(false);
                    navigate("/");
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-xs sm:text-sm"
                >
                  <span className="hidden sm:inline">Sign Out</span>
                  <span className="sm:hidden">Out</span>
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container py-12 sm:py-20 md:py-32 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6 sm:space-y-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground">
            Modern Inventory <span className="text-primary">Stock Taking</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground px-2">
            Simplify your warehouse stock management. Floor managers enter data
            pallet-wise. Inventory managers review and approve. Generate unified
            Excel reports instantly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            {!isLoggedIn && (
              <>
                <Link to="/login">
                  <Button
                    size="lg"
                    className="bg-primary hover:bg-primary/90 text-white gap-2"
                  >
                    Sign In
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </>
            )}
            {isLoggedIn && (
              <Link to="/dashboard">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white gap-2"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container py-12 sm:py-16 px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {stats.map((stat, idx) => (
            <div key={idx} className="text-center">
              <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary mb-2">
                {stat.number}
              </div>
              <p className="text-sm sm:text-base text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-12 sm:py-20 px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4">
            Powerful Features
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Everything you need for efficient inventory management
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <Card
                key={idx}
                className="p-6 hover:shadow-lg transition-shadow border-border"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Workflow Section */}
      <section className="container py-12 sm:py-20 px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4">
            Simple Workflow
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Three-step process for perfect inventory accuracy
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {[
            {
              step: 1,
              title: "Floor Managers Enter Stock",
              description:
                "Add pallets and items per floor. System auto-calculates weights. Submit when ready.",
            },
            {
              step: 2,
              title: "Inventory Manager Reviews",
              description:
                "Review all floor entries, edit if needed, and approve. Locked immediately after approval.",
            },
            {
              step: 3,
              title: "Generate Excel Report",
              description:
                "Consolidated report with all floors, items, and totals. Professional formatting, ready to use.",
            },
          ].map((item, idx) => (
            <div key={idx} className="relative">
              <Card className="p-8 text-center border-border">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white font-bold mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  {item.title}
                </h3>
                <p className="text-muted-foreground">{item.description}</p>
              </Card>
              {idx < 2 && (
                <div className="hidden md:flex absolute -right-4 top-1/2 transform -translate-y-1/2">
                  <ArrowRight className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-12 sm:py-20 px-4 sm:px-6">
        <Card className="p-6 sm:p-8 md:p-12 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <div className="text-center space-y-4 sm:space-y-6 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Ready to streamline your inventory?
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              Join warehouse teams across the country using StockTake for
              accurate, efficient stock management.
            </p>
            {!isLoggedIn && (
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Link to="/login">
                  <Button
                    size="lg"
                    className="bg-primary hover:bg-primary/90 text-white"
                  >
                    Sign In
                  </Button>
                </Link>
              </div>
            )}
            {isLoggedIn && (
              <Link to="/dashboard">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  Open Dashboard
                </Button>
              </Link>
            )}
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="container py-8 sm:py-12 px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-primary" />
                <span className="font-bold text-foreground">StockTake</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Modern inventory management for warehouses.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8">
            <p className="text-center text-sm text-muted-foreground">
              © 2024 StockTake. All rights reserved. Built for Candor Foods.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
