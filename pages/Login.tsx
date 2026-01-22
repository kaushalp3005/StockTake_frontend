import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Loader } from "lucide-react";
import { authAPI, APIError } from "@/utils/api";

//hididsjsfish

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const data = await authAPI.login(username, password);

      // Save token to localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      // Redirect to dashboard
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Login error:", err);
      console.error("Error details:", {
        name: err?.name,
        message: err?.message,
        status: err?.status,
        data: err?.data,
        stack: err?.stack
      });
      if (err instanceof APIError) {
        const errorMessage = err.data?.error || err.data?.message || err.message || "Login failed";
        setError(errorMessage);
      } else {
        setError(err.message || "An error occurred during login. Please check the console for details.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col overflow-hidden">
      {/* Split Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a8a] via-[#1e3a8a] to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white"></div>
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1e3a8a 50%, transparent 50%, white 50%, white 100%)',
        }}
      ></div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-border/20 bg-white/80 backdrop-blur-sm">
        <div className="container h-16 flex items-center gap-2 px-4 sm:px-6">
          <Package className="w-5 h-5 sm:w-6 sm:h-6 text-[#1e3a8a]" />
          <Link to="/" className="font-bold text-foreground hover:text-[#1e3a8a] transition-colors text-base sm:text-lg">
            StockTake
          </Link>
        </div>
      </nav>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center py-6 sm:py-12 px-4 relative z-10">
        <div className="w-full max-w-md">
          <Card className="p-6 sm:p-8 border-border/50 shadow-xl bg-white/95 backdrop-blur-sm">
            <div className="space-y-6">
              <div className="text-center space-y-4">
                {/* Icon */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#1e3a8a] flex items-center justify-center shadow-lg">
                    <Package className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                  </div>
                </div>
                {/* Branding */}
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold">
                    <span className="text-[#1e3a8a]">STOCK</span>
                    <span className="text-[#3b82f6]">TAKE</span>
                  </h1>
                  <p className="text-sm sm:text-base text-muted-foreground mt-2">
                    Inventory Management System
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">
                    Candor Foods Pvt. Ltd
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-foreground font-medium">
                    Username
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={isLoading}
                    className="bg-white border-2 border-border/50 rounded-lg h-12 focus:border-[#1e3a8a] focus:ring-2 focus:ring-[#1e3a8a]/20 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground font-medium">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="bg-white border-2 border-border/50 rounded-lg h-12 focus:border-[#1e3a8a] focus:ring-2 focus:ring-[#1e3a8a]/20 transition-all"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white h-12 rounded-lg font-semibold text-base shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "SIGN IN"
                  )}
                </Button>
              </form>


              {/* Disclaimer */}
              <div className="pt-4 border-t border-border/50">
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  Authorized personnel only.
                  <br />
                  Contact system administrator for access.
                </p>
              </div>
            </div>
          </Card>

          <div className="text-center text-xs text-muted-foreground mt-6 sm:mt-8 space-y-2">
            <p className="font-semibold text-foreground">Login with your username and password</p>
            <div className="bg-white/80 backdrop-blur-sm p-3 rounded-lg border border-border/50 text-left space-y-1 text-[10px] sm:text-xs break-words shadow-sm">
              <p>Use your assigned username and password to access the system</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
