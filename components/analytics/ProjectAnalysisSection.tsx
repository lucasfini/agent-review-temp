"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"
import { FeatureHelp } from "@/components/ui/feature-help"

interface TopicEntry {
  label: string
  shareOfVoice: number
  mentionCount: number
}

interface ProjectAnalysisSectionProps {
  contentBreakdown: Record<string, number>
  topics: TopicEntry[]
  hasSnapshot: boolean
}

const CHART_COLOR_PALETTE = ["#38bdf8", "#818cf8", "#34d399", "#f59e0b", "#f472b6", "#fb7185"]

function AnalysisCard({
  eyebrow,
  title,
  helpDescription,
  helpBestFor,
  children,
}: {
  eyebrow: string
  title: string
  helpDescription?: string
  helpBestFor?: string
  children: ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-60px_rgba(148,163,184,0.45)] sm:p-6 dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_24px_80px_-50px_rgba(15,23,42,0.95)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(148,163,184,0.12),transparent_24%),radial-gradient(circle_at_80%_16%,rgba(59,130,246,0.10),transparent_26%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(148,163,184,0.14),transparent_24%),radial-gradient(circle_at_80%_16%,rgba(59,130,246,0.14),transparent_26%),linear-gradient(180deg,#020617_0%,#071225_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:26px_26px,26px_26px] opacity-60 dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] dark:opacity-30" />
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-blue-100/50">{eyebrow}</p>
        <div className="mt-2 flex items-center gap-2">
          <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h3>
          {helpDescription ? (
            <FeatureHelp
              title={title}
              description={helpDescription}
              bestFor={helpBestFor}
            />
          ) : null}
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function ContentMixChart({ contentBreakdown }: { contentBreakdown: Record<string, number> }) {
  const slices = Object.entries(contentBreakdown)
    .map(([label, value]) => ({ label: label.replace(/_/g, " "), value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const total = slices.reduce((sum, item) => sum + item.value, 0)

  const gradientStops = slices.reduce(
    (acc, slice, index) => {
      const start = acc.offset
      const end = total === 0 ? acc.offset : start + (slice.value / total) * 100
      acc.stops.push(`${CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length]} ${start}% ${end}%`)
      acc.offset = end
      return acc
    },
    { offset: 0, stops: [] as string[] }
  )

  if (total === 0) {
    return (
      <div className="flex min-h-[22rem] items-center justify-center rounded-[1.5rem] border border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-blue-100/60">
        No outputs generated yet for this project.
      </div>
    )
  }

  return (
    <div className="grid min-h-[22rem] content-center gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
      <div className="relative mx-auto h-64 w-64">
        <div className="absolute inset-0 rounded-full border border-slate-200 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.04),transparent_58%)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_58%)]" />
        <div
          className="absolute inset-3 rounded-full border border-slate-200 shadow-[0_0_40px_rgba(56,189,248,0.08)] dark:border-white/15"
          style={{ background: `conic-gradient(${gradientStops.stops.join(", ")})` }}
        />
        <div className="absolute inset-[28%] rounded-full border border-slate-200 bg-white/80 backdrop-blur-[1px] dark:border-white/12 dark:bg-slate-950/35" />
        <div className="absolute inset-0 rounded-full border border-dashed border-slate-200 dark:border-white/8" />
        <div className="absolute left-1/2 top-4 h-[calc(50%-1rem)] w-px -translate-x-1/2 bg-slate-200 dark:bg-white/10" />
        <div className="absolute left-4 top-1/2 h-px w-[calc(50%-1rem)] -translate-y-1/2 bg-slate-200 dark:bg-white/10" />
      </div>

      <div className="mx-auto w-full max-w-sm space-y-3">
        {slices.map((slice, index) => {
          const pct = total === 0 ? 0 : Math.round((slice.value / total) * 100)
          return (
            <div
              key={slice.label}
              className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2 last:border-b-0 last:pb-0 dark:border-white/8"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-[0_0_14px_rgba(255,255,255,0.18)]"
                  style={{ backgroundColor: CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length] }}
                />
                <span className="text-sm capitalize text-slate-700 dark:text-blue-50/78">{slice.label}</span>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-blue-100/50">
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TopicIntensity({ topics, hasSnapshot }: { topics: TopicEntry[]; hasSnapshot: boolean }) {
  if (!hasSnapshot || topics.length === 0) {
    return (
      <div className="flex min-h-[22rem] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-blue-100/60">
        Run analysis on this project to populate topic intensity.
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/[0.06]">
      <div className="space-y-4">
        {topics.slice(0, 5).map((topic, index) => (
          <div key={topic.label}>
            <div className="flex items-center justify-between text-sm text-slate-700 dark:text-blue-100/78">
              <span>{topic.label}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-blue-100/45">
                {Math.round(topic.shareOfVoice * 100)}%
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.max(8, Math.round(topic.shareOfVoice * 100))}%` }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.7, delay: 0.08 * index, ease: "easeOut" }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-blue-100/45">
              {topic.mentionCount} mention{topic.mentionCount === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProjectAnalysisSection({
  contentBreakdown,
  topics,
  hasSnapshot,
}: ProjectAnalysisSectionProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <AnalysisCard
        eyebrow="Content mix"
        title="What this project produced across formats"
        helpDescription="Shows which output formats have already been generated from this project."
        helpBestFor="understanding how you have repurposed one recording across different asset types"
      >
        <ContentMixChart contentBreakdown={contentBreakdown} />
      </AnalysisCard>

      <AnalysisCard
        eyebrow="Topic intensity"
        title="Where the conversation spends its energy"
        helpDescription="Shows which themes dominated the recording based on topic share of voice."
        helpBestFor="spotting where the conversation spent the most time or emphasis"
      >
        <TopicIntensity topics={topics} hasSnapshot={hasSnapshot} />
      </AnalysisCard>
    </div>
  )
}
