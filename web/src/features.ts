// Feature flags. Keep in sync with src/features.ts (the API omits the fields while off).

/**
 * Rating/reputation display. Off because the backend never computes `rating_score`
 * (mctl-pairdesk#48). Flip to true together with the API flag once feedback is real.
 */
export const RATING_ENABLED = false;
