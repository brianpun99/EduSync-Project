"use client";

import { useState, FormEvent, use } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Send, FileText, Bot, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { document: string; snippet: string; score: number }[];
}

interface PageProps {
  params: Promise<{
    subjectId: string;
    documentId: string;
  }>;
}

export default function StudyWorkspacePage({ params }: PageProps) {
  const router = useRouter();
  const { subjectId, documentId } = use(params);
  
  const [inputMessage, setInputMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const queryMutation = useMutation({
    mutationFn: async (question: string) => {
      const { data } = await api.post("/query", {
        subject_id: parseInt(subjectId, 10),
        question,
      });
      return data;
    },
    onSuccess: (data) => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
        },
      ]);
    },
    onError: (error: any) => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.response?.data?.detail || "Could not fetch answer."}`,
        },
      ]);
    },
  });

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const currentMsg = inputMessage;
    setInputMessage("");

    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: currentMsg },
    ]);

    queryMutation.mutate(currentMsg);
  };

  const handleGenerateQuiz = () => {
    router.push(`/quiz?subjectId=${subjectId}&documentId=${documentId}`);
  };

  return (
    <div className="flex-1 flex h-screen overflow-hidden">
      {/* Left Pane - Placeholder for Document Viewer */}
      <div className="w-[60%] flex flex-col border-r border-border bg-secondary/10">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground truncate">
              Document {documentId}
            </span>
          </div>
          <div className="w-20" /> {/* Spacer */}
        </div>
        
        <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground">
          <p>The PDF Viewer component requires integration with a library like react-pdf.<br />For this step, we focus on the RAG chat integration on the right.</p>
        </div>
      </div>

      {/* Right Pane - RAG AI Chat */}
      <div className="w-[40%] flex flex-col bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">AI Study Assistant</h3>
              <p className="text-xs text-muted-foreground">Ask questions about this subject</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          {chatMessages.length === 0 && (
            <div className="text-center text-muted-foreground mt-10">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Ask a question based on your uploaded documents.</p>
            </div>
          )}

          {chatMessages.map((message, idx) => (
            <div key={idx} className={cn("flex flex-col gap-2")}>
              <div className={cn("flex gap-3", message.role === "user" ? "flex-row-reverse" : "")}>
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  message.role === "user" ? "bg-primary" : "bg-secondary"
                )}>
                  {message.role === "user" ? (
                    <User className="w-4 h-4 text-primary-foreground" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className={cn(
                  "max-w-[85%] rounded-xl px-4 py-3",
                  message.role === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-secondary text-foreground"
                )}>
                  <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                </div>
              </div>
              
              {/* Show sources if assistant */}
              {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                <div className="ml-11 max-w-[85%] mt-1">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Sources</div>
                  <div className="flex flex-wrap gap-2">
                    {message.sources.map((source, sIdx) => (
                      <div 
                        key={sIdx}
                        className="flex items-center gap-1.5 px-2 py-1 bg-card rounded border border-border text-xs"
                      >
                        <FileText className="w-3 h-3 text-primary" />
                        <span className="text-foreground max-w-[100px] truncate">{source.document}</span>
                        <span className="text-green-400">{Math.round(source.score * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {queryMutation.isPending && (
            <div className="flex gap-3">
               <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-secondary">
                 <Sparkles className="w-4 h-4 text-primary animate-pulse" />
               </div>
               <div className="bg-secondary text-foreground max-w-[85%] rounded-xl px-4 py-3 text-sm">
                 Thinking...
               </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border">
          <Button 
            onClick={handleGenerateQuiz}
            className="w-full bg-primary hover:bg-primary/90 h-12 text-base font-semibold"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Generate Adaptive Quiz
          </Button>
        </div>

        <form onSubmit={handleSendMessage} className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask anything about your documents..."
              className="bg-secondary border-border"
              disabled={queryMutation.isPending}
            />
            <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90" disabled={queryMutation.isPending}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
