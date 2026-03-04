# Launch Page UX/UI & Copy Audit

## Overview
This audit evaluates the current launch page (`app/page.tsx`) against the four core capabilities of AudioRepurpose. 

## 1. Automated Transcription & Speaker Diarization
**✅ What is currently working well:**
- This is the strongest and most clearly communicated feature on the page.
- The "Hero Mockup" visually demonstrates speaker identification (Ryan W. vs Sarah C.) with color coding and roles.
- The "Pain Points" section highly effectively targets the exact frustrations creators have with traditional transcription (e.g., overlapping speech, manual cleanup).
- Pricing tiers clearly explain the progression from generic labels (Basic) to AI name extraction (Pro) to role classification (Premium).

**❌ What features are missing or buried:**
- *None.* This capability is front and center and very well executed.

**💡 Recommendations:**
- Keep as is. The visual mockup does a fantastic job of instantly conveying this value proposition.

---

## 2. Educational Insights
**✅ What is currently working well:**
- The "Deep Insight Extraction" feature tile mentions "entity tracking across people, products, and key concepts."
- The Premium tier mentions "insights" as a bullet point.

**❌ What features are missing or buried:**
- The specifics of the educational insights—**concepts/people explained, definitions, research links**—are entirely missing from the copy.
- "Tier-based access" for insights is only vaguely implied by putting "insights" in the Premium tier.

**💡 Recommendations:**
- **Copy Update:** Update the "Deep Insight Extraction" feature tile to explicitly mention generating definitions, research links, and explanations for complex concepts. 
- **Component Change:** Add a visual example in the "Hero Mockup" (perhaps a third panel or a toggle) showing an "Insights Dashboard" with a highlighted concept and its generated definition/research link.

---

## 3. Content Generation & Cost Tracking
**✅ What is currently working well:**
- The "Output Showcase" section is excellent. It uses clear badges, explains the output length/format, and visually represents the variety of generated content (8 formats).
- The "Hero Mockup" shows a "Generated Content" panel which grounds the feature in reality.

**❌ What features are missing or buried:**
- **Prompt templating** is completely missing. Users don't know they can customize the AI's output style or structure.
- **Cost tracking** is completely missing. While the pricing section explains the *cost* ($0.37/hr), the capability to *track* these costs within the app isn't mentioned.

**💡 Recommendations:**
- **New Feature Tile:** Add a tile in the "Features" grid for "Custom Prompt Templating" to let power users know they have control over the output voice and format.
- **Copy Update (Pricing):** In the Pricing section, add a small callout or feature bullet mentioning "Built-in ROI & Cost Tracking dashboard."

---

## 4. Narrative Coverage Analysis
**✅ What is currently working well:**
- The Premium tier mentions "Key takeaways extraction," which touches the surface.

**❌ What features are missing or buried:**
- The entire concept of **Narrative coverage analysis** (topics, sentiment, CTAs, coverage gaps) is completely absent from the launch page.
- The **manual trigger for cost control** is also missing. Users might fear the AI will auto-run and drain their credits.

**💡 Recommendations:**
- **Add a New Section or Feature Tile:** Add "Narrative Coverage & Gaps" to the core features. Explain how it detects missing CTAs, analyzes sentiment, and finds topic gaps.
- **Addressing Cost Control:** In the "Pricing" or "How it Works" section, explicitly add a badge or text saying: "100% Manual Triggers — You control what processes and when, so you never waste credits."
- **Visual Evidence:** Consider adding a "Narrative Coverage" metrics widget to the Hero Mockup to show a "Sentiment Score" or "Detected CTAs" gauge.

---

## General Layout & UX Recommendations
1. **Feature Grid Expansion:** You have 4 core features right now. Consider expanding the `FEATURES` array to 6 tiles to explicitly include "Prompt Templating" and "Narrative Coverage Analysis".
2. **"How It Works" Updates:** Step 2 says "AI Identifies & Refines". Consider updating this description to mention that it also analyzes narrative gaps and extracts educational insights, not just speaker names.
3. **Credit Anxiety:** Address the "manual trigger for cost control" near the CTA buttons. E.g., adding a subtext under the "Get Started Free" button: *“Pay only when you manually trigger processing.”*
