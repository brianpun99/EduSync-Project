"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Target, FileText, AlertTriangle, Clock, ChevronRight, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface WeakTopic {
  topic: string;
  subject: string;
  mastery_score: number;
}

interface DashboardData {
  overall_mastery: number;
  weak_topics: WeakTopic[];
  document_count: number;
}

export default function DashboardPage() {
  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/analytics/dashboard');
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search topics, documents, concepts..." 
              className="pl-10 bg-secondary border-border"
            />
          </div>
        </div>
      </div>

      {/* Greeting */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Keep learning, keep growing!</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Overall Mastery"
          value={`${dashboard?.overall_mastery || 0}%`}
          subtext="Your current mastery"
          color="primary"
          showProgress
          progress={dashboard?.overall_mastery || 0}
        />
        <StatCard 
          label="Documents"
          value={`${dashboard?.document_count || 0}`}
          subtext="Documents loaded"
          color="cyan"
        />
        <StatCard 
          label="Weak Topics"
          value={`${dashboard?.weak_topics.length || 0}`}
          subtext="Need more revision"
          color="orange"
        />
        <StatCard 
          label="Study Time"
          value="--h --m"
          subtext="Not tracked currently"
          color="green"
        />
      </div>

      {/* Main content grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Weak Topics */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold text-foreground">Top Weak Topics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard?.weak_topics && dashboard.weak_topics.length > 0 ? (
              dashboard.weak_topics.map((topic, idx) => (
                <WeakTopicCard 
                  key={idx} 
                  topic={topic.topic}
                  subject={topic.subject}
                  masteryScore={topic.mastery_score}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-green-400 opacity-80" />
                <p className="text-sm font-medium text-foreground">No Knowledge Gaps Detected</p>
                <p className="text-xs">All studied topics are at or above the 60% mastery threshold.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold text-foreground">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">Activity tracking is not fully implemented on the backend yet.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  subtext, 
  trend, 
  trendValue,
  color,
  showProgress,
  progress 
}: { 
  label: string
  value: string
  subtext: string
  trend?: "up" | "down"
  trendValue?: string
  color: string
  showProgress?: boolean
  progress?: number
}) {
  const colorClasses: Record<string, string> = {
    primary: "text-primary",
    cyan: "text-cyan-400",
    orange: "text-orange-400",
    green: "text-green-400"
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground mb-1">{label}</div>
        <div className={`text-2xl lg:text-3xl font-bold ${colorClasses[color]}`}>{value}</div>
        {showProgress && progress !== undefined && (
          <Progress value={progress} className="h-1.5 mt-2 bg-secondary" />
        )}
        <div className="text-xs text-muted-foreground mt-1">{subtext}</div>
        {trendValue && (
          <div className="flex items-center gap-1 mt-1">
            {trend === "up" ? (
              <TrendingUp className="w-3 h-3 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-400" />
            )}
            <span className={`text-xs ${trend === "up" ? "text-green-400" : "text-red-400"}`}>
              {trendValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function getMasteryBadge(score: number) {
  if (score < 40) {
    return {
      label: "Needs Practice",
      className: "bg-red-500/10 text-red-400 border-red-500/20",
      barColor: "bg-red-500",
    };
  }
  if (score < 60) {
    return {
      label: "Developing",
      className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      barColor: "bg-amber-500",
    };
  }
  if (score < 80) {
    return {
      label: "Competent",
      className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      barColor: "bg-blue-500",
    };
  }
  return {
    label: "Mastered",
    className: "bg-green-500/10 text-green-400 border-green-500/20",
    barColor: "bg-green-500",
  };
}

function WeakTopicCard({
  topic,
  subject,
  masteryScore,
}: {
  topic: string;
  subject: string;
  masteryScore: number;
}) {
  const meta = getMasteryBadge(masteryScore);
  const rounded = Math.round(masteryScore);

  return (
    <div className="p-3.5 rounded-xl bg-secondary/20 border border-border hover:border-primary/40 transition-all space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm truncate">
              {topic}
            </span>
            <Badge variant="outline" className="text-[11px] py-0 px-2 font-normal bg-secondary/50 text-muted-foreground border-border">
              {subject}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-bold text-foreground">{rounded}%</span>
          <Badge className={cn("text-[10px] px-1.5 py-0.5 border font-medium", meta.className)}>
            {meta.label}
          </Badge>
        </div>
      </div>

      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", meta.barColor)}
          style={{ width: `${Math.max(5, rounded)}%` }}
        />
      </div>
    </div>
  );
}
