# Modules

The same eight domains the server uses, holding the screens that belong to
them. Sixty-four pages in one alphabetical folder put `InvoiceDesigner`,
`Invoices` and `JournalEntries` next to each other, which is three screens from
two different parts of the business sorted by an accident of spelling.

| Module | Screens |
|---|---|
| `sales` | Quick Bill, invoices and their designer, orders, quotations, challans, returns, customers, credit, coupons, subscriptions |
| `purchasing` | Purchase orders, purchases, returns, GRN, SRV, suppliers, inbound appointments, QC |
| `inventory` | Products, inventory, batches, masters, adjustments, counts, transfers, audit, store issues, serials |
| `warehouse` | Warehouses, the floor, pick waves, shipments, gatepasses, repairs |
| `accounting` | Ledgers, expenses, cash flow, tills, banks, chart of accounts, journals, statements |
| `planning` | Demand planning, replenishment, stock policies |
| `reporting` | Dashboard, process overviews, reports |
| `platform` | Login, register, profile, settings, users, branches, approvals, audit logs, backups |

## What stayed in `components/`

Anything used by more than one domain. `DataTable`, `Modal`, `PageHeader`,
`SearchableSelect` and the rest are used by forty screens each, and filing them
under a domain would be a claim that is not true and that every other domain
would then have to import across.

The line-item grids are the interesting case. `DocumentLines` and `LineItems`
were briefly filed under `inventory` and `sales`, and the coupling report is
what showed that was wrong: between them they are used by purchasing,
inventory, warehouse and sales. Four domains is not ownership. They are shared,
and they moved back.

They are also not duplicates of each other, which is worth saying because they
look like it. `LineItems` is a priced grid that converts between a product's
primary and secondary units; `DocumentLines` is a generic column-driven
quantity grid. A document that prices its lines wants the first, a document
that only counts them wants the second.

## The rule

**A domain may depend on `components/`, `hooks/`, `services/` and `utils/`.
Domain-to-domain should be rare.**

There is currently exactly one: `reporting → inventory`, where the dashboard
composes the expiry-alert widget. That is a report assembling a domain's own
view of itself, which is what a dashboard is for, and it is left alone.

If that number starts climbing, the usual cause is a component filed under one
domain that three others turned out to need — which is a component that belongs
in `components/`, not a boundary that needs relaxing.
