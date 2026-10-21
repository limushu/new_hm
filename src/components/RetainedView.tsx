import { Activity, useState, type ReactNode } from 'react';

/** Mount on first visit, then retain fields/DOM. Hidden views suspend effects
 * and render at lower priority so navigation need not rebuild the entire view. */
export default function RetainedView({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  if (!active && !visited) return null;
  return <Activity mode={active ? 'visible' : 'hidden'}>{children}</Activity>;
}
