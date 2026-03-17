"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface DropdownMenuProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}

export function DropdownMenu({ trigger, children, align = 'right', className }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  // Close on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on escape
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>

      {isOpen && (
        <div
          className={cn(
            "absolute z-50 mt-1 min-w-[180px] rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200 focus:outline-none dark:bg-slate-900 dark:ring-slate-700",
            align === 'right' ? 'right-0' : 'left-0'
          )}
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

interface DropdownMenuItemProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  destructive?: boolean
  className?: string
}

export function DropdownMenuItem({
  children,
  onClick,
  disabled = false,
  destructive = false,
  className
}: DropdownMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
        disabled
          ? "cursor-not-allowed text-slate-400 dark:text-slate-600"
          : destructive
          ? "text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        className
      )}
    >
      {children}
    </button>
  )
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {children}
    </div>
  )
}
