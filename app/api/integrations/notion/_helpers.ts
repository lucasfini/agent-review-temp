import { supabaseAdmin } from '@/lib/supabase/server';
import { getDecryptedTokens } from '../_utils';

export const NOTION_VERSION = '2022-06-28';

export type NotionRichText = {
  plain_text?: string;
};

export type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: any;
};

export function getNotionOAuthConfig() {
  return {
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
    redirectUri: process.env.NOTION_REDIRECT_URI,
  };
}

export function getNotionHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

export function getPlainText(richText: NotionRichText[] | undefined) {
  return (richText || []).map((item) => item.plain_text || '').join('');
}

export function getPageTitle(page: any) {
  const properties = page?.properties || {};
  for (const value of Object.values(properties) as any[]) {
    if (value?.type === 'title') {
      const title = getPlainText(value.title);
      if (title.trim()) return title.trim();
    }
  }
  return 'Notion page';
}

export function mapNotionPage(page: any) {
  return {
    id: page.id,
    title: getPageTitle(page),
    url: page.url || null,
    createdAt: page.created_time || null,
    editedAt: page.last_edited_time || null,
  };
}

export async function getNotionAccessToken(userId: string) {
  const { data } = await supabaseAdmin
    .from('integration_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'notion')
    .eq('status', 'connected')
    .single() as { data: any };

  const { accessToken } = getDecryptedTokens(data);
  return accessToken;
}

function blockToText(block: NotionBlock) {
  const type = block.type;
  const value = block[type];
  if (!value) return '';

  if (type === 'paragraph') return getPlainText(value.rich_text);
  if (type === 'heading_1') return `# ${getPlainText(value.rich_text)}`;
  if (type === 'heading_2') return `## ${getPlainText(value.rich_text)}`;
  if (type === 'heading_3') return `### ${getPlainText(value.rich_text)}`;
  if (type === 'bulleted_list_item') return `- ${getPlainText(value.rich_text)}`;
  if (type === 'numbered_list_item') return `1. ${getPlainText(value.rich_text)}`;
  if (type === 'to_do') return `- [${value.checked ? 'x' : ' '}] ${getPlainText(value.rich_text)}`;
  if (type === 'quote') return `> ${getPlainText(value.rich_text)}`;
  if (type === 'callout') return getPlainText(value.rich_text);
  if (type === 'toggle') return getPlainText(value.rich_text);
  if (type === 'code') return getPlainText(value.rich_text);
  return getPlainText(value.rich_text);
}

export async function fetchNotionBlockText(accessToken: string, blockId: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];

  const lines: string[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${encodeURIComponent(blockId)}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);

    const res = await fetch(url.toString(), {
      headers: getNotionHeaders(accessToken),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion block error: ${text}`);
    }

    const data = await res.json();
    for (const block of data.results || []) {
      const text = blockToText(block).trim();
      if (text) lines.push(text);
      if (block.has_children) {
        lines.push(...await fetchNotionBlockText(accessToken, block.id, depth + 1));
      }
    }

    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return lines;
}
