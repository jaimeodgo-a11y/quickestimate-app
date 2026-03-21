exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing env vars');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing configuration' }) };
  }

  // Parse the event — skip signature verification for now (add later with stripe secret key)
  let stripeEvent;
  try {
    stripeEvent = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  console.log('Stripe event received:', stripeEvent.type);

  // Handle checkout.session.completed
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data?.object;
    const customerEmail = session?.customer_details?.email || session?.customer_email;
    const customerId = session?.customer;
    const subscriptionId = session?.subscription;

    if (!customerEmail) {
      console.error('No customer email in session');
      return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
    }

    try {
      // Find user by email in Supabase auth
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(customerEmail)}`, {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      });
      const userData = await userRes.json();
      const user = userData?.users?.[0];

      if (!user) {
        console.error('No user found for email:', customerEmail);
        return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
      }

      // Upsert subscription as active
      const subRes = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          user_id: user.id,
          status: 'active',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan: 'pro',
          updated_at: new Date().toISOString()
        })
      });

      if (!subRes.ok) {
        const err = await subRes.text();
        console.error('Supabase error:', err);
      } else {
        console.log('Subscription activated for:', customerEmail);
      }

    } catch (err) {
      console.error('Error processing payment:', err);
    }
  }

  // Handle subscription cancelled/deleted
  if (stripeEvent.type === 'customer.subscription.deleted') {
    const subscription = stripeEvent.data?.object;
    const subscriptionId = subscription?.id;

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?stripe_subscription_id=eq.${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() })
      });
      console.log('Subscription cancelled:', subscriptionId);
    } catch (err) {
      console.error('Error cancelling subscription:', err);
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
};
