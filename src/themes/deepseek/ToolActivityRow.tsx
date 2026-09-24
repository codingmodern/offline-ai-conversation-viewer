import type { JSX } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FileSearch, Globe, Search, SearchCheck, Wrench } from 'lucide-react';
import type { UnifiedToolActivity } from '@/types/conversation';
import styles from './ToolActivityRow.module.css';

interface ActivityPresentation {
  readonly icon: LucideIcon;
  readonly label: string;
}

/**
 * Decorative presentation per known activity type (`sourceFragmentType` values
 * the DeepSeek normalizer produces). Unknown future types fall back to a
 * generic wrench row — preserved, never dropped (ADR #6's spirit).
 */
const ACTIVITY_PRESENTATION: Readonly<Record<string, ActivityPresentation>> = {
  SEARCH: { icon: Search, label: 'جستجو کرد' },
  TOOL_SEARCH: { icon: SearchCheck, label: 'در نتایج جستجو کرد' },
  TOOL_OPEN: { icon: Globe, label: 'صفحه‌ای را باز کرد' },
  TOOL_FIND: { icon: FileSearch, label: 'یافته‌ای را بررسی کرد' },
};

const FALLBACK_PRESENTATION: ActivityPresentation = {
  icon: Wrench,
  label: 'از ابزاری استفاده کرد',
};

interface ToolActivityRowProps {
  readonly activity: UnifiedToolActivity;
}

/**
 * A tool/search step, rendered as a compact decorative row (approved decision
 * D1): a Lucide icon plus a static Persian label in the theme's secondary
 * colour. It is deliberately a non-interactive `div` — Unit 06 FR6 is
 * visual-only, so the row must not look or behave clickable.
 *
 * `activity.results` is intentionally never rendered: its inner shape is
 * undocumented and provider-specific (`types/conversation.ts`), and displaying
 * raw JSON would be noise while interpreting it would invent product behaviour.
 */
export function ToolActivityRow({ activity }: ToolActivityRowProps): JSX.Element {
  const presentation = ACTIVITY_PRESENTATION[activity.activityType] ?? FALLBACK_PRESENTATION;
  const Icon = presentation.icon;

  return (
    <div className={styles.row} data-activity-type={activity.activityType}>
      <Icon size={14} aria-hidden="true" className={styles.icon} />
      <span className={styles.label}>{presentation.label}</span>
    </div>
  );
}
