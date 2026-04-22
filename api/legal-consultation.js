const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, currency = 'nzd', packageType, metadata = {} } = req.body;

    // Validate required fields
    if (!amount || !packageType) {
      return res.status(400).json({ error: 'Amount and package type are required' });
    }

    // Package configurations
    const packages = {
      essential: {
        name: 'Essential Legal Review',
        description: 'Single document analysis with key risk identification',
        features: ['Single document analysis', 'Key risk identification', 'Basic recommendations', '48-hour turnaround']
      },
      complete: {
        name: 'Complete Legal Analysis', 
        description: 'Comprehensive analysis of all property documents',
        features: ['All documents analysis', 'Comprehensive risk assessment', 'Strategic purchase advice', '24-hour turnaround']
      },
      premium: {
        name: 'Premium Legal Consultation',
        description: 'Full legal consultation with personal advisory call',
        features: ['Everything in Complete', 'Priority 12-hour turnaround', '1-hour consultation call', '30-day support']
      }
    };

    const selectedPackage = packages[packageType];
    if (!selectedPackage) {
      return res.status(400).json({ error: 'Invalid package type' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `Verihome NZ - ${selectedPackage.name}`,
              description: selectedPackage.description,
              images: ['https://verihome.co.nz/logo.png'],
              metadata: {
                service_type: 'legal_consultation',
                package_type: packageType,
              }
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/?success=true&session_id={CHECKOUT_SESSION_ID}&package=${packageType}`,
      cancel_url: `${req.headers.origin}/?canceled=true`,
      metadata: {
        ...metadata,
        service: 'legal_consultation',
        package: packageType,
        domain: req.headers.origin,
      },
      customer_email: req.body.customer_email || undefined,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['NZ'], // New Zealand only for legal services
      },
      payment_intent_data: {
        description: `Verihome NZ - ${selectedPackage.name}`,
        metadata: {
          ...metadata,
          service_type: 'legal_consultation',
          package_type: packageType,
        },
      },
      // Custom fields for legal service
      custom_fields: [
        {
          key: 'property_address',
          label: { type: 'text', value: 'Property Address' },
          type: 'text',
          optional: false,
        },
        {
          key: 'settlement_date',
          label: { type: 'text', value: 'Proposed Settlement Date' },
          type: 'text',
          optional: true,
        },
        {
          key: 'urgency',
          label: { type: 'text', value: 'Urgency Level' },
          type: 'dropdown',
          dropdown: {
            options: [
              { label: 'Standard', value: 'standard' },
              { label: 'Urgent (within 24 hours)', value: 'urgent' },
              { label: 'Emergency (same day)', value: 'emergency' }
            ]
          },
          optional: true,
        }
      ],
      // Legal service specific settings
      consent_collection: {
        terms_of_service: 'required',
        privacy_policy: 'required',
      },
    });

    res.status(200).json({ 
      id: session.id, 
      url: session.url,
      package: selectedPackage.name
    });
    
  } catch (error) {
    console.error('Stripe legal consultation error:', error);
    res.status(500).json({ error: error.message });
  }
}
