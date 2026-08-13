"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, ChevronLeft, ChevronRight, FileText, Play, BookOpenCheck, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface QuizOption {
  id: string;
  text: string;
}

interface QuizQuestion {
  question: string;
  options: QuizOption[];
  correct_option_id: string;
  explanation?: string;
}

interface QuizGenerateResponse {
  topic: string;
  questions: QuizQuestion[];
}

interface QuizSubmitResponse {
  score: number;
  correct_count: number;
  total_count: number;
  mastery_score: number;
  is_weak: boolean;
}

function QuizContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const initialSubjectId = searchParams.get("subjectId");
  const initialTopic = searchParams.get("documentId") || "General Topic"; // Or some default

  const [view, setView] = useState<"hub" | "generating" | "quiz" | "result">(initialSubjectId ? "generating" : "hub");
  
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [quizData, setQuizData] = useState<QuizGenerateResponse | null>(null);
  const [resultData, setResultData] = useState<QuizSubmitResponse | null>(null);
  
  const [subjectId, setSubjectId] = useState<string | null>(initialSubjectId);
  const [topic, setTopic] = useState<string>(initialTopic);

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      const { data } = await api.get('/subjects');
      return data;
    },
    enabled: view === "hub"
  });

  const generateMutation = useMutation({
    mutationFn: async (params: { subject_id: number; topic: string; num_questions: number }) => {
      const { data } = await api.post('/quiz/generate', params);
      return data as QuizGenerateResponse;
    },
    onSuccess: (data) => {
      setQuizData(data);
      setAnswers({});
      setCurrentQuestion(0);
      setView("quiz");
    },
    onError: (error: any) => {
      alert("Error generating quiz: " + (error.response?.data?.detail || error.message));
      setView("hub");
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!quizData || !subjectId) return;
      
      const payloadAnswers = quizData.questions.map((q, idx) => ({
        question_index: idx,
        selected_option_id: answers[idx] || "",
        correct_option_id: q.correct_option_id
      }));

      const { data } = await api.post('/quiz/submit', {
        subject_id: parseInt(subjectId, 10),
        topic: quizData.topic,
        answers: payloadAnswers
      });
      return data as QuizSubmitResponse;
    },
    onSuccess: (data) => {
      setResultData(data);
      setView("result");
    }
  });

  // Automatically start generation if navigated with params
  useEffect(() => {
    if (initialSubjectId && view === "generating" && !generateMutation.isPending) {
      generateMutation.mutate({
        subject_id: parseInt(initialSubjectId, 10),
        topic: initialTopic,
        num_questions: 5
      });
    }
  }, [initialSubjectId, initialTopic, view]);

  const handleStartFromHub = (subjId: number, t: string) => {
    setSubjectId(subjId.toString());
    setTopic(t);
    setView("generating");
    generateMutation.mutate({
      subject_id: subjId,
      topic: t,
      num_questions: 5
    });
  };

  const handleSelectAnswer = (answerId: string) => {
    setAnswers({ ...answers, [currentQuestion]: answerId });
  };

  const totalQuestions = quizData?.questions.length || 0;
  const question = quizData?.questions[currentQuestion];
  const selectedAnswer = answers[currentQuestion] ?? null;

  if (view === "hub") {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <h1 className="text-2xl font-bold text-foreground">Quiz Hub</h1>
        <p className="text-muted-foreground">Select a subject to generate a quiz</p>
        <div className="grid gap-4 md:grid-cols-2">
          {subjects.map((sub: any) => (
            <Card key={sub.id} className="bg-card border-border hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{sub.name}</h3>
                    <div className="text-sm text-muted-foreground mt-1">
                      Mastery: {sub.overall_mastery}%
                    </div>
                  </div>
                  <Button onClick={() => handleStartFromHub(sub.id, `Review ${sub.name}`)}>
                    <Play className="w-4 h-4 mr-2" />
                    Generate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (view === "generating") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Generating Adaptive Quiz...</h2>
          <p className="text-muted-foreground mt-2">Asking the AI to create questions based on your documents.</p>
        </div>
      </div>
    );
  }

  if (view === "quiz") {
    return (
      <div className="flex-1 flex h-screen overflow-hidden bg-background">
        <div className="flex-1 flex flex-col">
          <div className="px-6 py-3 border-b border-border bg-card">
            <div className="text-sm text-muted-foreground">
              <span className="text-primary font-medium">Quiz</span>
              <span className="mx-2">{">"}</span>
              <span>Topic: {quizData?.topic}</span>
              <span className="mx-2">{">"}</span>
              <span>{totalQuestions} Questions</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-4">
              <span className="text-foreground font-medium">
                Question {currentQuestion + 1} of {totalQuestions}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="destructive" size="sm" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? "Submitting..." : "Submit Exam"}
              </Button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
            {question && (
              <Card className="max-w-2xl w-full bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg font-medium text-foreground leading-relaxed">
                    {question.question}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleSelectAnswer(option.id)}
                      className={cn(
                        "w-full flex items-start gap-4 p-4 rounded-xl border transition-colors text-left",
                        selectedAnswer === option.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/30 hover:bg-secondary"
                      )}
                    >
                      <span className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0",
                        selectedAnswer === option.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      )}>
                        {option.id.toUpperCase()}
                      </span>
                      <span className="text-foreground pt-1">{option.text}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
              disabled={currentQuestion === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
            {currentQuestion === totalQuestions - 1 ? (
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="bg-green-600 hover:bg-green-700">
                Submit Quiz
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentQuestion(Math.min(totalQuestions - 1, currentQuestion + 1))}
                className="bg-primary hover:bg-primary/90"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>

        <div className="w-64 bg-card border-l border-border p-4">
          <h3 className="font-semibold text-foreground mb-4">Answer Grid</h3>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: totalQuestions }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentQuestion(i)}
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors",
                  currentQuestion === i
                    ? "bg-primary text-primary-foreground"
                    : answers[i]
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === "result" && resultData && quizData) {
    return (
      <div className="flex-1 p-6 overflow-auto bg-background">
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
          {/* Summary Card */}
          <Card className="bg-card border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-foreground">
                Quiz Complete!
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <div className={cn("text-6xl font-bold mb-3", resultData.score >= 60 ? "text-green-400" : "text-orange-400")}>
                  {Math.round(resultData.score)}%
                </div>
                <p className="text-muted-foreground text-lg">You answered {resultData.correct_count} out of {resultData.total_count} questions correctly</p>
              </div>

              {resultData.is_weak && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 max-w-2xl mx-auto">
                  <p className="text-sm text-orange-400 leading-relaxed text-center">
                    <strong>{`"${quizData?.topic}"`}</strong> has been flagged as a <strong>Knowledge Gap</strong> 
                    and will be prioritized in future sessions.
                  </p>
                </div>
              )}
              {!resultData.is_weak && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 max-w-2xl mx-auto">
                  <p className="text-sm text-green-400 leading-relaxed text-center">
                    Great job! You have demonstrated good mastery of this topic.
                  </p>
                </div>
              )}

              <div className="flex justify-center gap-4 mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/dashboard')}
                >
                  Back to Hub
                </Button>
                <Button 
                  className="border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => setView("hub")}
                >
                  New Quiz
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Review */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-foreground pl-2">Detailed Review</h2>
            
            {quizData.questions.map((q, idx) => {
              const userAnswer = answers[idx];
              const isCorrect = userAnswer === q.correct_option_id;

              return (
                <Card key={idx} className="bg-card border-border overflow-hidden">
                  <div className={cn(
                    "h-1.5 w-full",
                    isCorrect ? "bg-green-500" : "bg-red-500"
                  )} />
                  <CardHeader className="pb-3 flex flex-row gap-3 items-start">
                    <div className="mt-1 flex-shrink-0">
                      {isCorrect ? (
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Question {idx + 1}</div>
                      <CardTitle className="text-lg font-medium text-foreground leading-snug">
                        {q.question}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0 pl-[52px]">
                    <div className="space-y-2">
                      {q.options.map(opt => {
                        const isThisUserSelected = opt.id === userAnswer;
                        const isThisCorrect = opt.id === q.correct_option_id;
                        
                        let optionStyle = "border-border bg-secondary/30 text-muted-foreground opacity-60";
                        if (isThisCorrect) {
                          optionStyle = "border-green-500/50 bg-green-500/10 text-foreground";
                        } else if (isThisUserSelected && !isThisCorrect) {
                          optionStyle = "border-red-500/50 bg-red-500/10 text-foreground";
                        }

                        return (
                          <div key={opt.id} className={cn("flex items-start gap-3 p-3 rounded-lg border", optionStyle)}>
                            <span className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5",
                              isThisCorrect ? "bg-green-500/20 text-green-500" : 
                              isThisUserSelected ? "bg-red-500/20 text-red-500" : 
                              "bg-secondary text-muted-foreground"
                            )}>
                              {opt.id.toUpperCase()}
                            </span>
                            <span className="pt-0.5">{opt.text}</span>
                            {isThisUserSelected && !isThisCorrect && (
                              <span className="ml-auto text-xs font-semibold text-red-400 mt-1">Your Answer</span>
                            )}
                            {isThisCorrect && (
                              <span className="ml-auto text-xs font-semibold text-green-400 mt-1">Correct Answer</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {q.explanation && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
                        <h4 className="text-sm font-semibold text-primary mb-1">Explanation</h4>
                        <p className="text-sm text-foreground leading-relaxed">{q.explanation}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading quiz...</div>}>
      <QuizContent />
    </Suspense>
  );
}
