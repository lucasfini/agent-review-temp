import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-blue-600 text-white hover:bg-blue-700",
        secondary:
          "border-slate-300 bg-slate-200 text-slate-800 hover:bg-slate-300 dark:border-transparent dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600",
        success:
          "border-green-200 bg-green-100 text-green-800 hover:bg-green-200 dark:border-transparent dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60",
        warning:
          "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-transparent dark:bg-yellow-900/40 dark:text-yellow-400 dark:hover:bg-yellow-900/60",
        destructive:
          "border-red-200 bg-red-100 text-red-800 hover:bg-red-200 dark:border-transparent dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60",
        info:
          "border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:border-transparent dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60",
        outline: "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200",
        premium:
          "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-200 dark:border-transparent dark:bg-purple-900/40 dark:text-purple-400 dark:hover:bg-purple-900/60",
        pro:
          "border-indigo-200 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 dark:border-transparent dark:bg-indigo-900/40 dark:text-indigo-400 dark:hover:bg-indigo-900/60",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
