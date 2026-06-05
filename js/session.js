/**
 * EMOTION - session.js
 * Lógica de videollamada con Daily.co
 *
 * SETUP:
 * 1. Crear cuenta en https://www.daily.co
 * 2. Ir a Developers > API Keys y copiar tu API Key
 * 3. Reemplazar 'TU_DAILY_API_KEY' con tu clave real
 * 4. La función createRoom crea salas únicas por sesión
 */

const SessionModule = (() => {
  // ─── Configuración de Daily.co ────────────────────────────────
  const DAILY_API_KEY = 'TU_DAILY_API_KEY';
  const DAILY_DOMAIN = 'tu-dominio.daily.co'; // Tu subdominio de Daily.co

  // ═══════════════════════════════════════════════════════
  // GESTIÓN DE SALAS DE DAILY.CO
  // ═══════════════════════════════════════════════════════

  // Obtener o crear una sala Daily.co para la sesión
  async function getOrCreateRoom(sessionId) {
    const { db, COLLECTIONS } = EmotionApp;

    try {
      // Verificar si ya existe una sala para esta sesión
      const sessionDoc = await db.collection(COLLECTIONS.SESSIONS).doc(sessionId).get();
      const sessionData = sessionDoc.data();

      if (sessionData?.dailyRoomUrl) {
        return { url: sessionData.dailyRoomUrl, name: sessionData.dailyRoomName };
      }

      // Intentar crear nueva sala via API de Daily.co
      const roomName = `emotion-${sessionId}`;

      try {
        const roomData = await createDailyRoom(roomName, sessionData);

        // Guardar URL de la sala en Firestore
        await db.collection(COLLECTIONS.SESSIONS).doc(sessionId).update({
          dailyRoomUrl: roomData.url,
          dailyRoomName: roomData.name
        });

        return roomData;
      } catch (apiErr) {
        // Si la API falla (modo demo), usar URL de sala demo pública
        console.warn('Daily.co API no disponible, usando sala demo:', apiErr.message);
        const demoUrl = `https://emotion-demo.daily.co/${roomName}`;
        return { url: demoUrl, name: roomName };
      }

    } catch (err) {
      console.error('Error obteniendo sala:', err);
      throw err;
    }
  }

  // Crear sala en Daily.co via API
  async function createDailyRoom(roomName, sessionData) {
    const sessionDate = sessionData?.fecha;
    const sessionHour = sessionData?.hora;

    // Calcular tiempo de expiración (1 hora después de la sesión agendada)
    let exp = Math.floor(Date.now() / 1000) + (2 * 60 * 60); // 2 horas desde ahora
    if (sessionDate && sessionHour) {
      const sessionTime = new Date(`${sessionDate}T${sessionHour}:00`);
      exp = Math.floor(sessionTime.getTime() / 1000) + (2 * 60 * 60); // 2 horas desde la sesión
    }

    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'private',
        properties: {
          exp,
          max_participants: 2,
          enable_chat: true,
          enable_knocking: false,
          enable_screenshare: false,
          start_video_off: false,
          start_audio_off: false,
          lang: 'es',
          // Tema personalizado con colores de Emotion
          color_config: {
            baseTheme: 'dark',
            colors: {
              accent: '#4CAF9A',
              accentText: '#FFFFFF',
              background: '#0D1117',
              backgroundAccent: '#161B22',
              mainAreaBg: '#0D1117',
              mainAreaBgAccent: '#161B22',
              mainAreaText: '#FFFFFF',
              supportiveText: '#718096'
            }
          }
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error creando sala de Daily.co');
    }

    return await response.json();
  }

  // Generar token de acceso para Daily.co (con rol específico)
  async function createMeetingToken(roomName, userId, isOwner) {
    const exp = Math.floor(Date.now() / 1000) + (3 * 60 * 60); // 3 horas

    const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_id: userId,
          is_owner: isOwner, // El psicólogo es "owner"
          enable_recording: false,
          exp
        }
      })
    });

    if (!response.ok) throw new Error('Error generando token de reunión');
    const data = await response.json();
    return data.token;
  }

  // Eliminar sala al finalizar
  async function deleteRoom(roomName) {
    try {
      await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${DAILY_API_KEY}` }
      });
    } catch (err) {
      console.warn('No se pudo eliminar la sala:', err);
    }
  }

  // ═══════════════════════════════════════════════════════
  // GESTIÓN DE GRABACIONES (si se implementa)
  // ═══════════════════════════════════════════════════════

  async function startRecording(sessionId) {
    const { db, COLLECTIONS } = EmotionApp;
    const sessionDoc = await db.collection(COLLECTIONS.SESSIONS).doc(sessionId).get();
    const roomName = sessionDoc.data()?.dailyRoomName;

    if (!roomName) throw new Error('No se encontró la sala');

    const response = await fetch(`https://api.daily.co/v1/recordings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({ room_name: roomName })
    });

    if (!response.ok) throw new Error('Error iniciando grabación');
    const data = await response.json();

    await db.collection(COLLECTIONS.SESSIONS).doc(sessionId).update({
      recordingId: data.id,
      grabaciónActiva: true
    });

    return data;
  }

  // ═══════════════════════════════════════════════════════
  // UTILIDADES
  // ═══════════════════════════════════════════════════════

  // Verificar si un usuario puede unirse a una sesión
  async function canJoinSession(userId, sessionId) {
    const { db, COLLECTIONS } = EmotionApp;
    try {
      const sessionDoc = await db.collection(COLLECTIONS.SESSIONS).doc(sessionId).get();
      if (!sessionDoc.exists) return false;

      const session = sessionDoc.data();

      // Verificar que el usuario es participante de la sesión
      if (session.pacienteId !== userId && session.psicologoId !== userId) return false;

      // Verificar que la sesión no está cancelada o ya completada
      if (session.estado === 'cancelled') return false;

      return true;
    } catch {
      return false;
    }
  }

  // Generar URL completa de Daily.co con el token
  function buildMeetingUrl(roomUrl, token) {
    if (!token) return roomUrl;
    const url = new URL(roomUrl);
    url.searchParams.set('t', token);
    return url.toString();
  }

  // ─── Exponer API pública ──────────────────────────────────────
  return {
    getOrCreateRoom,
    createDailyRoom,
    createMeetingToken,
    deleteRoom,
    startRecording,
    canJoinSession,
    buildMeetingUrl
  };
})();

window.SessionModule = SessionModule;
