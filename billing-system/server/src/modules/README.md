# Modules

The server used to be organised by layer: sixty-two controllers in one folder,
forty-four services in another. That tells you what kind of thing each file is
and nothing about what it belongs to — and the rules that have to agree with
each other were the furthest apart. The sales order and the invoice it becomes
sat in the same directory as the backup scheduler.

These are the domains. Each holds its own controllers, services, routes and
validators.

| Module | Owns |
|---|---|
| `sales` | Quotation → order → challan → invoice → return, customers, credit, coupons, loyalty |
| `purchasing` | Purchase orders, inbound appointments, GRN, QC, supplier bills and returns, SRV |
| `inventory` | Products, stock and its ledger, batches, counts, adjustments, transfers, store issues |
| `warehouse` | The building and what happens in it: bins, waves, picking, packing, shipments, exceptions |
| `accounting` | Ledgers, expenses, cash and bank, chart of accounts, journals, statements |
| `planning` | Forecasting and replenishment |
| `reporting` | Read models across domains: dashboard, process overviews, reports |
| `platform` | Everything that is not a domain: auth, users, settings, audit, backup, notifications, PDF, email |

## What stayed outside

`models/`, `middleware/`, `utils/` and `config/` did not move. They are
genuinely cross-cutting, and a schema split along these lines would be a
database change rather than a code one — the tables are shared and the
associations cross every boundary in this table.

## The rule

**A domain may depend on `platform`. `platform` may not depend on a domain.**

Platform is the floor: it is what everything stands on, so anything it reaches
upward for is a dependency inverted. Domain-to-domain is allowed and expected —
purchasing receives stock, sales consumes it — because that is the business,
not an accident of layout.

## How the rule is kept

There are no backwards imports. There were four, and each was turned around
rather than moved, using the extension points in
`platform/extensions.service.js`:

| Was | Now |
|---|---|
| `branch.controller → inventory/stock` | Inventory contributes a stock total to `BRANCH_SUMMARY` |
| `notification.service → inventory/stockAudit` | Inventory offers its drift alert to `ALERTS` |
| `documentOutput → sales/invoiceHtml` | Sales registers the renderer at `DOCUMENT_HTML` |
| `settings.controller → accounting` | Settings announces `MODE_CHANGED`; accounting listens |

Platform declares a point and asks whoever is listening; the domains answer.
Nothing under `platform/` names a domain, and a domain that is never loaded
contributes nothing — which is what "this module is switched off" should mean.

Two more were not couplings at all but misfiled files, and were simply moved:
`locationAccess` is access control rather than warehousing, `tableExport` is a
generic export helper rather than a report. The stock endpoints addressed under
`/branches` went the same way — they are inventory operations that happen to be
asked about a location, so they live in `inventory/branchStock.*` and keep their
URLs by being mounted at that prefix by the composition root.

The rule is asserted, not trusted: `tests/extensions.test.js` fails if any file
in `platform/` imports a domain again.

### The one risk this trades for

A direct call that is missing fails loudly. A registration that is missing does
not — it contributes nothing, and the feature looks switched off on purpose.
The hooks are therefore loaded from one place (`modules/hooks.js`, imported by
`app.js`) and the same test suite checks that the real registrations arrive and
do their job, not merely that the mechanism works in isolation.

## The composition root

Two files are allowed to know that all eight modules exist:
`routes/index.js`, which mounts them, and `modules/hooks.js`, which loads their
contributions. Everything else belongs to one domain or sits beneath them all
in `platform`.

## Adding to a module

Files keep their existing suffixes — `x.controller.js`, `x.service.js`,
`x.routes.js`, `x.validator.js`. The suffix still says what kind of thing it is;
the folder now says what it is about. Route files are mounted by
`src/routes/index.js`, which stayed where it was because it belongs to no single
domain.
