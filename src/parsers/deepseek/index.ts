import type { ProviderModule } from '@/types/providers';
import { detect } from './detect';
import { parse } from './parse';

/**
 * DeepSeek provider module — the single public surface of this folder.
 *
 * The registry consumes this object, so Unit 03 added `parse()` here with no
 * change to the registry or to other providers (`02-platform-detection.md` FR8).
 */
export const deepseekProvider: ProviderModule = {
  id: 'deepseek',
  detect,
  parse,
};
