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
