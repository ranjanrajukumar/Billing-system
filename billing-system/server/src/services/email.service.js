// No SMTP transport is wired up yet. Point these at your provider (nodemailer,
// SES, Postmark, …) using the SMTP_* variables in .env when you are ready.
const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

export async function sendInvoiceEmail({ to, invoiceNumber }) {
  if (!smtpConfigured()) {
    console.log(`Email adapter placeholder: invoice ${invoiceNumber} queued for ${to}`);
    return { queued: true, delivered: false };
  }
  console.log(`SMTP configured but no transport implemented; invoice ${invoiceNumber} for ${to}`);
  return { queued: true, delivered: false };
}

export async function sendPasswordResetEmail(to, token) {
  const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  if (!smtpConfigured()) {
    console.log(`Password reset link for ${to}: ${link}`);
    return { queued: true, delivered: false };
  }
  console.log(`SMTP configured but no transport implemented; reset link for ${to}`);
  return { queued: true, delivered: false };
}
