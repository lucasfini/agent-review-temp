"use client"

import { useState, type FormEvent } from 'react'
import { cn } from "@/lib/utils"
import { Settings2, Plus, Target, Check, Pause, Archive, BookOpen, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger
} from '@/components/ui/sheet'

// ============================================================================
// TYPES
// ============================================================================

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
}

// ============================================================================
// GOAL TYPE STYLES
// ============================================================================

const GOAL_TYPE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  include: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-l-blue-500' },
  cta: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-l-emerald-500' },
  avoid: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-l-red-500' },
  mention: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-l-amber-500' }
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Check }> = {
  active: { bg: 'bg-green-50', text: 'text-green-700', icon: Check },
  paused: { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: Pause },
  archived: { bg: 'bg-gray-100', text: 'text-gray-600', icon: Archive }
}

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

interface ProgressBarProps {
  value: number
  max?: number
  size?: 'sm' | 'md'
  color?: string
  showLabel?: boolean
}

function ProgressBar({
  value,
  max = 100,
  size = 'md',
  color = 'bg-blue-500',
  showLabel = true
}: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "flex-1 rounded-full overflow-hidden bg-gray-100",
        size === 'sm' ? 'h-1.5' : 'h-2.5'
      )}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            percent >= 100 ? 'bg-green-500' : percent >= 75 ? 'bg-emerald-500' : color
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn(
          "font-medium tabular-nums",
          size === 'sm' ? 'text-xs' : 'text-sm',
          percent >= 100 ? 'text-green-600' : 'text-gray-600'
        )}>
          {Math.round(percent)}%
        </span>
      )}
    </div>
  )
}

// ============================================================================
// GOAL CARD WITH PROGRESS
// ============================================================================

interface GoalCardProps {
  goal: NarrativeGoal
  progress?: GoalProgress
  onToggleStatus: () => void
  onArchive: () => void
}

function GoalCard({ goal, progress, onToggleStatus, onArchive }: GoalCardProps) {
  const typeStyle = GOAL_TYPE_STYLES[goal.goal_type] || GOAL_TYPE_STYLES.mention
  const statusStyle = STATUS_STYLES[goal.status] || STATUS_STYLES.active
  const StatusIcon = statusStyle.icon

  const progressPercent = progress?.progressPercent || 0
  const currentMentions = progress?.currentMentions || 0
  const targetMentions = progress?.targetMentions || goal.target_mentions || 1

  return (
    <div className={cn(
      "bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden",
      "hover:shadow-md transition-shadow",
      "border-l-4",
      typeStyle.border
    )}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-2 min-w-0">
            <Target className={cn("h-4 w-4 mt-0.5 flex-shrink-0", typeStyle.text)} />
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-gray-900 truncate">
                {goal.topic_label}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  "text-xs font-medium uppercase px-1.5 py-0.5 rounded",
                  typeStyle.bg, typeStyle.text
                )}>
                  {goal.goal_type}
                </span>
                <span className="text-xs text-gray-500">
                  Target: {targetMentions} / {goal.cadence_days ? `${goal.cadence_days}d` : 'ongoing'}
                </span>
              </div>
            </div>
          </div>
          <span className={cn(
            "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
            statusStyle.bg, statusStyle.text
          )}>
            <StatusIcon className="h-3 w-3" />
            {goal.status}
          </span>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{currentMentions} of {targetMentions} mentions</span>
            <span className={progressPercent >= 100 ? 'text-green-600 font-medium' : ''}>
              {progressPercent >= 100 ? 'Complete!' : `${100 - progressPercent}% to go`}
            </span>
          </div>
          <ProgressBar
            value={progressPercent}
            color={typeStyle.text.replace('text-', 'bg-').replace('-700', '-500')}
          />
        </div>
      </div>

      {/* Actions */}
      {goal.status !== 'archived' && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onToggleStatus}
            className="text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            {goal.status === 'active' ? 'Pause' : 'Activate'}
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={onArchive}
            className="text-xs font-medium text-red-600 hover:text-red-800"
          >
            Archive
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CREATE GOAL FORM
// ============================================================================

const GOAL_TYPE_OPTIONS = [
  { value: 'include', label: 'Recurring Topic', helper: 'Ensure this theme shows up regularly.' },
  { value: 'cta', label: 'CTA Reminder', helper: 'Track mentions of offers or CTAs.' },
  { value: 'avoid', label: 'Avoid / Limit', helper: 'Flag when this theme appears.' },
  { value: 'mention', label: 'Awareness', helper: 'Lightweight monitoring of new ideas.' }
] as const

interface CreateGoalFormProps {
  onSave: (goal: { label: string; type: string; target: number; cadence: number | null }) => Promise<void>
  suggestedGoals: Array<{ label: string; type: string; target: number; cadence: number | null }>
  isSaving: boolean
  error: string
  onOpenExamples: () => void
}

function CreateGoalForm({ onSave, suggestedGoals, isSaving, error, onOpenExamples }: CreateGoalFormProps) {
  const [form, setForm] = useState({ label: '', type: 'include', target: 1, cadence: 30 })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await onSave({
      label: form.label,
      type: form.type,
      target: form.target,
      cadence: form.cadence || null
    })
    if (!error) {
      setForm(f => ({ ...f, label: '' }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Suggestions */}
      {suggestedGoals.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Quick add from analysis:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedGoals.slice(0, 4).map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSave(suggestion)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                + {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Goal Label
          </label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm(f => ({ ...f, label: e.target.value.slice(0, 80) }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Mention coaching program"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Goal Type
          </label>
          <select
            value={form.type}
            onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {GOAL_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {GOAL_TYPE_OPTIONS.find(o => o.value === form.type)?.helper}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Target Mentions
            </label>
            <input
              type="number"
              min={0}
              value={form.target}
              onChange={(e) => setForm(f => ({ ...f, target: Number(e.target.value) }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Cadence (days)
            </label>
            <input
              type="number"
              min={1}
              value={form.cadence}
              onChange={(e) => setForm(f => ({ ...f, cadence: Number(e.target.value) }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Create Goal'}
          </button>
          <button
            type="button"
            onClick={onOpenExamples}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}

// ============================================================================
// MAIN GOALS SECTION
// ============================================================================

export function GoalsSection({
  goals,
  goalProgress,
  onSaveGoal,
  onToggleStatus,
  onArchive,
  onOpenExamples,
  suggestedGoals,
  isSaving,
  error
}: GoalsSectionProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  // Calculate mock progress for demo (you would replace with real data)
  const getProgressForGoal = (goalId: string): GoalProgress | undefined => {
    const existing = goalProgress.find(p => p.goalId === goalId)
    if (existing) return existing

    // Generate mock progress for demo
    const goal = goals.find(g => g.id === goalId)
    if (!goal) return undefined

    const target = goal.target_mentions || 1
    const current = Math.floor(Math.random() * (target + 2))
    return {
      goalId,
      currentMentions: current,
      targetMentions: target,
      progressPercent: Math.min(100, (current / target) * 100)
    }
  }

  const activeGoals = goals.filter(g => g.status !== 'archived')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Active Goals</h3>
          <p className="text-sm text-gray-500">
            {activeGoals.length} goal{activeGoals.length !== 1 ? 's' : ''} being tracked
          </p>
        </div>
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Settings2 className="h-4 w-4" />
              Manage Goals
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader className="mb-6">
              <SheetTitle>Manage Goals</SheetTitle>
              <SheetDescription>
                Create and configure your narrative goals to track content coverage.
              </SheetDescription>
            </SheetHeader>
            <CreateGoalForm
              onSave={async (goal) => {
                await onSaveGoal(goal)
                // Don't close sheet on success so user can add more
              }}
              suggestedGoals={suggestedGoals}
              isSaving={isSaving}
              error={error}
              onOpenExamples={onOpenExamples}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Goals Grid */}
      {activeGoals.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <Target className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <h4 className="text-sm font-medium text-gray-900 mb-1">No goals yet</h4>
          <p className="text-sm text-gray-500 mb-4">
            Create goals to track narrative coverage across your content.
          </p>
          <button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
          >
            <Plus className="h-4 w-4" />
            Create your first goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeGoals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={getProgressForGoal(goal.id)}
              onToggleStatus={() => onToggleStatus(goal.id, goal.status)}
              onArchive={() => onArchive(goal.id, goal.topic_label)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
