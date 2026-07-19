import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import Customers from '../pages/Customers.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Invoices from '../pages/Invoices.jsx';
import SalesOrders from '../pages/SalesOrders.jsx';
import Inventory from '../pages/Inventory.jsx';
import InvoiceTemplateSetup from '../pages/InvoiceTemplateSetup.jsx';
import Login from '../pages/Login.jsx';
import Masters from '../pages/Masters.jsx';
import NotFound from '../pages/NotFound.jsx';
import Products from '../pages/Products.jsx';
import Profile from '../pages/Profile.jsx';
import Register from '../pages/Register.jsx';
import Reports from '../pages/Reports.jsx';
import Settings from '../pages/Settings.jsx';
import Users from '../pages/Users.jsx';

export default function AppRoutes({ mode, onToggleMode }) {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout mode={mode} onToggleMode={onToggleMode} />}>
          <Route index element={<Dashboard />} />
          <Route path="masters" element={<Masters />} />
          <Route path="customers" element={<Customers />} />
          <Route path="products" element={<Products />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="sales-orders" element={<SalesOrders />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
          <Route path="invoice-templates" element={<InvoiceTemplateSetup />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Route>
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
