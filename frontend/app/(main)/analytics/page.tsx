"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, TrendingDown, BookOpen, FileText, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

interface QuizScoreTrend {
  date: string;
  score: number;
}

interface AnalyticsOverview {
  total_subjects: number;
  total_documents: number;
  total_quizzes_taken: number;
  average_quiz_score: number;
  quiz_score_trend: QuizScoreTrend[];
}

export default function AnalyticsPage() {
  const { data: analytics, isLoading } = useQuery<AnalyticsOverview>({
    queryKey: ['analytics_overview'],
    queryFn: async () => {
      const { data } = await api.get('/analytics/overview');
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-6">Loading analytics...</div>;
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground">Track your learning progress and mastery</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={<BookOpen className="w-5 h-5 text-primary" />}
          label="Subjects"
          value={analytics?.total_subjects.toString() || "0"}
          color="primary"
        />
        <StatCard 
          icon={<FileText className="w-5 h-5 text-cyan-400" />}
          label="Documents"
          value={analytics?.total_documents.toString() || "0"}
          color="cyan"
        />
        <StatCard 
          icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
          label="Quizzes Taken"
          value={analytics?.total_quizzes_taken.toString() || "0"}
          color="green"
        />
        <StatCard 
          icon={<BarChart3 className="w-5 h-5 text-orange-400" />}
          label="Avg Score"
          value={`${Math.round(analytics?.average_quiz_score || 0)}%`}
          color="orange"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Performance Trend */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Performance Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics?.quiz_score_trend && analytics.quiz_score_trend.length > 0 ? (
              <div className="h-64 flex items-end justify-between gap-2 mt-4 pt-4 border-t border-border/50">
                {analytics.quiz_score_trend.map((trend, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full relative h-[200px] flex items-end justify-center">
                      <div 
                        className="w-full max-w-[40px] bg-primary/20 hover:bg-primary/40 rounded-t-sm transition-all relative group-hover:bg-primary/60"
                        style={{ height: `${Math.max(5, trend.score)}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {trend.score}%
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground truncate w-full text-center">
                      {new Date(trend.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No quiz data available yet.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Study Time / Activity placeholder */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Study Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground border-t border-border/50 mt-4">
              Detailed activity tracking coming soon.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ 
  icon,
  label, 
  value, 
  color
}: { 
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  const bgClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    cyan: "bg-cyan-500/10 text-cyan-400",
    orange: "bg-orange-500/10 text-orange-400",
    green: "bg-green-500/10 text-green-400"
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bgClasses[color]}`}>
          {icon}
        </div>
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}
