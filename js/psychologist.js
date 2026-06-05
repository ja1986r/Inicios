/**
 * EMOTION - psychologist.js
 * Lógica auxiliar del panel del psicólogo
 */

const PsychologistModule = (() => {
  const { db, COLLECTIONS } = EmotionApp;

  // ─── Obtener pacientes activos del psicólogo ──────────────────
  async function getActivePatients(psychologistId) {
    try {
      const snap = await db.collection(COLLECTIONS.SESSIONS)
        .where('psicologoId','==',psychologistId)
        .where('estado','in',['confirmed','completed']).get();

      const patientIds = [...new Set(snap.docs.map(d => d.data().pacienteId))];
      const patients = await Promise.all(patientIds.map(id => EmotionApp.getUserData(id)));
      return patients.filter(Boolean);
    } catch {
      return [];
    }
  }

  // ─── Trasladar paciente a otro psicólogo ─────────────────────
  async function transferPatient(patientId, fromPsychId, toPsychId) {
    try {
      const snap = await db.collection(COLLECTIONS.SESSIONS)
        .where('pacienteId','==',patientId)
        .where('psicologoId','==',fromPsychId)
        .where('estado','in',['pending','confirmed']).get();

      const batch = db.batch();
      snap.docs.forEach(d => batch.update(d.ref, { psicologoId: toPsychId }));
      await batch.commit();

      EmotionApp.showAlert('Paciente transferido correctamente.', 'success');
      return true;
    } catch (err) {
      EmotionApp.showAlert('Error al transferir el paciente.', 'error');
      return false;
    }
  }

  return { getActivePatients, transferPatient };
})();

window.PsychologistModule = PsychologistModule;
