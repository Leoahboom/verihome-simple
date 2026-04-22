const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Legal consultation webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        await handleLegalConsultationPayment(session);
        break;
      
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('Legal consultation payment succeeded:', paymentIntent.id);
        await updatePaymentStatus(paymentIntent.id, 'completed');
        break;
      
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('Legal consultation payment failed:', failedPayment.id);
        await updatePaymentStatus(failedPayment.id, 'failed');
        await sendPaymentFailureNotification(failedPayment);
        break;
      
      default:
        console.log(`Unhandled legal consultation event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Legal consultation webhook error:', error);
    res.status(500).json({ error: 'Legal consultation webhook processing failed' });
  }
}

async function handleLegalConsultationPayment(session) {
  console.log('Processing legal consultation payment:', session.id);
  
  try {
    // Extract customer and service information
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name;
    const amount = session.amount_total;
    const currency = session.currency;
    const packageType = session.metadata?.package || 'complete';
    
    // Extract property information from custom fields
    const propertyAddress = session.custom_fields?.find(f => f.key === 'property_address')?.text?.value;
    const settlementDate = session.custom_fields?.find(f => f.key === 'settlement_date')?.text?.value;
    const urgency = session.custom_fields?.find(f => f.key === 'urgency')?.dropdown?.value || 'standard';
    
    // Create legal consultation record
    const consultationRecord = {
      sessionId: session.id,
      customerEmail,
      customerName,
      amount,
      currency,
      packageType,
      propertyAddress,
      settlementDate,
      urgency,
      status: 'payment_completed',
      metadata: session.metadata,
      createdAt: new Date().toISOString(),
      expectedCompletionTime: calculateCompletionTime(packageType, urgency),
      assignedLawyer: await assignLawyer(packageType, urgency),
    };
    
    console.log('Legal consultation record:', consultationRecord);
    
    // Send confirmation email to client
    await sendClientConfirmationEmail(customerEmail, consultationRecord);
    
    // Notify legal team
    await notifyLegalTeam(consultationRecord);
    
    // Schedule legal analysis based on package type
    await initiateLegalAnalysis(consultationRecord);
    
  } catch (error) {
    console.error('Error processing legal consultation payment:', error);
    throw error;
  }
}

function calculateCompletionTime(packageType, urgency) {
  const baseHours = {
    essential: 48,
    complete: 24,
    premium: 12
  };
  
  const urgencyMultiplier = {
    emergency: 0.25,  // Same day
    urgent: 0.5,      // Within 24 hours  
    standard: 1       // Standard timing
  };
  
  const hours = baseHours[packageType] * urgencyMultiplier[urgency];
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function assignLawyer(packageType, urgency) {
  // TODO: Implement lawyer assignment logic
  // This could integrate with a lawyer management system
  const lawyers = {
    premium: 'Senior Legal Counsel',
    complete: 'Property Law Specialist', 
    essential: 'Legal Analyst'
  };
  
  return lawyers[packageType] || 'Legal Team';
}

async function sendClientConfirmationEmail(email, record) {
  // TODO: Replace with actual email service (SendGrid, AWS SES, etc.)
  console.log(`Sending legal consultation confirmation to: ${email}`);
  
  const emailContent = {
    to: email,
    from: 'support@verihome.co.nz',
    subject: `Verihome - Legal Consultation Confirmed (${record.packageType.toUpperCase()})`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: #1a237e; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; }
          .info-box { background: #f8f9fa; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>⚖️ Verihome NZ</h1>
          <h2>Legal Consultation Confirmed</h2>
        </div>
        
        <div class="content">
          <h3>Dear ${record.customerName},</h3>
          
          <p>Thank you for choosing Verihome NZ for your legal consultation. Your payment has been confirmed and our legal team has been notified.</p>
          
          <div class="info-box">
            <h4>📋 Service Details:</h4>
            <ul>
              <li><strong>Package:</strong> ${record.packageType.charAt(0).toUpperCase() + record.packageType.slice(1)} Legal Analysis</li>
              <li><strong>Amount Paid:</strong> $${(record.amount / 100).toFixed(2)} ${record.currency.toUpperCase()}</li>
              <li><strong>Property Address:</strong> ${record.propertyAddress}</li>
              <li><strong>Settlement Date:</strong> ${record.settlementDate || 'Not specified'}</li>
              <li><strong>Priority Level:</strong> ${record.urgency}</li>
              <li><strong>Expected Completion:</strong> ${new Date(record.expectedCompletionTime).toLocaleDateString('en-NZ', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</li>
              <li><strong>Assigned Legal Specialist:</strong> ${record.assignedLawyer}</li>
            </ul>
          </div>
          
          <h4>📄 Next Steps:</h4>
          <ol>
            <li>Our legal team will review your uploaded documents</li>
            <li>We'll conduct comprehensive analysis based on your package</li>
            <li>You'll receive your detailed legal analysis report via email</li>
            ${record.packageType !== 'essential' ? '<li>Schedule your consultation call (link will be provided)</li>' : ''}
          </ol>
          
          <div class="info-box">
            <h4>⚠️ Important Legal Notice:</h4>
            <p>This service provides AI-powered legal analysis and recommendations for informational purposes. For complex legal matters, we recommend consulting with a qualified New Zealand solicitor. Our analysis serves as a professional starting point for your legal due diligence.</p>
          </div>
          
          <p>If you have any questions, please contact us at <a href="mailto:support@Verihome.co.nz">support@Verihome.co.nz</a></p>
          
          <p>Best regards,<br>
          <strong>The Verihome NZ Team</strong></p>
        </div>
        
        <div class="footer">
          <p>Protocal Zero Limited <br>
          Professional AI Legal Consultation Services<br>
          <a href="https://verihome.co.nz">verihome.co.nz</a></p>
        </div>
      </body>
      </html>
    `
  };
  
  // TODO: Implement actual email sending
  console.log('Email content prepared:', emailContent);
}

async function notifyLegalTeam(record) {
  // TODO: Notify legal team via Slack, email, or internal system
  console.log('Notifying legal team of new consultation:', {
    client: record.customerName,
    package: record.packageType,
    property: record.propertyAddress,
    urgency: record.urgency,
    expectedCompletion: record.expectedCompletionTime
  });
  
  // Internal notification email to legal team
  const teamNotification = {
    to: 'support@verihome.co.nz',
    from: 'support@verihome.co.nz',
    subject: `New Legal Consultation - ${record.packageType.toUpperCase()} (${record.urgency})`,
    html: `
      <h2>New Legal Consultation Assignment</h2>
      <ul>
        <li><strong>Client:</strong> ${record.customerName} (${record.customerEmail})</li>
        <li><strong>Package:</strong> ${record.packageType}</li>
        <li><strong>Property:</strong> ${record.propertyAddress}</li>
        <li><strong>Settlement Date:</strong> ${record.settlementDate}</li>
        <li><strong>Urgency:</strong> ${record.urgency}</li>
        <li><strong>Due:</strong> ${new Date(record.expectedCompletionTime).toLocaleString()}</li>
        <li><strong>Session ID:</strong> ${record.sessionId}</li>
      </ul>
      <p>Documents should be available in the client's session folder.</p>
    `
  };
  
  console.log('Legal team notification prepared:', teamNotification);
}

async function initiateLegalAnalysis(record) {
  console.log(`Initiating legal analysis for session: ${record.sessionId}`);
  
  // TODO: Integrate with legal analysis workflow system
  // This is where you would:
  // 1. Retrieve uploaded documents for this session
  // 2. Assign to appropriate legal analyst/lawyer
  // 3. Create work item in legal workflow system
  // 4. Set up reminders and deadlines
  // 5. Initialize AI-assisted legal analysis
  
  // For now, log the analysis initiation
  const analysisTask = {
    sessionId: record.sessionId,
    clientName: record.customerName,
    packageType: record.packageType,
    priority: record.urgency,
    assignedTo: record.assignedLawyer,
    dueDate: record.expectedCompletionTime,
    status: 'assigned',
    createdAt: new Date().toISOString()
  };
  
  console.log('Legal analysis task created:', analysisTask);
}

async function updatePaymentStatus(paymentIntentId, status) {
  // TODO: Update database with payment status
  console.log(`Updated payment ${paymentIntentId} status to: ${status}`);
}

async function sendPaymentFailureNotification(paymentIntent) {
  // TODO: Send payment failure notification to customer
  console.log('Payment failed for legal consultation:', paymentIntent.id);
}

// Export config for Next.js API routes
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
