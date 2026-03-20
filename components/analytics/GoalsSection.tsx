"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { cn } from "@/lib/utils"
import { Settings2, Plus, Target, Check, Pause, Archive, BookOpen, Sparkles, ArrowRight, ChevronDown, ChevronUp, PlayCircle, Ban, Megaphone } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger
} from '@/components/ui/sheet'
import { FeatureHelp } from '@/components/ui/feature-help'

interface NarrativeGoal {
  id: string
  topic_label: string
  goal_type: string
  target_mentions?: number | null
  cadence_days?: number | null
  status: string
}

interface GoalProgress {
  goalId: string
  currentMentions: number
  targetMentions: number
  progressPercent: number
}

interface GoalsSectionProps {
  goals: NarrativeGoal[]
  goalProgress: GoalProgress[]
  onSaveGoal: (goal: { label: string; type: string; target: number; cadence: number | null }) => Promise<void>
  onToggleStatus: (goalId: string, currentStatus: string) => Promise<void>
  onArchive: (goalId: string, label: string) => Promise<void>
  onOpenExamples: () => void
  suggestedGoals: Array<{ label: string; type: string; target: number; cadence: number | null }>
  isSaving: boolean
  error: string
  readOnly?: boolean
}

const GOAL_TYPE_META: Record<string, {
  label: string
  summary: string
  icon: typeof Target
  accent: string
  badge: string
}> = {
  include: {
    label: 'Repeat this theme',
    summary: 'Use this when you want a topic to keep showing up in future episodes.',
    icon: PlayCircle,
    accent: 'text-blue-600 dark:text-blue-300',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30',
  },
  cta: {
    label: 'Remember this CTA',
    summary: 'Use this when you want a reminder to mention an offer, signup, or action consistently.',
    icon: Megaphone,
    accent: 'text-emerald-600 dark:text-emerald-300',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/30',
  },
  avoid: {
    label: 'Avoid this pattern',
    summary: 'Use this when you want analysis to flag a topic or pattern you are trying to reduce.',
    icon: Ban,
    accent: 'text-rose-600 dark:text-rose-300',
    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/30',
  },
  mention: {
    label: 'Improve this habit',
    summary: 'Use this for lighter creator habits or ideas you want to keep top of mind.',
    icon: Sparkles,
    accent: 'text-amber-600 dark:text-amber-300',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/30',
  }
}

const STATUS_META: Record<string, {
  label: string
  badge: string
  icon: typeof Check
}> = {
  active: {
    label: 'Active',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/30',
    icon: Check,
  },
  paused: {
    label: 'Paused',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/30',
    icon: Pause,
  },
  archived: {
    label: 'Archived',
    badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    icon: Archive,
  },
}

const GOAL_TYPE_OPTIONS = [
  { value: 'include', label: 'Repeat this theme', helper: 'Keep this topic showing up regularly in future episodes.' },
  { value: 'cta', label: 'Remember this CTA', helper: 'Track whether an offer or call to action is being mentioned often enough.' },
  { value: 'mention', label: 'Improve this habit', helper: 'Use for lighter creator habits or ideas you want analysis to watch for.' },
  { value: 'avoid', label: 'Avoid this pattern', helper: 'Flag when a topic or pattern appears more than you want.' }
] as const

function getGoalMeta(goalType: string) {
  return GOAL_TYPE_META[goalType] || GOAL_TYPE_META.mention
}

function getStatusMeta(status: string) {
  return STATUS_META[status] || STATUS_META.active
}

function getTargetSummary(goal: NarrativeGoal, progress?: GoalProgress) {
  const currentMentions = progress?.currentMentions || 0
  const targetMentions = progress?.targetMentions || goal.target_mentions || 1

  if (goal.goal_type === 'avoid') {
    return currentMentions === 0
      ? 'Not showing up in recent analysis'
      : `Detected ${currentMentions} time${currentMentions === 1 ? '' : 's'} recently`
  }

  if (!goal.cadence_days) {
    return `${currentMentions} of ${targetMentions} signals seen recently`
  }

  return `${currentMentions} of ${targetMentions} signals in the last ${goal.cadence_days} days`
}

function getProgressSummary(goal: NarrativeGoal, progress?: GoalProgress) {
  const percent = progress?.progressPercent || 0

  if (goal.goal_type === 'avoid') {
    return percent === 0
      ? 'Good so far — no recent signals detected.'
      : 'Still showing up in recent analysis.'
  }

  if (percent >= 100) return 'On track — this is showing up consistently.'
  if (percent >= 60) return 'Partially showing up, but not yet consistent.'
  return 'Not showing up enough yet.'
}

function getNextAction(goal: NarrativeGoal, progress?: GoalProgress) {
  const percent = progress?.progressPercent || 0

  switch (goal.goal_type) {
    case 'cta':
      return percent >= 100
        ? 'Keep this CTA in your opening or closing pattern.'
        : 'Add this CTA to a reliable segment like your intro, outro, or show notes.'
    case 'avoid':
      return percent === 0
        ? 'Keep your current framing — analysis is not seeing this pattern.'
        : 'Rewrite prompts or transitions so this pattern is less likely to appear.'
    case 'include':
      return percent >= 100
        ? 'This theme is landing regularly. Keep reinforcing it with stronger examples.'
        : 'Plan one explicit segment or talking point around this theme in the next episode.'
    default:
      return percent >= 100
        ? 'This habit is showing up. Keep reinforcing it intentionally.'
        : 'Make this a deliberate part of your prep so it appears more consistently.'
  }
}

function GoalCard({
  goal,
  progress,
  onToggleStatus,
  onArchive,
  readOnly = false,
  archived = false,
}: {
  goal: NarrativeGoal
  progress?: GoalProgress
  onToggleStatus?: () => void
  onArchive?: () => void
  readOnly?: boolean
  archived?: boolean
}) {
  const meta = getGoalMeta(goal.goal_type)
  const status = getStatusMeta(goal.status)
  const GoalIcon = meta.icon
  const StatusIcon = status.icon
  const percent = progress?.progressPercent || 0
  const progressValue = goal.goal_type === 'avoid' ? `${progress?.currentMentions || 0}` : `${percent}%`

  return (
    <div className={cn(
      "overflow-hidden rounded-xl border bg-white shadow-sm transition-colors dark:bg-slate-950",
      archived
        ? "border-slate-200/80 opacity-85 dark:border-slate-800/60"
        : goal.status === 'paused'
          ? "border-amber-200/70 dark:border-amber-900/30"
          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
    )}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
                <GoalIcon className={cn("h-4 w-4", meta.accent)} />
              </div>
              <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", meta.badge)}>
                {meta.label}
              </span>
            </div>
            <h4 className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-slate-50">
              {goal.topic_label}
            </h4>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
              {meta.summary}
            </p>
          </div>
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", status.badge)}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {getTargetSummary(goal, progress)}
            </p>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {progressValue}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {getProgressSummary(goal, progress)}
          </p>
          <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <p>{getNextAction(goal, progress)}</p>
          </div>
        </div>
      </div>

      {!readOnly && !archived && (
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-4 py-2.5 text-sm dark:border-slate-800">
          <button
            type="button"
            onClick={onToggleStatus}
            className="font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            {goal.status === 'active' ? 'Pause' : 'Resume'}
          </button>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">|</span>
          <button
            type="button"
            onClick={onArchive}
            className="font-medium text-slate-500 transition-colors hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
          >
            Archive
          </button>
        </div>
      )}
    </div>
  )
}

function CreateGoalForm({
  onSave,
  suggestedGoals,
  isSaving,
  error,
  onOpenExamples,
}: {
  onSave: (goal: { label: string; type: string; target: number; cadence: number | null }) => Promise<void>
  suggestedGoals: Array<{ label: string; type: string; target: number; cadence: number | null }>
  isSaving: boolean
  error: string
  onOpenExamples: () => void
}) {
  const [form, setForm] = useState({ label: '', type: 'include', target: 1, cadence: 30 })

  const selectedTypeMeta = useMemo(
    () => GOAL_TYPE_OPTIONS.find((option) => option.value === form.type) || GOAL_TYPE_OPTIONS[0],
    [form.type]
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await onSave({
      label: form.label,
      type: form.type,
      target: form.target,
      cadence: form.cadence || null
    })
    if (!error) {
      setForm((prev) => ({ ...prev, label: '' }))
    }
  }

  return (
    <div className="space-y-6">
      {suggestedGoals.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Quick start from recent analysis
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedGoals.slice(0, 4).map((suggestion, idx) => (
              <button
                key={`${suggestion.label}-${idx}`}
                type="button"
                onClick={() => onSave(suggestion)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-800/40 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
              >
                + {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="goal-label" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            What do you want to intentionally include, improve, or avoid?
          </label>
          <input
            id="goal-label"
            type="text"
            value={form.label}
            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value.slice(0, 80) }))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            placeholder="e.g., Mention coaching program, use stronger hooks, reduce long tangents"
          />
        </div>

        <div>
          <label htmlFor="goal-type" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Goal style
          </label>
          <select
            id="goal-type"
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            {GOAL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {selectedTypeMeta.helper}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="goal-target" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Target frequency
            </label>
            <input
              id="goal-target"
              type="number"
              min={0}
              value={form.target}
              onChange={(e) => setForm((prev) => ({ ...prev, target: Number(e.target.value) }))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
          <div>
            <label htmlFor="goal-cadence" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Cadence window (days)
            </label>
            <input
              id="goal-cadence"
              type="number"
              min={1}
              value={form.cadence}
              onChange={(e) => setForm((prev) => ({ ...prev, cadence: Number(e.target.value) }))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            How this works
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Active goals guide analysis toward things you want to repeat, remember, improve, or avoid. They do not replace creator coaching, but they help prioritize what the app watches for.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Create Goal'}
          </button>
          <button
            type="button"
            onClick={onOpenExamples}
            aria-label="Browse example goals"
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <BookOpen className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}

export function GoalsSection({
  goals,
  goalProgress,
  onSaveGoal,
  onToggleStatus,
  onArchive,
  onOpenExamples,
  suggestedGoals,
  isSaving,
  error,
  readOnly = false
}: GoalsSectionProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const getProgressForGoal = (goalId: string): GoalProgress | undefined =>
    goalProgress.find((entry) => entry.goalId === goalId)

  const activeGoals = goals.filter((goal) => goal.status !== 'archived')
  const archivedGoals = goals.filter((goal) => goal.status === 'archived')
  const pausedCount = activeGoals.filter((goal) => goal.status === 'paused').length

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/60 p-5 dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.84))]">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Goals</h3>
              <FeatureHelp
                title="Goals"
                description="Goals are creator intentions for future episodes. They help analysis watch for themes, CTAs, habits, or patterns you want to repeat, improve, or avoid."
                bestFor="keeping your best habits intentional across episodes"
              />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Use goals to tell the app what you want to intentionally include, remember, improve, or avoid across future recordings. Analysis uses active goals as guidance, but creator coaching can still surface issues even when no goals exist.
            </p>
          </div>
          {!readOnly ? (
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <Settings2 className="h-4 w-4" />
                  Manage Goals
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader className="mb-6">
                  <SheetTitle>Manage Goals</SheetTitle>
                  <SheetDescription>
                    Create creator intentions that guide future episodes and help analysis prioritize what matters most to you.
                  </SheetDescription>
                </SheetHeader>
                <CreateGoalForm
                  onSave={onSaveGoal}
                  suggestedGoals={suggestedGoals}
                  isSaving={isSaving}
                  error={error}
                  onOpenExamples={onOpenExamples}
                />
              </SheetContent>
            </Sheet>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-slate-200/90 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="min-w-[90px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Active</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{activeGoals.length}</p>
          </div>
          <div className="hidden h-8 w-px bg-slate-200 dark:bg-slate-800 sm:block" />
          <div className="min-w-[90px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Paused</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{pausedCount}</p>
          </div>
          <div className="hidden h-8 w-px bg-slate-200 dark:bg-slate-800 sm:block" />
          <div className="min-w-[110px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Archived</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{archivedGoals.length}</p>
          </div>
        </div>
      </div>

      {activeGoals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/90 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <Target className="mx-auto mb-3 h-10 w-10 text-slate-500" />
          <h4 className="mb-1 text-sm font-medium text-slate-900 dark:text-slate-50">No active goals yet</h4>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Add a goal when you want analysis to keep an eye on a topic, CTA, habit, or pattern you care about repeating or improving.
          </p>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:border-blue-800/40 dark:hover:bg-blue-900/20"
            >
              <Plus className="h-4 w-4" />
              Create your first goal
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {activeGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={getProgressForGoal(goal.id)}
              onToggleStatus={() => onToggleStatus(goal.id, goal.status)}
              onArchive={() => onArchive(goal.id, goal.topic_label)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {archivedGoals.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Archived Goals</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Archived goals stop influencing active tracking, but their history stays visible here.
              </p>
            </div>
            {showArchived ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>
          {showArchived ? (
            <div className="grid grid-cols-1 gap-4 border-t border-slate-200 px-5 py-5 xl:grid-cols-2 dark:border-slate-800">
              {archivedGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  progress={getProgressForGoal(goal.id)}
                  archived
                  readOnly
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
