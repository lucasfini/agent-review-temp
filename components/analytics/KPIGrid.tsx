"use client"

import { cn } from "@/lib/utils"
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Minus, FileText, Zap, Clock, DollarSign } from 'lucide-react'

interface SparklineData {
  value: number
}

interface KPICardData {
  title: string
  value: string | number
  trend: {
    value: number
    direction: 'up' | 'down' | 'neutral'
    label: string
  }
  sparkline: SparklineData[]
  icon: React.ReactNode
  iconBg: string
  sparklineColor: string
}

function SparkAreaChart({
  data,
  color = "#3b82f6"
}: {
  data: SparklineData[]
  color?: string
}) {
  return (
    <div className="h-10 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#gradient-${color.replace('#', '')})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

interface KPIGridProps {
  totalProjects: number
  projectsTrend: { value: number; direction: 'up' | 'down' | 'neutral'; label: string }
  projectsSparkline: SparklineData[]

  totalOutputs: number
  outputsTrend: { value: number; direction: 'up' | 'down' | 'neutral'; label: string }
  outputsSparkline: SparklineData[]

  processingTime: string
  processingTrend: { value: number; direction: 'up' | 'down' | 'neutral'; label: string }
  processingSparkline: SparklineData[]

  aiSpend: string
  spendTrend: { value: number; direction: 'up' | 'down' | 'neutral'; label: string }
  spendSparkline: SparklineData[]
}

export function KPIGrid({
  totalProjects,
  projectsTrend,
  projectsSparkline,
  totalOutputs,
  outputsTrend,
  outputsSparkline,
  processingTime,
  processingTrend,
  processingSparkline,
  aiSpend,
  spendTrend,
  spendSparkline
}: KPIGridProps) {
  const cards: KPICardData[] = [
    {
      title: 'Total Projects',
      value: totalProjects,
      trend: projectsTrend,
      sparkline: projectsSparkline,
      icon: <FileText className="h-5 w-5" />,
      iconBg: 'bg-slate-100 text-slate-600',
      sparklineColor: '#64748b'
    },
    {
      title: 'Content Pieces',
      value: totalOutputs,
      trend: outputsTrend,
      sparkline: outputsSparkline,
      icon: <Zap className="h-5 w-5" />,
      iconBg: 'bg-blue-50 text-blue-600',
      sparklineColor: '#3b82f6'
    },
    {
      title: 'Processing Time',
      value: processingTime,
      trend: processingTrend,
      sparkline: processingSparkline,
      icon: <Clock className="h-5 w-5" />,
      iconBg: 'bg-emerald-50 text-emerald-600',
      sparklineColor: '#10b981'
    },
    {
      title: 'Est. AI Spend',
      value: aiSpend,
      trend: spendTrend,
      sparkline: spendSparkline,
      icon: <DollarSign className="h-5 w-5" />,
      iconBg: 'bg-violet-50 text-violet-600',
      sparklineColor: '#8b5cf6'
    }
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          {/* Header with icon */}
          <div className="flex items-start justify-between mb-3">
            <div className={cn("rounded-lg p-2", card.iconBg)}>
              {card.icon}
            </div>
            <SparkAreaChart data={card.sparkline} color={card.sparklineColor} />
          </div>

          {/* Metric */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {card.title}
            </p>
            <p className="text-2xl font-semibold text-gray-900 tracking-tight">
              {card.value}
            </p>
          </div>

          {/* Trend */}
          <div className="mt-3 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                card.trend.direction === "up" && "bg-green-50 text-green-700",
                card.trend.direction === "down" && "bg-red-50 text-red-700",
                card.trend.direction === "neutral" && "bg-gray-100 text-gray-600"
              )}
            >
              {card.trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
              {card.trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
              {card.trend.direction === "neutral" && <Minus className="h-3 w-3" />}
              {card.trend.value > 0 ? "+" : ""}{card.trend.value}%
            </span>
            <span className="text-xs text-gray-400">{card.trend.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// Helper to generate mock sparkline data
export function generateSparklineData(baseValue: number, variance: number = 0.3): SparklineData[] {
  const points = 7
  const data: SparklineData[] = []

  for (let i = 0; i < points; i++) {
    const randomVariance = (Math.random() - 0.5) * variance * baseValue
    const trendBoost = (i / points) * baseValue * 0.2 // Slight upward trend
    data.push({
      value: Math.max(0, baseValue + randomVariance + trendBoost)
    })
  }

  return data
}
