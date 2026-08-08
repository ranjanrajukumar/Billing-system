import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { alpha, IconButton, InputAdornment, TextField, useTheme } from '@mui/material';
import { useRef, useState } from 'react';

export default function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  const theme = useTheme();
  const inputRef = useRef();

  const handleChange = (e) => onChange(e.target.value);
  const handleClear = () => { onChange(''); inputRef.current?.focus(); };

  return (
    <TextField
      inputRef={inputRef}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      size="small"
      sx={{
        minWidth: { xs: '100%', sm: 240 },
        '& .MuiOutlinedInput-root': {
          borderRadius: 2.5,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
          '&.Mui-focused': { bgcolor: 'background.paper' },
          fontSize: '0.875rem',
        },
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleClear} sx={{ p: 0.5 }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        },
      }}
    />
  );
}
