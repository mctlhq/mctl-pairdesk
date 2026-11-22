// Rating is hidden until it is real (mctl-pairdesk#48): the API must not expose
// rating_score on maker cards while RATING_ENABLED is false. Runs against dist/, no
// Postgres. Run via: npm run test:rating
import test from 'node:test';
import assert from 'node:assert/strict';

const { serializeOrder } = await import('../../dist/services/serializers.js');
const { RATING_ENABLED } = await import('../../dist/features.js');

const order = {
  id: 1, want_asset: 'EUR', want_amount: '100', location_country: null, location_city: null,
  comment: null, status: 'active', expires_at: null, created_by_user_id: 7,
  created_at: '2026-01-01T00:00:00Z',
};
const maker = { user_id: 7, username: 'bob', display_name: 'Bob', rating_score: '4.5', completed_deals_count: 3 };

test('maker card omits rating_score unless RATING_ENABLED, keeps completed_deals_count', () => {
  const out = serializeOrder(order, [], maker);
  assert.equal('rating_score' in out.maker, RATING_ENABLED);
  assert.equal(out.maker.completed_deals_count, 3);
  assert.equal(out.maker.username, 'bob');
});
