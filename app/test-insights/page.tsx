'use client';

import React, { useState } from 'react';
import { InsightsPanel, Insight } from '@/components/insights';
import { Lightbulb, PanelRightOpen, PanelRightClose } from 'lucide-react';

// Mock data with new structure
const MOCK_INSIGHTS: Insight[] = [
  {
    id: '1',
    title: 'Steam Machine',
    category: 'tool',
    definition: 'Valve\'s discontinued line of pre-built gaming PCs designed to run SteamOS and bring PC gaming to the living room.',
    significance: 'Represented Valve\'s first major hardware push and laid groundwork for the Steam Deck. Its failure taught Valve important lessons about hardware-software integration.',
    matchText: 'Steam Machine',
    matchVariants: ['Steam Machines'],
    sources: [
      { title: 'Steam Machine - Wikipedia', url: 'https://en.wikipedia.org/wiki/Steam_Machine' },
      { title: 'The Rise and Fall of Steam Machines', url: 'https://arstechnica.com/gaming/steam-machines' },
    ],
  },
  {
    id: '2',
    title: 'Gabe Newell',
    category: 'person',
    definition: 'Co-founder and president of Valve Corporation. Former Microsoft employee who left to start Valve in 1996.',
    significance: 'His leadership philosophy of flat organizational structure and long-term thinking has made Valve one of the most influential companies in gaming.',
    matchText: 'Gabe Newell',
    matchVariants: ['Gabe', 'Newell'],
    sources: [
      { title: 'Gabe Newell - Wikipedia', url: 'https://en.wikipedia.org/wiki/Gabe_Newell' },
    ],
  },
  {
    id: '3',
    title: 'Digital Distribution',
    category: 'concept',
    definition: 'The delivery of digital content (games, software, media) over the internet, eliminating physical media.',
    significance: 'Steam pioneered this model for games in 2003, fundamentally changing how games are sold and consumed worldwide.',
    matchText: 'digital distribution',
    sources: [
      { title: 'How Steam Changed Gaming', url: 'https://www.polygon.com/steam-history' },
    ],
  },
  {
    id: '4',
    title: 'Source Engine',
    category: 'tool',
    definition: 'Valve\'s proprietary game engine that powered Half-Life 2, Portal, Counter-Strike, and many third-party games.',
    significance: 'Introduced advanced physics simulation and facial animation that set new standards for game development in the 2000s.',
    matchText: 'Source engine',
    matchVariants: ['Source Engine', 'Source'],
    sources: [
      { title: 'Source Engine Documentation', url: 'https://developer.valvesoftware.com/wiki/Source' },
    ],
  },
  {
    id: '5',
    title: 'Platform Lock-in',
    category: 'concept',
    definition: 'When users become dependent on a platform due to accumulated purchases, making switching costly or impractical.',
    significance: 'Steam\'s vast library system creates strong lock-in effects, which has been both criticized and emulated across the industry.',
    matchText: 'platform lock-in',
    matchVariants: ['lock-in'],
    sources: [
      { title: 'The Economics of Platform Lock-in', url: 'https://hbr.org/platform-strategy' },
    ],
  },
  {
    id: '6',
    title: 'Robin Walker',
    category: 'person',
    definition: 'Valve programmer and designer, co-creator of Team Fortress. Joined Valve after they acquired the Team Fortress mod.',
    significance: 'His work on Team Fortress 2 pioneered the free-to-play model with cosmetic monetization that became industry standard.',
    matchText: 'Robin Walker',
    matchVariants: ['Walker'],
    sources: [
      { title: 'Robin Walker Interview', url: 'https://www.gamedeveloper.com/robin-walker' },
    ],
  },
];

const MOCK_TRANSCRIPT = `Today we're discussing the history of Valve and how they revolutionized gaming.

It all started when Gabe Newell left Microsoft in 1996 to pursue his vision of creating immersive games. Newell had seen the potential of interactive entertainment and wanted to push the boundaries.

The company's first major innovation was Steam, which pioneered digital distribution for games. Before Steam, gamers had to buy physical discs. Digital distribution changed everything—suddenly you could buy a game at midnight and play immediately.

Of course, not everything Valve touched turned to gold. The Steam Machine initiative in 2013 was meant to bring PC gaming to the living room. Steam Machines were pre-built computers running SteamOS, but they never caught on with mainstream consumers.

One thing that did succeed was the Source engine. This technology powered classics like Half-Life 2 and Portal. The Source Engine's physics system was groundbreaking for its time.

Robin Walker, one of Valve's key developers, helped shape the free-to-play model with Team Fortress 2. Walker had originally created Team Fortress as a Quake mod before joining Valve.

Critics often point to platform lock-in as a downside of Steam's dominance. Once you have hundreds of games in your Steam library, switching to another platform feels almost impossible. This lock-in effect has become a common strategy in the industry.

Gabe Newell has always emphasized long-term thinking over quarterly profits. This philosophy allowed Valve to experiment with hardware like the Steam Deck, learning from the Steam Machine failure.`;

export default function TestInsightsPage() {
  const [showSidebar, setShowSidebar] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-600">
            <Lightbulb className="h-4 w-4" />
            <span className="text-sm font-medium">Insights Demo</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSidebar(!showSidebar)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            {showSidebar ? (
              <>
                <PanelRightClose className="h-4 w-4" />
                <span>Hide Panel</span>
              </>
            ) : (
              <>
                <PanelRightOpen className="h-4 w-4" />
                <span>Show Panel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white" style={{ height: 'calc(100vh - 53px)' }}>
        <InsightsPanel
          transcriptText={MOCK_TRANSCRIPT}
          insights={MOCK_INSIGHTS}
          showSidebar={showSidebar}
          onCloseSidebar={() => setShowSidebar(false)}
        />
      </div>
    </div>
  );
}
