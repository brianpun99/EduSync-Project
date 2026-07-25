"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, FileText, Search, Plus, ChevronRight, BookOpen, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface Subject {
  id: number;
  name: string;
  document_count: number;
  storage_used_mb: number;
  storage_limit_mb: number;
  overall_mastery: number;
}

interface Document {
  id: number;
  subject_id: number;
  filename: string;
  file_size_bytes: number;
  page_count: number | null;
  chunk_count: number;
  status: string;
}

export default function SubjectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: subjects = [], isLoading: isLoadingSubjects } = useQuery<Subject[]>({
    queryKey: ['subjects'],
    queryFn: async () => {
      const { data } = await api.get('/subjects');
      return data;
    }
  });

  const { data: documents = [], isLoading: isLoadingDocs } = useQuery<Document[]>({
    queryKey: ['documents', selectedSubject],
    queryFn: async () => {
      const { data } = await api.get(`/subjects/${selectedSubject}/documents`);
      return data;
    },
    enabled: selectedSubject !== null,
  });

  const createSubjectMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post('/subjects', { name });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/subjects/${selectedSubject}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', selectedSubject] });
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || "Upload failed");
    }
  });

  const handleCreateSubject = () => {
    const name = prompt("Enter subject name:");
    if (name) {
      createSubjectMutation.mutate(name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadDocumentMutation.mutate(file);
    }
    // reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const filteredSubjects = subjects.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentSubject = subjects.find(s => s.id === selectedSubject);

  if (selectedSubject && currentSubject) {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button 
            onClick={() => setSelectedSubject(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Subjects
          </button>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground font-medium">{currentSubject.name}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{currentSubject.name}</h1>
            <p className="text-muted-foreground">{currentSubject.document_count} documents</p>
          </div>
          <Button 
            className="bg-primary hover:bg-primary/90"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadDocumentMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />
            {uploadDocumentMutation.isPending ? "Uploading..." : "Add Document"}
          </Button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange}
            accept=".pdf,.pptx"
          />
        </div>

        {/* Upload Drop Zone */}
        <div 
          className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-secondary/20 hover:bg-secondary/30 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-10 h-10 text-muted-foreground" />
            <p className="text-foreground font-medium">Drop PDF files here or click to upload</p>
            <p className="text-sm text-muted-foreground">Max File Size: <span className="font-bold text-yellow-500">10MB</span></p>
          </div>
        </div>

        {/* Documents List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Documents</h2>
          {isLoadingDocs ? (
            <p className="text-muted-foreground">Loading documents...</p>
          ) : documents.length > 0 ? (
            documents.map((doc) => (
              <Card 
                key={doc.id} 
                className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => {
                  if (doc.status === 'vectorized') {
                    router.push(`/study/${currentSubject.id}/${doc.id}`);
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{doc.filename}</div>
                      <div className="text-sm text-muted-foreground">{doc.page_count || '?'} pages</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-sm text-muted-foreground">
                        File Size: <span className="text-foreground">{(doc.file_size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                      <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full border", 
                        doc.status === 'vectorized' ? "bg-green-500/10 border-green-500/30 text-green-400" :
                        doc.status === 'processing' ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" :
                        "bg-red-500/10 border-red-500/30 text-red-400"
                      )}>
                        <span className={cn("w-2 h-2 rounded-full",
                          doc.status === 'vectorized' ? "bg-green-500" :
                          doc.status === 'processing' ? "bg-yellow-500" :
                          "bg-red-500"
                        )} />
                        <span className="text-xs font-medium capitalize">Status: {doc.status}</span>
                      </div>
                    </div>
                    {doc.status === 'vectorized' && <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground">No documents uploaded yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subjects</h1>
          <p className="text-muted-foreground">Organize your study materials by subject</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={handleCreateSubject}>
          <Plus className="w-4 h-4 mr-2" />
          New Subject
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search subjects..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-secondary border-border"
        />
      </div>

      {/* Subject Folders Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoadingSubjects ? (
          <p className="text-muted-foreground">Loading subjects...</p>
        ) : filteredSubjects.length > 0 ? (
          filteredSubjects.map((subject) => (
            <Card 
              key={subject.id}
              onClick={() => setSelectedSubject(subject.id)}
              className="bg-card border-border hover:border-primary/50 transition-all cursor-pointer group"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/30 transition-colors">
                    <FolderOpen className="w-7 h-7 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{subject.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <BookOpen className="w-4 h-4" />
                      <span>{subject.document_count} documents</span>
                    </div>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Mastery</span>
                    <span className="text-foreground font-medium">{subject.overall_mastery}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all",
                        subject.overall_mastery >= 80 ? "bg-green-500" : subject.overall_mastery >= 60 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${subject.overall_mastery}%` }}
                    />
                  </div>
                </div>

                {/* Storage usage indicator */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      Storage
                    </span>
                    <span className="text-muted-foreground">{subject.storage_used_mb.toFixed(1)}MB / {subject.storage_limit_mb}MB</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all",
                        (subject.storage_used_mb / subject.storage_limit_mb) >= 0.8 ? "bg-red-500" : "bg-primary"
                      )}
                      style={{ width: `${(subject.storage_used_mb / subject.storage_limit_mb) * 100}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-muted-foreground">No subjects found. Create one to get started!</p>
        )}
      </div>
    </div>
  );
}
