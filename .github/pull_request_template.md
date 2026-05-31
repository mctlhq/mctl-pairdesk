## What & why

<!-- What changed and the reason (the WHY, not a restatement of the diff). -->

## Checklist

- [ ] `npm run type-check` passes
- [ ] e2e lifecycle passes against a real Postgres (create → respond → accept → complete)
- [ ] concurrent-accept test proves only one accepted deal can win per order
- [ ] public order serializers expose no phone / payment / preset fields
- [ ] contact reveal works only for the creator / chosen responder on an accepted/completed deal (order reserved/completed)
- [ ] pending / blocked users cannot access approved-only routes
- [ ] admin / moderator routes are RBAC-gated
- [ ] CBR reference snapshot works; fallback behaviour (no snapshot, order still created) is documented
- [ ] disclaimer acceptance is supported, or clearly queued for the relevant stage

## Notes

<!-- Anything reviewers should know: trade-offs, deferred items, follow-ups. -->
