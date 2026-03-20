"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { AreaChart, Area, ResponsiveContainer } from "recharts"
import { FeatureHelp } from "@/components/ui/feature-help"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface SparklinePoint {
  value: number
}

export interface AnalyticsKpiCard {
  title: string
  value: string | number
  note: string
  helpDescription?: string
  helpBestFor?: string
  trend: {
    value: number
    direction: "up" | "down" | "neutral"
    label: string
    tone?: "positive" | "negative" | "neutral"
  }
  sparkline: SparklinePoint[]
  icon: ReactNode
  iconBg: string
  sparklineColor: string
}

function SparkAreaChart({
  data,
  color = "#3b82f6",
}: {
  data: SparklinePoint[]
  color?: string
}) {
  return (
    <div className="h-10 w-20" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#gradient-${color.replace("#", "")})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function KPIGrid({ cards }: { cards: AnalyticsKpiCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const trendTone =
          card.trend.tone ||
          (card.trend.direction === "up"
            ? "positive"
            : card.trend.direction === "down"
              ? "negative"
              : "neutral")

        return (
          <div
            key={card.title}
            role="group"
            aria-label={`${card.title}: ${card.value}`}
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className={cn("rounded-lg p-2", card.iconBg)}>
                {card.icon}
              </div>
              <SparkAreaChart data={card.sparkline} color={card.sparklineColor} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {card.title}
                </p>
                {card.helpDescription ? (
                  <FeatureHelp
                    title={card.title}
                    description={card.helpDescription}
                    bestFor={card.helpBestFor}
                  />
                ) : null}
              </div>
              <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                {card.value}
              </p>
              <p className="min-h-[2.5rem] text-sm leading-5 text-slate-500 dark:text-slate-400">
                {card.note}
              </p>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  trendTone === "positive" && "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
                  trendTone === "negative" && "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
                  trendTone === "neutral" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {card.trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
                {card.trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
                {card.trend.direction === "neutral" && <Minus className="h-3 w-3" />}
                {card.trend.value > 0 ? "+" : ""}
                {card.trend.value}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{card.trend.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
