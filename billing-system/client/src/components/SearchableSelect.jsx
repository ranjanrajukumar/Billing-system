import React from 'react';
import { Autocomplete, TextField } from '@mui/material';

/**
 * A searchable dropdown wrapper around MUI's Autocomplete.
 * Designed to replace standard <TextField select> components.
 */
export default function SearchableSelect({
  options,
  label,
  value,
  onChange,
  getOptionLabel,
  getOptionKey = (option) => option?.id || option,
  placeholder = "Select...",
  size,
  error,
  helperText,
  required,
  fullWidth = true,
  ...props
}) {
  return (
    <Autocomplete
      options={options}
      getOptionLabel={(option) => {
        if (!option) return '';
        if (typeof getOptionLabel === 'function') return getOptionLabel(option);
        return option.name || option.label || option.toString();
      }}
      isOptionEqualToValue={(option, val) => {
        if (!option || !val) return option === val;
        return getOptionKey(option) === getOptionKey(val);
      }}
      value={value}
      onChange={(event, newValue) => onChange(newValue)}
      fullWidth={fullWidth}
      size={size}
      renderInput={(params) => (
        <TextField 
          {...params} 
          label={label} 
          placeholder={placeholder} 
          InputLabelProps={{ shrink: true }} 
          size={size}
          error={error}
          helperText={helperText}
          required={required}
        />
      )}
      {...props}
    />
  );
}
