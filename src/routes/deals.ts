import { Router } from 'express';
import { getCtx, requireApproved } from '../middleware/auth.js';
import { sendAppError } from '../middleware/errors.js';
import { acceptDeal, completeDeal, getDealDetail, listMyDeals, rejectDeal } from '../services/deals.js';

export const dealsRouter = Router();
dealsRouter.use(requireApproved());

dealsRouter.get('/deals', async (req, res, next) => {
  try {
    res.json({ deals: await listMyDeals(getCtx(req)) });
  } catch (err) {
    next(err);
  }
});

dealsRouter.get('/deals/:id', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad deal id' });
    return res.json(await getDealDetail(getCtx(req), id));
  } catch (err) {
    return sendAppError(res, err, next);
  }
});

function action(handler: (ctx: ReturnType<typeof getCtx>, id: number) => Promise<void>) {
  return async (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    try {
      const id = Number.parseInt(req.params.id ?? '', 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad deal id' });
      await handler(getCtx(req), id);
      return res.json({ ok: true });
    } catch (err) {
      return sendAppError(res, err, next);
    }
  };
}

dealsRouter.post('/deals/:id/accept', action(acceptDeal));
dealsRouter.post('/deals/:id/reject', action(rejectDeal));
dealsRouter.post('/deals/:id/complete', action(completeDeal));
