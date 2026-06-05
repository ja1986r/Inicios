/**
 * EMOTION - payments.js
 * Lógica de pagos con Stripe y registro de transacciones
 *
 * SETUP:
 * 1. Crear cuenta en https://stripe.com
 * 2. Obtener tu Publishable Key del dashboard de Stripe
 * 3. Reemplazar 'pk_test_TU_STRIPE_PUBLISHABLE_KEY' con tu clave real
 * 4. Configurar el webhook y la Netlify Function para crear PaymentIntents
 */

const PaymentsModule = (() => {
  const { db, COLLECTIONS, CURRENCIES } = EmotionApp;

  // ─── Clave pública de Stripe (reemplazar con la tuya) ─────────
  const STRIPE_PK = 'pk_test_TU_STRIPE_PUBLISHABLE_KEY';
  let stripe = null;

  function initStripe() {
    if (typeof Stripe === 'undefined') {
      console.warn('Stripe.js no está cargado.');
      return null;
    }
    if (!stripe) stripe = Stripe(STRIPE_PK);
    return stripe;
  }

  // ═══════════════════════════════════════════════════════
  // CREAR CHECKOUT SESSION (requiere Netlify Function)
  // ═══════════════════════════════════════════════════════
  async function createCheckoutSession(sessionData) {
    const { psicologoNombre, pacienteEmail, precio, moneda, sessionId, fecha, hora } = sessionData;

    EmotionApp.setLoading(true, 'Preparando el pago...');

    try {
      // Llamar a la Netlify Function que crea el Payment Intent
      const response = await fetch('/.netlify/functions/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: convertToSmallestUnit(precio, moneda),
          currency: moneda.toLowerCase(),
          metadata: {
            sessionId,
            pacienteEmail,
            psicologoNombre,
            fecha,
            hora
          }
        })
      });

      if (!response.ok) throw new Error('Error al conectar con el servidor de pagos.');

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      EmotionApp.setLoading(false);
      return data; // { clientSecret, paymentIntentId }

    } catch (err) {
      EmotionApp.setLoading(false);
      // En modo demo/sin Netlify Function, simular el pago
      console.warn('Usando modo demo de pagos:', err.message);
      return { demo: true, clientSecret: 'demo_secret_' + Date.now() };
    }
  }

  // ═══════════════════════════════════════════════════════
  // PROCESAR PAGO CON STRIPE ELEMENTS (modal en la página)
  // ═══════════════════════════════════════════════════════
  async function showPaymentModal(sessionData, onSuccess) {
    const { precio, moneda, psicologoNombre, fecha, hora, sessionId } = sessionData;
    const priceFormatted = EmotionApp.formatPrice(precio, moneda);

    // Crear modal de pago
    const existingModal = document.getElementById('payment-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'payment-modal';
    modal.className = 'em-modal-overlay active';
    modal.innerHTML = `
      <div class="em-modal">
        <div class="em-modal-header">
          <h3 class="em-modal-title">💳 Confirmar pago</h3>
          <button class="em-modal-close" onclick="document.getElementById('payment-modal').remove()">✕</button>
        </div>
        <div class="em-modal-body">
          <!-- Resumen de la sesión -->
          <div style="background:var(--em-mint-light);border-radius:var(--em-radius);padding:16px;margin-bottom:20px">
            <div style="font-size:0.82rem;font-weight:700;color:var(--em-mint-dark);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">
              Resumen de tu sesión
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.9rem;color:var(--em-text);margin-bottom:4px">
              <span>Psicólogo</span><strong>${psicologoNombre}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.9rem;color:var(--em-text);margin-bottom:4px">
              <span>Fecha</span><strong>${fecha}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.9rem;color:var(--em-text);margin-bottom:4px">
              <span>Hora</span><strong>${hora}</strong>
            </div>
            <hr style="border:none;border-top:1px solid rgba(76,175,154,0.2);margin:8px 0">
            <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:800;color:var(--em-mint-dark)">
              <span>Total</span><span>${priceFormatted}</span>
            </div>
          </div>

          <!-- Campo de tarjeta Stripe -->
          <div class="em-form-group">
            <label class="em-label">Datos de tu tarjeta</label>
            <div id="card-element" style="padding:14px 16px;border:2px solid var(--em-gray-200);border-radius:var(--em-radius);background:white">
              <!-- Stripe Element se monta aquí -->
            </div>
            <div id="card-errors" class="em-form-error" style="margin-top:6px"></div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:0.8rem;color:var(--em-text-light)">
            🔒 Pago procesado de forma segura por Stripe. Tus datos están protegidos.
          </div>
        </div>
        <div class="em-modal-footer">
          <button class="em-btn em-btn-ghost" onclick="document.getElementById('payment-modal').remove()">Cancelar</button>
          <button class="em-btn em-btn-primary" id="btn-pay-now">
            Pagar ${priceFormatted}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Intentar inicializar Stripe Elements
    const stripeInstance = initStripe();
    let cardElement = null;

    if (stripeInstance) {
      try {
        const { clientSecret, demo } = await createCheckoutSession(sessionData);

        if (!demo) {
          const elements = stripeInstance.elements();
          cardElement = elements.create('card', {
            style: {
              base: {
                fontSize: '16px',
                color: '#2D3748',
                '::placeholder': { color: '#A0AEC0' }
              }
            }
          });
          cardElement.mount('#card-element');
          cardElement.on('change', (event) => {
            const displayError = document.getElementById('card-errors');
            displayError.textContent = event.error ? event.error.message : '';
          });

          document.getElementById('btn-pay-now').addEventListener('click', async () => {
            await processStripePayment(stripeInstance, cardElement, clientSecret, sessionId, precio, moneda, onSuccess);
          });
          return;
        }
      } catch (err) {
        console.warn('Stripe Elements no disponible, usando modo demo');
      }
    }

    // Modo demo (sin Stripe configurado)
    document.getElementById('card-element').innerHTML = `
      <div style="text-align:center;padding:16px;color:var(--em-text-light)">
        <div style="font-size:1.5rem;margin-bottom:8px">🧪</div>
        <div style="font-size:0.85rem;font-weight:600">Modo Demo</div>
        <div style="font-size:0.8rem;margin-top:4px">En producción aquí aparecerá el formulario de Stripe</div>
      </div>
    `;
    document.getElementById('btn-pay-now').addEventListener('click', async () => {
      await processDemoPayment(sessionId, precio, moneda, onSuccess);
    });
  }

  // ─── Procesar pago real con Stripe ────────────────────────────
  async function processStripePayment(stripeInstance, cardElement, clientSecret, sessionId, precio, moneda, onSuccess) {
    const btn = document.getElementById('btn-pay-now');
    btn.disabled = true;
    btn.classList.add('em-loading');

    try {
      const { paymentIntent, error } = await stripeInstance.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement }
      });

      if (error) {
        document.getElementById('card-errors').textContent = error.message;
        btn.disabled = false;
        btn.classList.remove('em-loading');
        return;
      }

      if (paymentIntent.status === 'succeeded') {
        await recordPayment(sessionId, paymentIntent.id, precio, moneda, 'completed');
        document.getElementById('payment-modal').remove();
        EmotionApp.showAlert('¡Pago exitoso! Tu sesión ha sido confirmada.', 'success');
        if (onSuccess) onSuccess(paymentIntent.id);
      }
    } catch (err) {
      EmotionApp.showAlert('Error al procesar el pago. Intenta nuevamente.', 'error');
      btn.disabled = false;
      btn.classList.remove('em-loading');
    }
  }

  // ─── Pago demo (sin Stripe real) ─────────────────────────────
  async function processDemoPayment(sessionId, precio, moneda, onSuccess) {
    const btn = document.getElementById('btn-pay-now');
    btn.disabled = true;
    btn.classList.add('em-loading');
    btn.textContent = 'Procesando...';

    // Simular delay de procesamiento
    await new Promise(r => setTimeout(r, 1500));

    const demoPaymentId = 'demo_pay_' + Date.now();
    await recordPayment(sessionId, demoPaymentId, precio, moneda, 'completed');
    document.getElementById('payment-modal').remove();
    EmotionApp.showAlert('¡Pago procesado! (Modo demo). Tu sesión ha sido confirmada.', 'success');
    if (onSuccess) onSuccess(demoPaymentId);
  }

  // ═══════════════════════════════════════════════════════
  // REGISTRO DE PAGOS EN FIRESTORE
  // ═══════════════════════════════════════════════════════
  async function recordPayment(sessionId, stripePaymentId, monto, moneda, estado) {
    try {
      // Obtener datos de la sesión
      const sessionDoc = await db.collection(COLLECTIONS.SESSIONS).doc(sessionId).get();
      const session = sessionDoc.data();

      // Calcular comisión de la plataforma
      const commission = await EmotionApp.getPlatformCommission();
      const montoComision = monto * commission;
      const montoPsicologo = monto - montoComision;

      // Guardar pago
      const paymentRef = await db.collection(COLLECTIONS.PAYMENTS).add({
        sesionId: sessionId,
        pacienteId: session.pacienteId,
        psicologoId: session.psicologoId,
        monto,
        moneda,
        montoComision,
        montoPsicologo,
        stripePaymentId,
        estado,
        fecha: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Actualizar estado de la sesión
      await db.collection(COLLECTIONS.SESSIONS).doc(sessionId).update({
        estado: 'confirmed',
        pagoId: paymentRef.id,
        stripePaymentId,
        fechaPago: firebase.firestore.FieldValue.serverTimestamp()
      });

      return paymentRef.id;
    } catch (err) {
      console.error('Error registrando pago:', err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // CONVERSIÓN DE MONEDAS
  // ═══════════════════════════════════════════════════════
  function convertToSmallestUnit(amount, currency) {
    // Monedas sin decimales (unidades enteras)
    const zeroCurrencies = ['CLP', 'PYG', 'BRL'];
    if (zeroCurrencies.includes(currency)) {
      return Math.round(amount);
    }
    // El resto usa centavos (multiplicar por 100)
    return Math.round(amount * 100);
  }

  // ─── Obtener historial de pagos ───────────────────────────────
  async function getPaymentHistory(userId, role) {
    try {
      const field = role === 'psychologist' ? 'psicologoId' : 'pacienteId';
      const snap = await db.collection(COLLECTIONS.PAYMENTS)
        .where(field, '==', userId)
        .orderBy('fecha', 'desc')
        .limit(50)
        .get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('Error obteniendo pagos:', err);
      return [];
    }
  }

  // ─── Resumen financiero para admin ───────────────────────────
  async function getFinancialSummary(startDate, endDate) {
    try {
      let query = db.collection(COLLECTIONS.PAYMENTS).where('estado', '==', 'completed');
      if (startDate) query = query.where('fecha', '>=', startDate);
      if (endDate) query = query.where('fecha', '<=', endDate);

      const snap = await query.get();
      const payments = snap.docs.map(d => d.data());

      const totalBruto = payments.reduce((sum, p) => {
        // Convertir todo a USD para resumen (simplificado)
        return sum + (p.moneda === 'USD' ? p.monto : 0);
      }, 0);

      const totalComision = payments.reduce((sum, p) => {
        return sum + (p.moneda === 'USD' ? p.montoComision : 0);
      }, 0);

      return {
        totalTransacciones: payments.length,
        totalBruto,
        totalComision,
        totalPsicologos: totalBruto - totalComision,
        porMoneda: groupByMoneda(payments)
      };
    } catch (err) {
      console.error('Error en resumen financiero:', err);
      return { totalTransacciones: 0, totalBruto: 0, totalComision: 0, totalPsicologos: 0, porMoneda: {} };
    }
  }

  function groupByMoneda(payments) {
    return payments.reduce((acc, p) => {
      if (!acc[p.moneda]) acc[p.moneda] = { total: 0, count: 0 };
      acc[p.moneda].total += p.monto;
      acc[p.moneda].count++;
      return acc;
    }, {});
  }

  return {
    initStripe,
    showPaymentModal,
    createCheckoutSession,
    recordPayment,
    getPaymentHistory,
    getFinancialSummary,
    convertToSmallestUnit
  };
})();

window.PaymentsModule = PaymentsModule;
