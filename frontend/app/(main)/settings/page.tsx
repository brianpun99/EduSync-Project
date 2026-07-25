"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, Database, Bell, Moon, Sun } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    queryClient.clear();
    router.push("/login");
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your EduSync preferences and data</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 max-w-4xl">
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
              <Button variant="outline" size="sm" className="w-full">
                View Recovery Key
              </Button>
            </div>
            <Button variant="destructive" className="w-full" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Log Out
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <CardTitle>Data Sovereignty</CardTitle>
            </div>
            <CardDescription>Manage your local storage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Local Storage Used</span>
                <span className="text-foreground font-medium">1.2 GB / 5.0 GB</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: "24%" }} />
              </div>
            </div>
            
            <div className="pt-4 space-y-3">
              <Button variant="outline" className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20">
                Clear Local Cache
              </Button>
              <Button variant="outline" className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/20">
                Delete All User Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
