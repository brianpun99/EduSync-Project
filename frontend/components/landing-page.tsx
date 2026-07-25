"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Brain, FileText, Database, Cpu, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react"

interface LandingPageProps {
  onGetStarted: () => void
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 lg:px-12 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <span className="text-lg font-semibold text-foreground">EduSync</span>
        </div>
        <button onClick={onGetStarted} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Sign in
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 grid lg:grid-cols-2 gap-10 items-center px-6 lg:px-12 py-10 max-w-7xl mx-auto w-full">
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl lg:text-5xl font-bold text-foreground text-balance leading-tight">
              Your Notes. Your AI.
              <br />
              <span className="text-primary">Zero Hallucinations.</span>
            </h1>
            <p className="text-muted-foreground mt-4 max-w-md leading-relaxed">
              An adaptive AI study assistant that understands your materials and helps you master every concept.
            </p>
          </div>

          <ul className="space-y-3">
            {[
              "AI grounded in your documents",
              "Privacy-first & Local-first",
              "Track knowledge gaps",
              "Adaptive learning path",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-foreground">
                <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" />
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>

          <div>
            <Button
              onClick={onGetStarted}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <p className="text-sm text-muted-foreground mt-3">
              Already have an account?{" "}
              <button onClick={onGetStarted} className="text-primary hover:underline">
                Sign in
              </button>
            </p>
          </div>
        </div>

        {/* Process flow */}
        <div className="space-y-4">
          <ProcessStep
            icon={<FileText className="w-6 h-6 text-primary" />}
            title="PDF / PPTX Upload"
            subtitle="Bring your own study materials"
          />
          <ProcessStep
            icon={<Cpu className="w-6 h-6 text-cyan-400" />}
            title="Text Extraction & Processing"
            subtitle="Processed locally on your device"
          />
          <ProcessStep
            icon={<Database className="w-6 h-6 text-orange-400" />}
            title="Vector Database (Local)"
            subtitle="Your data never leaves your machine"
          />
          <ProcessStep
            icon={<Brain className="w-6 h-6 text-primary" />}
            title="AI (RAG) Engine"
            subtitle="Cloud or Local inference"
          />
          <ProcessStep
            icon={<ShieldCheck className="w-6 h-6 text-accent" />}
            title="Accurate Answers with Sources"
            subtitle="Every answer cites your documents"
          />
        </div>
      </main>
    </div>
  )
}

function ProcessStep({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors">
      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  )
}
