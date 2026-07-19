# Billing and Tax Invoice Management System

Production-oriented full stack billing system built with React, Vite, Node.js, Express, MySQL, Sequelize, JWT, Material UI, PDFKit, and ExcelJS.

## Features

- JWT login, logout, forgot/reset password placeholder, and role based authorization.
- Customer CRUD with validation, search, and pagination.
- Product CRUD with category, HSN, GST, barcode, stock, low stock threshold, filtering, and pagination.
- Invoice creation with automatic invoice number, GST split, round off, amount in words, stock deduction, PDF download, print, and share action hooks.
- Dashboard metrics for total customers, total products, today's sales, monthly sales, revenue, recent invoices, low stock products, and sales charts.
- Reports for sales, customers, GST, products, and inventory with Excel export.
- Company settings, dark mode, responsive layout, reusable table/modal/search/loader/dialog components.
- Security middleware: Helmet, CORS, rate limiter, bcrypt, JWT, Sequelize parameterization, centralized error handling.

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
    database/schema.sql
    logs/
    pdf/
    uploads/
```

The server code lives under `server/src` for maintainability while preserving the requested MVC folders.

## Installation Guide

1. Install dependencies:

```bash
cd billing-system
npm run install:all
```

2. Create MySQL database:

```bash
mysql -u root -p < server/database/schema.sql
```

3. Configure environment:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Update `server/.env` with your MySQL credentials and a strong `JWT_SECRET`.

4. Migrate/sync tables and seed default data:

```bash
npm run db:migrate --prefix server
```

Default admin:

```text
Email: admin@example.com
Password: Admin@123
```

5. Start development servers:

```bash
npm run dev:server
npm run dev:client
```

Client: `http://localhost:5173`

API: `http://localhost:5000`

## Production Notes

- Use a long random `JWT_SECRET` and rotate it through your secret manager.
- Put the API behind HTTPS and a reverse proxy such as Nginx.
- Configure `CLIENT_URL` to the production frontend origin.
- Replace the email placeholder in `server/src/services/email.service.js` with your SMTP provider.
- Replace the backup placeholder in `server/src/services/backup.service.js` with managed MySQL snapshots or `mysqldump`.
- Store uploaded logos and generated PDFs in object storage for multi-instance deployments.
- Run database migrations explicitly in mature deployments instead of `sequelize.sync({ alter: true })`.

## API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).
