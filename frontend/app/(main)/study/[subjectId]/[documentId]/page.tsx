"use client";

import { useState, useEffect, useRef, FormEvent, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
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
  History,
  X,
  MessageSquare,
  ChevronDown,
  Filter,
  Eye,
  EyeOff,
  ExternalLink,
  Highlighter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  findSnippetMatchesInPage,
  applyHighlightsToText,
  escapeHtml,
  type HighlightRange,
} from "@/lib/pdf-highlighter";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Source {
  document: string;
  document_id?: number;
  snippet: string;
  score: number;
  pageNumber?: number;
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

interface MessageBubbleProps {
  message: ChatMessage;
  activeSourceIdx: number | null;
  activeSources: Source[];
  sourcePageMap: Record<number, number>;
  currentDocName?: string;
  currentDocId?: number;
  onSelectSource: (source: Source, index: number, allSources: Source[]) => void;
  onOpenOtherDoc?: (docName: string) => void;
}

function MessageBubble({
  message,
  activeSourceIdx,
  activeSources,
  sourcePageMap,
  currentDocName,
  currentDocId,
  onSelectSource,
  onOpenOtherDoc,
}: MessageBubbleProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className={cn("flex gap-3", message.role === "user" ? "flex-row-reverse" : "")}>
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
          <div className="ml-11 max-w-[85%] mt-1.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                Cited Sources
              </span>
              <span className="text-[11px] text-purple-400/80">Click to highlight in PDF</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((source, sIdx) => {
                const isCurrentDoc =
                  source.document_id != null && currentDocId != null
                    ? source.document_id === currentDocId
                    : !currentDocName || source.document === currentDocName;
                const pageNumber = sourcePageMap[sIdx] ?? source.pageNumber;
                const isSelected =
                  activeSources.includes(source) &&
                  (activeSourceIdx === sIdx || (activeSourceIdx === null && sIdx === 0));

                return (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => {
                      if (isCurrentDoc) {
                        onSelectSource(source, sIdx, message.sources || []);
                      } else if (onOpenOtherDoc) {
                        onOpenOtherDoc(source.document);
                      }
                    }}
                    title={
                      isCurrentDoc
                        ? pageNumber
                          ? `Jump to source on page ${pageNumber}`
                          : "Jump to cited source location in PDF"
                        : `Open source document: ${source.document}`
                    }
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs text-left transition-all group cursor-pointer",
                      isSelected
                        ? "bg-purple-500/20 border-purple-500/70 text-purple-200 shadow-sm shadow-purple-500/10 ring-1 ring-purple-500/50"
                        : "bg-card border-border hover:border-purple-500/40 hover:bg-purple-500/5 text-foreground"
                    )}
                  >
                    <FileText
                      className={cn(
                        "w-3.5 h-3.5 flex-shrink-0 transition-colors",
                        isSelected ? "text-purple-300" : "text-purple-400 group-hover:text-purple-300"
                      )}
                    />
                    <span className="font-medium max-w-[110px] truncate">{source.document}</span>

                    {/* Page badge */}
                    {isCurrentDoc && pageNumber ? (
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide",
                          isSelected
                            ? "bg-purple-500 text-white shadow-sm"
                            : "bg-purple-500/20 text-purple-300"
                        )}
                      >
                        p.{pageNumber}
                      </span>
                    ) : !isCurrentDoc ? (
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    ) : null}

                    {/* Relevance score */}
                    <span className="text-green-400 text-[11px] font-medium ml-0.5">
                      {Math.round(source.score * 100)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
}

export default function StudyWorkspacePage({ params }: PageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { subjectId, documentId } = use(params);

  // ── Chat state (starts blank every visit) ───────────────────────────────────
  const [inputMessage, setInputMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // ── Document scope checklist ────────────────────────────────────────────────
  const currentDocId = parseInt(documentId, 10);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(
    () => new Set([currentDocId])
  );
  const [scopeOpen, setScopeOpen] = useState(false);

  // Fetch all sibling documents in this subject for the checklist
  const { data: siblingDocs = [] } = useQuery<{ id: number; filename: string }[]>({
    queryKey: ["subject_documents", subjectId],
    queryFn: async () => {
      const { data } = await api.get(`/subjects/${subjectId}/documents`);
      return data;
    },
  });

  const toggleDocId = (docId: number) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      // Prevent unchecking the current document
      if (docId === currentDocId) return next;
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // ── PDF viewer & Source text highlighting state ─────────────────────────────
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pdfProxy, setPdfProxy] = useState<any>(null);
  const [activeSources, setActiveSources] = useState<Source[]>([]);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState<number | null>(null);
  const [showHighlights, setShowHighlights] = useState<boolean>(true);
  const [pageHighlights, setPageHighlights] = useState<Record<number, Record<number, HighlightRange[]>>>({});
  const [sourcePageMap, setSourcePageMap] = useState<Record<number, number>>({});
  const [highlightsVersion, setHighlightsVersion] = useState(0);
  const pageItemsCacheRef = useRef<Map<number, Array<{ str: string; hasEOL?: boolean }>>>(new Map());

  // ── Fetch document metadata ─────────────────────────────────────────────────
  const { data: docMeta } = useQuery({
    queryKey: ["document", subjectId, documentId],
    queryFn: async () => {
      const { data } = await api.get(`/subjects/${subjectId}/documents`);
      return data.find((d: any) => d.id === parseInt(documentId, 10));
    },
  });

  // ── Reset highlights & state when documentId changes ───────────────────────
  useEffect(() => {
    const nextDocId = parseInt(documentId, 10);
    if (!isNaN(nextDocId)) {
      setSelectedDocIds(new Set([nextDocId]));
    }
    setChatMessages([]);
    setActiveSources([]);
    setSelectedSourceIdx(null);
    setPageHighlights({});
    setSourcePageMap({});
    setNumPages(0);
    setCurrentPage(1);
    setPdfUrl(null);
    setPdfError(null);
    setPdfProxy(null);
    pageItemsCacheRef.current.clear();
  }, [documentId]);

  // ── Fetch persisted history (kept separate — not auto-loaded into chat) ─────
  const { data: chatHistory = [], isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery<ChatMessage[]>({
    queryKey: ["chat_history", subjectId, documentId],
    queryFn: async () => {
      const { data } = await api.get(
        `/subjects/${subjectId}/documents/${documentId}/chat`
      );
      return data as ChatMessage[];
    },
    // Only fetch when the history panel is opened
    enabled: showHistoryPanel,
  });

  // ── Active Study Time Logger (Heartbeat every 30s) ──────────────────────────
  useEffect(() => {
    const sId = parseInt(subjectId, 10);
    const dId = parseInt(documentId, 10);
    if (isNaN(sId) || isNaN(dId)) return;

    const interval = setInterval(() => {
      api.post("/analytics/study-time", {
        duration_seconds: 30,
        subject_id: sId,
        document_id: dId,
      }).catch(() => {});
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [subjectId, documentId]);

  // ── Scroll to bottom when new messages arrive ───────────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Build blob URL for PDF (auth header required) ───────────────────────────
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    api
      .get(`/subjects/${subjectId}/documents/${documentId}/file`, {
        responseType: "blob",
      })
      .then((res) => {
        const contentType = String(res.headers["content-type"] || "application/octet-stream");
        const blob = new Blob([res.data], { type: contentType });
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(() => setPdfError("Could not load document file."));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [subjectId, documentId]);

  const onDocumentLoadSuccess = (pdf: any) => {
    setNumPages(pdf.numPages);
    setCurrentPage(1);
    setPdfProxy(pdf);
  };

  // ── Index document pages and calculate source text highlight ranges ────────
  useEffect(() => {
    if (!pdfProxy || !activeSources || activeSources.length === 0) {
      setPageHighlights({});
      setSourcePageMap({});
      return;
    }

    let isMounted = true;

    async function processHighlights() {
      const currentFileName = docMeta?.filename;
      const currentDocIdNum = parseInt(documentId, 10);
      const newPageHighlights: Record<number, Record<number, HighlightRange[]>> = {};
      const newSourcePageMap: Record<number, number> = {};

      const relevant = activeSources
        .map((s, idx) => ({ ...s, originalIdx: idx }))
        .filter((s) => {
          if (s.document_id != null && !isNaN(currentDocIdNum)) {
            return s.document_id === currentDocIdNum;
          }
          if (currentFileName) {
            return s.document === currentFileName;
          }
          return true;
        });

      if (relevant.length === 0) {
        if (isMounted) {
          setPageHighlights({});
          setSourcePageMap({});
        }
        return;
      }

      // Pre-extract text items for all pages in this document if not yet cached
      for (let p = 1; p <= pdfProxy.numPages; p++) {
        if (!pageItemsCacheRef.current.has(p)) {
          try {
            const page = await pdfProxy.getPage(p);
            const textContent = await page.getTextContent();
            const items = textContent.items
              .filter((item: any) => typeof item.str === "string")
              .map((item: any) => ({ str: item.str, hasEOL: Boolean(item.hasEOL) }));
            pageItemsCacheRef.current.set(p, items);
          } catch (err) {
            console.warn(`Error extracting text from page ${p}:`, err);
          }
        }
      }

      if (!isMounted) return;

      for (const src of relevant) {
        const isSelected =
          selectedSourceIdx === src.originalIdx ||
          (selectedSourceIdx === null && src.originalIdx === 0);
        let firstMatchedPage: number | null = null;

        // If source has a known pageNumber, prioritize checking that page first
        const pagesToCheck: number[] = [];
        if (src.pageNumber && src.pageNumber >= 1 && src.pageNumber <= pdfProxy.numPages) {
          pagesToCheck.push(src.pageNumber);
        }
        for (let p = 1; p <= pdfProxy.numPages; p++) {
          if (!pagesToCheck.includes(p)) {
            pagesToCheck.push(p);
          }
        }

        for (const p of pagesToCheck) {
          const items = pageItemsCacheRef.current.get(p);
          if (!items || items.length === 0) continue;

          const matches = findSnippetMatchesInPage(
            items,
            src.snippet,
            src.originalIdx,
            isSelected
          );

          if (matches.length > 0) {
            if (firstMatchedPage === null) {
              firstMatchedPage = p;
            }
            if (!newPageHighlights[p]) {
              newPageHighlights[p] = {};
            }
            for (const m of matches) {
              if (!newPageHighlights[p][m.itemIndex]) {
                newPageHighlights[p][m.itemIndex] = [];
              }
              newPageHighlights[p][m.itemIndex].push(...m.ranges);
            }
            // If we matched the page indicated by backend metadata, avoid highlighting false positives elsewhere
            if (src.pageNumber && p === src.pageNumber) {
              break;
            }
          }
        }

        const resolvedPage =
          firstMatchedPage ??
          (src.pageNumber && src.pageNumber <= pdfProxy.numPages ? src.pageNumber : null);

        if (resolvedPage !== null) {
          newSourcePageMap[src.originalIdx] = resolvedPage;
        }
      }

      if (isMounted) {
        setPageHighlights(newPageHighlights);
        setSourcePageMap(newSourcePageMap);
        setHighlightsVersion((v) => v + 1);

        // Auto-navigate to page containing selected source
        const targetIdx = selectedSourceIdx ?? 0;
        const targetPage = newSourcePageMap[targetIdx];
        if (targetPage && targetPage >= 1 && targetPage <= pdfProxy.numPages) {
          setCurrentPage((prev) => (prev !== targetPage ? targetPage : prev));
        }
      }
    }

    processHighlights();

    return () => {
      isMounted = false;
    };
  }, [pdfProxy, activeSources, selectedSourceIdx, docMeta?.filename, documentId]);

  // ── Custom text renderer for react-pdf Page ────────────────────────────────
  const customTextRenderer = useCallback(
    ({ pageNumber, itemIndex, str }: { pageNumber: number; itemIndex: number; str: string }) => {
      if (!showHighlights) {
        return escapeHtml(str);
      }
      const ranges = pageHighlights[pageNumber]?.[itemIndex];
      if (!ranges || ranges.length === 0) {
        return escapeHtml(str);
      }
      return applyHighlightsToText(str, ranges);
    },
    [pageHighlights, showHighlights]
  );

  // ── Auto-scroll to active light purple highlight in PDF ────────────────────
  const scrollToHighlight = useCallback(() => {
    if (!containerRef.current || !showHighlights) return;
    const activeMark =
      containerRef.current.querySelector("mark.source-highlight.active") ||
      containerRef.current.querySelector("mark.source-highlight");
    if (activeMark) {
      activeMark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [showHighlights]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToHighlight();
    }, 150);
    return () => clearTimeout(timer);
  }, [currentPage, selectedSourceIdx, pageHighlights, scrollToHighlight]);

  // ── Source selection & navigation handlers ─────────────────────────────────
  const handleSelectSource = (
    source: Source,
    index: number,
    allSources: Source[]
  ) => {
    setActiveSources(allSources);
    setSelectedSourceIdx(index);
    setShowHighlights(true);

    const targetPage = sourcePageMap[index] ?? source.pageNumber;
    if (targetPage && targetPage >= 1 && targetPage <= numPages) {
      setCurrentPage(targetPage);
    }
  };

  const handleOpenOtherDoc = (filename: string) => {
    const targetDoc = siblingDocs.find((d) => d.filename === filename);
    if (targetDoc) {
      router.push(`/study/${subjectId}/${targetDoc.id}`);
    }
  };

  // ── Send message ─────────────────────────────────────────────────────────────
  const queryMutation = useMutation({
    mutationFn: async (question: string) => {
      const { data } = await api.post("/query", {
        subject_id: parseInt(subjectId, 10),
        document_id: currentDocId,
        question,
        document_ids: Array.from(selectedDocIds),
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
      if (data.sources && data.sources.length > 0) {
        setActiveSources(data.sources);
        setSelectedSourceIdx(0);
        setShowHighlights(true);
      }
      // Invalidate history cache so it refreshes next time panel opens
      queryClient.invalidateQueries({ queryKey: ["chat_history", subjectId, documentId] });
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

  // ── Clear all history ────────────────────────────────────────────────────────
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/subjects/${subjectId}/documents/${documentId}/chat`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_history", subjectId, documentId] });
      setShowClearDialog(false);
      setShowHistoryPanel(false);
      setActiveSources([]);
      setSelectedSourceIdx(null);
      setPageHighlights({});
      setSourcePageMap({});
    },
  });

  const handleGenerateQuiz = () => {
    const docIdsParam = Array.from(selectedDocIds).join(",");
    const rawName = docMeta?.filename || `Document ${documentId}`;
    const cleanTopic = rawName.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
    router.push(
      `/quiz?subjectId=${subjectId}&documentId=${documentId}&topic=${encodeURIComponent(cleanTopic)}&documentIds=${docIdsParam}`
    );
  };

  const handleOpenHistory = () => {
    setShowHistoryPanel(true);
    refetchHistory();
  };

  // Pages in this document that have citations
  const citedPages = Object.keys(pageHighlights)
    .map(Number)
    .filter((p) => Object.keys(pageHighlights[p] || {}).length > 0)
    .sort((a, b) => a - b);

  const citationsOnCurrentPage = pageHighlights[currentPage]
    ? Object.keys(pageHighlights[currentPage]).length
    : 0;

  const totalCitationsInDoc = citedPages.length;

  return (
    <div className="flex-1 flex h-full max-h-screen overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        {/* ── Left Pane – PDF Viewer ─────────────────────────────────────────── */}
        <ResizablePanel
          defaultSize={60}
          minSize={30}
          maxSize={80}
          className="flex flex-col border-r border-border bg-secondary/10 min-h-0 h-full overflow-hidden"
        >
          {/* Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-card">
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

          <div className="flex items-center gap-2">
            {/* Highlight Indicator and Controls */}
            {totalCitationsInDoc > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 border border-purple-500/25 rounded-lg text-xs text-purple-300">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span className="font-medium hidden sm:inline">
                  {citationsOnCurrentPage > 0
                    ? `Source on p.${currentPage}`
                    : `${totalCitationsInDoc} cited page${totalCitationsInDoc > 1 ? "s" : ""}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-purple-300 hover:text-purple-100 hover:bg-purple-500/20 cursor-pointer"
                  onClick={() => setShowHighlights((v) => !v)}
                  title={showHighlights ? "Hide light purple highlights" : "Show light purple highlights"}
                >
                  {showHighlights ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </Button>
              </div>
            )}

            {numPages > 0 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}>
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setScale((s) => Math.min(3, s + 0.15))}>
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* AI Grounding Banner when highlights exist */}
        {showHighlights && totalCitationsInDoc > 0 && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 bg-purple-950/25 border-b border-purple-500/20 text-xs text-purple-200">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium text-[11px] border border-purple-500/30 flex items-center gap-1">
                <Highlighter className="w-3 h-3 text-purple-300" />
                Cited Sources
              </span>
              <span className="text-purple-200/90 text-xs hidden sm:inline">
                Light purple highlights show cited source text in this document
              </span>
            </div>

            {/* Jump to cited pages */}
            {citedPages.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground hidden md:inline">Cited:</span>
                {citedPages.map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium transition-all cursor-pointer",
                      currentPage === page
                        ? "bg-purple-600 text-white shadow-sm ring-1 ring-purple-400"
                        : "bg-purple-500/10 text-purple-300 hover:bg-purple-500/25"
                    )}
                  >
                    p.{page}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Page navigation */}
        {numPages > 0 && (
          <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-2 border-b border-border bg-card/50">
            <Button variant="outline" size="sm" disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={numPages} value={currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= numPages) setCurrentPage(val);
                }}
                className="w-16 h-8 text-center bg-secondary border-border text-sm"
              />
              <span className="text-sm text-muted-foreground">of {numPages}</span>
            </div>
            <Button variant="outline" size="sm" disabled={currentPage >= numPages}
              onClick={() => setCurrentPage((p) => p + 1)}>
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Document content */}
        <div ref={containerRef} className="flex-1 min-h-0 overflow-auto flex justify-center bg-secondary/30">
          {pdfError && (
            <div className="flex items-center justify-center h-full text-red-400">{pdfError}</div>
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
                key={`page-${currentPage}-scale-${scale}-hl-${highlightsVersion}`}
                pageNumber={currentPage}
                scale={scale}
                customTextRenderer={customTextRenderer}
                onRenderSuccess={() => {
                  setTimeout(scrollToHighlight, 120);
                }}
                className="shadow-lg my-4 relative"
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
      </ResizablePanel>

      {/* ── Resizable Splitter Handle ────────────────────────────────────────── */}
      <ResizableHandle withHandle />

      {/* ── Right Pane – AI Chat ───────────────────────────────────────────── */}
      <ResizablePanel
        defaultSize={40}
        minSize={25}
        maxSize={70}
        className="flex flex-col bg-card relative min-h-0 h-full overflow-hidden"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">AI Study Assistant</h3>
              <p className="text-xs text-muted-foreground">Ask questions about this document</p>
            </div>
          </div>

          {/* History button — top right corner */}
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5 text-sm border-border hover:border-primary/50 hover:text-primary transition-colors"
            onClick={handleOpenHistory}
          >
            <History className="w-4 h-4" />
            History
          </Button>
        </div>

        {/* ── Document Scope Checklist ──────────────────────────────────────── */}
        {siblingDocs.length > 1 && (
          <Collapsible open={scopeOpen} onOpenChange={setScopeOpen} className="flex-shrink-0">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/30 hover:bg-secondary/50 transition-colors text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Filter className="w-3.5 h-3.5" />
                  <span className="font-medium">Retrieval Scope</span>
                  <span className="text-primary font-semibold">
                    {selectedDocIds.size} of {siblingDocs.length} files
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
                    scopeOpen && "rotate-180"
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-2 border-b border-border bg-secondary/20 space-y-1.5">
                <p className="text-[11px] text-muted-foreground mb-2">
                  Select which documents the AI should reference:
                </p>
                {siblingDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => {
                      if (doc.id !== currentDocId) {
                        toggleDocId(doc.id);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs select-none",
                      doc.id === currentDocId
                        ? "bg-primary/10 border border-primary/20 cursor-default"
                        : "hover:bg-secondary/60",
                      selectedDocIds.has(doc.id)
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <Checkbox
                      checked={selectedDocIds.has(doc.id)}
                      disabled={doc.id === currentDocId}
                      className="h-3.5 w-3.5 pointer-events-none"
                    />
                    <FileText className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{doc.filename}</span>
                    {doc.id === currentDocId && (
                      <span className="ml-auto text-[10px] text-primary font-medium">
                        current
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Messages (current session only — starts blank) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 overscroll-contain">
          {chatMessages.length === 0 && !queryMutation.isPending && (
            <div className="text-center text-muted-foreground mt-10 space-y-3">
              <Sparkles className="w-8 h-8 mx-auto opacity-50" />
              <p className="text-sm">Ask a question based on your uploaded documents.</p>
              <button
                onClick={handleOpenHistory}
                className="inline-flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors underline-offset-2 hover:underline"
              >
                <History className="w-3 h-3" />
                View previous conversations
              </button>
            </div>
          )}

          {chatMessages.map((message, idx) => (
            <MessageBubble
              key={idx}
              message={message}
              activeSourceIdx={selectedSourceIdx}
              activeSources={activeSources}
              sourcePageMap={sourcePageMap}
              currentDocName={docMeta?.filename}
              currentDocId={currentDocId}
              onSelectSource={handleSelectSource}
              onOpenOtherDoc={handleOpenOtherDoc}
            />
          ))}

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

          <div ref={chatBottomRef} />
        </div>

        {/* Quiz button */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-card">
          <Button onClick={handleGenerateQuiz}
            className="w-full bg-primary hover:bg-primary/90 h-12 text-base font-semibold">
            <Sparkles className="w-5 h-5 mr-2" />
            Generate Adaptive Quiz
          </Button>
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="flex-shrink-0 p-4 border-t border-border bg-card">
          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask anything about your documents..."
              className="bg-secondary border-border"
              disabled={queryMutation.isPending}
            />
            <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90"
              disabled={queryMutation.isPending || !inputMessage.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>

        {/* ── History Slide-over Panel ─────────────────────────────────────── */}
        {showHistoryPanel && (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 z-10"
              onClick={() => setShowHistoryPanel(false)}
            />

            {/* Panel */}
            <div className="absolute inset-0 z-20 flex flex-col bg-card animate-in slide-in-from-right duration-200">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/95">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">Chat History</h3>
                    <p className="text-xs text-muted-foreground">
                      {chatHistory.length > 0
                        ? `${chatHistory.length} messages saved`
                        : "No past conversations"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {chatHistory.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                      onClick={() => setShowClearDialog(true)}
                      title="Clear all history"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setShowHistoryPanel(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* History messages */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 overscroll-contain">
                {isHistoryLoading ? (
                  <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading history...
                  </div>
                ) : chatHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <MessageSquare className="w-10 h-10 opacity-30" />
                    <p className="text-sm">No previous conversations yet.</p>
                    <p className="text-xs opacity-70">
                      Your Q&amp;A sessions will appear here after your first chat.
                    </p>
                  </div>
                ) : (
                  chatHistory.map((message, idx) => (
                    <MessageBubble
                      key={idx}
                      message={message}
                      activeSourceIdx={selectedSourceIdx}
                      activeSources={activeSources}
                      sourcePageMap={sourcePageMap}
                      currentDocName={docMeta?.filename}
                      currentDocId={currentDocId}
                      onSelectSource={(source, sIdx, allSources) => {
                        handleSelectSource(source, sIdx, allSources);
                        setShowHistoryPanel(false);
                      }}
                      onOpenOtherDoc={handleOpenOtherDoc}
                    />
                  ))
                )}
              </div>

              {/* Panel Footer */}
              <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-card/95">
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={() => setShowHistoryPanel(false)}
                >
                  Back to Chat
                </Button>
              </div>
            </div>
          </>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>

      {/* ── Clear History Confirmation Dialog ──────────────────────────────── */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Chat History?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all{" "}
              <span className="text-foreground font-medium">{chatHistory.length} messages</span>{" "}
              saved for this document. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearHistoryMutation.mutate()}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {clearHistoryMutation.isPending ? "Clearing..." : "Clear History"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
