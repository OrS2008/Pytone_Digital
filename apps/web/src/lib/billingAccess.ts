// Pure mapping from a Stripe subscription to the `subscribedUntil`
// timestamp stored on the user record (lib/auth/users → accessState).
//
// Kept free of imports so it can be unit-tested directly (see
// e2e/unit/billingAccess.test.ts).

export interface SubscriptionLike {
  status: string;
  /** Unix seconds. */
  trial_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> };
}

/** Statuses during which the customer is entitled to the service. */
const ENTITLED = new Set(['active', 'trialing', 'past_due']);

// Renewal webhooks can lag the period boundary by minutes to hours.
// Without a cushion a paying customer would be locked out at the exact
// second the period ends, until the renewal event lands.
export const RENEWAL_GRACE_MS = 36 * 60 * 60 * 1000;

/**
 * Epoch-ms until which the user should have access, or 0 for none.
 *
 *   entitled     → end of the paid (or trial) period + grace
 *   anything else → 0 (canceled, unpaid, incomplete, paused …)
 */
export function subscribedUntilFor(sub: SubscriptionLike): number {
  if (!ENTITLED.has(sub.status)) return 0;
  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? 0;
  const endSec = Math.max(periodEnd || 0, sub.trial_end || 0);
  if (!endSec) return 0;
  return endSec * 1000 + RENEWAL_GRACE_MS;
}
