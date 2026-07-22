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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Pencil, Trash2, Loader, X, Users, KeyRound } from "lucide-react";
import { usersAPI, type ManagedUser, type ManagedUserInput, APIError } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

const ROLE_OPTIONS = ["FLOOR_MANAGER", "INVENTORY_MANAGER", "ADMIN", "SUPERUSER", "MANAGER", "FLOORHEAD"];

const EMPTY_FORM: Required<Pick<ManagedUserInput, "username" | "password" | "name" | "email" | "warehouse" | "role" | "isActive">> = {
  username: "",
  password: "",
  name: "",
  email: "",
  warehouse: "",
  role: "FLOOR_MANAGER",
  isActive: true,
};

export default function ManageUsers() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  // Auth gate — FLOOR_MANAGER, INVENTORY_MANAGER and SUPERUSER (not FLOORHEAD, not ADMIN)
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      navigate("/login");
      return;
    }
    const u = JSON.parse(userStr);
    const dbRoleUpper = (u.dbRole || "").toUpperCase();
    const isFloorHead = dbRoleUpper === "FLOORHEAD" || dbRoleUpper === "FLOOR_HEAD";
    const allowed = ["FLOOR_MANAGER", "INVENTORY_MANAGER", "SUPERUSER"];
    if (!allowed.includes(u.role) || isFloorHead) {
      toast({
        title: "Access denied",
        description: "You do not have permission to manage users.",
        variant: "destructive",
      });
      navigate("/dashboard");
    }
  }, [navigate, toast]);

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await usersAPI.list();
      setUsers(res.users);
    } catch (err: any) {
      const msg = err instanceof APIError ? err.data?.error || err.message : err.message;
      setError(msg || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreate = () => {
    setDialogMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (u: ManagedUser) => {
    setDialogMode("edit");
    setEditingId(u.id);
    setForm({
      username: u.username || "",
      password: "", // blank = keep existing
      name: u.name || "",
      email: u.email || "",
      warehouse: u.warehouse || "",
      role: u.role || "FLOOR_MANAGER",
      isActive: !!u.isActive,
    });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setFormError("");

    if (!form.username.trim()) {
      setFormError("Username is required");
      return;
    }
    if (dialogMode === "create" && !form.password.trim()) {
      setFormError("Password is required for new users");
      return;
    }
    if (!form.role.trim()) {
      setFormError("Role is required");
      return;
    }

    setSaving(true);
    try {
      const payload: ManagedUserInput = {
        username: form.username.trim(),
        name: form.name.trim() || null,
        email: form.email.trim() || null,
        warehouse: form.warehouse.trim() || null,
        role: form.role.trim(),
        isActive: form.isActive,
      };
      if (form.password) {
        payload.password = form.password;
      }

      if (dialogMode === "create") {
        await usersAPI.create({ ...payload, password: form.password });
        toast({ title: "User created", description: `${form.username} added.` });
      } else if (editingId) {
        await usersAPI.update(editingId, payload);
        toast({ title: "User updated", description: `${form.username} saved.` });
      }

      setDialogOpen(false);
      await loadUsers();
    } catch (err: any) {
      const msg = err instanceof APIError ? err.data?.error || err.message : err.message;
      setFormError(msg || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (u: ManagedUser) => {
    setDeletingUser(u);
    setDeleteOpen(true);
  };

  const openResetPassword = (u: ManagedUser) => {
    setResetUser(u);
    setResetPwd("");
    setResetConfirm("");
    setResetError("");
    setResetOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    setResetError("");

    if (!resetPwd) {
      setResetError("New password is required");
      return;
    }
    if (resetPwd.length < 4) {
      setResetError("Password must be at least 4 characters");
      return;
    }
    if (resetPwd !== resetConfirm) {
      setResetError("Passwords do not match");
      return;
    }

    setResetting(true);
    try {
      await usersAPI.update(resetUser.id, { password: resetPwd });
      toast({
        title: "Password reset",
        description: `New password set for ${resetUser.username}.`,
      });
      setResetOpen(false);
      setResetUser(null);
    } catch (err: any) {
      const msg = err instanceof APIError ? err.data?.error || err.message : err.message;
      setResetError(msg || "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      await usersAPI.remove(deletingUser.id);
      toast({ title: "User deleted", description: `${deletingUser.username} removed.` });
      setDeleteOpen(false);
      setDeletingUser(null);
      await loadUsers();
    } catch (err: any) {
      const msg = err instanceof APIError ? err.data?.error || err.message : err.message;
      toast({ title: "Delete failed", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-background">
      <nav
        style={{ background: "#111827", minHeight: 52 }}
        className="sticky top-0 z-50 flex items-center justify-between px-3 sm:px-5"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <Users className="w-5 h-5 text-blue-400" />
          <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 16 }}>Manage Users</span>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </nav>

      <div className="p-3 sm:p-6 max-w-7xl mx-auto">
        {error && (
          <Card className="p-4 mb-4 border-destructive/40 bg-destructive/5 text-destructive text-sm">
            {error}
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader className="w-5 h-5 animate-spin mr-2" /> Loading users…
          </div>
        ) : users.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No users found. Click <strong>Add User</strong> to create one.
          </Card>
        ) : (
          <>
          {/* Desktop / tablet: full table */}
          <Card className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left">
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">Username</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Warehouse</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Active</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{u.id}</td>
                    <td className="px-3 py-2 font-medium">{u.username}</td>
                    <td className="px-3 py-2">{u.name || "—"}</td>
                    <td className="px-3 py-2 text-xs">{u.email || "—"}</td>
                    <td className="px-3 py-2">{u.warehouse || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                          u.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {u.isActive ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openResetPassword(u)}
                          aria-label={`Reset password for ${u.username}`}
                          title="Reset password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(u)}
                          aria-label={`Edit ${u.username}`}
                          title="Edit user"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => confirmDelete(u)}
                          aria-label={`Delete ${u.username}`}
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile: card list (table would only scroll sideways on phones) */}
          <div className="sm:hidden space-y-3">
            {users.map((u) => (
              <Card key={u.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{u.username}</p>
                    {u.name && (
                      <p className="text-xs text-muted-foreground truncate">{u.name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">
                      {u.role}
                    </span>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        u.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {u.email && (
                    <p className="truncate">
                      <span className="text-foreground/70">Email:</span> {u.email}
                    </p>
                  )}
                  <p>
                    <span className="text-foreground/70">Warehouse:</span> {u.warehouse || "—"}
                  </p>
                  <p>
                    <span className="text-foreground/70">ID:</span>{" "}
                    <span className="font-mono">{u.id}</span>
                    {u.createdAt && <> · {new Date(u.createdAt).toLocaleDateString()}</>}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1"
                    onClick={() => openResetPassword(u)}
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Reset
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1"
                    onClick={() => openEdit(u)}
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1 text-destructive hover:text-destructive"
                    onClick={() => confirmDelete(u)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Create / Edit dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.78)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialogOpen(false);
          }}
        >
          <div
            className="relative w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            style={{ maxHeight: "92dvh" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-border"
              style={{ background: "#111827" }}
            >
              <span className="font-bold text-white text-base">
                {dialogMode === "create" ? "Add New User" : `Edit User #${editingId}`}
              </span>
              <button
                onClick={() => setDialogOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4 text-gray-300" />
              </button>
            </div>

            <div
              className="p-4 space-y-3 overflow-y-auto"
              style={{ maxHeight: "calc(92dvh - 130px)" }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="form-username">Username *</Label>
                <Input
                  id="form-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="form-password">
                  Password {dialogMode === "create" ? "*" : "(leave blank to keep current)"}
                </Label>
                <Input
                  id="form-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  disabled={saving}
                  placeholder={dialogMode === "edit" ? "•••••••• (unchanged)" : ""}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="form-name">Name</Label>
                  <Input
                    id="form-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="form-email">Email</Label>
                  <Input
                    id="form-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="form-warehouse">Warehouse</Label>
                  <Input
                    id="form-warehouse"
                    value={form.warehouse}
                    onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                    disabled={saving}
                    placeholder="e.g. W202"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="form-role">Role *</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm({ ...form, role: v })}
                    disabled={saving}
                  >
                    <SelectTrigger id="form-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="form-active"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  disabled={saving}
                  className="w-4 h-4"
                />
                <Label htmlFor="form-active" className="cursor-pointer">
                  Account is active
                </Label>
              </div>

              {formError && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-sm">
                  {formError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" /> Saving…
                  </>
                ) : dialogMode === "create" ? (
                  "Create"
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetOpen && resetUser && (
        <div
          className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.78)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetting) setResetOpen(false);
          }}
        >
          <div
            className="relative w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            style={{ maxHeight: "92dvh" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-border"
              style={{ background: "#111827" }}
            >
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-white text-base">Reset Password</span>
              </div>
              <button
                onClick={() => !resetting && setResetOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                disabled={resetting}
              >
                <X className="w-4 h-4 text-gray-300" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Set a new password for <strong className="text-foreground">{resetUser.username}</strong>.
                The user will use this on their next login.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="reset-pwd">New password *</Label>
                <Input
                  id="reset-pwd"
                  type="password"
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                  disabled={resetting}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm">Confirm new password *</Label>
                <Input
                  id="reset-confirm"
                  type="password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  disabled={resetting}
                />
              </div>

              {resetError && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-sm">
                  {resetError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setResetOpen(false)}
                disabled={resetting}
              >
                Cancel
              </Button>
              <Button onClick={handleResetPassword} disabled={resetting}>
                {resetting ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" /> Saving…
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deletingUser?.username}</strong> from{" "}
              <code>stocktake_users</code>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" /> Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
