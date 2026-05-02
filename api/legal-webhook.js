const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Initialize Supabase (service role for server-side writes)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleLegalConsultationPayment(session);
        break;
      }
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log('Payment succeeded:', paymentIntent.id);
        await updatePaymentStatus(paymentIntent.id, 'completed');
        break;
      }
      case 'payment_intent.payment_failed': {
        const failedPayment = event.data.object;
        console.log('Payment failed:', failedPayment.id);
        await updatePaymentStatus(failedPayment.id, 'failed');
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// ─── Main Payment Handler ─────────────────────────────────────────────────────

async function handleLegalConsultationPayment(session) {
  console.log('Processing payment for session:', session.id);

  const customerEmail = session.customer_details?.email;
  const customerName  = session.customer_details?.name;
  const amount        = session.amount_total;
  const currency      = session.currency;
  const packageType   = session.metadata?.package || 'complete';

  const propertyAddress = session.custom_fields?.find(f => f.key === 'property_address')?.text?.value;
  const settlementDate  = session.custom_fields?.find(f => f.key === 'settlement_date')?.text?.value;
  const urgency         = session.custom_fields?.find(f => f.key === 'urgency')?.dropdown?.value || 'standard';

  const expectedCompletionTime = calculateCompletionTime(packageType, urgency);
  const assignedLawyer         = assignLawyer(packageType);

  const record = {
    stripe_session_id:      session.id,
    stripe_payment_intent:  session.payment_intent,
    customer_email:         customerEmail,
    customer_name:          customerName,
    amount_cents:           amount,
    currency:               currency,
    package_type:           packageType,
    property_address:       propertyAddress,
    settlement_date:        settlementDate,
    urgency:                urgency,
    status:                 'payment_completed',
    assigned_lawyer:        assignedLawyer,
    expected_completion_at: expectedCompletionTime,
    metadata:               session.metadata || {},
  };

  // 1. Save order to Supabase
  await saveOrderToSupabase(record);

  // 2. Send confirmation email to client
  await sendClientConfirmationEmail(customerEmail, customerName, record);

  // 3. Notify internal team
  await notifyLegalTeam(record);
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

async function saveOrderToSupabase(record) {
  const { data, error } = await supabase
    .from('orders')
    .insert([record]);

  if (error) {
    console.error('Supabase insert error:', error);
    throw new Error(`Failed to save order: ${error.message}`);
  }

  console.log('Order saved to Supabase:', data);
  return data;
}

async function updatePaymentStatus(paymentIntentId, status) {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('stripe_payment_intent', paymentIntentId);

  if (error) {
    console.error('Supabase update error:', error);
  } else {
    console.log(`Order ${paymentIntentId} status updated to: ${status}`);
  }
}

// ─── Resend Emails ────────────────────────────────────────────────────────────

async function sendClientConfirmationEmail(email, name, record) {
  const packageLabel = {
    essential: 'Essential Review ($149)',
    complete:  'Complete Analysis ($299)',
    premium:   'Premium Consultation ($499)',
  }[record.package_type] || record.package_type;

  const completionDate = new Date(record.expected_completion_at).toLocaleDateString('en-NZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const { error } = await resend.emails.send({
    from: 'Verihome NZ <support@verihome.co.nz>',
    to:   email,
    subject: `✅ Your Verihome Legal Consultation is Confirmed – ${packageLabel}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .header { background: #1a237e; color: white; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .header h2 { margin: 8px 0 0; font-size: 16px; font-weight: normal; opacity: 0.9; }
          .content { padding: 30px; max-width: 600px; margin: 0 auto; }
          .info-box { background: #f8f9fa; padding: 20px; border-left: 4px solid #1a237e; margin: 20px 0; border-radius: 4px; }
          .info-box h4 { margin: 0 0 12px; color: #1a237e; }
          .info-box ul { margin: 0; padding-left: 20px; }
          .info-box li { margin-bottom: 6px; }
          .steps ol { padding-left: 20px; }
          .steps li { margin-bottom: 8px; }
          .notice { background: #fff8e1; padding: 16px; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 14px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 13px; color: #666; }
          .footer a { color: #1a237e; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>⚖️ Verihome NZ</h1>
          <h2>Legal Consultation Confirmed</h2>
        </div>
        <div class="content">
          <p>Dear <strong>${name}</strong>,</p>
          <p>Thank you for choosing Verihome NZ. Your payment has been confirmed and our legal team has been notified.</p>

          <div class="info-box">
            <h4>📋 Service Details</h4>
            <ul>
              <li><strong>Package:</strong> ${packageLabel}</li>
              <li><strong>Amount Paid:</strong> $${(record.amount_cents / 100).toFixed(2)} ${record.currency.toUpperCase()}</li>
              <li><strong>Property Address:</strong> ${record.property_address || 'Not provided'}</li>
              <li><strong>Settlement Date:</strong> ${record.settlement_date || 'Not specified'}</li>
              <li><strong>Priority Level:</strong> ${record.urgency}</li>
              <li><strong>Assigned Specialist:</strong> ${record.assigned_lawyer}</li>
              <li><strong>Expected Completion:</strong> ${completionDate}</li>
            </ul>
          </div>

          <div class="steps">
            <h4>📄 Next Steps</h4>
            <ol>
              <li>Our legal team will review your uploaded documents</li>
              <li>We'll conduct a comprehensive analysis based on your package</li>
              <li>You'll receive your detailed legal analysis report via email</li>
              ${record.package_type !== 'essential' ? '<li>A consultation call link will be sent separately</li>' : ''}
            </ol>
          </div>

          <div class="notice">
            <strong>⚠️ Legal Notice:</strong> This service provides AI-assisted legal analysis for informational purposes. 
            For complex matters, we recommend consulting a qualified New Zealand solicitor.
          </div>

          <p style="margin-top: 24px;">Questions? Contact us at <a href="mailto:support@verihome.co.nz">support@verihome.co.nz</a></p>
          <p>Best regards,<br><strong>The Verihome NZ Team</strong></p>
        </div>
        <div class="footer">
          <p>Protocol Zero Limited · Professional AI Legal Consultation Services<br>
          <a href="https://verihome-simple.vercel.app">verihome-simple.vercel.app</a></p>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    console.error('Resend client email error:', error);
  } else {
    console.log('Confirmation email sent to:', email);
  }
}

async function notifyLegalTeam(record) {
  const { error } = await resend.emails.send({
    from: 'Verihome System <support@verihome.co.nz>',
    to:   'support@verihome.co.nz',
    subject: `🆕 New ${record.package_type.toUpperCase()} Consultation – ${record.urgency.toUpperCase()} – ${record.customer_name}`,
    html: `
      <h2>New Legal Consultation Order</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Client</strong></td><td style="padding:8px;border:1px solid #ddd">${record.customer_name} (${record.customer_email})</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Package</strong></td><td style="padding:8px;border:1px solid #ddd">${record.package_type}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Property</strong></td><td style="padding:8px;border:1px solid #ddd">${record.property_address || 'N/A'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Settlement Date</strong></td><td style="padding:8px;border:1px solid #ddd">${record.settlement_date || 'N/A'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Urgency</strong></td><td style="padding:8px;border:1px solid #ddd">${record.urgency}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Assigned To</strong></td><td style="padding:8px;border:1px solid #ddd">${record.assigned_lawyer}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Due By</strong></td><td style="padding:8px;border:1px solid #ddd">${new Date(record.expected_completion_at).toLocaleString('en-NZ')}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #ddd">$${(record.amount_cents / 100).toFixed(2)} ${record.currency.toUpperCase()}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Session ID</strong></td><td style="padding:8px;border:1px solid #ddd">${record.stripe_session_id}</td></tr>
      </table>
    `,
  });

  if (error) {
    console.error('Resend team notification error:', error);
  } else {
    console.log('Legal team notified');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateCompletionTime(packageType, urgency) {
  const baseHours = { essential: 48, complete: 24, premium: 12 };
  const multiplier = { emergency: 0.25, urgent: 0.5, standard: 1 };
  const hours = (baseHours[packageType] || 24) * (multiplier[urgency] || 1);
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function assignLawyer(packageType) {
  const lawyers = {
    premium:   'Senior Legal Counsel',
    complete:  'Property Law Specialist',
    essential: 'Legal Analyst',
  };
  return lawyers[packageType] || 'Legal Team';
}

export const config = {
  api: {
    bodyParser: false,
  },
};
