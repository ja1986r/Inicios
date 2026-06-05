/**
 * EMOTION - patient.js
 * Lógica auxiliar del panel del paciente
 */

const PatientModule = (() => {
  const { db, COLLECTIONS } = EmotionApp;

  // ─── Obtener psicólogo activo del paciente ────────────────────
  async function getActivePsychologist(patientId) {
    try {
      const snap = await db.collection(COLLECTIONS.SESSIONS)
        .where('pacienteId','==',patientId)
        .where('estado','in',['confirmed','pending'])
        .orderBy('fecha','desc').limit(1).get();

      if (snap.empty) return null;
      const session = snap.docs[0].data();
      return EmotionApp.getUserData(session.psicologoId);
    } catch (err) {
      console.error('Error obteniendo psicólogo activo:', err);
      return null;
    }
  }

  // ─── Calcular progreso del paciente ──────────────────────────
  async function getPatientProgress(patientId) {
    try {
      const snap = await db.collection(COLLECTIONS.SESSIONS)
        .where('pacienteId','==',patientId)
        .where('estado','==','completed').get();

      const totalSessions = snap.size;
      const weeks = totalSessions > 0
        ? Math.max(1, Math.floor((new Date() - snap.docs.sort((a,b) =>
            new Date(a.data().fecha) - new Date(b.data().fecha))[0]?.data().fecha
          ) / (7*24*60*60*1000)))
        : 0;

      return { totalSessions, weeks };
    } catch {
      return { totalSessions: 0, weeks: 0 };
    }
  }

  return { getActivePsychologist, getPatientProgress };
})();

window.PatientModule = PatientModule;
