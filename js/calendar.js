/**
 * EMOTION - calendar.js
 * Lógica de calendario, disponibilidad y agendamiento de sesiones
 */

const CalendarModule = (() => {
  const { db, COLLECTIONS } = EmotionApp;

  // ═══════════════════════════════════════════════════════
  // WIDGET DE CALENDARIO
  // ═══════════════════════════════════════════════════════
  class CalendarWidget {
    constructor(containerId, options = {}) {
      this.container = document.getElementById(containerId);
      this.options = {
        onDateSelect: options.onDateSelect || (() => {}),
        markedDates: options.markedDates || [],   // Fechas con sesiones
        availableDates: options.availableDates || null, // null = todas disponibles
        minDate: options.minDate || new Date(),
        maxDate: options.maxDate || null,
        mode: options.mode || 'view'  // 'view' o 'availability'
      };
      this.currentDate = new Date();
      this.selectedDate = null;
      this.render();
    }

    render() {
      if (!this.container) return;
      const year = this.currentDate.getFullYear();
      const month = this.currentDate.getMonth();

      const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = new Date();

      let daysHTML = '';
      // Celdas vacías al inicio
      for (let i = 0; i < firstDay; i++) {
        daysHTML += `<button class="em-calendar-day other-month" disabled></button>`;
      }
      // Días del mes
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const date = new Date(year, month, day);
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = this.selectedDate === dateStr;
        const isPast = date < today && !isToday;
        const hasSession = this.options.markedDates.includes(dateStr);
        const isAvailable = !this.options.availableDates || this.options.availableDates.includes(dateStr);

        let classes = 'em-calendar-day';
        if (isToday) classes += ' today';
        if (isSelected) classes += ' selected';
        if (hasSession) classes += ' has-session';
        if (isPast && this.options.mode !== 'availability') classes += ' other-month';

        daysHTML += `
          <button class="${classes}"
            data-date="${dateStr}"
            ${(isPast && this.options.mode !== 'availability') || !isAvailable ? 'disabled' : ''}
            onclick="CalendarModule._handleDayClick(this, '${containerId}')">
            ${day}
          </button>`;
      }

      const containerId = this.container.id;
      this.container.innerHTML = `
        <div class="em-calendar-widget">
          <div class="em-calendar-header">
            <button class="em-calendar-nav-btn" onclick="CalendarModule._changeMonth('${containerId}', -1)">‹</button>
            <div class="em-calendar-month">${monthNames[month]} ${year}</div>
            <button class="em-calendar-nav-btn" onclick="CalendarModule._changeMonth('${containerId}', 1)">›</button>
          </div>
          <div class="em-calendar-grid">
            <div class="em-calendar-days-header">
              ${dayNames.map(d => `<div class="em-calendar-day-name">${d}</div>`).join('')}
            </div>
            <div class="em-calendar-days">${daysHTML}</div>
          </div>
        </div>
      `;

      // Guardar referencia
      CalendarModule._instances = CalendarModule._instances || {};
      CalendarModule._instances[containerId] = this;
    }

    selectDate(dateStr) {
      this.selectedDate = dateStr;
      this.render();
      this.options.onDateSelect(dateStr);
    }

    changeMonth(delta) {
      this.currentDate.setMonth(this.currentDate.getMonth() + delta);
      this.render();
    }

    setMarkedDates(dates) {
      this.options.markedDates = dates;
      this.render();
    }
  }

  function _handleDayClick(btn, containerId) {
    const dateStr = btn.dataset.date;
    const instance = CalendarModule._instances?.[containerId];
    if (instance) instance.selectDate(dateStr);
  }

  function _changeMonth(containerId, delta) {
    const instance = CalendarModule._instances?.[containerId];
    if (instance) instance.changeMonth(delta);
  }

  // ═══════════════════════════════════════════════════════
  // GESTIÓN DE DISPONIBILIDAD DEL PSICÓLOGO
  // ═══════════════════════════════════════════════════════

  // Horarios disponibles por defecto (lunes a viernes 9:00-18:00)
  const DEFAULT_SLOTS = ['09:00','09:30','10:00','10:30','11:00','11:30',
    '12:00','12:30','13:00','13:30','14:00','14:30',
    '15:00','15:30','16:00','16:30','17:00','17:30'];

  // Guardar disponibilidad del psicólogo en Firestore
  async function saveAvailability(psychologistId, availability) {
    try {
      await db.collection(COLLECTIONS.USERS).doc(psychologistId).update({
        availability,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      EmotionApp.showAlert('Disponibilidad actualizada correctamente.', 'success');
    } catch (err) {
      console.error('Error guardando disponibilidad:', err);
      EmotionApp.showAlert('Error al guardar la disponibilidad.', 'error');
    }
  }

  // Obtener slots disponibles para una fecha específica
  async function getAvailableSlots(psychologistId, dateStr) {
    try {
      const [psychDoc, sessionsSnap] = await Promise.all([
        db.collection(COLLECTIONS.USERS).doc(psychologistId).get(),
        db.collection(COLLECTIONS.SESSIONS)
          .where('psicologoId', '==', psychologistId)
          .where('fecha', '==', dateStr)
          .where('estado', 'in', ['pending', 'confirmed'])
          .get()
      ]);

      const psych = psychDoc.data();
      const date = new Date(dateStr + 'T12:00:00');
      const dayOfWeek = date.getDay(); // 0=Dom, 1=Lun...

      // Obtener slots configurados para ese día
      const daySlots = psych?.availability?.[dayOfWeek] || [];
      if (daySlots.length === 0) return [];

      // Quitar los slots ya reservados
      const bookedSlots = sessionsSnap.docs.map(d => d.data().hora);
      return daySlots.filter(slot => !bookedSlots.includes(slot));

    } catch (err) {
      console.error('Error obteniendo slots:', err);
      return DEFAULT_SLOTS;
    }
  }

  // Renderizar selector de slots de tiempo
  function renderTimeSlots(containerId, slots, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (slots.length === 0) {
      container.innerHTML = `
        <div class="em-empty" style="padding:20px">
          <div class="em-empty-icon">📅</div>
          <div class="em-empty-text">No hay horarios disponibles para esta fecha</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="padding:16px">
        <div style="font-size:0.85rem;font-weight:600;color:var(--em-text-light);margin-bottom:12px">
          Selecciona un horario:
        </div>
        <div class="em-time-slots">
          ${slots.map(slot => `
            <button class="em-time-slot" data-time="${slot}"
              onclick="CalendarModule._selectSlot(this, '${containerId}')">
              ${slot}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    container._onSlotSelect = onSelect;
  }

  function _selectSlot(btn, containerId) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.em-time-slot').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    if (container._onSlotSelect) container._onSlotSelect(btn.dataset.time);
  }

  // ═══════════════════════════════════════════════════════
  // AGENDAMIENTO DE SESIÓN
  // ═══════════════════════════════════════════════════════
  async function bookSession(patientId, psychologistId, fecha, hora, precio, moneda) {
    EmotionApp.setLoading(true, 'Procesando tu solicitud...');
    try {
      // Verificar disponibilidad nuevamente
      const slots = await getAvailableSlots(psychologistId, fecha);
      if (!slots.includes(hora)) {
        throw new Error('Este horario ya no está disponible. Por favor elige otro.');
      }

      // Crear la sesión en Firestore
      const sessionRef = await db.collection(COLLECTIONS.SESSIONS).add({
        pacienteId: patientId,
        psicologoId: psychologistId,
        fecha,
        hora,
        duracion: 50, // minutos
        estado: 'pending',
        precio,
        moneda,
        fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
      });

      EmotionApp.setLoading(false);
      return sessionRef.id;
    } catch (err) {
      EmotionApp.setLoading(false);
      EmotionApp.showAlert(err.message || 'Error al agendar la sesión.', 'error');
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // UTILIDADES DE FECHAS
  // ═══════════════════════════════════════════════════════

  // Calcular countdown para una sesión próxima
  function calculateCountdown(fecha, hora) {
    const sessionDate = new Date(`${fecha}T${hora}:00`);
    const now = new Date();
    const diff = sessionDate - now;

    if (diff <= 0) return { dias: 0, horas: 0, minutos: 0, segundos: 0, passed: true };

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diff % (1000 * 60)) / 1000);

    return { dias, horas, minutos, segundos, passed: false };
  }

  // Renderizar countdown y actualizarlo cada segundo
  function renderCountdown(containerId, fecha, hora, onReady) {
    const container = document.getElementById(containerId);
    if (!container) return;

    function update() {
      const ct = calculateCountdown(fecha, hora);
      if (ct.passed) {
        container.innerHTML = `<span class="em-badge em-badge-approved">¡Es hora de tu sesión!</span>`;
        if (onReady) onReady();
        return;
      }
      container.innerHTML = `
        <div class="em-countdown">
          <div class="em-countdown-item">
            <div class="em-countdown-num">${String(ct.dias).padStart(2,'0')}</div>
            <div class="em-countdown-label">días</div>
          </div>
          <div class="em-countdown-sep">:</div>
          <div class="em-countdown-item">
            <div class="em-countdown-num">${String(ct.horas).padStart(2,'0')}</div>
            <div class="em-countdown-label">horas</div>
          </div>
          <div class="em-countdown-sep">:</div>
          <div class="em-countdown-item">
            <div class="em-countdown-num">${String(ct.minutos).padStart(2,'0')}</div>
            <div class="em-countdown-label">min</div>
          </div>
          <div class="em-countdown-sep">:</div>
          <div class="em-countdown-item">
            <div class="em-countdown-num">${String(ct.segundos).padStart(2,'0')}</div>
            <div class="em-countdown-label">seg</div>
          </div>
        </div>
      `;
    }

    update();
    const timer = setInterval(update, 1000);
    return timer; // Para poder cancelarlo
  }

  // Formatear nombre del día
  function getDayName(dateStr) {
    const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const date = new Date(dateStr + 'T12:00:00');
    return days[date.getDay()];
  }

  // ─── Exponer funciones ────────────────────────────────
  return {
    CalendarWidget,
    saveAvailability,
    getAvailableSlots,
    renderTimeSlots,
    bookSession,
    calculateCountdown,
    renderCountdown,
    getDayName,
    DEFAULT_SLOTS,
    _instances: {},
    _handleDayClick,
    _changeMonth,
    _selectSlot
  };
})();

window.CalendarModule = CalendarModule;
