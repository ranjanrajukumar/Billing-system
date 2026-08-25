import Swal from 'sweetalert2';
import { UI_ACCENTS } from './theme.js';
import { readUiPrefs } from './uiPrefs.js';

// SweetAlert is rendered outside React, so it cannot read the theme provider.
// It reads the saved accent directly instead — otherwise the one dialog that
// asks "are you sure" stays indigo on a company that chose anything else.
const accent = () => (UI_ACCENTS[readUiPrefs().accent] || UI_ACCENTS.indigo).main;

// SweetAlert renders outside the MUI tree, so it needs the current palette
// passed in rather than reading it from a theme provider.
function palette() {
  const dark = document.documentElement.getAttribute('data-mui-color-scheme') === 'dark'
    || document.body.classList.contains('dark')
    || window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  return dark
    ? { background: '#1e2430', color: '#e6e9ef' }
    : { background: '#ffffff', color: '#1a2027' };
}

const base = () => ({
  ...palette(),
  buttonsStyling: true,
  confirmButtonColor: accent(),
  cancelButtonColor: '#6b7280',
  reverseButtons: true,
  focusCancel: true,
  customClass: { popup: 'swal-rounded' },
});

/**
 * Asks the user to confirm a destructive or irreversible action.
 * Resolves true only when they confirm.
 */
export async function confirmAction({
  title = 'Are you sure?',
  text = '',
  confirmText = 'Yes, continue',
  cancelText = 'Cancel',
  icon = 'warning',
  danger = true,
} = {}) {
  const result = await Swal.fire({
    ...base(),
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: danger ? '#dc2626' : accent(),
  });
  return result.isConfirmed;
}

function alertSuccess(title, text = '') {
  return Swal.fire({ ...base(), title, text, icon: 'success', timer: 2200, showConfirmButton: false });
}

function alertError(title, text = '') {
  return Swal.fire({ ...base(), title, text, icon: 'error', confirmButtonText: 'Close' });
}

function alertInfo(title, text = '') {
  return Swal.fire({ ...base(), title, text, icon: 'info', confirmButtonText: 'OK' });
}

/** Small corner toast, for confirmations that do not need to interrupt. */
function toastSuccess(title) {
  return Swal.fire({
    ...palette(),
    toast: true,
    position: 'top-end',
    icon: 'success',
    title,
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  });
}
