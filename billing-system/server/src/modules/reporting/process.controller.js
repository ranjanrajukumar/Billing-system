import { asyncHandler } from '../../utils/asyncHandler.js';
import { KEY_BY_PATH, PROCESS_BY_SLUG } from '../../config/menu.js';
import { processOverview } from './process.service.js';

/**
 * The overview behind a process menu entry.
 *
 * Gated on the children, because the parent is not a right anybody holds: it
 * exists exactly when one of its documents does. A user who can reach no screen
 * in a flow has no business reading its queue lengths — those numbers are about
 * work, and work they cannot open is just a leak of how busy another department
 * is.
 *
 * `req.user.menus` is that decision already made, at sign-in, by the same
 * function the sidebar was built from. Recomputing it here would be a second
 * opinion on a question that already has an answer.
 */
export const getProcess = asyncHandler(async (req, res) => {
  const process = PROCESS_BY_SLUG[req.params.key];
  if (!process) return res.status(404).json({ message: 'No such process' });

  const visible = new Set(req.user?.menus || []);
  const reachable = process.children.filter((child) => visible.has(child.key));
  if (!reachable.length) {
    return res.status(403).json({ message: 'This process is not available to you' });
  }

  const overview = await processOverview(process.key, req);

  // Asked of the whole menu rather than of this process's documents: a stage
  // may point at a screen that belongs to another flow — goods in transit sit
  // on the transfers screen but are Pick to Ship's problem — and such a stage
  // should still be a link for anybody who can open it.
  const canOpen = (path) => visible.has(KEY_BY_PATH[path]);

  res.json({
    ...overview,
    path: process.path,
    // Every stage is reported, including ones this user cannot open.
    //
    // The flow is the flow: a salesperson seeing four orders sitting in picking
    // is the point of the page, and hiding the stage because they have no
    // warehouse rights would leave them looking at a chain with a hole in it
    // and no way to know why their order has not shipped. What is withheld is
    // the link, not the fact — `linked: false` renders as a figure rather than
    // a door, so nothing on the page leads somewhere locked.
    stages: overview.stages.map((stage) => ({ ...stage, linked: canOpen(stage.path) })),
    documents: reachable.map(({ key, label, path }) => ({ key, label, path })),
  });
});
