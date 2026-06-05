/**
 * EMOTION - admin.js
 * Lógica auxiliar del panel de administrador
 */

const AdminModule = (() => {
  const { db, COLLECTIONS } = EmotionApp;

  // ═══════════════════════════════════════════════════════
  // EXPORTAR DATOS
  // ═══════════════════════════════════════════════════════

  // Exportar pagos a CSV
  async function exportPaymentsToCSV(startDate, endDate) {
    try {
      let query = db.collection(COLLECTIONS.PAYMENTS).where('estado','==','completed');
      if (startDate) query = query.where('fecha','>=',startDate);
      if (endDate) query = query.where('fecha','<=',endDate);

      const snap = await query.get();
      const rows = [['Fecha','PacienteId','PsicologoId','Monto','Moneda','Comision','MontoPsicologo','PaymentId']];

      snap.docs.forEach(d => {
        const p = d.data();
        const fecha = p.fecha?.toDate ? p.fecha.toDate().toLocaleDateString('es-ES') : '—';
        rows.push([fecha, p.pacienteId, p.psicologoId, p.monto, p.moneda, p.montoComision, p.montoPsicologo, p.stripePaymentId || 'demo']);
      });

      const csv = rows.map(r => r.join(',')).join('\n');
      downloadCSV(csv, 'emotion-pagos.csv');
    } catch (err) {
      EmotionApp.showAlert('Error al exportar los datos.', 'error');
    }
  }

  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }

  // ═══════════════════════════════════════════════════════
  // NOTIFICACIONES
  // ═══════════════════════════════════════════════════════

  // Enviar notificación in-app a un usuario
  async function sendNotification(userId, title, message, type = 'info') {
    try {
      await db.collection('notifications').add({
        userId,
        title,
        message,
        type,
        read: false,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.error('Error enviando notificación:', err);
    }
  }

  // Notificar aprobación al psicólogo
  async function notifyPsychologistApproved(psychologistId) {
    await sendNotification(
      psychologistId,
      '¡Tu perfil fue aprobado! ✅',
      'Ya puedes recibir pacientes en Emotion. Tu perfil es público y visible en la plataforma.',
      'success'
    );
  }

  // Notificar rechazo al psicólogo
  async function notifyPsychologistRejected(psychologistId, reason) {
    await sendNotification(
      psychologistId,
      'Solicitud de registro revisada',
      `Tu solicitud fue revisada por nuestro equipo. ${reason ? 'Motivo: ' + reason : 'Por favor contacta al soporte para más información.'}`,
      'warning'
    );
  }

  // ═══════════════════════════════════════════════════════
  // REPORTES
  // ═══════════════════════════════════════════════════════

  // Generar reporte mensual
  async function generateMonthlyReport(year, month) {
    try {
      const startDate = firebase.firestore.Timestamp.fromDate(new Date(year, month - 1, 1));
      const endDate = firebase.firestore.Timestamp.fromDate(new Date(year, month, 0, 23, 59, 59));

      const [sessionsSnap, paymentsSnap, newPsychsSnap, newPatientsSnap] = await Promise.all([
        db.collection(COLLECTIONS.SESSIONS).where('estado','==','completed').where('fecha','>=',`${year}-${String(month).padStart(2,'0')}-01`).get(),
        db.collection(COLLECTIONS.PAYMENTS).where('fecha','>=',startDate).where('fecha','<=',endDate).get(),
        db.collection(COLLECTIONS.USERS).where('rol','==','psychologist').where('fechaRegistro','>=',startDate).where('fechaRegistro','<=',endDate).get(),
        db.collection(COLLECTIONS.USERS).where('rol','==','patient').where('fechaRegistro','>=',startDate).where('fechaRegistro','<=',endDate).get()
      ]);

      const payments = paymentsSnap.docs.map(d => d.data());
      const totalRevenue = payments.reduce((sum, p) => sum + (p.monto || 0), 0);
      const totalCommission = payments.reduce((sum, p) => sum + (p.montoComision || 0), 0);

      return {
        periodo: `${year}-${String(month).padStart(2,'0')}`,
        sesionesCompletadas: sessionsSnap.size,
        nuevosPsicologos: newPsychsSnap.size,
        nuevosPacientes: newPatientsSnap.size,
        ingresoTotal: totalRevenue,
        comisionPlataforma: totalCommission,
        pagadoAPsicologos: totalRevenue - totalCommission,
        totalTransacciones: payments.length
      };
    } catch (err) {
      console.error('Error generando reporte:', err);
      return null;
    }
  }

  // ─── Exponer API ──────────────────────────────────────────────
  return {
    exportPaymentsToCSV,
    sendNotification,
    notifyPsychologistApproved,
    notifyPsychologistRejected,
    generateMonthlyReport
  };
})();

window.AdminModule = AdminModule;
