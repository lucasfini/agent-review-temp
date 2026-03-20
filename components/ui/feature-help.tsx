"use client";

import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureHelpProps {
  title?: string;
  description: string;
  bestFor?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  contentClassName?: string;
}

export function FeatureHelp({
  title,
  description,
  bestFor,
  side = "top",
  align = "center",
  className,
  contentClassName,
}: FeatureHelpProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <HoverCardPrimitive.Root open={open} onOpenChange={setOpen} openDelay={120} closeDelay={80}>
      <HoverCardPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={title ? `Help: ${title}` : "More information"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((prev) => !prev);
          }}
          className={cn(
            "inline-flex h-4.5 w-4.5 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:text-slate-500 dark:hover:text-slate-200",
            className
          )}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "z-50 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 text-left text-slate-900 shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50",
            contentClassName
          )}
        >
          {title ? <p className="text-sm font-semibold">{title}</p> : null}
          <p className={cn("text-sm leading-5 text-slate-600 dark:text-slate-300", title ? "mt-1.5" : "")}>
            {description}
          </p>
          {bestFor ? (
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Best used when: {bestFor}
            </p>
          ) : null}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}
