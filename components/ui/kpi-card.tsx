"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface KPICardProps {
  title: string
  value: string | number
  icon?: React.ReactNode
  trend?: {
    value: number
    direction: "up" | "down" | "neutral"
    label?: string
  }
  subtitle?: string
  className?: string
}

export function KPICard({
  title,
  value,
  icon,
  trend,
  subtitle,
  className
}: KPICardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm transition-all hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="text-2xl font-semibold tracking-tight text-slate-50">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-slate-800 p-2 text-slate-400">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
              trend.direction === "up" && "bg-green-900/30 text-green-400",
              trend.direction === "down" && "bg-red-900/30 text-red-400",
              trend.direction === "neutral" && "bg-slate-800 text-slate-400"
            )}
          >
            {trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
            {trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
            {trend.direction === "neutral" && <Minus className="h-3 w-3" />}
            {trend.value > 0 ? "+" : ""}{trend.value}%
          </span>
          {trend.label && (
            <span className="text-xs text-slate-500">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  )
}

interface CollapsibleStatsRowProps {
  children: React.ReactNode
  defaultCollapsed?: boolean
  title?: string
}

export function CollapsibleStatsRow({
  children,
  defaultCollapsed = false,
  title = "Key Metrics"
}: CollapsibleStatsRowProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="mb-3 flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          {title}
        </span>
        <span className="text-xs text-slate-500 hover:text-slate-300">
          {isCollapsed ? "Show" : "Hide"}
        </span>
      </button>
      <div
        className={cn(
          "grid gap-4 transition-all duration-200",
          isCollapsed ? "h-0 overflow-hidden opacity-0" : "opacity-100"
        )}
      >
        {children}
      </div>
    </div>
  )
}
