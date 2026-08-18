import React, { useState, useEffect } from 'react';
import api from '../services/api.js';
import SearchableSelect from './SearchableSelect.jsx';

/**
 * A reusable Supplier Selector that fetches suppliers from the API on mount.
 */
export default function SupplierSelect({ value, onChange, label = 'Supplier', required = true, ...props }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get('/suppliers?limit=500')
      .then((res) => {
        if (active) {
          const list = res.data?.data || res.data || [];
          setSuppliers(list);
        }
      })
      .catch(() => {
        if (active) setSuppliers([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedSupplier = suppliers.find((s) => String(s.id) === String(value)) || null;

  return (
    <SearchableSelect
      options={suppliers}
      label={label}
      value={selectedSupplier}
      onChange={(selected) => onChange?.(selected)}
      getOptionLabel={(s) => `${s.supplierName}${s.mobile ? ` · ${s.mobile}` : ''}`}
      getOptionKey={(s) => s.id}
      required={required}
      loading={loading}
      {...props}
    />
  );
}
