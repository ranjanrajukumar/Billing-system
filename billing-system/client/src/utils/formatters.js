export const currency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
export const date = (value) => value ? new Intl.DateTimeFormat('en-IN').format(new Date(value)) : '-';
