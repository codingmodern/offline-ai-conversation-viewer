import type { ProviderModule } from '@/types/providers';
import { detect } from './detect';
import { parse } from './parse';

/**
 * Gemini provider module — the single public surface of this folder.
 *
 * The registry consumes this object, so Unit 10 added `parse()` here with no
 * change to the registry's shape or to other providers
 * (`02-platform-detection.md` FR8).
 */
export const geminiProvider: ProviderModule = {
  id: 'gemini',
  detect,
  parse,
};