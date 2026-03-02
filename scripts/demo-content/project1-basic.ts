/**
 * Demo Project 1 — Basic Tier
 * "How We Built It: From Dorm Room to $10M ARR"
 * ~22 minutes, 2 speakers, numbered (no AI name extraction)
 * Intentionally sparse to show the upgrade value proposition.
 */

export const PROJECT1_TITLE = 'How We Built It: From Dorm Room to $10M ARR';

export const PROJECT1_TRANSCRIPTION_TEXT = `
Speaker 1: Welcome back to the show. Today I'm joined by someone whose story is honestly one of the most inspiring I've come across in the startup world — going from a dorm room project to ten million dollars in annual recurring revenue in just under three years. Welcome.

Speaker 2: Thank you, I'm genuinely excited to be here. It still doesn't feel real when I say those numbers out loud.

Speaker 1: Let's start at the very beginning. You're at university, second year I think — what was the problem you were trying to solve?

Speaker 2: Right, so I was studying computer science and I had this side project — a scheduling tool for student clubs on campus. Nothing fancy. But I kept hearing the same thing from every club president I talked to: they were drowning in emails, nobody showed up to events, and tracking RSVPs was a nightmare. I thought, okay, this is solvable.

Speaker 1: And how many potential users did that represent on your campus?

Speaker 2: Maybe three thousand students actively involved in clubs. But I started thinking — every university has this problem. There are four thousand universities in the US alone. Suddenly it wasn't a side project, it was a real market.

Speaker 1: That shift in thinking from "cool project" to "real company" — when did that happen?

Speaker 2: Honestly it was a Tuesday night. I was in the library at two in the morning and someone from a completely different school messaged me saying they'd heard about my tool and could they use it. I hadn't even publicized it. That was the moment. If it's spreading word of mouth with zero marketing, something is working.

Speaker 1: So what did you do next?

Speaker 2: I called my co-founder — my roommate Marcus — woke him up actually, and said we need to build a real product. We pulled an all-nighter, wrote out the core features, and committed to launching a proper beta in six weeks.

Speaker 1: Six weeks is fast. What corners did you cut?

Speaker 2: Honestly, most of the admin features. We built exactly what the users were asking for and nothing else. No analytics dashboards, no integrations, nothing. Just: create an event, invite people, track attendance. That's it.

Speaker 1: And the launch?

Speaker 2: We emailed every student government president in our state. Got thirty beta users in the first week. By month three we had two hundred campuses. We hadn't charged a single dollar yet.

Speaker 1: When did money come into the picture?

Speaker 2: Month four. We introduced a free tier with a hundred event attendees per month, and a paid tier at ninety-nine dollars a year per campus. First payment came in on a Wednesday. Marcus and I literally took a screenshot.

Speaker 1: Walk me through the growth from there to a million in ARR.

Speaker 2: It took fourteen months. The thing that accelerated it was a feature nobody expected — a shared alumni network. We noticed that club presidents were graduating and wanting to stay connected to their clubs. We built a basic alumni tab, almost as an afterthought. It went viral on LinkedIn. Suddenly we were getting inbound from three hundred schools in a month.

Speaker 1: That's incredible. And from a million to ten million?

Speaker 2: That was an eighteen-month push. We raised a seed round — two point five million dollars — hired a six-person sales team, and went after the top two hundred universities directly. We closed Harvard, MIT, and Stanford in the same quarter. Those logos opened every door after that.

Speaker 1: What was the hardest part of that scale-up phase?

Speaker 2: Culture. When it's just you and your co-founder, everything is implicit. The moment you have twenty people, you realize nothing is implicit. You have to be intentional about every decision. We almost lost two of our best engineers because we hadn't thought about career growth paths. That was a wake-up call.

Speaker 1: If you could go back and change one thing?

Speaker 2: I would have hired a head of customer success six months earlier. We were losing accounts we shouldn't have been losing — not because the product was bad, but because nobody was proactively reaching out. We were leaving money on the table.

Speaker 1: Last question — what's next?

Speaker 2: We're going international. UK and Canada first, then Australia. The university club problem is universal. We think there's a path to fifty million ARR in the next three years.

Speaker 1: I love the ambition. Thanks so much for being here.

Speaker 2: Really appreciated it, thank you.
`.trim();

export const PROJECT1_SEGMENTS = [
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 0, endTime: 18, text: "Welcome back to the show. Today I'm joined by someone whose story is honestly one of the most inspiring I've come across in the startup world — going from a dorm room project to ten million dollars in annual recurring revenue in just under three years. Welcome.", confidence: 0.92, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 19, endTime: 29, text: "Thank you, I'm genuinely excited to be here. It still doesn't feel real when I say those numbers out loud.", confidence: 0.91, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 30, endTime: 43, text: "Let's start at the very beginning. You're at university, second year I think — what was the problem you were trying to solve?", confidence: 0.93, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 44, endTime: 82, text: "Right, so I was studying computer science and I had this side project — a scheduling tool for student clubs on campus. Nothing fancy. But I kept hearing the same thing from every club president I talked to: they were drowning in emails, nobody showed up to events, and tracking RSVPs was a nightmare. I thought, okay, this is solvable.", confidence: 0.90, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 83, endTime: 92, text: "And how many potential users did that represent on your campus?", confidence: 0.94, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 93, endTime: 118, text: "Maybe three thousand students actively involved in clubs. But I started thinking — every university has this problem. There are four thousand universities in the US alone. Suddenly it wasn't a side project, it was a real market.", confidence: 0.89, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 119, endTime: 133, text: "That shift in thinking from 'cool project' to 'real company' — when did that happen?", confidence: 0.92, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 134, endTime: 173, text: "Honestly it was a Tuesday night. I was in the library at two in the morning and someone from a completely different school messaged me saying they'd heard about my tool and could they use it. I hadn't even publicized it. That was the moment. If it's spreading word of mouth with zero marketing, something is working.", confidence: 0.91, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 174, endTime: 181, text: "So what did you do next?", confidence: 0.95, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 182, endTime: 226, text: "I called my co-founder — my roommate Marcus — woke him up actually, and said we need to build a real product. We pulled an all-nighter, wrote out the core features, and committed to launching a proper beta in six weeks.", confidence: 0.90, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 227, endTime: 238, text: "Six weeks is fast. What corners did you cut?", confidence: 0.93, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 239, endTime: 287, text: "Honestly, most of the admin features. We built exactly what the users were asking for and nothing else. No analytics dashboards, no integrations, nothing. Just: create an event, invite people, track attendance. That's it.", confidence: 0.91, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 288, endTime: 296, text: "And the launch?", confidence: 0.94, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 297, endTime: 349, text: "We emailed every student government president in our state. Got thirty beta users in the first week. By month three we had two hundred campuses. We hadn't charged a single dollar yet.", confidence: 0.90, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 350, endTime: 360, text: "When did money come into the picture?", confidence: 0.92, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 361, endTime: 413, text: "Month four. We introduced a free tier with a hundred event attendees per month, and a paid tier at ninety-nine dollars a year per campus. First payment came in on a Wednesday. Marcus and I literally took a screenshot.", confidence: 0.91, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 414, endTime: 426, text: "Walk me through the growth from there to a million in ARR.", confidence: 0.93, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 427, endTime: 498, text: "It took fourteen months. The thing that accelerated it was a feature nobody expected — a shared alumni network. We noticed that club presidents were graduating and wanting to stay connected to their clubs. We built a basic alumni tab, almost as an afterthought. It went viral on LinkedIn. Suddenly we were getting inbound from three hundred schools in a month.", confidence: 0.89, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 499, endTime: 510, text: "That's incredible. And from a million to ten million?", confidence: 0.93, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 511, endTime: 568, text: "That was an eighteen-month push. We raised a seed round — two point five million dollars — hired a six-person sales team, and went after the top two hundred universities directly. We closed Harvard, MIT, and Stanford in the same quarter. Those logos opened every door after that.", confidence: 0.91, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 569, endTime: 583, text: "What was the hardest part of that scale-up phase?", confidence: 0.92, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 584, endTime: 647, text: "Culture. When it's just you and your co-founder, everything is implicit. The moment you have twenty people, you realize nothing is implicit. You have to be intentional about every decision. We almost lost two of our best engineers because we hadn't thought about career growth paths. That was a wake-up call.", confidence: 0.90, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 648, endTime: 662, text: "If you could go back and change one thing?", confidence: 0.94, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 663, endTime: 716, text: "I would have hired a head of customer success six months earlier. We were losing accounts we shouldn't have been losing — not because the product was bad, but because nobody was proactively reaching out. We were leaving money on the table.", confidence: 0.90, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 717, endTime: 726, text: "Last question — what's next?", confidence: 0.93, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 727, endTime: 764, text: "We're going international. UK and Canada first, then Australia. The university club problem is universal. We think there's a path to fifty million ARR in the next three years.", confidence: 0.91, status: 'confirmed' as const },
  { speakerId: 'A', finalSpeakerId: 'A', startTime: 765, endTime: 776, text: "I love the ambition. Thanks so much for being here.", confidence: 0.95, status: 'confirmed' as const },
  { speakerId: 'B', finalSpeakerId: 'B', startTime: 777, endTime: 784, text: "Really appreciated it, thank you.", confidence: 0.94, status: 'confirmed' as const },
];

export const PROJECT1_SPEAKER_DATA = {
  segments: PROJECT1_SEGMENTS,
  speakers: {
    A: {
      id: 'A',
      finalName: 'Speaker 1',
      fallbackName: 'Speaker 1',
      role: null,
      totalDuration: 182,
      segmentCount: 14,
      confidence: 0.92,
    },
    B: {
      id: 'B',
      finalName: 'Speaker 2',
      fallbackName: 'Speaker 2',
      role: null,
      totalDuration: 602,
      segmentCount: 14,
      confidence: 0.91,
    },
  },
  detectionMetadata: {
    totalSpeakers: 2,
    totalSegments: 28,
    processedAt: '2026-02-20T14:22:00Z',
  },
};
