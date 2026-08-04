"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, BookOpen, FileText, CheckCircle2, Zap, Target, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface QuizScoreTrend {
  date: string;
  subject: string;
  topic: string;
  score: number;
}

interface AnalyticsOverview {
  total_subjects: number;
  total_documents: number;
  total_quizzes_taken: number;
  average_quiz_score: number;
  quiz_score_trend: QuizScoreTrend[];
  strong_count: number;
  good_count: number;
  weak_count: number;
}

export default function AnalyticsPage() {
  const { data: analytics, isLoading, isError } = useQuery<AnalyticsOverview>({
    queryKey: ['analytics_overview'],
    queryFn: async () => {
      const { data } = await api.get('/analytics/overview');
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <BarChart3 className="w-10 h-10 animate-pulse" />
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-red-400">
          <AlertTriangle className="w-10 h-10" />
          <p>Failed to load analytics. Please try again.</p>
        </div>
      </div>
    );
  }

  const totalTopics = (analytics?.strong_count || 0) + (analytics?.good_count || 0) + (analytics?.weak_count || 0);

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
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Quiz Score Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics?.quiz_score_trend && analytics.quiz_score_trend.length > 0 ? (
              <div className="h-64 flex items-end justify-between gap-1 mt-4 pt-4 border-t border-border/50">
                {analytics.quiz_score_trend.map((trend, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group min-w-0">
                    <div className="w-full relative h-[200px] flex items-end justify-center">
                      <div
                        className={cn(
                          "w-full max-w-[40px] rounded-t-sm transition-all relative",
                          trend.score >= 80 ? "bg-green-500/40 hover:bg-green-500/70" :
                          trend.score >= 60 ? "bg-yellow-500/40 hover:bg-yellow-500/70" :
                          "bg-red-500/40 hover:bg-red-500/70"
                        )}
                        style={{ height: `${Math.max(5, trend.score)}%` }}
                      >
                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-popover border border-border text-popover-foreground text-xs px-2 py-1.5 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                          <div className="font-semibold">{trend.score}%</div>
                          <div className="text-muted-foreground">{trend.topic}</div>
                          <div className="text-muted-foreground">{trend.subject}</div>
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
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground border-t border-border/50 mt-4">
                <BarChart3 className="w-10 h-10 opacity-30" />
                <p className="text-sm">No quiz data available yet.</p>
                <p className="text-xs opacity-70">Take a quiz to see your progress here!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mastery Breakdown */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Mastery Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="border-t border-border/50 mt-2 pt-4">
            {totalTopics > 0 ? (
              <div className="space-y-4 mt-2">
                {/* Strong */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-green-400" />
                      <span className="text-foreground font-medium">Strong (≥80%)</span>
                    </span>
                    <span className="text-green-400 font-semibold">{analytics?.strong_count} topics</span>
                  </div>
                  <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${(analytics!.strong_count / totalTopics) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Good */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-yellow-400" />
                      <span className="text-foreground font-medium">Good (60–80%)</span>
                    </span>
                    <span className="text-yellow-400 font-semibold">{analytics?.good_count} topics</span>
                  </div>
                  <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                      style={{ width: `${(analytics!.good_count / totalTopics) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Weak */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="text-foreground font-medium">Needs Work (&lt;60%)</span>
                    </span>
                    <span className="text-red-400 font-semibold">{analytics?.weak_count} topics</span>
                  </div>
                  <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${(analytics!.weak_count / totalTopics) * 100}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                  Based on {totalTopics} tracked topic{totalTopics !== 1 ? "s" : ""} across all subjects.
                </p>
              </div>
            ) : (
              <div className="h-56 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Target className="w-10 h-10 opacity-30" />
                <p className="text-sm">No mastery data yet.</p>
                <p className="text-xs opacity-70">Complete quizzes to track topic mastery!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Quiz History Table */}
      {analytics?.quiz_score_trend && analytics.quiz_score_trend.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              Recent Quiz History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Date</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Subject</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Topic</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {[...analytics.quiz_score_trend].reverse().slice(0, 10).map((entry, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2.5 px-3 text-foreground">{entry.subject}</td>
                      <td className="py-2.5 px-3 text-foreground">{entry.topic}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={cn(
                          "font-semibold px-2 py-0.5 rounded-full text-xs",
                          entry.score >= 80 ? "bg-green-500/10 text-green-400" :
                          entry.score >= 60 ? "bg-yellow-500/10 text-yellow-400" :
                          "bg-red-500/10 text-red-400"
                        )}>
                          {entry.score}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
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
