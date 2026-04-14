import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@irongate.local';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@irongate.local';
const SALES_EMAIL = process.env.SALES_EMAIL || SUPPORT_EMAIL;

// Initialize SendGrid if key is available
if (SENDGRID_API_KEY && SENDGRID_API_KEY !== 'YOUR_SENDGRID_API_KEY_HERE') {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

function isSendGridConfigured() {
  const key = SENDGRID_API_KEY || '';
  if (!key || key === 'YOUR_SENDGRID_API_KEY_HERE') return false;
  return key.startsWith('SG.');
}

/**
 * Send payment receipt email
 */
export async function sendPaymentReceipt(email, receiptData) {
  try {
    if (!isSendGridConfigured()) {
      console.warn('SendGrid not configured, skipping receipt email to:', email);
      return { success: false, reason: 'not_configured' };
    }

    const { invoiceNumber, amount, currency, planName, periodStart, periodEnd, invoicePdfUrl } = receiptData;

    const amountFormatted = `${currency === 'USD' ? '$' : ''}${(amount / 100).toFixed(2)}`;
    const periodStartDate = new Date(periodStart).toLocaleDateString();
    const periodEndDate = new Date(periodEnd).toLocaleDateString();

    const msg = {
      to: email,
      from: FROM_EMAIL,
      subject: `Payment Received - IronGate Invoice #${invoiceNumber}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">Payment Received</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Thank you for your subscription</p>
          </div>
          
          <div style="background: #f9fafb; padding: 2rem; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hello,</p>
            
            <p>We've successfully received your payment for your IronGate subscription. Here are your receipt details:</p>
            
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 1.5rem; margin: 1.5rem 0;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                  <p style="margin: 0 0 0.25rem 0; color: #6b7280; font-size: 14px;">Invoice Number</p>
                  <p style="margin: 0; font-size: 16px; font-weight: 600;">#${invoiceNumber}</p>
                </div>
                <div>
                  <p style="margin: 0 0 0.25rem 0; color: #6b7280; font-size: 14px;">Amount Paid</p>
                  <p style="margin: 0; font-size: 16px; font-weight: 600; color: #10b981;">${amountFormatted}</p>
                </div>
                <div>
                  <p style="margin: 0 0 0.25rem 0; color: #6b7280; font-size: 14px;">Plan</p>
                  <p style="margin: 0; font-size: 16px; font-weight: 600;">${planName}</p>
                </div>
                <div>
                  <p style="margin: 0 0 0.25rem 0; color: #6b7280; font-size: 14px;">Period</p>
                  <p style="margin: 0; font-size: 14px;">${periodStartDate} - ${periodEndDate}</p>
                </div>
              </div>
            </div>
            
            <div style="text-align: center; margin: 1.5rem 0;">
              <a href="${invoicePdfUrl}" style="display: inline-block; background: #667eea; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Download Invoice
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin: 2rem 0 1rem 0;">
              <strong>Next Steps:</strong><br/>
              Your subscription is now active. Log in to your account to start using all the features.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0;"/>
            
            <p style="color: #6b7280; font-size: 13px; margin: 1rem 0 0 0;">
              Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #667eea; text-decoration: none;">${SUPPORT_EMAIL}</a>
            </p>
          </div>
        </div>
      `,
      replyTo: SUPPORT_EMAIL
    };

    await sgMail.send(msg);
    console.log(`✉️ Receipt email sent to ${email}`);
    return { success: true, messageId: msg.to };
  } catch (error) {
    console.error('Error sending receipt email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send subscription confirmation email
 */
export async function sendSubscriptionConfirmation(email, planName, startDate) {
  try {
    if (!isSendGridConfigured()) {
      console.warn('SendGrid not configured, skipping confirmation email to:', email);
      return { success: false, reason: 'not_configured' };
    }

    const startDateFormatted = new Date(startDate).toLocaleDateString();

    const msg = {
      to: email,
      from: FROM_EMAIL,
      subject: 'Welcome to IronGate - Subscription Active',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">Welcome to IronGate!</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Your ${planName} subscription is now active</p>
          </div>
          
          <div style="background: #f9fafb; padding: 2rem; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hello,</p>
            
            <p>Your ${planName} plan is now active as of <strong>${startDateFormatted}</strong>.</p>
            
            <div style="background: white; border-left: 4px solid #10b981; border-radius: 6px; padding: 1rem; margin: 1.5rem 0;">
              <p style="margin: 0; font-weight: 600; color: #10b981;">✓ Setup Complete</p>
              <p style="margin: 0.5rem 0 0 0;">You now have full access to all IronGate features.</p>
            </div>
            
            <p style="margin-top: 1.5rem;">Get started:</p>
            <ul style="margin: 1rem 0; padding-left: 1.5rem;">
              <li style="margin: 0.5rem 0;">Log in to your dashboard</li>
              <li style="margin: 0.5rem 0;">Configure your first security sentinel</li>
              <li style="margin: 0.5rem 0;">Set up alerts and notifications</li>
              <li style="margin: 0.5rem 0;">Generate & use your API keys</li>
            </ul>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0;"/>
            
            <p style="color: #6b7280; font-size: 13px; margin: 1rem 0 0 0;">
              Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #667eea; text-decoration: none;">${SUPPORT_EMAIL}</a>
            </p>
          </div>
        </div>
      `,
      replyTo: SUPPORT_EMAIL
    };

    await sgMail.send(msg);
    console.log(`✉️ Subscription confirmation email sent to ${email}`);
    return { success: true, messageId: msg.to };
  } catch (error) {
    console.error('Error sending subscription confirmation email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send failed payment email
 */
export async function sendPaymentFailedNotice(email, planName, retryDate) {
  try {
    if (!isSendGridConfigured()) {
      console.warn('SendGrid not configured, skipping payment failed email to:', email);
      return { success: false, reason: 'not_configured' };
    }

    const retryDateFormatted = new Date(retryDate).toLocaleDateString();

    const msg = {
      to: email,
      from: FROM_EMAIL,
      subject: 'Action Required - Payment Failed for Your IronGate Subscription',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); color: white; padding: 2rem; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">Payment Failed</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Action required to keep your subscription active</p>
          </div>
          
          <div style="background: #f9fafb; padding: 2rem; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hello,</p>
            
            <p>We weren't able to process your payment for your IronGate ${planName} subscription. Your subscription may be suspended if we don't receive a valid payment method.</p>
            
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; border-radius: 6px; padding: 1rem; margin: 1.5rem 0;">
              <p style="margin: 0; font-weight: 600; color: #dc2626;">⚠️ Action Required</p>
              <p style="margin: 0.5rem 0 0 0;">Please update your payment method by <strong>${retryDateFormatted}</strong> to avoid service interruption.</p>
            </div>
            
            <p style="text-align: center; margin: 1.5rem 0;">
              <a href="https://irongate.local/billing" style="display: inline-block; background: #dc2626; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Update Payment Method
              </a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0;"/>
            
            <p style="color: #6b7280; font-size: 13px; margin: 1rem 0 0 0;">
              Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #667eea; text-decoration: none;">${SUPPORT_EMAIL}</a>
            </p>
          </div>
        </div>
      `,
      replyTo: SUPPORT_EMAIL
    };

    await sgMail.send(msg);
    console.log(`✉️ Payment failed notice sent to ${email}`);
    return { success: true, messageId: msg.to };
  } catch (error) {
    console.error('Error sending payment failed email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send trial expiring soon notification
 */
export async function sendTrialExpiringNotice(email, planName, expiryDate, daysLeft) {
  try {
    if (!isSendGridConfigured()) {
      console.warn('SendGrid not configured, skipping trial expiring email to:', email);
      return { success: false, reason: 'not_configured' };
    }

    const expiryDateFormatted = new Date(expiryDate).toLocaleDateString();

    const msg = {
      to: email,
      from: FROM_EMAIL,
      subject: `Your IronGate ${planName} Trial Expires in ${daysLeft} Days`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 2rem; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">Your Trial is Ending Soon</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">You have ${daysLeft} days left to save your subscription</p>
          </div>
          
          <div style="background: #f9fafb; padding: 2rem; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hello,</p>
            
            <p>Your IronGate <strong>${planName}</strong> trial ends on <strong>${expiryDateFormatted}</strong>.</p>
            
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 1rem; margin: 1.5rem 0;">
              <p style="margin: 0; font-weight: 600;">⏰ Trial Expiration</p>
              <p style="margin: 0.5rem 0 0 0;">After your trial ends, your account will be downgraded to the free plan unless you add a payment method.</p>
            </div>
            
            <p style="text-align: center; margin: 1.5rem 0;">
              <a href="https://irongate.local/billing" style="display: inline-block; background: #f59e0b; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Complete Your Subscription
              </a>
            </p>
            
            <p style="color: #6b7280; font-size: 0.95rem; margin: 2rem 0 1rem 0;">
              <strong>What happens next:</strong><br/>
              • Your trial will automatically end on ${expiryDateFormatted}<br/>
              • Your account will revert to the free plan<br/>
              • Any usage overages will no longer be tracked<br/>
              • You can upgrade anytime to restore advanced features
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0;"/>
            
            <p style="color: #6b7280; font-size: 13px; margin: 1rem 0 0 0;">
              Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #667eea; text-decoration: none;">${SUPPORT_EMAIL}</a>
            </p>
          </div>
        </div>
      `,
      replyTo: SUPPORT_EMAIL
    };

    await sgMail.send(msg);
    console.log(`✉️ Trial expiring notice sent to ${email}`);
    return { success: true, messageId: msg.to };
  } catch (error) {
    console.error('Error sending trial expiring email:', error);
    return { success: false, error: error.message };
  }
}

export async function sendDemoRequestNotification(lead) {
  try {
    if (!isSendGridConfigured()) {
      console.warn('SendGrid not configured, skipping demo request email for:', lead?.email);
      return { success: false, reason: 'not_configured' };
    }

    const msg = {
      to: SALES_EMAIL,
      from: FROM_EMAIL,
      subject: `New IronGate demo request from ${lead.company || lead.email}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #333;">
          <div style="background: linear-gradient(135deg, #0f766e 0%, #164e63 100%); color: white; padding: 24px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 26px;">New Demo Request</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">A new prospect requested rollout guidance.</p>
          </div>
          <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 10px 10px;">
            <p><strong>Name:</strong> ${lead.fullName || 'Unknown'}</p>
            <p><strong>Email:</strong> ${lead.email || 'Unknown'}</p>
            <p><strong>Company:</strong> ${lead.company || 'Unknown'}</p>
            <p><strong>Team Size:</strong> ${lead.teamSize || 'Not provided'}</p>
            <p><strong>Message:</strong></p>
            <div style="padding: 12px 14px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; white-space: pre-wrap;">${lead.message || 'No additional message provided.'}</div>
            <p style="margin-top: 18px; color: #6b7280; font-size: 13px;">Reply directly to this email to contact the buyer.</p>
          </div>
        </div>
      `,
      replyTo: lead.email || SUPPORT_EMAIL
    };

    await sgMail.send(msg);
    console.log(`✉️ Demo request notification sent for ${lead?.email}`);
    return { success: true, messageId: msg.to };
  } catch (error) {
    console.error('Error sending demo request notification:', error);
    return { success: false, error: error.message };
  }
}

export default {
  isSendGridConfigured,
  sendPaymentReceipt,
  sendSubscriptionConfirmation,
  sendPaymentFailedNotice,
  sendTrialExpiringNotice,
  sendDemoRequestNotification
};
