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
          'Each card is a processed podcast episode. Click any project to open it in the Content Library.',
        side: 'top' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="hub-filters"]',
      popover: {
        title: 'Filter & Search',
        description:
          'Filter by processing tier or status. Search by name. Useful when you have dozens of episodes.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Next: Content Library',
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
    selectPremium: () => void;
    showSpeakers: () => void;
    showContent: () => void;
    showInsights: () => void;
    showSummary: () => void;
    showChapters: () => void;
    showTakeaways: () => void;
    showQuotes: () => void;
    expandFirstOutput: () => void;
    openGenerateModal: () => void;
    closeGenerateModal: () => void;
  }
) {
  return [
    {
      element: '[data-tour="project-sidebar"]',
      popover: {
        title: 'Your Project Library',
        description:
          'All your projects live here. We will open a premium project to show the full experience.',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="premium-project"]',
      popover: {
        title: 'Premium Project',
        description:
          'Open the premium AI Roundtable project to see the complete workflow.',
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
      },
    },
    {
      element: '[data-tour="sidebar-tab-review"]',
      popover: {
        title: 'Review',
        description:
          'Quickly audit low-confidence segments and resolve any speaker issues.',
        side: 'bottom' as const,
        align: 'start' as const,
        onNextClick: handlers.showSpeakers,
      },
    },
    {
      element: '[data-tour="sidebar-tab-speakers"]',
      popover: {
        title: 'Speakers',
        description:
          'See the speaker roster, roles, and segment counts at a glance.',
        side: 'bottom' as const,
        align: 'start' as const,
        onNextClick: handlers.showContent,
      },
    },
    {
      element: '[data-tour="sidebar-tab-content"]',
      popover: {
        title: 'Generated Content',
        description:
          'Premium projects include a full content suite across platforms.',
        side: 'bottom' as const,
        align: 'end' as const,
        onNextClick: handlers.expandFirstOutput,
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
      },
    },
    {
      element: '[data-tour="sidebar-tab-insights"]',
      popover: {
        title: 'Insights',
        description:
          'Entities, tools, and themes extracted with sources and confidence.',
        side: 'bottom' as const,
        align: 'start' as const,
        onNextClick: handlers.showSummary,
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
        side: 'over' as const,
        align: 'center' as const,
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
      },
    },
  ];
}

function getUploadSteps(onNavigateToAnalytics: () => void) {
  return [
    {
      element: '[data-tour="upload-zone"]',
      popover: {
        title: 'Upload Your Audio',
        description:
          'Drag and drop any MP3, WAV, M4A, or M4B file. Up to 500MB. Processing typically takes 3–5 minutes per hour of audio.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="tier-selector"]',
      popover: {
        title: 'Choose Your Tier',
        description:
          'Basic gives you a clean transcript with speaker labels. Pro adds AI name extraction and a summary. Premium adds roles, chapters, takeaways, and social quotes — everything you need for full content generation.',
        side: 'bottom' as const,
        align: 'start' as const,
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

function getAnalyticsSteps(onNavigateToSettings: () => void) {
  return [
    {
      element: '[data-tour="analytics-kpis"]',
      popover: {
        title: 'Your Content Output',
        description:
          'Track cumulative content created, processing time, and average cost per episode over time.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="analytics-goals"]',
      popover: {
        title: 'Narrative Goals',
        description:
          'Set topics you want to own — "AI in healthcare", "leadership mindset" — and see which episodes cover them and how deeply.',
        side: 'bottom' as const,
        align: 'start' as const,
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

function getSettingsSteps() {
  return [
    {
      element: '[data-tour="credit-balance"]',
      popover: {
        title: 'Pay-As-You-Go Credits',
        description:
          'No subscriptions. Buy credits and use them as you process audio. Basic costs ~$0.37/hr. Premium costs ~$0.52/hr.',
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
    const clickAndAdvance = (selector: string, delayMs = 0) => {
      clickSelector(selector);
      if (delayMs > 0) {
        setTimeout(() => driverRef.current?.moveNext(), delayMs);
      } else {
        driverRef.current?.moveNext();
      }
    };
    const handlers = {
      selectPremium: () => clickAndAdvance('[data-tour="premium-project"]', 200),
      showSpeakers: () => clickAndAdvance('[data-tour="sidebar-tab-speakers"]', 50),
      showContent: () => clickAndAdvance('[data-tour="sidebar-tab-content"]', 50),
      showInsights: () => clickAndAdvance('[data-tour="sidebar-tab-insights"]', 50),
      showSummary: () => clickAndAdvance('[data-tour="sidebar-tab-summary"]', 50),
      showChapters: () => clickAndAdvance('[data-tour="sidebar-tab-chapters"]', 50),
      showTakeaways: () => clickAndAdvance('[data-tour="sidebar-tab-takeaways"]', 50),
      showQuotes: () => clickAndAdvance('[data-tour="sidebar-tab-quotes"]', 50),
      expandFirstOutput: () => {
        clickSelector('[data-tour="sidebar-tab-content"]');
        setTimeout(() => {
          clickSelector('[data-tour="content-output"]');
          driverRef.current?.moveNext();
        }, 150);
      },
      openGenerateModal: () => {
        window.dispatchEvent(new CustomEvent('demoOpenGenerateContent'));
        setTimeout(() => driverRef.current?.moveNext(), 200);
      },
      closeGenerateModal: () => {
        clickSelector('[data-tour="generate-close"]');
        setTimeout(() => driverRef.current?.moveNext(), 150);
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
        steps = getUploadSteps(() => navigateTo('/dashboard/analytics', 'analytics'));
        break;
      case 'analytics':
        steps = getAnalyticsSteps(() => navigateTo('/dashboard/settings', 'settings'));
        break;
      case 'settings':
        steps = getSettingsSteps();
        break;
      default:
        return;
    }

    const driverInstance = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: 'close',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Continue to next page →',
      onDestroyStarted: () => {
        localStorage.removeItem('demoTourChapter');
        driverInstance.destroy();
      },
      steps,
    });

    driverRef.current = driverInstance;
    driverInstance.drive();
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
