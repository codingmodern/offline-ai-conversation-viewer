import type { TFunction } from 'i18next';

import i18n from '@/i18n';

/**
 * Deferred user-facing messages (Unit 12).
 *
 * Why a descriptor instead of a pre-translated string: messages that outlive the
 * render that produced them (an import error row, the post-import summary banner,
 * a storage failure) are held in state. Storing the finished Persian text would
 * freeze those messages in the language that was active when the error happened,
 * so switching languages would leave part of the UI behind — the one thing spec
 * AC4 («تغییر زبان … آنی») forbids. Holding the key plus its parameters keeps the
 * message translatable for as long as it is on screen.
 *
 * `params` is always present (possibly empty) rather than optional: it keeps
 * call sites free of `exactOptionalPropertyTypes` dances and makes `translate`
 * a single unconditional call.
 */
export interface UserMessage {
  /** Fully-qualified translation key, e.g. `errors.FileReadError`. */
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/** Builds a descriptor; `params` may be omitted for messages without placeholders. */
export function userMessage(
  key: string,
  params: Readonly<Record<string, string | number>> = {},
): UserMessage {
  return { key, params };
}

/**
 * Renders a descriptor through a translator function, or falls back to the
 * global `i18n.t` singleton when called with only the message.
 */
export function translateMessage(message: UserMessage): string;
export function translateMessage(t: TFunction, message: UserMessage): string;
export function translateMessage(
  first: TFunction | UserMessage,
  second?: UserMessage,
): string {
  if (second !== undefined) {
    const t = first as TFunction;
    return t(second.key, second.params);
  }
  const message = first as UserMessage;
  return i18n.t(message.key, message.params);
}