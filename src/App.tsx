import type { JSX } from 'react';
import { AppShell } from '@/components/shell/AppShell';

/**
 * Application root.
 *
 * Unit 04 replaces the bare import screen with the shell (sidebar + main region);
 * conversation rendering inside that region arrives with Unit 06.
 */
export function App(): JSX.Element {
  return <AppShell />;
}
