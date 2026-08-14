# Billing System API Documentation

Base URL: `http://localhost:5000/api`

Authentication: send `Authorization: Bearer <jwt>` for all routes except `/auth/login`, `/auth/forgot-password`, and `/auth/reset-password`.

## Auth

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | Login with email and password. |
| GET | `/auth/me` | Authenticated | Get current user profile. |
| POST | `/auth/forgot-password` | Public | Issue a reset token. Outside production the token is returned in the response body as `resetToken`, because no SMTP transport is configured yet. |
| POST | `/auth/reset-password` | Public | Reset password with token. |
| PUT | `/auth/profile` | Authenticated | Update own profile; accepts a `profileImage` file upload. |

### Login Body

```json
{
  "email": "admin@example.com",
  "password": "Admin@123"
}
```

## Customers

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/customers?page=1&limit=10&search=raj` | All | Paginated search. |
| GET | `/customers/:id` | All | Customer details. |
| POST | `/customers` | Admin, Sales | Create customer. |
| PUT | `/customers/:id` | Admin, Sales | Update customer. |
| DELETE | `/customers/:id` | Admin | Delete customer. |

Required fields: `customerName`, `mobileNumber`, `address`, `city`, `state`, `pincode`.

## Products

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/products` | All | Paginated search/filter. |
| GET | `/products/categories` | All | Category list. |
| GET | `/products/:id` | All | Product details. |
| POST | `/products` | Admin, Accountant | Create product. |
| PUT | `/products/:id` | Admin, Accountant | Update product. |
| DELETE | `/products/:id` | Admin | Delete product. |

Required fields: `productName`, `hsnCode`, `purchasePrice`, `sellingPrice`, `gstPercent`, `stock`.

## Invoices

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/invoices` | All | Paginated invoices. |
| GET | `/invoices/:id` | All | Invoice details with items/payments. |
| POST | `/invoices` | Admin, Sales, Accountant | Create invoice and decrement stock. |
| DELETE | `/invoices/:id` | Admin, Sales | Cancel invoice, reverse stock, retire its payments. |
| GET | `/invoices/:id/pdf?template=standard` | All | Download PDF invoice. |

### Create Invoice Body

```json
{
  "invoiceDate": "2026-07-18",
  "customerId": 1,
  "paymentMethod": "UPI",
  "items": [
    { "productId": 1, "quantity": 2, "rate": 500, "discount": 0, "gstPercent": 18 }
  ],
  "notes": "Thank you"
}
```

The server calculates `subtotal`, `cgst`, `sgst`, `igst`, `grandTotal`, `roundOff`, and `amountInWords`.

A `paymentMethod` of `Credit` leaves the invoice `Unpaid` with no payment recorded; every other method records a payment for the full amount and marks it `Paid`.

## Payments

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/payments?invoiceId=1` | All | Paginated payments, optionally for one invoice. |
| GET | `/payments/invoice/:invoiceId` | All | Payment history plus `summary` with `grandTotal`, `paid`, `outstanding`, `status`. |
| POST | `/payments` | Admin, Accountant, Sales | Record a payment. Rejected with `400` if it exceeds the outstanding balance. |
| DELETE | `/payments/:id` | Admin, Accountant | Remove a payment and recalculate the invoice status. |

Invoice status is always derived from recorded payments: `Unpaid` → `Partially Paid` → `Paid`.

### Create Payment Body

```json
{ "invoiceId": 1, "amount": 500, "paymentMethod": "UPI", "referenceNumber": "TXN123" }
```

## Purchases

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/purchases?from=&to=` | All | Paginated purchases with supplier and items. |
| GET | `/purchases/:id` | All | Purchase details. |
| POST | `/purchases` | Admin, Accountant | Record a purchase. Status `Received` increases stock; `Draft` does not. |
| DELETE | `/purchases/:id` | Admin | Cancel and reverse stock. Returns `409` if the stock has since been sold. |

### Create Purchase Body

```json
{
  "purchaseDate": "2026-08-08",
  "supplierId": 1,
  "status": "Received",
  "paidAmount": 0,
  "items": [{ "productId": 1, "quantity": 25, "rate": 40, "gstPercent": 18 }]
}
```

## Suppliers, Quotations, Delivery Challans, Sales Returns

All four follow the same shape: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.

| Resource | Notes |
| --- | --- |
| `/suppliers` | `supplierName` and `mobileNumber` required; `pincode` must be 4–10 characters. |
| `/quotations` | Line items accept `quantity`, `rate`, `discount`, `gstPercent`. |
| `/delivery-challans` | Line items need only `productId` and `quantity`. |
| `/sales-returns` | Restores stock. `refundAmount` per item is derived from `quantity × rate` when omitted. `GET /sales-returns/:id/pdf` returns a credit note. |

## Inventory

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/inventory/summary` | Stock valuation and critical products. |
| GET | `/inventory/movements?productId=&type=` | Stock movement ledger. |
| POST | `/inventory/adjust` | Manual adjustment. `type` is `Adjustment In`, `Adjustment Out`, or `Opening Stock`. |

## Media

Image bytes are stored in the database. These endpoints are unauthenticated so `<img src>` works directly.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/media/products/:id` | Product image (note: not under `/api`). |
| GET | `/media/company/logo` | Company logo. |
| GET | `/media/users/:id` | User avatar. |

Records expose a ready-made `imageUrl` / `logoUrl` / `profileImageUrl` pointing at these paths.

## Dashboard

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/dashboard` | Total customers, total products, today's sales, monthly sales, revenue, recent invoices, low stock products, and chart data. |

## Reports

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` | Sales report. |
| GET | `/reports/customers` | Customer report. |
| GET | `/reports/gst?from=YYYY-MM-DD&to=YYYY-MM-DD` | GST report. |
| GET | `/reports/products` | Product report. |
| GET | `/reports/inventory` | Inventory report. |
| GET | `/reports/export/:type` | Excel export for `sales` or `inventory`. |

## Settings

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/settings` | All | Company and application settings. |
| PUT | `/settings/company` | Admin | Update company profile and logo. Only `name`, `gstNumber`, `email`, `mobile`, `address`, `city`, `state`, `pincode`, `signatureUrl` and `defaultInvoiceTemplate` are writable. |

## Invoice Templates

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/invoice-templates` | All | List templates. |
| POST | `/invoice-templates` | Admin, Accountant | Create template. |
| GET | `/invoice-templates/:id/preview` | All | Specimen PDF using a saved template. |
| POST | `/invoice-templates/sample` | All | Specimen PDF for an unsaved configuration. |
| POST | `/invoice-templates/:id/duplicate` | Admin, Accountant | Copy a template. |
| PUT | `/invoice-templates/:id/set-default` | Admin, Accountant | Make it the default. |
| DELETE | `/invoice-templates/:id` | Admin | Delete. Returns `400` for the current default. |

## Business Mode & Modules

The application runs in one of two modes. **Basic** is a shop: POS, inventory, party
ledgers. **Advanced** adds the full ERP workflow. Switching mode changes only what is
shown and what the API accepts — no data is added, moved or deleted, so it is reversible.

Every Advanced router is gated on its module. A request to a disabled module returns
`403` with `{ "message": "...", "module": "<key>" }`, so a disabled feature is genuinely
unreachable rather than merely hidden from the sidebar.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/settings/modules` | All | Current mode, every module's state, and the menu catalogue trimmed to match. The sidebar is built from this. |
| PUT | `/settings/mode` | Admin | Switch between `Basic` and `Advanced`. Going Advanced also seeds the chart of accounts. |
| PUT | `/settings/modules/:key` | Admin | Turn one optional module on or off. Core modules are refused. |

## Locations (Branches & Warehouses)

Branches and warehouses are both rows in `branches`, distinguished by `locationType`.
They behave identically for stock, so transfers, receipts and counts work against either
without a second code path. A warehouse has `canSell: false` and stays out of billing pickers.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/warehouses?locationType=Warehouse\|Branch\|all` | All | Locations with their total stock. |
| GET | `/warehouses/:id` | All | One location plus its zone/rack/bin tree. |
| GET | `/warehouses/:id/contents` | All | What the location holds, product by product. |
| GET | `/warehouses/:id/valuation` | All | Stock value at cost and at sale price. |
| POST | `/warehouses` | Admin, Accountant, Warehouse Manager | Create a location. |
| PUT | `/warehouses/:id` | Admin, Accountant, Warehouse Manager | Update. Changing the type is refused while stock is held. |
| DELETE | `/warehouses/:id` | Admin | Refused while stock is held. |
| GET/POST | `/warehouses/:id/bins` | All / Managers | Zone → rack → shelf → bin tree. Entirely optional. |

Send `X-Branch-Id: <id>` (or `?branchId=`) to act on a specific location. Admins may do
this in any mode; non-admins are pinned to their own branch when multi-branch is on.

## Serial Numbers

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/warehouses/serials?productId=&status=&branchId=&search=` | All | Tracked units. |
| GET | `/warehouses/serials/:serialNumber` | All | One unit's whole history, for warranty claims. |
| POST | `/warehouses/serials` | Managers, Inventory Staff | Add serials in bulk (newline or comma separated). |

## Stock Transfers

Stock leaves the source at dispatch and arrives at the destination at receipt. In between
it is *in transit* — counted at neither end, which is what makes a branch's figure the
stock it can actually sell.

Statuses: `Draft → Pending → Approved → Picked → Dispatched/InTransit → PartiallyReceived → Received`, plus `Cancelled` and `Rejected`.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/stock-transfers?status=&direction=incoming\|outgoing` | All | List. |
| POST | `/stock-transfers` | All | Raise a transfer. Moves no stock. |
| POST | `/stock-transfers/:id/approve` | Managers | |
| POST | `/stock-transfers/:id/dispatch` | Managers, Inventory Staff | Stock leaves the source. Availability is re-checked here. |
| POST | `/stock-transfers/:id/receive` | Managers, Inventory Staff | Stock arrives. A short receipt stays `PartiallyReceived`. |
| POST | `/stock-transfers/:id/cancel` | Managers | Anything already dispatched is returned to source. |

## Stock Adjustments & Counting

An adjustment moves no stock until it is approved — writing inventory off always leaves a
named approver behind it.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET/POST | `/stock-adjustments` | All | Signed quantities: negative writes off, positive adds back. |
| POST | `/stock-adjustments/:id/approve` | Managers | Applies the quantities and books the value. |
| POST | `/stock-adjustments/:id/reject` | Managers | |
| POST | `/stock-counts` | All | Opens a sheet, freezing the system quantity onto every line. |
| PUT | `/stock-counts/:id/counts` | All | Save counted figures; `submit: true` sends it for approval. |
| POST | `/stock-counts/:id/approve` | Managers | Posts the variance as a stock adjustment. |

## Purchase Orders & GRN

A PO is a commitment and moves no stock. Goods arrive through a GRN, which is what lets
one order be delivered in parts: ordered 100, received 90, 10 still outstanding.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET/POST | `/purchase-orders` | Buyers | List / create. |
| GET | `/purchase-orders/:id/pending-items` | All | What is still outstanding, used to prefill a GRN. |
| POST | `/purchase-orders/:id/submit` | Buyers | Raises an approval request, or approves outright when no rule applies. |
| POST | `/purchase-orders/:id/approve` \| `/reject` | Admin, Accountant | |
| POST | `/purchase-orders/:id/close` | Buyers | Close short — the balance is not coming. |
| GET/POST | `/grn` | Receivers | Received / accepted / rejected / damaged per line. |
| POST | `/grn/:id/post` | Receivers | **Only the accepted quantity enters stock.** One-way. |
| POST | `/grn/:id/invoice` | Admin, Accountant, Purchase Manager | Raises the supplier's invoice. Does not move stock again. |

Over-receiving beyond the order's outstanding balance is refused with `400`.

## Purchase Returns

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/purchase-returns/returnable/:purchaseId` | All | Lines still available to return. |
| POST | `/purchase-returns` | Buyers | Draft. Moves no stock. |
| POST | `/purchase-returns/:id/confirm` | Buyers | Stock out, debit note raised, supplier ledger adjusted. |
| POST | `/purchase-returns/:id/cancel` | Admin, Accountant | Restores stock and reverses the accounting entry. |

## Party Ledgers

Assembled from the documents themselves rather than from a stored balance, so they cannot
drift away from the invoices they describe. Available in both modes.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/ledgers/customer/:id?from=&to=` | All | Running ledger with opening balance, debits, credits and outstanding. |
| GET | `/ledgers/supplier/:id?from=&to=` | All | Same for a supplier; the balance is what we owe. |
| GET | `/ledgers/receivables` | All | Every customer with a balance. |
| GET | `/ledgers/payables` | All | Every supplier we owe. |

## Expenses, Cash & Bank

Recording an expense and paying it are separate steps, so what is committed but not yet
paid stays visible.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET/POST | `/expenses` | All | List / record. |
| GET | `/expenses/summary` | All | Totals by category. |
| POST | `/expenses/:id/approve` \| `/reject` | Admin, Accountant, Branch Manager | |
| POST | `/expenses/:id/pay` | Admin, Accountant, Branch Manager, Cashier | Pays from a cash register or bank account. |
| GET | `/cash/registers` | All | Tills. |
| POST | `/cash/registers/open` | All | Opens a shift. One open register per location. |
| POST | `/cash/registers/:id/close` | All | Closes against a physical count; the variance is recorded, not absorbed. |
| POST | `/cash/registers/:id/entries` | All | Cash in/out not tied to a sale. |
| GET | `/cash/registers/reconciliation?date=` | All | The day's cash position per till. |
| GET/POST | `/cash/banks` | All / Admin, Accountant | Bank accounts. Balances follow transactions and cannot be typed over. |
| POST | `/cash/banks/:id/entries` | Admin, Accountant | Deposit, withdrawal, charges, interest. |

## Accounting

All statements are derived from posted journal lines, never from stored totals. A posted
entry is never edited or deleted — corrections are made by posting a reversal.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/accounting/accounts` \| `/accounts/tree` | Admin, Accountant, Auditor | Chart of accounts. |
| POST | `/accounting/accounts/seed` | Admin, Accountant | Seeds the standard chart. Idempotent. |
| GET/POST | `/accounting/entries` | Admin, Accountant, Auditor | Journal. A manual entry is refused unless debits equal credits. |
| POST | `/accounting/entries/:id/reverse` | Admin, Accountant | Posts an equal and opposite entry. |
| GET | `/accounting/ledger/:accountId` | Admin, Accountant, Auditor | General ledger with a running balance. |
| GET | `/accounting/trial-balance` | Admin, Accountant, Auditor | Includes a `balanced` flag. |
| GET | `/accounting/profit-loss` | Admin, Accountant, Auditor | Gross and net profit. |
| GET | `/accounting/balance-sheet?asOn=` | Admin, Accountant, Auditor | Retained earnings computed from profit to date. |
| POST | `/accounting/rebuild-balances` | Admin | Repair tool for imported data. |

Sales, purchases, payments, expenses, returns and stock adjustments post automatically.
Posting is skipped silently when the accounting module is off, so a shop's billing is
never blocked by a missing ledger account.

## Approval Workflow

Thresholds are configuration, not code — a ₹100,000 order is routine for one business and
exceptional for another. Starter rules are seeded **inactive**.

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/approvals?status=&mine=true` | All | The queue. |
| GET | `/approvals/pending-count` | All | Badge count for the current user's role. |
| POST | `/approvals/:id/approve` \| `/reject` | Whoever the rule names (Admin always) | Records the decision and moves the document's own status. |
| GET | `/approvals/rules/options` | All | The document types, operators and fields a rule may use. |
| GET/POST | `/approvals/rules` | All / Admin, Accountant | Rules. |

Testable fields: `grandTotal`, `totalAmount`, `amount`, `quantity`, `totalQuantity`,
`discountPercent`, `discountAmount`, `varianceQty`, `varianceValue`. Anything else is
refused — a rule is user configuration and must not reach into arbitrary document state.

## Inventory Reporting

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| GET | `/inventory/ledger?productId=&branchId=&from=&to=` | All | The stock ledger: every movement with the balance before and after it. |
| GET | `/inventory/valuation?branchId=` | All | Stock value at cost and at sale price. |
| GET | `/branches/stock/:productId` | All | One product's quantity at every location. |

## Rate Limits

| Scope | Default | Variable |
| --- | --- | --- |
| General API | 2000 requests / 15 min | `RATE_LIMIT_MAX` |
| Login, register, forgot/reset password | 20 failed attempts / 15 min | `AUTH_RATE_LIMIT_MAX` |

Successful logins are not counted against the auth limit. Exceeding either returns `429` with a JSON body.

## Error Format

```json
{
  "message": "Validation failed",
  "errors": []
}
```

Common status codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `500`.
