"use client";

import { motion } from "framer-motion";
import { BookOpenText, Sparkles } from "lucide-react";

import {
  GradientText,
  MarketingFooter,
  MarketingNav,
  MarketingSection,
  MarketingShell,
  PillBadge,
  PrimaryButton,
  SIGNUP_HREF,
  Surface,
  fadeUp,
  stagger,
  useMarketingSectionFocus,
  useMarketingTheme,
} from "@/components/site/marketing";

type MarkdownBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

function parseMarkdown(markdown: string): MarkdownBlock[] {
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith("## ")) {
        return { type: "heading", level: 2, text: block.replace(/^##\s+/, "") };
      }

      if (block.startsWith("### ")) {
        return { type: "heading", level: 3, text: block.replace(/^###\s+/, "") };
      }

      const lines = block.split("\n").map((line) => line.trim());
      if (lines.every((line) => line.startsWith("- "))) {
        return {
          type: "list",
          items: lines.map((line) => line.replace(/^-\s+/, "")),
        };
      }

      return {
        type: "paragraph",
        text: lines.join(" "),
      };
    });
}

export default function WhatsNewMarketingPage({ markdown }: { markdown: string }) {
  const { theme } = useMarketingTheme();
  useMarketingSectionFocus();
  const blocks = parseMarkdown(markdown);

  return (
    <MarketingShell theme={theme}>
      <MarketingNav theme={theme} />
      <MarketingSection id="whats-new" band="home" grid className="min-h-[calc(92svh_-_var(--nav-h))]">
        <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-4xl text-center">
          <motion.div variants={fadeUp}>
            <PillBadge icon={Sparkles}>What's New</PillBadge>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="mt-4 font-serif text-[clamp(38px,5.2vw,92px)] font-semibold leading-[0.96] tracking-normal text-[var(--text)]"
          >
            Product updates for <GradientText>AudioRepurpose.</GradientText>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-2xl text-[clamp(17px,1.05vw,22px)] leading-8 text-[var(--muted)]">
            Release notes will live in one editable markdown file as new features ship.
          </motion.p>
        </motion.div>
      </MarketingSection>

      <MarketingSection id="updates" band="b" grid className="min-h-0">
        <div className="mx-auto grid w-full max-w-4xl gap-[var(--card-gap)]">
          {blocks.length ? (
            <Surface className="p-[var(--card-padding)]">
              <div className="grid gap-5">
                {blocks.map((block, index) => {
                  if (block.type === "heading") {
                    const HeadingTag = block.level === 2 ? "h2" : "h3";
                    return (
                      <HeadingTag
                        key={`${block.type}-${index}`}
                        className={block.level === 2 ? "font-serif text-3xl font-semibold text-[var(--text)]" : "text-xl font-bold text-[var(--text)]"}
                      >
                        {block.text}
                      </HeadingTag>
                    );
                  }

                  if (block.type === "list") {
                    return (
                      <ul key={`${block.type}-${index}`} className="grid gap-3">
                        {block.items.map((item) => (
                          <li key={item} className="flex gap-3 text-sm leading-6 text-[var(--muted)]">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--blue)]" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  }

                  return (
                    <p key={`${block.type}-${index}`} className="text-base leading-7 text-[var(--muted)]">
                      {block.text}
                    </p>
                  );
                })}
              </div>
            </Surface>
          ) : (
            <Surface className="p-[var(--card-padding)] text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-[var(--blue)]">
                <BookOpenText aria-hidden="true" className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-2xl font-bold text-[var(--text)]">No updates published yet.</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                This page will be updated from <span className="font-semibold text-[var(--text)]">content/whats-new.md</span> as features are ready to announce.
              </p>
              <div className="mt-5">
                <PrimaryButton href={SIGNUP_HREF}>Sign up for free</PrimaryButton>
              </div>
            </Surface>
          )}
          <MarketingFooter theme={theme} />
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}
