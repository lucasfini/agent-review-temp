import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-blue-600 text-white hover:bg-blue-700",
        secondary:
          "border-transparent bg-slate-700 text-slate-200 hover:bg-slate-600",
        success:
          "border-transparent bg-green-900/40 text-green-400 hover:bg-green-900/60",
        warning:
          "border-transparent bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60",
        destructive:
          "border-transparent bg-red-900/40 text-red-400 hover:bg-red-900/60",
        info:
          "border-transparent bg-blue-900/40 text-blue-400 hover:bg-blue-900/60",
        outline: "text-slate-200 border-slate-700",
        premium:
          "border-transparent bg-purple-900/40 text-purple-400 hover:bg-purple-900/60",
        pro:
          "border-transparent bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/60",
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
