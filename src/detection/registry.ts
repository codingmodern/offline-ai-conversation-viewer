import type { ProviderId, ProviderModule } from '@/types/providers';
import { deepseekProvider } from '@/parsers/deepseek';
import { claudeProvider } from '@/parsers/claude';
import { geminiProvider } from '@/parsers/gemini';
import { chatgptProvider } from '@/parsers/chatgpt';

/**
 * The single provider registry for the whole project
 * (`02-platform-detection.md` FR1).
 *
 * Unit 02 uses it to call `detect()`; Unit 03 will use **this same registry** to
 * retrieve `parse()` from the same module objects. No parallel registry is
 * allowed to exist.
 *
 * Registering a new platform means adding one line here — the detection logic in
 * `detectProvider.ts` and every existing provider stay untouched (FR8/NFR3).
 * Unit 09 added Claude, Unit 10 Gemini and Unit 11 ChatGPT exactly that way.
 *
 * Order is explicit and stable so detection is predictable and reproducible
 * (FR4). It is *not* a priority list: detection never stops at the first match
 * (see `detectProvider.ts`).
 */
export const PROVIDER_MODULES: readonly ProviderModule[] = [
  deepseekProvider,
  claudeProvider,
  geminiProvider,
  chatgptProvider,
];

/**
 * Looks up a registered module by id.
 *
 * Provided for the parsing layer (Unit 03), which resolves `parse()` from the
 * detected id through this same registry.
 */
export function findProviderModule(id: ProviderId): ProviderModule | undefined {
  return PROVIDER_MODULES.find((module) => module.id === id);
}
