// H1: Shared dark topbar — bg #111827, 52px mobile / 56px desktop
// Blue rounded-square logo + "StockTake" | Right: avatar + username + role + back button
import { Package, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AppTopbarProps {
  /** If provided, renders a "← Back" button navigating to this path. Omit to hide. */
  backTo?: string;
  /** Override default back label */
  backLabel?: string;
  /** Custom back action (overrides backTo) */
  onBack?: () => void;
  /** Optional right-side extra content */
  right?: React.ReactNode;
}

export function AppTopbar({ backTo, backLabel = "Back", onBack, right }: AppTopbarProps) {
  const navigate = useNavigate();
  const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
  const user = userStr ? JSON.parse(userStr) : null;

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    if (backTo) navigate(backTo);
  };

  return (
    <nav
      style={{ background: "#111827", minHeight: 52 }}
      className="sticky top-0 z-50 flex items-center justify-between px-3 sm:px-5 sm:min-h-[56px]"
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-2">
        <div
          style={{
            background: "#185FA5",
            borderRadius: 8,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Package className="w-4 h-4 text-white" />
        </div>
        <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 16 }}>StockTake</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {right}

        {/* User chip — desktop only */}
        {user && (
          <div className="hidden sm:flex items-center gap-2">
            <div
              style={{
                background: "#185FA5",
                borderRadius: "50%",
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {(user.username || user.name || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="text-right">
              <p style={{ color: "#F9FAFB", fontSize: 12, fontWeight: 600, lineHeight: 1 }}>
                {user.username || user.name}
              </p>
              <p style={{ color: "#9CA3AF", fontSize: 10, lineHeight: 1, marginTop: 2 }}>
                {user.role}
              </p>
            </div>
          </div>
        )}

        {/* Back button */}
        {(backTo || onBack) && (
          <button
            onClick={handleBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: 6,
              color: "#D1D5DB",
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 10px",
              cursor: "pointer",
              touchAction: "manipulation",
              minHeight: 32,
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{backLabel}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
