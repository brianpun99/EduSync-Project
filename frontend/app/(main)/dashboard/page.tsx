"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, MessageSquare, Target, FileText, AlertTriangle, Clock, ChevronRight, TrendingUp, TrendingDown, CheckCircle2, BookOpen } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface WeakTopic {
  topic: string;
  subject: string;
  mastery_score: number;
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  meta?: string;
}

interface DashboardData {
  overall_mastery: number;
  weak_topics: WeakTopic[];
  document_count: number;
  study_time_minutes: number;
  study_time_formatted: string;
  recent_activities: ActivityItem[];
}

function formatTimeAgo(dateStr: string) {
  try {
    const date = new Date(dateStr.replace(" ", "T") + "Z");
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return "Recent";
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "Recent";
  }
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
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="text-muted-foreground text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Greeting Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Keep learning, keep growing!</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Overall Mastery"
          value={`${dashboard?.overall_mastery || 0}%`}
          subtext="Knowledge retention score"
          color="primary"
          showProgress
          progress={dashboard?.overall_mastery || 0}
        />
        <StatCard 
          label="Documents"
          value={`${dashboard?.document_count || 0}`}
          subtext="Vectorized study materials"
          color="cyan"
        />
        <StatCard 
          label="Weak Topics"
          value={`${dashboard?.weak_topics.length || 0}`}
          subtext="Flagged for revision"
          color="orange"
        />
        <StatCard 
          label="Study Time"
          value={dashboard?.study_time_formatted || "0h 0m"}
          subtext="Total learning duration"
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
              <div className="text-center py-10 text-muted-foreground space-y-2">
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
          <CardContent className="space-y-3">
            {dashboard?.recent_activities && dashboard.recent_activities.length > 0 ? (
              dashboard.recent_activities.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))
            ) : (
              <div className="text-center py-10 text-muted-foreground space-y-2">
                <Clock className="w-8 h-8 mx-auto opacity-40" />
                <p className="text-sm font-medium text-foreground">No Recent Activity</p>
                <p className="text-xs">Your quiz attempts, uploads, and study chats will show up here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const getIcon = () => {
    switch (item.type) {
      case "quiz":
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case "document":
        return <FileText className="w-4 h-4 text-cyan-400" />;
      case "chat":
        return <MessageSquare className="w-4 h-4 text-primary" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getBg = () => {
    switch (item.type) {
      case "quiz":
        return "bg-purple-500/10 border-purple-500/20";
      case "document":
        return "bg-cyan-500/10 border-cyan-500/20";
      case "chat":
        return "bg-primary/10 border-primary/20";
      default:
        return "bg-secondary";
    }
  };

  return (
    <div className="flex items-start gap-3.5 p-3 rounded-xl bg-secondary/20 border border-border hover:border-primary/40 transition-colors">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border mt-0.5", getBg())}>
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatTimeAgo(item.timestamp)}</span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
      </div>
      {item.meta && (
        <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium border-border bg-secondary/50 flex-shrink-0 self-center">
          {item.meta}
        </Badge>
      )}
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
