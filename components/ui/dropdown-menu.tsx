"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface DropdownMenuProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'left' | 'right'
  side?: 'top' | 'bottom'
  offset?: number
  portal?: boolean
  className?: string
}

export function DropdownMenu({
  trigger,
  children,
  align = 'right',
  side = 'bottom',
  offset = 4,
  portal = false,
  className
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [portalStyle, setPortalStyle] = React.useState<React.CSSProperties | null>(null)

  // Close on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedTrigger = menuRef.current?.contains(target)
      const clickedContent = contentRef.current?.contains(target)

      if (!clickedTrigger && !clickedContent) {
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

  React.useLayoutEffect(() => {
    if (!isOpen || !portal || !triggerRef.current) return

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return

      setPortalStyle({
        position: 'fixed',
        top: side === 'top' ? rect.top - offset : rect.bottom + offset,
        left: align === 'right' ? rect.right : rect.left,
        transform: align === 'right'
          ? `translateX(-100%)${side === 'top' ? ' translateY(-100%)' : ''}`
          : side === 'top'
            ? 'translateY(-100%)'
            : undefined,
        zIndex: 1000,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [align, isOpen, offset, portal, side])

  const menu = isOpen ? (
    <div
      ref={contentRef}
      className={cn(
        "z-50 min-w-[180px] rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200 focus:outline-none dark:bg-slate-900 dark:ring-slate-700",
        portal
          ? ""
          : cn(
              "absolute",
              side === 'top' ? 'bottom-full mb-1' : 'mt-1',
              align === 'right' ? 'right-0' : 'left-0'
            )
      )}
      style={portal ? portalStyle ?? undefined : undefined}
      onClick={() => setIsOpen(false)}
    >
      {children}
    </div>
  ) : null

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>

      {portal
        ? isOpen && portalStyle ? createPortal(menu, document.body) : null
        : menu}
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
