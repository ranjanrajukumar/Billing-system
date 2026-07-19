export async function sendInvoiceEmail({ to, invoiceNumber }) {
  console.log(`Email adapter placeholder: invoice ${invoiceNumber} queued for ${to}`);
  return { queued: true };
}
