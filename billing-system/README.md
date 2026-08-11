# Billing and Tax Invoice Management System

Production-oriented full stack billing system built with React, Vite, Node.js, Express, MySQL, Sequelize, JWT, Material UI, PDFKit, and ExcelJS.

## Features

- JWT login, forgot/reset password, and role based authorization with an optional per-role permission matrix.
- Customer and supplier CRUD with validation, search, and pagination.
- Product CRUD with category, HSN, GST, barcode, stock, low stock threshold, filtering, and pagination.
- Invoice creation with automatic invoice number, GST split, round off, amount in words, stock deduction, PDF download, print, and share.
- Payments recorded against invoices, with outstanding balance tracking and automatic `Unpaid` / `Partially Paid` / `Paid` status.
- Purchases from suppliers that bring stock into inventory, with cancellation that reverses stock.
- Sales orders, quotations, delivery challans, and sales returns, each with its own screen.
- Inventory ledger with manual stock adjustments and movement history.
- Dashboard metrics for total customers, total products, today's sales, monthly sales, revenue, recent invoices, low stock products, and sales charts.
- Reports for sales, customers, GST, products, and inventory with Excel export.
- Images (product photos, company logo, avatars) stored as BLOBs in the database and served from `/media`.
- Printing renders only the document, never the surrounding application shell.
- Company settings, dark mode, responsive layout, reusable table/modal/search/loader/dialog components.
- Security middleware: Helmet, CORS, tiered rate limiting, bcrypt, JWT, Sequelize parameterization, centralized error handling.

## Folder Structure

```text
billing-system/
  client/
    src/
      components/
      context/
      hooks/
      layouts/
      pages/
      routes/
      services/
      utils/
      assets/
  server/
    src/
      config/
      controllers/
      middleware/
      models/
      routes/
      services/
      utils/
    logs/
    pdf/
```

The server code lives under `server/src` for maintainability while preserving the requested MVC folders.

## Installation Guide

1. Install dependencies:

```bash
cd billing-system
npm run install:all
```

2. Configure environment:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Update `server/.env` with your MySQL credentials and a strong `JWT_SECRET`.

3. Migrate/sync tables and seed default data:

```bash
npm run db:migrate --prefix server
```

Default admin:

```text
Email: admin@example.com
Password: Admin@123
```

4. Start development servers:

```bash
npm run dev:server
npm run dev:client
```

Client: `http://localhost:5173`

API: `http://localhost:5000`

## Production Notes

- Use a long random `JWT_SECRET` and rotate it through your secret manager.
- Put the API behind HTTPS and a reverse proxy such as Nginx.
- Configure `CLIENT_URL` to the production frontend origin, and tighten the CORS origin in `server/src/app.js` (it currently reflects any origin).
- Replace the email placeholder in `server/src/services/email.service.js` with your SMTP provider. Until then, `/auth/forgot-password` returns the reset token in the response outside production only.
- Replace the backup placeholder in `server/src/services/backup.service.js` with managed MySQL snapshots or `mysqldump`.
- Images live in the database, so backups are self-contained but grow with every upload. Move them to object storage if the dump size becomes a problem.
- Set `AUTO_MIGRATE=false` and run migrations explicitly. On every boot `sequelize.sync({ alter: true })` runs alongside a duplicate-index sweep, and the two undo each other's work — repeated restarts accumulate indexes until MySQL's 64-key limit is hit.
- Never commit `server/.env`, and keep credentials out of one-off scripts.

## API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).
