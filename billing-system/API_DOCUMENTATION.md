# Billing System API Documentation

Base URL: `http://localhost:5000/api`

Authentication: send `Authorization: Bearer <jwt>` for all routes except `/auth/login`, `/auth/forgot-password`, and `/auth/reset-password`.

## Auth

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | Login with email and password. |
| GET | `/auth/me` | Authenticated | Get current user profile. |
| POST | `/auth/forgot-password` | Public | Generate a reset token placeholder. |
| POST | `/auth/reset-password` | Public | Reset password with token. |

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
| GET | `/invoices/:id/pdf` | All | Download PDF invoice. |

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
| PUT | `/settings/company` | Admin | Update company profile and logo. |

## Error Format

```json
{
  "message": "Validation failed",
  "errors": []
}
```

Common status codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `500`.
