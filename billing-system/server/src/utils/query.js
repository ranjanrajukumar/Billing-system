/**
 * The two conditions almost every query in this system starts with.
 *
 * Both were being written out by hand, and both are the kind of thing that is
 * wrong silently rather than loudly: a query that forgets `detstatus` reports
 * deleted records as live, and one that forgets the branch scope reports
 * another location's work as yours. Neither throws. Both just answer.
 *
 * They live here rather than in `middleware/branchContext.js` — where the
 * branch scope is decided — because that file is about resolving the request,
 * and this is about writing a query. A service that needs `live()` should not
 * have to import from the middleware layer to get it.
 */

/**
 * Not deleted.
 *
 * `detstatus` is the soft-delete flag: `false` is live, `true` is deleted. It
 * has to be spelled `false` and not left out, and it has to be `false` rather
 * than "not true" — a NULL in that column matches neither, which is exactly the
 * trap that makes a table of live records read as empty.
 */
export const live = (extra = {}) => ({ detstatus: false, ...extra });
