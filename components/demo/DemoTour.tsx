"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export type TourChapter = 'hub' | 'projects' | 'upload' | 'analytics' | 'settings';

interface DemoTourProps {
  chapter: TourChapter;
  /** Auto-start when this chapter matches the localStorage key */
  autoStart?: boolean;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

function getHubSteps(onNavigateToProjects: () => void) {
  return [
    {
      element: 'body',
      popover: {
        title: 'Welcome to AudioRepurpose',
        description:
          'This dashboard is your command center for turning audio into content. You have 4 demo files already processed — let\'s explore.',
        side: 'over' as const,
        align: 'center' as const,
      },
    },
    {
      element: '[data-tour="hub-stats"]',
      popover: {
        title: 'Performance at a Glance',
        description:
          'These KPIs update in real time. See how many projects you\'ve processed, pieces of content generated, and hours of manual work saved.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="hub-grid"]',
      popover: {
        title: 'Your Projects',
        description:
          'Each card is a processed podcast episode. Click any project to open it in the Studio.',
        side: 'top' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="hub-filters"]',
      popover: {
        title: 'Filter & Search',
        description:
          'Filter by audio type or status. Search by name. Useful when you have dozens of episodes.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Next: Studio',
        description:
          "Let's open a project and see everything AudioRepurpose generated from a single recording.",
        side: 'over' as const,
        align: 'center' as const,
        onNextClick: onNavigateToProjects,
      },
    },
  ];
}

function getProjectsSteps(
  onNavigateToUpload: () => void,
  handlers: {
    closeProject: () => void;
    selectPremium: () => void;
    selectReviewTab: () => void;
    selectSpeakersTab: () => void;
    selectContentTab: () => void;
    selectInsightsTab: () => void;
    selectSummaryTab: () => void;
    selectChaptersTab: () => void;
    selectTakeawaysTab: () => void;
    selectQuotesTab: () => void;
    showReview: () => void;
    showSpeakers: () => void;
    showContent: () => void;
    showInsights: () => void;
    showSummary: () => void;
    showChapters: () => void;
    showTakeaways: () => void;
    showQuotes: () => void;
    expandFirstOutput: () => void;
    collapseFirstOutput: () => void;
    refresh: () => void;
    openGenerateModal: () => void;
    closeGenerateModal: () => void;
    openGenerateModalOnly: () => void;
    closeGenerateModalOnly: () => void;
  }
) {
  return [
    {
      element: '[data-tour="project-sidebar"]',
      popover: {
        title: 'Your Project Library',
        description:
          'All your projects live here. We will open a featured project to show the full experience.',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="premium-project"]',
      popover: {
        title: 'Featured Project',
        description:
          'Open the featured AI Roundtable project to see the complete workflow.',
        side: 'right' as const,
        align: 'start' as const,
        onNextClick: handlers.selectPremium,
      },
    },
    {
      element: '[data-tour="conversation-feed"]',
      popover: {
        title: 'Conversation View',
        description:
          'This middle column is the transcript. It stays synced to speakers, timestamps, and selections.',
        side: 'left' as const,
        align: 'start' as const,
        onPrevClick: handlers.closeProject,
      },
    },
    {
      element: '[data-tour="speaker-bubble"]',
      popover: {
        title: 'Speaker Attribution',
        description:
          'Each speaker gets a color, name, and role. The AI extracted these from the conversation itself — no manual tagging needed.',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="sidebar-panel"]',
      popover: {
        title: 'Right Sidebar',
        description:
          'This panel is where all AI analysis and generated content live. We will walk through each section.',
        side: 'left' as const,
        align: 'start' as const,
        onNextClick: handlers.showReview,
      },
    },
    {
      element: '[data-tour="review-panel"]',
      popover: {
        title: 'Review Panel',
        description:
          'Review uncertain segments, request AI touch-ups, and apply fixes in one place.',
        side: 'left' as const,
        align: 'start' as const,
        onNextClick: handlers.showSpeakers,
        onHighlightStarted: (element: Element | null) => {
          handlers.selectReviewTab();
          element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(() => handlers.refresh(), 120);
        },
      },
    },
    {
      element: '[data-tour="speakers-panel"]',
      popover: {
        title: 'Speaker Roster',
        description:
          'Manage speaker names and roles, merge duplicates, and improve accuracy.',
        side: 'left' as const,
        align: 'start' as const,
        onNextClick: handlers.showContent,
        onPrevClick: handlers.selectReviewTab,
        onHighlightStarted: (element: Element | null) => {
          handlers.selectSpeakersTab();
          element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(() => handlers.refresh(), 120);
        },
      },
    },
    {
      element: '[data-tour="sidebar-tab-content"]',
      popover: {
        title: 'Generated Content',
        description:
          'Generated content lives here across platforms and formats.',
        side: 'bottom' as const,
        align: 'end' as const,
        onNextClick: handlers.expandFirstOutput,
        onPrevClick: handlers.selectSpeakersTab,
        onHighlightStarted: handlers.selectContentTab,
      },
    },
    {
      element: '[data-tour="content-output"]',
      popover: {
        title: 'Ready-to-Use Post',
        description:
          'Each card can expand, copy, or download instantly.',
        side: 'left' as const,
        align: 'start' as const,
        onNextClick: handlers.showInsights,
        onPrevClick: handlers.collapseFirstOutput,
        onHighlightStarted: handlers.selectContentTab,
      },
    },
    {
      element: '[data-tour="insights-panel"]',
      popover: {
        title: 'Insights Panel',
        description:
          'Explore topics, gaps, and opportunities powered by AI analysis.',
        side: 'left' as const,
        align: 'start' as const,
        onNextClick: handlers.showSummary,
        onPrevClick: handlers.selectContentTab,
        onHighlightStarted: (element: Element | null) => {
          handlers.selectInsightsTab();
          element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(() => handlers.refresh(), 120);
        },
      },
    },
    {
      element: '[data-tour="summary-panel"]',
      popover: {
        title: 'AI Summary',
        description:
          'A concise narrative overview of the full episode.',
        side: 'left' as const,
        align: 'start' as const,
        onNextClick: handlers.showChapters,
        onPrevClick: handlers.selectInsightsTab,
        onHighlightStarted: handlers.selectSummaryTab,
      },
    },
    {
      element: '[data-tour="chapters-panel"]',
      popover: {
        title: 'Chapters',
        description:
          'Auto-detected chapters with timestamps for fast navigation.',
        side: 'left' as const,
        align: 'start' as const,
        onNextClick: handlers.showTakeaways,
        onPrevClick: handlers.selectSummaryTab,
        onHighlightStarted: handlers.selectChaptersTab,
      },
    },
    {
      element: '[data-tour="takeaways-panel"]',
      popover: {
        title: 'Key Takeaways',
        description:
          'The most important moments distilled into actionable bullets.',
        side: 'left' as const,
        align: 'start' as const,
        onNextClick: handlers.showQuotes,
        onPrevClick: handlers.selectChaptersTab,
        onHighlightStarted: handlers.selectTakeawaysTab,
      },
    },
    {
      element: '[data-tour="quotes-panel"]',
      popover: {
        title: 'Quotes',
        description:
          'Pull-ready quotes with speaker attribution and timestamps.',
        side: 'left' as const,
        align: 'start' as const,
        onPrevClick: handlers.selectTakeawaysTab,
        onHighlightStarted: handlers.selectQuotesTab,
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Generate New Content',
        description:
          'Now let’s open the generator and preview everything you can create.',
        side: 'over' as const,
        align: 'center' as const,
        onNextClick: handlers.openGenerateModal,
      },
    },
    {
      element: '[data-tour="generate-modal"]',
      popover: {
        title: 'Generate Content',
        description:
          'Pick exactly which assets you want to generate for this episode.',
        side: 'right' as const,
        align: 'center' as const,
        onPrevClick: handlers.closeGenerateModalOnly,
        onHighlightStarted: (element: Element | null) => {
          handlers.openGenerateModalOnly();
          element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(() => handlers.refresh(), 200);
        },
      },
    },
    {
      element: '[data-tour="generate-section-social"]',
      popover: {
        title: 'Social Content',
        description:
          'Threads, LinkedIn posts, Instagram captions, and more.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="generate-section-longform"]',
      popover: {
        title: 'Long-Form Content',
        description:
          'Blog posts, newsletters, and extended narratives.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="generate-section-support"]',
      popover: {
        title: 'Supporting Assets',
        description:
          'Show notes, quote graphics, and supporting collateral.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="generate-footer"]',
      popover: {
        title: 'Estimate & Generate',
        description:
          'See the estimated credits and generate with one click.',
        side: 'top' as const,
        align: 'end' as const,
        onNextClick: handlers.closeGenerateModal,
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Next: Upload',
        description: 'See how easy it is to add your own recordings.',
        side: 'over' as const,
        align: 'center' as const,
        onNextClick: onNavigateToUpload,
        onPrevClick: handlers.openGenerateModalOnly,
      },
    },
  ];
}

function getUploadSteps(onNavigateToAnalytics: () => void, onNavigateToProjects: () => void) {
  return [
    {
      element: '[data-tour="upload-zone"]',
      popover: {
        title: 'Upload Your Audio',
        description:
          'Drag and drop any MP3, WAV, M4A, or M4B file. Up to 500MB. Processing typically takes 3–5 minutes per hour of audio.',
        side: 'bottom' as const,
        align: 'start' as const,
        onPrevClick: onNavigateToProjects,
      },
    },
    {
      element: '[data-tour="tier-selector"]',
      popover: {
        title: 'Choose Your Tier',
        description:
          'Transcript gives you a clean transcript with speaker labels. Content Kit adds named speakers, summary, chapters, takeaways, and quotes. Repurpose Pack includes all 11 publish-ready content types.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="advanced-options"]',
      popover: {
        title: 'Advanced Options',
        description:
          'Tune speaker detection and pre-define speakers before upload for better accuracy.',
        side: 'bottom' as const,
        align: 'start' as const,
        onHighlightStarted: (element: Element | null) => {
          const wrapper = document.querySelector('[data-tour="advanced-options"]') as HTMLElement | null;
          const expanded = wrapper?.getAttribute('data-expanded') === 'true';
          if (!expanded) {
            const toggle = document.querySelector('[data-tour="advanced-options-toggle"]') as HTMLElement | null;
            toggle?.click();
          }
          element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      },
    },
    {
      element: '[data-tour="speaker-roster"]',
      popover: {
        title: 'Pre-Define Speakers',
        description:
          "Optionally list the speakers' names and roles before uploading. This gives the AI a head start and improves attribution accuracy.",
        side: 'top' as const,
        align: 'start' as const,
        onHighlightStarted: (element: Element | null) => {
          element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      },
    },
    {
      element: '[data-tour="upload-history"]',
      popover: {
        title: 'Upload History',
        description:
          'Track past uploads, statuses, and quickly jump back into any project.',
        side: 'top' as const,
        align: 'start' as const,
        onHighlightStarted: (element: Element | null) => {
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Next: Analytics',
        description: 'See how your content library grows over time.',
        side: 'over' as const,
        align: 'center' as const,
        onNextClick: onNavigateToAnalytics,
      },
    },
  ];
}

function getAnalyticsSteps(
  onNavigateToSettings: () => void,
  onNavigateToUpload: () => void,
  handlers: {
    showInsightsTab: () => void;
    showGoalsTab: () => void;
    advanceToGoalsPanel: () => void;
    refresh: () => void;
  }
) {
  return [
    {
      element: '[data-tour="analytics-kpis"]',
      popover: {
        title: 'Your Content Output',
        description:
          'Track cumulative content created, processing time, and average cost per episode over time.',
        side: 'bottom' as const,
        align: 'start' as const,
        onPrevClick: onNavigateToUpload,
      },
    },
    {
      element: '[data-tour="analytics-controls"]',
      popover: {
        title: 'Filters & Time Range',
        description:
          'Slice analytics by project and time range to spot trends.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="analytics-content-mix"]',
      popover: {
        title: 'Content Mix & Topics',
        description:
          'See how your content output is distributed and which topics dominate.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="analytics-banner"]',
      popover: {
        title: 'Projects Ready for Analysis',
        description:
          'Run analytics on newly uploaded projects to unlock insights.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="analytics-coverage"]',
      popover: {
        title: 'Insights & Gaps',
        description:
          'Review coverage opportunities and content gaps across your library.',
        side: 'bottom' as const,
        align: 'start' as const,
        onNextClick: handlers.advanceToGoalsPanel,
        onHighlightStarted: () => {
          handlers.showInsightsTab();
          setTimeout(() => handlers.refresh(), 120);
        },
      },
    },
    {
      element: '[data-tour="analytics-goals-panel"]',
      popover: {
        title: 'Narrative Goals',
        description:
          'Set topics you want to own — "AI in healthcare", "leadership mindset" — and see which episodes cover them and how deeply.',
        side: 'top' as const,
        align: 'start' as const,
        onHighlightStarted: (element: Element | null) => {
          handlers.showGoalsTab();
          element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(() => handlers.refresh(), 120);
        },
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Next: Settings & Credits',
        description: 'See how the credit system works.',
        side: 'over' as const,
        align: 'center' as const,
        onNextClick: onNavigateToSettings,
      },
    },
  ];
}

function getSettingsSteps(onNavigateToHub: () => void, onNavigateToSignup: () => void) {
  return [
    {
      element: '[data-tour="credit-balance"]',
      popover: {
        title: 'Pay-As-You-Go Credits',
        description:
          'No subscriptions. Buy credits and use them as you process audio. Transcript costs $0.49/hr, Content Kit costs $1.49/hr, and Repurpose Pack costs $2.49/hr.',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="usage-tab"]',
      popover: {
        title: 'Full Usage Transparency',
        description:
          'Every API call is logged with its exact cost. Filter by project, date, or service. No surprises on your bill.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: 'body',
      popover: {
        title: "You've Seen Everything!",
        description:
          'AudioRepurpose turns any recording into a month of content in minutes. Ready to try it with your own audio?',
        side: 'over' as const,
        align: 'center' as const,
        prevBtnText: 'Done',
        doneBtnText: 'Sign Up →',
        onPrevClick: onNavigateToHub,
        onNextClick: onNavigateToSignup,
      },
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DemoTour({ chapter, autoStart = true }: DemoTourProps) {
  const router = useRouter();
  const driverRef = useRef<any>(null);
  const startedRef = useRef(false);

  const navigateTo = useCallback(
    (path: string, nextChapter: TourChapter) => {
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
      localStorage.setItem('demoTourChapter', nextChapter);
      router.push(path);
    },
    [router]
  );

  const startTour = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    const { driver } = await import('driver.js');
    // @ts-ignore — CSS module type not declared
    await import('driver.js/dist/driver.css');

    let steps: any[];
    const clickSelector = (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.click();
    };
    const refreshHighlight = () => {
      driverRef.current?.refresh?.();
    };
    const ensureContextSidebarOpen = () => {
      const panel = document.querySelector('[data-tour="sidebar-panel"]') as HTMLElement | null;
      if (panel && panel.offsetWidth > 0) return;
      const toggle =
        (document.querySelector('button[title="Show details panel"]') as HTMLElement | null) ||
        (document.querySelector('button[title="Show details"]') as HTMLElement | null);
      toggle?.click();
    };
    const activateTab = (selector: string, delayMs = 120) => {
      ensureContextSidebarOpen();
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.click();
      setTimeout(() => refreshHighlight(), delayMs);
    };
    const clickAndAdvance = (selector: string, delayMs = 0) => {
      clickSelector(selector);
      if (delayMs > 0) {
        setTimeout(() => driverRef.current?.moveNext(), delayMs);
      } else {
        driverRef.current?.moveNext();
      }
    };
    const closeProject = () => {
      window.dispatchEvent(new CustomEvent('demoCloseProject'));
    };
    const handlers = {
      closeProject,
      selectPremium: () => clickAndAdvance('[data-tour="premium-project"]', 200),
      selectReviewTab: () => activateTab('[data-tour="sidebar-tab-review"]'),
      selectSpeakersTab: () => activateTab('[data-tour="sidebar-tab-speakers"]'),
      selectContentTab: () => activateTab('[data-tour="sidebar-tab-content"]'),
      selectInsightsTab: () => activateTab('[data-tour="sidebar-tab-insights"]'),
      selectSummaryTab: () => activateTab('[data-tour="sidebar-tab-summary"]'),
      selectChaptersTab: () => activateTab('[data-tour="sidebar-tab-chapters"]'),
      selectTakeawaysTab: () => activateTab('[data-tour="sidebar-tab-takeaways"]'),
      selectQuotesTab: () => activateTab('[data-tour="sidebar-tab-quotes"]'),
      showReview: () => clickAndAdvance('[data-tour="sidebar-tab-review"]', 50),
      showSpeakers: () => clickAndAdvance('[data-tour="sidebar-tab-speakers"]', 50),
      showContent: () => clickAndAdvance('[data-tour="sidebar-tab-content"]', 50),
      showInsights: () => clickAndAdvance('[data-tour="sidebar-tab-insights"]', 50),
      showSummary: () => clickAndAdvance('[data-tour="sidebar-tab-summary"]', 50),
      showChapters: () => clickAndAdvance('[data-tour="sidebar-tab-chapters"]', 50),
      showTakeaways: () => clickAndAdvance('[data-tour="sidebar-tab-takeaways"]', 50),
      showQuotes: () => clickAndAdvance('[data-tour="sidebar-tab-quotes"]', 50),
      showInsightsTab: () => clickSelector('#tab-insights'),
      showGoalsTab: () => clickSelector('#tab-goals'),
      advanceToGoalsPanel: () => clickAndAdvance('#tab-goals', 80),
      refresh: refreshHighlight,
      expandFirstOutput: () => {
        clickSelector('[data-tour="sidebar-tab-content"]');
        setTimeout(() => {
          clickSelector('[data-tour="content-output"]');
          driverRef.current?.moveNext();
        }, 150);
      },
      collapseFirstOutput: () => {
        const el = document.querySelector('[data-tour="content-output"]') as HTMLElement | null;
        if (el?.getAttribute('data-expanded') === 'true') {
          el.click();
        }
      },
      openGenerateModal: () => {
        window.dispatchEvent(new CustomEvent('demoOpenGenerateContent'));
        setTimeout(() => driverRef.current?.moveNext(), 200);
      },
      openGenerateModalOnly: () => {
        window.dispatchEvent(new CustomEvent('demoOpenGenerateContent'));
      },
      closeGenerateModal: () => {
        clickSelector('[data-tour="generate-close"]');
        setTimeout(() => driverRef.current?.moveNext(), 150);
      },
      closeGenerateModalOnly: () => {
        clickSelector('[data-tour="generate-close"]');
      },
    };

    switch (chapter) {
      case 'hub':
        steps = getHubSteps(() => navigateTo('/dashboard/projects', 'projects'));
        break;
      case 'projects':
        steps = getProjectsSteps(() => navigateTo('/dashboard/upload', 'upload'), handlers);
        break;
      case 'upload':
        steps = getUploadSteps(
          () => navigateTo('/dashboard/analytics', 'analytics'),
          () => navigateTo('/dashboard/projects', 'projects')
        );
        break;
      case 'analytics':
        steps = getAnalyticsSteps(
          () => navigateTo('/dashboard/usage', 'settings'),
          () => navigateTo('/dashboard/upload', 'upload'),
          { showInsightsTab: handlers.showInsightsTab, showGoalsTab: handlers.showGoalsTab, advanceToGoalsPanel: handlers.advanceToGoalsPanel, refresh: handlers.refresh }
        );
        break;
      case 'settings':
        steps = getSettingsSteps(
          () => {
            driverRef.current?.destroy();
            driverRef.current = null;
            localStorage.removeItem('demoTourChapter');
            router.push('/dashboard/hub');
          },
          () => {
            driverRef.current?.destroy();
            driverRef.current = null;
            localStorage.removeItem('demoTourChapter');
            router.push('/auth/signup');
          }
        );
        break;
      default:
        return;
    }

    // Resolve step elements lazily so targets that appear after navigation,
    // tab switches, or modal opens can still be highlighted.
    const lazySteps = steps.map((step: any) => {
      if (!step.element) return step;
      if (typeof step.element !== 'string') return step;
      const selector = step.element;
      return {
        ...step,
        element: () => document.querySelector(selector) || document.body,
      };
    });

    const driverInstance = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.35,
      stagePadding: 6,
      stageRadius: 8,
      overlayClickBehavior: 'close',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Continue →',
      onDestroyStarted: () => {
        localStorage.removeItem('demoTourChapter');
        driverInstance.destroy();
      },
      steps: lazySteps,
    });

    driverRef.current = driverInstance;
    try {
      driverInstance.drive();
    } catch (err) {
      console.warn('[DemoTour] driver.js failed to start:', err);
      localStorage.removeItem('demoTourChapter');
      startedRef.current = false;
    }
  }, [chapter, navigateTo, router]);

  useEffect(() => {
    if (!autoStart) return;
    const storedChapter = localStorage.getItem('demoTourChapter');
    if (storedChapter !== chapter) return;

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(() => {
      startTour();
    }, 400);

    return () => clearTimeout(timeout);
  }, [autoStart, chapter, startTour]);

  // Also listen for the custom event dispatched by WelcomeModal
  useEffect(() => {
    if (chapter !== 'hub') return;
    const handler = () => {
      startedRef.current = false; // reset so it can start
      setTimeout(() => startTour(), 400);
    };
    window.addEventListener('demoTourStart', handler);
    return () => window.removeEventListener('demoTourStart', handler);
  }, [chapter, startTour]);

  return null;
}
