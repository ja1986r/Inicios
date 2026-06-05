/**
 * EMOTION - Plataforma de Telemedicina Emocional
 * Configuración de Firebase
 *
 * INSTRUCCIONES:
 * 1. Ir a https://console.firebase.google.com
 * 2. Crear un proyecto llamado "emotion-app"
 * 3. Ir a Configuración del proyecto > Tus apps > Web
 * 4. Copiar las credenciales y reemplazar los valores de abajo
 * 5. Habilitar: Authentication, Firestore, Storage, Realtime Database
 */

// ═══════════════════════════════════════════════════════
// CONFIGURACIÓN DE FIREBASE - REEMPLAZAR CON TUS VALORES
// ═══════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  databaseURL: "https://tu-proyecto-default-rtdb.firebaseio.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// ═══════════════════════════════════════════════════════
// SERVICIOS DE FIREBASE
// ═══════════════════════════════════════════════════════
const db = firebase.firestore();           // Firestore para datos principales
const auth = firebase.auth();             // Autenticación
const storage = firebase.storage();       // Storage para archivos
const rtdb = firebase.database();         // Realtime DB para videollamadas y chat

// Objeto global de la aplicación
window.EmotionApp = {
  db,
  auth,
  storage,
  rtdb,
  currentUser: null,
  currentUserData: null,

  // ═══════════════════════════════════════════════════
  // CONSTANTES
  // ═══════════════════════════════════════════════════
  COLLECTIONS: {
    USERS: 'users',
    SESSIONS: 'sessions',
    RESOURCES: 'resources',
    PATIENT_RESOURCES: 'patient_resources',
    SESSION_NOTES: 'session_notes',
    SESSION_RECORDS: 'session_records',
    PAYMENTS: 'payments',
    SETTINGS: 'settings'
  },

  ROLES: {
    PATIENT: 'patient',
    PSYCHOLOGIST: 'psychologist',
    ADMIN: 'admin'
  },

  PSYCHOLOGIST_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    SUSPENDED: 'suspended'
  },

  SESSION_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },

  // Monedas LATAM soportadas
  CURRENCIES: {
    USD: { name: 'Dólar estadounidense', symbol: '$', locale: 'en-US' },
    PYG: { name: 'Guaraní paraguayo', symbol: '₲', locale: 'es-PY' },
    COP: { name: 'Peso colombiano', symbol: '$', locale: 'es-CO' },
    ARS: { name: 'Peso argentino', symbol: '$', locale: 'es-AR' },
    BRL: { name: 'Real brasileño', symbol: 'R$', locale: 'pt-BR' },
    CLP: { name: 'Peso chileno', symbol: '$', locale: 'es-CL' },
    MXN: { name: 'Peso mexicano', symbol: '$', locale: 'es-MX' },
    PEN: { name: 'Sol peruano', symbol: 'S/', locale: 'es-PE' },
    BOB: { name: 'Boliviano', symbol: 'Bs.', locale: 'es-BO' }
  },

  // Países LATAM
  COUNTRIES: [
    'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia',
    'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'Guatemala',
    'Honduras', 'México', 'Nicaragua', 'Panamá', 'Paraguay',
    'Perú', 'República Dominicana', 'Uruguay', 'Venezuela'
  ],

  // Especialidades psicológicas
  SPECIALTIES: [
    'Ansiedad y Estrés',
    'Depresión',
    'Terapia de Pareja',
    'Terapia Familiar',
    'Terapia Infantil y Adolescente',
    'Trauma y PTSD',
    'Trastornos de la Alimentación',
    'Adicciones',
    'TOC',
    'Trastornos del Sueño',
    'Duelo y Pérdidas',
    'Habilidades Sociales',
    'Autoestima y Desarrollo Personal',
    'Psicología Laboral',
    'Orientación Vocacional',
    'Psicología Forense',
    'Neuropsicología',
    'Psicosis y Esquizofrenia'
  ],

  // ═══════════════════════════════════════════════════
  // UTILIDADES
  // ═══════════════════════════════════════════════════

  // Formatear precio con moneda
  formatPrice(amount, currency) {
    const curr = this.CURRENCIES[currency] || this.CURRENCIES.USD;
    try {
      return new Intl.NumberFormat(curr.locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: currency === 'PYG' || currency === 'CLP' ? 0 : 2
      }).format(amount);
    } catch {
      return `${curr.symbol}${amount}`;
    }
  },

  // Formatear fecha legible
  formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric'
    }).format(date);
  },

  // Formatear fecha y hora
  formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  },

  // Mostrar mensaje de alerta
  showAlert(message, type = 'info', duration = 4000) {
    const alert = document.createElement('div');
    alert.className = `em-toast em-toast-${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    alert.innerHTML = `
      <span class="em-toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="em-toast-msg">${message}</span>
    `;
    let container = document.getElementById('em-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'em-toast-container';
      document.body.appendChild(container);
    }
    container.appendChild(alert);
    setTimeout(() => alert.classList.add('em-toast-show'), 10);
    setTimeout(() => {
      alert.classList.remove('em-toast-show');
      setTimeout(() => alert.remove(), 300);
    }, duration);
  },

  // Mostrar/ocultar loading global
  setLoading(show, message = 'Cargando...') {
    let overlay = document.getElementById('em-loading-overlay');
    if (show) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'em-loading-overlay';
        overlay.innerHTML = `
          <div class="em-loading-box">
            <div class="em-spinner"></div>
            <p id="em-loading-msg">${message}</p>
          </div>
        `;
        document.body.appendChild(overlay);
      }
      document.getElementById('em-loading-msg').textContent = message;
      overlay.style.display = 'flex';
    } else if (overlay) {
      overlay.style.display = 'none';
    }
  },

  // Generar slug de URL desde nombre
  generateSlug(name) {
    return name.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  },

  // Obtener datos del usuario actual de Firestore
  async getUserData(uid) {
    try {
      const doc = await db.collection(this.COLLECTIONS.USERS).doc(uid).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
      return null;
    } catch (err) {
      console.error('Error obteniendo usuario:', err);
      return null;
    }
  },

  // Verificar rol y redirigir según rol
  async checkAuthAndRedirect() {
    return new Promise((resolve) => {
      auth.onAuthStateChanged(async (user) => {
        if (user) {
          const userData = await this.getUserData(user.uid);
          this.currentUser = user;
          this.currentUserData = userData;
          resolve({ user, userData });
        } else {
          resolve({ user: null, userData: null });
        }
      });
    });
  },

  // Comisión de la plataforma (configurable desde admin)
  async getPlatformCommission() {
    try {
      const doc = await db.collection(this.COLLECTIONS.SETTINGS).doc('platform').get();
      if (doc.exists) return doc.data().commission || 0.15;
      return 0.15; // 15% por defecto
    } catch {
      return 0.15;
    }
  }
};

// ═══════════════════════════════════════════════════════
// ESTILOS DINÁMICOS (toast notifications y loading)
// ═══════════════════════════════════════════════════════
const dynamicStyles = document.createElement('style');
dynamicStyles.textContent = `
  #em-toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .em-toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    border-radius: 12px;
    min-width: 280px;
    max-width: 400px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    transform: translateX(120%);
    transition: transform 0.3s ease;
    font-family: 'Poppins', sans-serif;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .em-toast.em-toast-show { transform: translateX(0); }
  .em-toast-success { background: #d4edda; color: #155724; border-left: 4px solid #28a745; }
  .em-toast-error { background: #f8d7da; color: #721c24; border-left: 4px solid #dc3545; }
  .em-toast-info { background: #d1ecf1; color: #0c5460; border-left: 4px solid #17a2b8; }
  .em-toast-warning { background: #fff3cd; color: #856404; border-left: 4px solid #ffc107; }
  .em-toast-icon { font-size: 1.1rem; font-weight: bold; }
  #em-loading-overlay {
    position: fixed; inset: 0;
    background: rgba(255,255,255,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 9998;
    backdrop-filter: blur(4px);
  }
  .em-loading-box {
    display: flex; flex-direction: column;
    align-items: center; gap: 16px;
    background: white; padding: 40px;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.1);
  }
  .em-loading-box p {
    color: #2D3748; font-family: 'Poppins', sans-serif;
    font-size: 0.95rem; margin: 0;
  }
  .em-spinner {
    width: 48px; height: 48px;
    border: 4px solid #E8F5F2;
    border-top-color: #4CAF9A;
    border-radius: 50%;
    animation: em-spin 0.8s linear infinite;
  }
  @keyframes em-spin { to { transform: rotate(360deg); } }
`;
document.head.appendChild(dynamicStyles);

console.log('✅ Emotion App - Firebase inicializado correctamente');
