// Feature flags. Compile-time constants, not env: flipping one is a code change that
// goes through review.

/**
 * Rating/reputation display. Off because `user_profiles.rating_score` is never written
 * (no feedback endpoint exists, see mctl-pairdesk#48), so showing it would present a
 * permanently-zero signal as real. The schema and the `feedback` table stay untouched.
 * Re-enable together with `RATING_ENABLED` in web/src/features.ts once feedback exists.
 */
export const RATING_ENABLED = false;
