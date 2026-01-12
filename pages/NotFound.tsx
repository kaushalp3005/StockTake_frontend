import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Package, Home, MessageSquare } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="container h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-foreground hover:text-primary transition-colors">
            <Package className="w-6 h-6 text-primary" />
            StockTake
          </Link>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </nav>

      {/* Not Found Content */}
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="max-w-lg text-center px-4">
          <div className="text-6xl font-bold text-primary mb-4">404</div>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Page Under Development
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            This page is being built. Check back soon or explore other features of StockTake.
          </p>

          <Card className="p-8 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 mb-8">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
              <MessageSquare className="w-5 h-5 inline mr-2" />
              Want to help build this?
            </h3>
            <p className="text-blue-800 dark:text-blue-200">
              Continue using the available features or return to the dashboard. As you explore, let us know what features are most important to you.
            </p>
          </Card>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
            >
              Go Back
            </Button>
            <Link to="/dashboard">
              <Button className="bg-primary hover:bg-primary/90 text-white w-full sm:w-auto">
                <Home className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline">
                Homepage
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
