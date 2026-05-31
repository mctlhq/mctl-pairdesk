import { Router } from 'express';
import { isAsset } from '../config.js';
import { requireApproved } from '../middleware/auth.js';
import { getReferenceRate } from '../services/rates.js';

export const ratesRouter = Router();
ratesRouter.use(requireApproved());

// Market reference quote for a base/give pair, used by the create-order preview.
ratesRouter.get('/rates/reference', async (req, res, next) => {
  try {
    const base = req.query.base as string | undefined;
    const quote = req.query.quote as string | undefined;
    if (!isAsset(base) || !isAsset(quote)) {
      return res.status(400).json({ error: 'base and quote must be supported assets' });
    }
    const ref = await getReferenceRate(base, quote);
    if (!ref) return res.status(503).json({ error: 'reference rate unavailable' });
    return res.json(ref);
  } catch (err) {
    return next(err);
  }
});
