const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, currency = 'nzd', packageType, metadata = {} } = req.body;

    if (!amount || !packageType) {
      return res.status(400).json({ error: 'Amount and package type are required' });
    }

    // Package configurations — prices in NZD cents
    // Launch Offer pricing: Essential $69 (orig $129), Complete $199 (orig $249), Premium $259 (orig $319)
    const packages = {
      essential: {
        name: 'Essential Review',
        description: 'AI analysis of one property document — S&P Agreement, LIM Report, or Building Inspection',
        amount: 6900,       // $69 NZD launch price
        originalAmount: 12900, // $129 NZD original price
        features: ['Single document AI analysis', 'Full risk identification', 'NZ-specific recommendations', 'Negotiation points', '48-hour turnaround', 'PDF report']
      },
      complete: {
        name: 'Complete Analysis',
        description: 'Comprehensive AI analysis of all your property documents with full strategic advice',
        amount: 19900,      // $199 NZD launch price
        originalAmount: 24900, // $249 NZD original price
        features: ['All documents AI analysis', 'Full risk assessment', 'Strategic purchase advice', 'Detailed negotiation strategy', '24-hour turnaround', 'Due diligence checklist', 'Detailed PDF report']
      },
      premium: {
        name: 'Premium Consultation',
        description: 'Priority full analysis with follow-up Q&A and custom negotiation strategy',
        amount: 25900,      // $259 NZD launch price
        originalAmount: 31900, // $319 NZD original price
        features: ['Everything in Complete', 'Priority 12-hour turnaround', 'Follow-up Q&A session', 'Custom negotiation strategy', 'Legal document templates', '30-day email support']
      }
    };

    const selectedPackage = packages[packageType];
    if (!selectedPackage) {
      return res.status(400).json({ error: 'Invalid package type' });
    }

    // Use amount from request body (allows frontend to pass launch price)
    // Validate it matches the expected launch price for security
    const expectedAmount = selectedPackage.amount;
    if (amount !== expectedAmount) {
      return res.status(400).json({ error: 'Invalid amount for package' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `Verihome NZ — ${selectedPackage.name}`,
              description: selectedPackage.description,
              metadata: {
                service_type: 'property_document_analysis',
                package_type: packageType,
                original_price_nzd: String(selectedPackage.originalAmount / 100),
                launch_price_nzd: String(selectedPackage.amount / 100),
              }
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // Allow customers to enter promo codes at checkout
      allow_promotion_codes: true,
            success_url: `${req.headers.origin}/success.html?package=${packageType}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/?canceled=true`,
      metadata: {
        ...metadata,
        service: 'property_document_analysis',
        package: packageType,
        domain: req.headers.origin,
      },
      customer_email: req.body.customer_email || undefined,
      billing_address_collection: 'required',
      payment_intent_data: {
        description: `Verihome NZ — ${selectedPackage.name}`,
        metadata: {
          ...metadata,
          service_type: 'property_document_analysis',
          package_type: packageType,
        },
      },
      custom_fields: [
        {
          key: 'property_address',
          label: { type: 'custom', custom: 'Property Address' },
          type: 'text',
          optional: false,
        },
        {
          key: 'settlement_date',
          label: { type: 'custom', custom: 'Proposed Settlement Date' },
          type: 'text',
          optional: true,
        },
      ],
      consent_collection: {
        terms_of_service: 'required',
      },
    });

    res.status(200).json({
      id: session.id,
      url: session.url,
      package: selectedPackage.name,
      amount: selectedPackage.amount,
    });

  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: error.message });
  }
}
