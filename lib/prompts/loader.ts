/**
 * Prompt configuration loader with template variable substitution
 */

import promptsConfig from '@/config/prompts.json';
import type { PromptsConfig, TemplateVars } from './types';

// Typed config export
export const prompts = promptsConfig as PromptsConfig;

/**
 * Substitute template variables in a prompt string
 * Supports ${variableName} syntax
 */
export function substituteVars(template: string, vars: TemplateVars): string {
  return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = vars[varName];

    if (value === undefined || value === null) {
      console.warn(`[Prompts] Missing template variable: ${varName}`);
      return match; // Keep original if not found
    }

    return String(value);
  });
}

/**
 * Get a prompt with variables substituted
 */
export function getPrompt(
  promptPath: string[],
  vars?: TemplateVars
): { prompt: string; config: any } {
  // Navigate to the prompt in the config object
  let current: any = prompts;

  for (const key of promptPath) {
    if (!current[key]) {
      throw new Error(`Prompt path not found: ${promptPath.join('.')}`);
    }
    current = current[key];
  }

  if (!current.prompt && !current.instructions) {
    throw new Error(`No prompt found at path: ${promptPath.join('.')}`);
  }

  const promptText = current.prompt || current.instructions;
  const substituted = vars ? substituteVars(promptText, vars) : promptText;

  return {
    prompt: substituted,
    config: current
  };
}

/**
 * Get system message if available
 */
export function getSystemMessage(promptPath: string[]): string | undefined {
  let current: any = prompts;

  for (const key of promptPath) {
    if (!current[key]) return undefined;
    current = current[key];
  }

  return current.system;
}

/**
 * Validate that all required variables are provided
 */
export function validateVars(
  template: string,
  vars: TemplateVars
): { valid: boolean; missing: string[] } {
  const matches = template.match(/\$\{([^}]+)\}/g) || [];
  const required = matches.map(m => m.slice(2, -1)); // Remove ${ and }
  const missing = required.filter(varName => vars[varName] === undefined);

  return {
    valid: missing.length === 0,
    missing
  };
}
