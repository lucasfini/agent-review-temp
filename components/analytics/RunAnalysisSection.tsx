"use client"

import { BarChart3, Loader2 } from "lucide-react"
import { FeatureHelp } from "@/components/ui/feature-help"

interface ReadyProject {
  id: string
  title: string
}

interface RunAnalysisSectionProps {
  selectedProject: ReadyProject | null
  selectedHasTranscript: boolean
  selectedHasSnapshot: boolean
  runningCoverageIds: Map<string, string>
  onRunAnalysis: (projectId: string) => void
}

export function RunAnalysisSection({
  selectedProject,
  selectedHasTranscript,
  selectedHasSnapshot,
  runningCoverageIds,
  onRunAnalysis,
}: RunAnalysisSectionProps) {
  const selectedIsRunning = selectedProject ? runningCoverageIds.has(selectedProject.id) : false

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => selectedProject && onRunAnalysis(selectedProject.id)}
        disabled={!selectedProject || !selectedHasTranscript || selectedIsRunning}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-transparent px-4 py-2.5 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 active:bg-blue-600 active:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950/30 dark:active:bg-blue-500 dark:active:text-white dark:disabled:border-slate-700 dark:disabled:text-slate-500 sm:min-w-[170px]"
      >
        {selectedIsRunning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running...
          </>
        ) : (
          <>
            <BarChart3 className="h-4 w-4" />
            {selectedHasSnapshot ? "Rerun Analysis" : "Run Analysis"}
          </>
        )}
      </button>
      <FeatureHelp
        title={selectedHasSnapshot ? "Rerun Analysis" : "Run Analysis"}
        description="Reviews the transcript to generate creator coaching, topic intensity, and supporting analytics for this project."
        bestFor="understanding what worked, what felt weak, and what to improve in the next recording"
      />
    </div>
  )
}
