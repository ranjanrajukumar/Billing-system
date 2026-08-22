import nodemailer from 'nodemailer';
import { Resend } from 'resend';

let resendClient = null;
if (process.env.RESEND_API_KEY) {
  resendClient = new Resend(process.env.RESEND_API_KEY);
}

// Create a test account dynamically if you don't have credentials
// In production, use your actual SMTP credentials
const createTransporter = async () => {
  // Use environment variables in production
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true', 
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Fallback to Ethereal for testing
  console.log('No SMTP credentials found in .env, falling back to Ethereal Email for testing');
  let testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
};

export const sendInvoiceEmail = async (toEmail, invoice, pdfBuffer) => {
  try {
    const subject = `Invoice ${invoice.invoiceNumber || invoice.id}`;
    const text = `Dear Customer,\n\nPlease find attached the invoice ${invoice.invoiceNumber || invoice.id} for your recent purchase.\n\nThank you for your business!\n\nBest Regards,\nBilling System Team`;
    const filename = `Invoice_${invoice.invoiceNumber || invoice.id}.pdf`;

    if (resendClient) {
      const { data, error } = await resendClient.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Billing System <no-reply@resend.dev>',
        to: toEmail,
        subject,
        text,
        attachments: [
          {
            filename,
            content: pdfBuffer,
          }
        ]
      });

      if (error) {
        throw new Error(error.message);
      }
      
      console.log('Invoice Email sent via Resend: %s', data.id);
      return { success: true, messageId: data.id };
    }

    // Fallback to nodemailer
    const transporter = await createTransporter();
    const mailOptions = {
      from: '"Billing System" <no-reply@billingsystem.com>',
      to: toEmail,
      subject,
      text,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Invoice Email sent via Nodemailer: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending invoice email:', error);
    return { success: false, error };
  }
};

export const sendLowStockAlert = async (product) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const subject = `Low Stock Alert: ${product.name}`;
    const text = `Alert: The product "${product.name}" (SKU: ${product.sku || 'N/A'}) has fallen below the low stock threshold.\n\nCurrent Stock: ${product.stock}\nThreshold: ${product.lowStockThreshold}\n\nPlease restock soon.`;

    if (resendClient) {
      const { data, error } = await resendClient.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Billing System Alert <alert@resend.dev>',
        to: adminEmail,
        subject,
        text,
      });

      if (error) throw new Error(error.message);
      console.log('Low Stock Alert Email sent via Resend: %s', data.id);
      return { success: true, messageId: data.id };
    }

    // Fallback
    const transporter = await createTransporter();
    const mailOptions = {
      from: '"Billing System Alert" <alert@billingsystem.com>',
      to: adminEmail,
      subject,
      text,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Low Stock Alert Email sent via Nodemailer: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending low stock email:', error);
    return { success: false, error };
  }
};

export const sendPasswordResetEmail = async (toEmail, token) => {
  try {
    const resetUrl = process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/reset-password?token=${token}` : `http://localhost:5173/reset-password?token=${token}`;
    const subject = 'Password Reset Request';
    const text = `You requested a password reset. Please click the following link to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;
    const html = `<p>You requested a password reset.</p><p>Please click the following link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, please ignore this email.</p>`;

    if (resendClient) {
      const { data, error } = await resendClient.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Billing System <no-reply@resend.dev>',
        to: toEmail,
        subject,
        text,
        html,
      });

      if (error) throw new Error(error.message);
      console.log('Password Reset Email sent via Resend: %s', data.id);
      return { success: true, messageId: data.id };
    }

    const transporter = await createTransporter();
    const mailOptions = {
      from: '"Billing System" <no-reply@billingsystem.com>',
      to: toEmail,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password Reset Email sent via Nodemailer: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error };
  }
};
