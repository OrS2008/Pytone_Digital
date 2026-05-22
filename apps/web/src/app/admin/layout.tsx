// Admin shell — completely separate from /tv. No nav, no theme picker,
// no end-user chrome. The admin area is dark and minimal on purpose.

import type { ReactNode } from 'react';
import './admin.css';

export const metadata = {
  title:   'Nova Stream · Admin',
  // The admin pages are not for indexing.
  robots:  { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="adm-root">{children}</div>;
}
