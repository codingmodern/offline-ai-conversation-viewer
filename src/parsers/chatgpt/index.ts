import type { ProviderModule } from '@/types/providers';
import { detect } from './detect';
import { parse } from './parse';

/**
 * ChatGPT provider module — the single public surface of this folder.
 *
 * The registry consumes this object, so Unit 11 added `parse()` here with no
 * change to the registry's shape or to other providers
 * (`02-platform-detection.md` FR8). ChatGPT stays `available: false` in the
 * import picker until its theme ships (Unit 11b).
 */
export const chatgptProvider: ProviderModule = {
  id: 'chatgpt',
  detect,
  parse,
};
