import { Router } from 'express';
import { getProcess } from './process.controller.js';

/**
 * Process overviews.
 *
 * No module gate and no role list here on purpose: which processes a user can
 * see follows from which documents they can see, and the handler works that out
 * from the rights they already carry. A gate here would be a second, weaker
 * copy of that rule.
 */
const router = Router();

router.get('/:key', getProcess);

export default router;
