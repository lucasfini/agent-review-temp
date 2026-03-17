"use client"

import { cn } from "@/lib/utils"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

// ============================================================================
// DONUT CHART
// ============================================================================

interface DonutChartData {
  name: string
  value: number
  color: string
  [key: string]: any
}

interface DonutChartProps {
  data: DonutChartData[]
  className?: string
  showLegend?: boolean
}

export function DonutChart({ data, className, showLegend = true }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (total === 0) {
    return (
      <div className={cn("flex items-center justify-center h-48 text-slate-500 text-sm", className)}>
        No data available
      </div>
    )
  }

  return (
    <div className={cn("h-64", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload
                const percentage = ((item.value / total) * 100).toFixed(1)
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{item.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {item.value} ({percentage}%)
                    </p>
                  </div>
                )
              }
              return null
            }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              height={36}
              content={({ payload }) => (
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {payload?.map((entry, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-xs text-slate-400">{entry.value}</span>
                    </div>
                  ))}
                </div>
              )}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================================================
// BAR LIST
// ============================================================================

interface BarListItem {
  name: string
  value: number
  icon?: React.ReactNode
  color?: string
}

interface BarListProps {
  data: BarListItem[]
  className?: string
  valueFormatter?: (value: number) => string
}

export function BarList({
  data,
  className,
  valueFormatter = (v) => v.toString()
}: BarListProps) {
  const maxValue = Math.max(...data.map(item => item.value), 1)

  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-32 text-slate-500 text-sm", className)}>
        No data available
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {data.map((item, index) => (
        <div key={index} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {item.icon && (
                <span className="flex-shrink-0 text-slate-500">
                  {item.icon}
                </span>
              )}
              <span className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                {item.name}
              </span>
            </div>
            <span className="ml-2 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {valueFormatter(item.value)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                backgroundColor: item.color || '#3b82f6'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// CONTENT MIX SECTION (Donut + BarList side by side)
// ============================================================================

interface ContentMixData {
  contentBreakdown: Record<string, number>
  topTopics: Array<{ label: string; mentions: number }>
}

// Vibrant color palette: blue, cyan, indigo, violet (plus extras for more categories)
const CHART_COLOR_PALETTE = [
  '#3b82f6',  // blue
  '#06b6d4',  // cyan
  '#6366f1',  // indigo
  '#8b5cf6',  // violet
  '#ec4899',  // pink
  '#10b981',  // emerald
  '#f59e0b',  // amber
  '#ef4444',  // red
]

// Legacy mapping for specific content types
const CONTENT_COLORS: Record<string, string> = {
  social: '#3b82f6',    // blue
  blog: '#06b6d4',      // cyan
  graphic: '#6366f1',   // indigo
  email: '#8b5cf6',     // violet
  thread: '#ec4899',    // pink
  newsletter: '#10b981', // emerald
  summary: '#f59e0b',   // amber
  default: '#64748b'    // slate
}

function getContentColor(type: string, index?: number): string {
  // If index provided, use palette rotation for distinct colors
  if (index !== undefined) {
    return CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length]
  }
  const normalizedType = type.toLowerCase().replace(/[_-]/g, '')
  return CONTENT_COLORS[normalizedType] || CONTENT_COLORS.default
}

export function ContentMixSection({ contentBreakdown, topTopics }: ContentMixData) {
  // Transform content breakdown for donut chart with distinct colors
  const donutData: DonutChartData[] = Object.entries(contentBreakdown)
    .map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
      value,
      color: '' // Will be assigned after sorting
    }))
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({
      ...item,
      color: CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length]
    }))

  // Transform topics for bar list
  const barListData: BarListItem[] = topTopics.slice(0, 5).map((topic, idx) => ({
    name: topic.label,
    value: topic.mentions,
    color: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][idx % 5]
  }))

  const totalContent = donutData.reduce((sum, d) => sum + d.value, 0)
  const donutSummary = donutData.length > 0
    ? `Content mix: ${donutData.map(d => `${d.name} ${d.value}`).join(', ')}. Total: ${totalContent}.`
    : 'No content data available.'

  const topicSummary = barListData.length > 0
    ? `Top topics: ${barListData.map(d => `${d.name} ${d.value} mentions`).join(', ')}.`
    : 'No topic data available.'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Donut Chart - Content Mix */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" role="region" aria-label="Content mix breakdown">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-50">Content Mix</h3>
        <div role="img" aria-label={donutSummary}>
          <DonutChart data={donutData} />
        </div>
        {totalContent === 0 && (
          <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            No content generated yet. Generate content from your transcribed projects to see a breakdown here.
          </p>
        )}
      </div>

      {/* Bar List - Top Topics */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" role="region" aria-label="Top performing topics">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-50">Top Performing Topics</h3>
        <div role="img" aria-label={topicSummary}>
          <BarList
            data={barListData}
            valueFormatter={(v) => `${v} mentions`}
          />
        </div>
        {topTopics.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No topics detected yet. Run analytics on your transcribed projects to discover topic performance.
          </p>
        )}
      </div>
    </div>
  )
}
