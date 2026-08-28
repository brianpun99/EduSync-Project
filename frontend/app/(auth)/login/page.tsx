"use client";

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Eye, EyeOff, Copy, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // -- Recovery mode --
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverKey, setRecoverKey] = useState("");
  const [recoverNewPassword, setRecoverNewPassword] = useState("");
  const [recoverError, setRecoverError] = useState("");

  const { data: authStatus } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const { data } = await api.get('/auth/status');
      return data;
    },
  });

  useEffect(() => {
    if (authStatus && !authStatus.account_exists) {
      setMode("register");
    }
  }, [authStatus]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/auth/login', { email, password });
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem('access_token', data.access_token);
      router.push('/dashboard');
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || "Login failed");
    }
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/auth/register', { email, username, password });
      return data;
    },
    onSuccess: (data) => {
      setRecoveryKey(data.recovery_key);
      setShowRecoveryModal(true);
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || "Registration failed");
    }
  });

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    registerMutation.mutate();
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  const recoverMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/auth/recover', {
        email: recoverEmail,
        recovery_key: recoverKey,
        new_password: recoverNewPassword,
      });
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem('access_token', data.access_token);
      router.push('/dashboard');
    },
    onError: (error: any) => {
      setRecoverError(error.response?.data?.detail || "Recovery failed. Check your email and recovery key.");
    },
  });

  const handleRecover = (e: FormEvent) => {
    e.preventDefault();
    setRecoverError("");
    recoverMutation.mutate();
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmKey = () => {
    if (keySaved) {
      setShowRecoveryModal(false);
      // Auto-login after saving recovery key
      loginMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Brain className="w-10 h-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" 
              ? "Sign in to continue your learning journey" 
              : "Start your offline-first learning experience"
            }
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-secondary border-border"
                required
              />
            </div>

            {mode === "register" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Username</label>
                <Input
                  type="text"
                  placeholder="Your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-secondary border-border"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-secondary border-border pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loginMutation.isPending || registerMutation.isPending}>
              {loginMutation.isPending || registerMutation.isPending ? "Please wait..." : (mode === "login" ? "Sign In" : "Create Account")}
            </Button>
          </form>

          {mode === "login" && !showRecoveryForm && (
            <button
              type="button"
              className="w-full mt-3 text-sm text-primary hover:underline"
              onClick={() => {
                setShowRecoveryForm(true);
                setRecoverError("");
              }}
            >
              Use Offline Recovery Key
            </button>
          )}

          {showRecoveryForm && (
            <div className="mt-4 space-y-4">
              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <h3 className="text-sm font-semibold text-foreground">Account Recovery</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Enter your email, recovery key, and a new password to regain access.
                </p>

                {recoverError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-3">
                    <p className="text-xs text-red-400">{recoverError}</p>
                  </div>
                )}

                <form onSubmit={handleRecover} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Email</label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={recoverEmail}
                      onChange={(e) => setRecoverEmail(e.target.value)}
                      className="bg-secondary border-border"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Recovery Key</label>
                    <Input
                      type="text"
                      placeholder="EDUSYNC-XXXX-XXXX-XXXX"
                      value={recoverKey}
                      onChange={(e) => setRecoverKey(e.target.value)}
                      className="bg-secondary border-border font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">New Password</label>
                    <Input
                      type="password"
                      placeholder="Enter a new password (min 8 chars)"
                      value={recoverNewPassword}
                      onChange={(e) => setRecoverNewPassword(e.target.value)}
                      className="bg-secondary border-border"
                      minLength={8}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90"
                    disabled={recoverMutation.isPending}
                  >
                    {recoverMutation.isPending ? "Recovering…" : "Reset Password & Sign In"}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowRecoveryForm(false)}
                  >
                    ← Back to login
                  </button>
                </form>
              </div>
            </div>
          )}

          {authStatus?.account_exists && (
            <div className="mt-6 text-center">
              <span className="text-sm text-muted-foreground">
                {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-sm text-primary hover:underline"
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recovery Key Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg bg-card border-border">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                </div>
              </div>
              <CardTitle className="text-xl font-bold text-foreground">
                Master Recovery Key
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Save this key to recover your account
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-secondary/50 border border-border rounded-xl p-6 text-center">
                <code className="text-2xl font-mono font-bold text-primary tracking-wider">
                  {recoveryKey}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyKey}
                  className="mt-4 text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-2 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Key
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-sm text-red-400 leading-relaxed">
                  <strong>EduSync is an offline-first system.</strong> Write this key down physically. 
                  We cannot send password reset emails.
                </p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={keySaved}
                  onChange={(e) => setKeySaved(e.target.checked)}
                  className="w-5 h-5 rounded border-border bg-secondary mt-0.5 accent-primary"
                />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                  I have securely saved this key.
                </span>
              </label>

              <Button
                type="button"
                onClick={handleConfirmKey}
                disabled={!keySaved}
                className={cn(
                  "w-full",
                  keySaved 
                    ? "bg-primary hover:bg-primary/90" 
                    : "bg-secondary text-muted-foreground cursor-not-allowed"
                )}
              >
                Continue to EduSync
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
