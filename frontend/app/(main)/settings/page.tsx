"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogOut, Shield, Database, Key, Trash2, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StorageData {
  database_bytes: number;
  vector_store_bytes: number;
  uploads_bytes: number;
  total_bytes: number;
  limit_bytes: number;
  total_display: string;
  limit_display: string;
  usage_percent: number;
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // -- Dialogs state --
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [showClearCacheDialog, setShowClearCacheDialog] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  // -- Recovery Key verification --
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verified, setVerified] = useState(false);

  // -- Delete All confirmation --
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // -----------------------------------------------------------------------
  // Queries & Mutations
  // -----------------------------------------------------------------------

  const { data: storageData, refetch: refetchStorage } = useQuery<StorageData>({
    queryKey: ["storage"],
    queryFn: async () => {
      const { data } = await api.get("/data/storage");
      return data;
    },
  });

  const verifyPasswordMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/auth/verify-password", {
        email: verifyEmail,
        password: verifyPassword,
      });
      return data;
    },
    onSuccess: () => {
      setVerified(true);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Invalid email or password.");
    },
  });

  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.delete("/data/cache");
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setShowClearCacheDialog(false);
      refetchStorage();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to clear cache.");
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.delete("/data/all");
      return data;
    },
    onSuccess: () => {
      toast.success("All data has been permanently deleted.");
      localStorage.removeItem("access_token");
      queryClient.clear();
      setShowDeleteAllDialog(false);
      router.push("/login");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to delete data.");
    },
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    queryClient.clear();
    router.push("/login");
  };

  const handleOpenRecoveryDialog = () => {
    setVerifyEmail("");
    setVerifyPassword("");
    setVerified(false);
    setShowRecoveryDialog(true);
  };

  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    verifyPasswordMutation.mutate();
  };

  const handleOpenDeleteAllDialog = () => {
    setDeleteConfirmText("");
    setShowDeleteAllDialog(true);
  };

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const usagePercent = storageData?.usage_percent ?? 0;
  const totalDisplay = storageData?.total_display ?? "—";
  const limitDisplay = storageData?.limit_display ?? "5.0 GB";

  // Color the bar based on usage
  const barColor =
    usagePercent >= 90
      ? "bg-red-500"
      : usagePercent >= 70
        ? "bg-yellow-500"
        : "bg-primary";

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your EduSync preferences and data</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 max-w-4xl">
        {/* ============================================================= */}
        {/* Account & Security                                            */}
        {/* ============================================================= */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle>Account & Security</CardTitle>
            </div>
            <CardDescription>Manage your local account settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-secondary/50 rounded-xl border border-border">
              <p className="text-sm font-medium text-foreground mb-1">Local Authentication</p>
              <p className="text-xs text-muted-foreground mb-3">
                Your data is encrypted and stored locally. Never share your recovery key.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleOpenRecoveryDialog}
              >
                <Key className="w-4 h-4 mr-2" />
                View Recovery Key
              </Button>
            </div>
            <Button variant="destructive" className="w-full" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Log Out
            </Button>
          </CardContent>
        </Card>

        {/* ============================================================= */}
        {/* Data Sovereignty                                              */}
        {/* ============================================================= */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <CardTitle>Data Sovereignty</CardTitle>
            </div>
            <CardDescription>Manage your local storage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Storage bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Local Storage Used</span>
                <span className="text-foreground font-medium">
                  {totalDisplay} / {limitDisplay}
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-500`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>

            {/* Storage breakdown */}
            {storageData && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Database</span>
                  <span>{formatBytes(storageData.database_bytes)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Vector Store (AI embeddings)</span>
                  <span>{formatBytes(storageData.vector_store_bytes)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Uploaded Files</span>
                  <span>{formatBytes(storageData.uploads_bytes)}</span>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="pt-4 space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20"
                onClick={() => setShowClearCacheDialog(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Local Cache
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/20"
                onClick={handleOpenDeleteAllDialog}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Delete All User Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* =================================================================== */}
      {/* Dialog: View Recovery Key                                           */}
      {/* =================================================================== */}
      <Dialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              {verified ? "Recovery Key Reminder" : "Verify Your Identity"}
            </DialogTitle>
            <DialogDescription>
              {verified
                ? "Your recovery key was shown once during registration."
                : "Enter your credentials to continue."}
            </DialogDescription>
          </DialogHeader>

          {!verified ? (
            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={verifyEmail}
                  onChange={(e) => setVerifyEmail(e.target.value)}
                  className="bg-secondary border-border"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  placeholder="Enter your current password"
                  value={verifyPassword}
                  onChange={(e) => setVerifyPassword(e.target.value)}
                  className="bg-secondary border-border"
                  required
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRecoveryDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={verifyPasswordMutation.isPending}
                >
                  {verifyPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                <p className="text-sm text-green-400 leading-relaxed">
                  Identity verified successfully.
                </p>
              </div>

              <div className="p-4 bg-secondary/50 rounded-xl border border-border space-y-3">
                <p className="text-sm text-foreground font-medium">
                  Your Master Recovery Key was displayed once when you first created your account.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  EduSync is an offline-first system. The recovery key is securely hashed and
                  <strong> cannot be retrieved from the server</strong>. Please check the location
                  where you saved it during registration (e.g. written down physically, password
                  manager, or a screenshot).
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The key format is: <code className="text-primary font-mono">EDUSYNC-XXXX-XXXX-XXXX</code>
                </p>
              </div>

              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="text-xs text-yellow-400 leading-relaxed">
                  <strong>Lost your key?</strong> Without the recovery key, there is no way to reset
                  your password if you forget it. Your only option would be to delete all data and
                  create a new account.
                </p>
              </div>

              <DialogFooter>
                <Button onClick={() => setShowRecoveryDialog(false)}>
                  Got it
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* Dialog: Clear Local Cache                                           */}
      {/* =================================================================== */}
      <Dialog open={showClearCacheDialog} onOpenChange={setShowClearCacheDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Clear Local Cache
            </DialogTitle>
            <DialogDescription>
              This will remove temporary and non-essential data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="p-4 bg-secondary/50 rounded-xl border border-border">
              <p className="text-sm font-medium text-foreground mb-2">What will be cleared:</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Chat conversation history (RAG logs)</li>
                <li>Study session time-tracking logs</li>
              </ul>
            </div>

            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
              <p className="text-sm font-medium text-green-400 mb-2">What will be kept:</p>
              <ul className="text-xs text-green-400/80 space-y-1 list-disc list-inside">
                <li>Your account and credentials</li>
                <li>All subjects and uploaded documents</li>
                <li>Quiz history and mastery scores</li>
                <li>AI vector embeddings</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowClearCacheDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={clearCacheMutation.isPending}
              onClick={() => clearCacheMutation.mutate()}
            >
              {clearCacheMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Clearing…
                </>
              ) : (
                "Clear Cache"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* Dialog: Delete All User Data                                        */}
      {/* =================================================================== */}
      <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete All User Data
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-sm text-red-400 leading-relaxed">
                <strong>This will permanently delete:</strong>
              </p>
              <ul className="text-xs text-red-400/80 space-y-1 list-disc list-inside mt-2">
                <li>Your account and recovery key</li>
                <li>All subjects and uploaded documents</li>
                <li>AI vector embeddings and chat history</li>
                <li>Quiz history and mastery scores</li>
                <li>All study session data</li>
              </ul>
              <p className="text-xs text-red-400/60 mt-3">
                Your application will be returned to a fresh, first-run state.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Type <code className="text-red-400 font-mono bg-red-500/10 px-1.5 py-0.5 rounded">DELETE</code> to confirm
              </label>
              <Input
                type="text"
                placeholder="DELETE"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="bg-secondary border-border font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteAllDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "DELETE" || deleteAllMutation.isPending}
              onClick={() => deleteAllMutation.mutate()}
            >
              {deleteAllMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Permanently Delete Everything"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
