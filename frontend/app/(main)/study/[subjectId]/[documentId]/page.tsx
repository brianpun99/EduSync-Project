"use client";

import { useState, useEffect, useRef, FormEvent, use } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Send,
  FileText,
  Bot,
  User,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Loader2,
  Trash2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Source {
  document: string;
  snippet: string;
  score: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  created_at?: string;
}

interface PageProps {
  params: Promise<{
    subjectId: string;
    documentId: string;
  }>;
}

function formatTimestamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString([], { day: "numeric", month: "short" });
  return `${time} · ${date}`;
}

export default function StudyWorkspacePage({ params }: PageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { subjectId, documentId } = use(params);

  const [inputMessage, setInputMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // PDF viewer state
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch document metadata ──────────────────────────────────────────────────
  const { data: docMeta } = useQuery({
    queryKey: ["document", subjectId, documentId],
    queryFn: async () => {
      const { data } = await api.get(`/subjects/${subjectId}/documents`);
      return data.find((d: any) => d.id === parseInt(documentId, 10));
    },
  });

  // ── Load persisted chat history on mount ────────────────────────────────────
  useQuery({
    queryKey: ["chat_history", subjectId, documentId],
    queryFn: async () => {
      const { data } = await api.get(
        `/subjects/${subjectId}/documents/${documentId}/chat`
      );
      return data as ChatMessage[];
    },
    enabled: !historyLoaded,
    onSuccess: (data: ChatMessage[]) => {
      setChatMessages(data);
      setHistoryLoaded(true);
    },
  });

  // ── Scroll to bottom whenever messages change ────────────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Build blob URL for PDF (auth header required) ───────────────────────────
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    let objectUrl: string | null = null;
    api
      .get(`/subjects/${subjectId}/documents/${documentId}/file`, {
        responseType: "blob",
      })
      .then((res) => {
        const contentType = res.headers["content-type"] || "application/octet-stream";
        const blob = new Blob([res.data], { type: contentType });
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(() => setPdfError("Could not load document file."));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [subjectId, documentId]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  // ── Send message ─────────────────────────────────────────────────────────────
  const queryMutation = useMutation({
    mutationFn: async (question: string) => {
      const { data } = await api.post("/query", {
        subject_id: parseInt(subjectId, 10),
        document_id: parseInt(documentId, 10),
        question,
      });
      return data;
    },
    onSuccess: (data) => {
      const now = new Date().toISOString();
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
          created_at: now,
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
    const now = new Date().toISOString();

    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: currentMsg, created_at: now },
    ]);

    queryMutation.mutate(currentMsg);
  };

  // ── Clear history ────────────────────────────────────────────────────────────
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/subjects/${subjectId}/documents/${documentId}/chat`);
    },
    onSuccess: () => {
      setChatMessages([]);
      queryClient.invalidateQueries({ queryKey: ["chat_history", subjectId, documentId] });
    },
  });

  const handleGenerateQuiz = () => {
    router.push(`/quiz?subjectId=${subjectId}&documentId=${documentId}`);
  };

  return (
    <div className="flex-1 flex h-screen overflow-hidden">
      {/* ── Left Pane – PDF Viewer ─────────────────────────────────────────── */}
      <div className="w-[60%] flex flex-col border-r border-border bg-secondary/10">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
              {docMeta?.filename || `Document ${documentId}`}
            </span>
          </div>

          {/* Zoom controls */}
          {numPages > 0 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setScale((s) => Math.min(3, s + 0.15))}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Page navigation */}
        {numPages > 0 && (
          <div className="flex items-center justify-center gap-3 px-4 py-2 border-b border-border bg-card/50">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={numPages}
                value={currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= numPages) setCurrentPage(val);
                }}
                className="w-16 h-8 text-center bg-secondary border-border text-sm"
              />
              <span className="text-sm text-muted-foreground">of {numPages}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= numPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Document content */}
        <div ref={containerRef} className="flex-1 overflow-auto flex justify-center bg-secondary/30">
          {pdfError && (
            <div className="flex items-center justify-center h-full text-red-400">
              {pdfError}
            </div>
          )}

          {!pdfUrl && !pdfError && (
            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading document...
            </div>
          )}

          {pdfUrl && (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) => setPdfError(`Failed to load PDF: ${err.message}`)}
              loading={
                <div className="flex items-center justify-center h-full gap-2 text-muted-foreground py-20">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Rendering PDF...
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                scale={scale}
                className="shadow-lg my-4"
                loading={
                  <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Rendering page {currentPage}...
                  </div>
                }
              />
            </Document>
          )}
        </div>
      </div>

      {/* ── Right Pane – AI Chat ───────────────────────────────────────────── */}
      <div className="w-[40%] flex flex-col bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">AI Study Assistant</h3>
              <p className="text-xs text-muted-foreground">
                {chatMessages.length > 0
                  ? `${chatMessages.length} message${chatMessages.length !== 1 ? "s" : ""} in history`
                  : "Ask questions about this document"}
              </p>
            </div>
          </div>

          {/* Clear history button */}
          {chatMessages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
              onClick={() => setShowClearDialog(true)}
              title="Clear chat history"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-5">
          {chatMessages.length === 0 && !queryMutation.isPending && (
            <div className="text-center text-muted-foreground mt-10">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Ask a question based on your uploaded documents.</p>
            </div>
          )}

          {chatMessages.map((message, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <div
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "flex-row-reverse" : ""
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                    message.role === "user" ? "bg-primary" : "bg-secondary"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="w-4 h-4 text-primary-foreground" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-primary" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  )}
                >
                  <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                </div>
              </div>

              {/* Timestamp */}
              {message.created_at && (
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs text-muted-foreground px-2",
                    message.role === "user" ? "justify-end pr-11" : "pl-11"
                  )}
                >
                  <Clock className="w-3 h-3" />
                  {formatTimestamp(message.created_at)}
                </div>
              )}

              {/* Sources (assistant only) */}
              {message.role === "assistant" &&
                message.sources &&
                message.sources.length > 0 && (
                  <div className="ml-11 max-w-[85%] mt-1">
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">
                      Sources
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {message.sources.map((source, sIdx) => (
                        <div
                          key={sIdx}
                          className="flex items-center gap-1.5 px-2 py-1 bg-card rounded border border-border text-xs"
                        >
                          <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                          <span className="text-foreground max-w-[100px] truncate">
                            {source.document}
                          </span>
                          <span className="text-green-400 font-medium">
                            {Math.round(source.score * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          ))}

          {/* Thinking indicator */}
          {queryMutation.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-secondary">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              </div>
              <div className="bg-secondary text-foreground max-w-[85%] rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                Thinking...
              </div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={chatBottomRef} />
        </div>

        {/* Quiz button */}
        <div className="px-4 py-3 border-t border-border">
          <Button
            onClick={handleGenerateQuiz}
            className="w-full bg-primary hover:bg-primary/90 h-12 text-base font-semibold"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Generate Adaptive Quiz
          </Button>
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask anything about your documents..."
              className="bg-secondary border-border"
              disabled={queryMutation.isPending}
            />
            <Button
              type="submit"
              size="icon"
              className="bg-primary hover:bg-primary/90"
              disabled={queryMutation.isPending || !inputMessage.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </div>

      {/* ── Clear History Confirmation Dialog ──────────────────────────────── */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Chat History?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all{" "}
              <span className="text-foreground font-medium">{chatMessages.length} messages</span>{" "}
              in this chat. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearHistoryMutation.mutate();
                setShowClearDialog(false);
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Clear History
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
