import type { ProviderModule } from '@/types/providers';
import { detect } from './detect';
import { parse } from './parse';

/**
 * Claude provider module — the single public surface of this folder.
 *
 * The registry consumes this object, so Unit 09 added `parse()` here with no
 * change to the registry's shape or to other providers
 * (`02-platform-detection.md` FR8).
 */
export const claudeProvider: ProviderModule = {
  id: 'claude',
  detect,
  parse,
};
