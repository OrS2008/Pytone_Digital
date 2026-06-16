// Root route. Visitors who are not signed in see the public welcome /
// landing page so newcomers understand what Nova Stream is before
// hitting the player. Signed-in visitors bounce straight to /tv so
// returning users skip the marketing screen.
//
// The check is on the ns_session cookie, NOT on its KV validity — that
// would add a round-trip to every cold page load. The /tv shell does a
// real /api/auth/me check and bounces back to /tv/login if the cookie
// is stale.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import WelcomeLanding from './welcome/WelcomeLanding';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function Root() {
  const jar = await cookies();
  const session = jar.get('ns_session');
  if (session?.value) redirect('/tv');
  return <WelcomeLanding />;
}
