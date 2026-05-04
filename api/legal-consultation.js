const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function handler(req, res) {
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
        description: 'AI-powered risk report covering all your property documents with NZ-specific recommendations',
        amount: 2522,       // $25.22 NZD excl. GST (~$29 incl. GST)
        originalAmount: 4261, // ~$49 incl. GST original
        features: ['All documents analysed', 'High/Medium/Low risk findings', 'NZ legal context & recommendations', 'Pre-unconditional checklist', '48-hour turnaround']
      },
      complete: {
        name: 'Complete Analysis',
        description: 'Deep-dive analysis with negotiation strategy, due diligence checklist and NZ legislation references',
        amount: 7739,       // $77.39 NZD excl. GST (~$89 incl. GST)
        originalAmount: 12957, // ~$149 incl. GST original
        features: ['Everything in Essential', 'Detailed analysis with cost estimates', 'Negotiation leverage points', 'NZ legislation references', 'Due diligence checklist (10+ items)', '24-hour turnaround']
      },
      premium: {
        name: 'Premium Report',
        description: 'Formal legal-style report with statute citations, negotiation script and contract conditions to add',
        amount: 12957,      // $129.57 NZD excl. GST (~$149 incl. GST)
        originalAmount: 21652, // ~$249 incl. GST original
        features: ['Everything in Complete', 'Specific NZ statute citations', 'Full negotiation script', 'Contract conditions to add', 'Solicitor referral advice', 'Priority 12-hour turnaround']
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

module.exports = handler;
module.exports.config = {
    api: { bodyParser: false },
};
