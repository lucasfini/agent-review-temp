import { readFile } from "node:fs/promises";
import path from "node:path";

import WhatsNewMarketingPage from "@/components/site/WhatsNewMarketingPage";

export const metadata = {
  title: "What's New | AudioRepurpose",
  description: "AudioRepurpose product updates and release notes.",
};

async function readWhatsNewMarkdown() {
  try {
    return await readFile(path.join(process.cwd(), "content", "whats-new.md"), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

export default async function WhatsNewPage() {
  const markdown = await readWhatsNewMarkdown();

  return <WhatsNewMarketingPage markdown={markdown} />;
}
