"use client";

import { useState, useEffect, useRef, FormEvent, use } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Minus,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

  // PDF viewer state
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch document metadata (to get filename)
  const { data: docMeta } = useQuery({
    queryKey: ["document", subjectId, documentId],
    queryFn: async () => {
      const { data } = await api.get(`/subjects/${subjectId}/documents`);
      return data.find((d: any) => d.id === parseInt(documentId, 10));
    },
  });

  // Build the PDF URL with auth token
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    // Fetch the file as a blob so we can pass the auth header
    api
      .get(`/subjects/${subjectId}/documents/${documentId}/file`, {
        responseType: "blob",
      })
      .then((res) => {
        const blob = new Blob([res.data], { type: "application/pdf" });
        setPdfUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        setPdfError("Could not load document file.");
      });

    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [subjectId, documentId]);

  const isPdf = docMeta?.filename?.toLowerCase().endsWith(".pdf");

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

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
      {/* Left Pane - Document Viewer */}
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

          {/* PDF Controls */}
          {isPdf && numPages > 0 && (
            <div className="flex items-center gap-1">
              {/* Zoom */}
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
          {!isPdf && <div className="w-20" />}
        </div>

        {/* Page Navigation */}
        {isPdf && numPages > 0 && (
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
                  if (!isNaN(val) && val >= 1 && val <= numPages) {
                    setCurrentPage(val);
                  }
                }}
                className="w-16 h-8 text-center bg-secondary border-border text-sm"
              />
              <span className="text-sm text-muted-foreground">
                of {numPages}
              </span>
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

        {/* Document Content */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto flex justify-center bg-secondary/30"
        >
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

          {pdfUrl && isPdf && (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) =>
                setPdfError(`Failed to load PDF: ${err.message}`)
              }
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

          {pdfUrl && !isPdf && (
            <div className="flex items-center justify-center h-full text-muted-foreground p-8 text-center">
              <div>
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">
                  PPTX preview is not supported in the browser.
                </p>
                <p className="text-sm mt-1">
                  The document has been processed and you can ask questions about
                  it using the AI assistant on the right.
                </p>
              </div>
            </div>
          )}
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
              <h3 className="font-semibold text-foreground">
                AI Study Assistant
              </h3>
              <p className="text-xs text-muted-foreground">
                Ask questions about this subject
              </p>
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
              <div
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "flex-row-reverse" : ""
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    message.role === "user" ? "bg-primary" : "bg-secondary"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="w-4 h-4 text-primary-foreground" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  )}
                >
                  <div className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              </div>

              {/* Show sources if assistant */}
              {message.role === "assistant" &&
                message.sources &&
                message.sources.length > 0 && (
                  <div className="ml-11 max-w-[85%] mt-1">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Sources
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {message.sources.map((source, sIdx) => (
                        <div
                          key={sIdx}
                          className="flex items-center gap-1.5 px-2 py-1 bg-card rounded border border-border text-xs"
                        >
                          <FileText className="w-3 h-3 text-primary" />
                          <span className="text-foreground max-w-[100px] truncate">
                            {source.document}
                          </span>
                          <span className="text-green-400">
                            {Math.round(source.score * 100)}%
                          </span>
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
            <Button
              type="submit"
              size="icon"
              className="bg-primary hover:bg-primary/90"
              disabled={queryMutation.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
