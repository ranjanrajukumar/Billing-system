import twilio from 'twilio';

let twilioClient = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('Twilio client initialized');
  } catch (error) {
    console.error('Failed to initialize Twilio client:', error);
  }
}

/**
 * Sends an SMS message using Twilio.
 * 
 * @param {string} to - The destination phone number (e.g., '+1234567890')
 * @param {string} body - The text message body
 * @returns {Promise<object>} The result of the SMS dispatch
 */
export const sendSMS = async (to, body) => {
  if (!to) {
    console.warn('Cannot send SMS: destination number is missing');
    return { success: false, error: 'Destination number missing' };
  }

  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    console.warn('Twilio is not configured. SMS not sent to:', to);
    console.warn('Message body:', body);
    // Return success true in dev mode to avoid failing transactions
    return { success: true, mock: true, messageId: 'mock-id' };
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log('SMS sent via Twilio to %s, SID: %s', to, message.sid);
    return { success: true, messageId: message.sid };
  } catch (error) {
    console.error('Error sending SMS via Twilio:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Sends an SMS notification when an invoice is confirmed.
 */
export const sendInvoiceSMS = async (customerPhone, invoiceNumber, amount) => {
  if (!customerPhone) return;
  const message = `Hello, your invoice ${invoiceNumber} for the amount of ${amount} has been generated. Thank you for your business!`;
  return sendSMS(customerPhone, message);
};

/**
 * Sends an SMS notification for low stock.
 */
export const sendLowStockSMS = async (adminPhone, productName, stock) => {
  if (!adminPhone) return;
  const message = `Alert: Product "${productName}" is running low on stock. Current stock: ${stock}. Please reorder.`;
  return sendSMS(adminPhone, message);
};
