/**
 * EMOTION - Netlify Function: create-payment-intent
 * Crea un PaymentIntent en Stripe de forma segura en el servidor
 *
 * Variables de entorno requeridas en Netlify:
 * - STRIPE_SECRET_KEY: Tu clave secreta de Stripe (sk_live_... o sk_test_...)
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Solo permitir POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { amount, currency, metadata } = JSON.parse(event.body);

    if (!amount || !currency) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Monto y moneda son requeridos.' })
      };
    }

    // Validar que el monto sea positivo
    if (amount <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'El monto debe ser mayor a 0.' })
      };
    }

    // Crear el PaymentIntent en Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      metadata: metadata || {},
      automatic_payment_methods: { enabled: true }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      })
    };

  } catch (err) {
    console.error('Error creando PaymentIntent:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Error interno del servidor.' })
    };
  }
};
