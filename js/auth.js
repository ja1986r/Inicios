/**
 * EMOTION - auth.js
 * Módulo de autenticación: login, registro de pacientes y psicólogos
 */

const AuthModule = (() => {
  const { db, auth, storage, COLLECTIONS, ROLES, PSYCHOLOGIST_STATUS, COUNTRIES, SPECIALTIES, CURRENCIES } = EmotionApp;

  // ═══════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════
  async function login(email, password) {
    EmotionApp.setLoading(true, 'Iniciando sesión...');
    try {
      const { user } = await auth.signInWithEmailAndPassword(email, password);
      const userData = await EmotionApp.getUserData(user.uid);

      if (!userData) throw new Error('Usuario no encontrado en la base de datos.');

      EmotionApp.showAlert(`¡Bienvenido/a, ${userData.nombre?.split(' ')[0]}!`, 'success');

      // Redirigir según rol
      setTimeout(() => {
        if (userData.rol === ROLES.ADMIN) {
          window.location.href = 'admin-dashboard.html';
        } else if (userData.rol === ROLES.PSYCHOLOGIST) {
          window.location.href = 'psychologist-dashboard.html';
        } else {
          // Verificar si hay redirect pendiente
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get('redirect');
          const psychologistId = params.get('psychologist');
          if (redirect === 'book' && psychologistId) {
            window.location.href = `patient-dashboard.html?book=${psychologistId}`;
          } else {
            window.location.href = 'patient-dashboard.html';
          }
        }
      }, 800);

    } catch (err) {
      EmotionApp.setLoading(false);
      let msg = 'Error al iniciar sesión.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = 'Email o contraseña incorrectos.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos. Espera unos minutos.';
      } else if (err.code === 'auth/user-disabled') {
        msg = 'Esta cuenta ha sido deshabilitada. Contacta al soporte.';
      } else if (err.message) {
        msg = err.message;
      }
      EmotionApp.showAlert(msg, 'error');
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // REGISTRO DE PACIENTE
  // ═══════════════════════════════════════════════════════
  async function registerPatient(formData) {
    EmotionApp.setLoading(true, 'Creando tu cuenta...');
    try {
      // Validar datos
      validatePatientForm(formData);

      const { user } = await auth.createUserWithEmailAndPassword(formData.email, formData.password);

      // Guardar en Firestore
      await db.collection(COLLECTIONS.USERS).doc(user.uid).set({
        uid: user.uid,
        email: formData.email,
        nombre: formData.nombre,
        pais: formData.pais,
        telefono: formData.telefono,
        fechaNacimiento: formData.fechaNacimiento,
        rol: ROLES.PATIENT,
        fechaRegistro: firebase.firestore.FieldValue.serverTimestamp(),
        activo: true
      });

      // Actualizar perfil de Auth
      await user.updateProfile({ displayName: formData.nombre });

      EmotionApp.showAlert('¡Cuenta creada exitosamente! Bienvenido/a a Emotion 🌱', 'success');
      setTimeout(() => { window.location.href = 'patient-dashboard.html'; }, 1200);

    } catch (err) {
      EmotionApp.setLoading(false);
      let msg = 'Error al crear la cuenta.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Este email ya está registrado. ¿Olvidaste tu contraseña?';
      } else if (err.code === 'auth/weak-password') {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'El formato del email no es válido.';
      } else if (err.message) {
        msg = err.message;
      }
      EmotionApp.showAlert(msg, 'error');
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // REGISTRO DE PSICÓLOGO
  // ═══════════════════════════════════════════════════════
  async function registerPsychologist(formData, photoFile, videoFile) {
    EmotionApp.setLoading(true, 'Creando tu perfil profesional...');
    try {
      validatePsychologistForm(formData);

      const { user } = await auth.createUserWithEmailAndPassword(formData.email, formData.password);
      const uid = user.uid;
      let fotoUrl = null;
      let videoUrl = null;

      // Subir foto de perfil
      if (photoFile) {
        EmotionApp.setLoading(true, 'Subiendo foto de perfil...');
        const photoRef = storage.ref(`psychologists/${uid}/profile-photo`);
        await photoRef.put(photoFile);
        fotoUrl = await photoRef.getDownloadURL();
      }

      // Subir video de presentación
      if (videoFile) {
        EmotionApp.setLoading(true, 'Subiendo video de presentación...');
        const videoRef = storage.ref(`psychologists/${uid}/intro-video`);
        await videoRef.put(videoFile);
        videoUrl = await videoRef.getDownloadURL();
      }

      const slug = EmotionApp.generateSlug(formData.nombre);

      // Guardar en Firestore
      await db.collection(COLLECTIONS.USERS).doc(uid).set({
        uid,
        email: formData.email,
        nombre: formData.nombre,
        pais: formData.pais,
        especialidad: formData.especialidad,
        anosExperiencia: parseInt(formData.anosExperiencia) || 0,
        descripcion: formData.descripcion,
        fotoPerfil: fotoUrl,
        precio: parseFloat(formData.precio) || 0,
        moneda: formData.moneda,
        titulo: formData.titulo,
        numeroColegiatura: formData.numeroColegiatura,
        videoUrl,
        rol: ROLES.PSYCHOLOGIST,
        estado: PSYCHOLOGIST_STATUS.PENDING,
        slug,
        fechaRegistro: firebase.firestore.FieldValue.serverTimestamp(),
        activo: true
      });

      await user.updateProfile({ displayName: formData.nombre });

      EmotionApp.setLoading(false);
      showPendingMessage();

    } catch (err) {
      EmotionApp.setLoading(false);
      let msg = 'Error al registrar tu perfil.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Este email ya está registrado.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (err.message) {
        msg = err.message;
      }
      EmotionApp.showAlert(msg, 'error');
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════
  async function logout() {
    try {
      await auth.signOut();
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  }

  // ═══════════════════════════════════════════════════════
  // RESET DE CONTRASEÑA
  // ═══════════════════════════════════════════════════════
  async function resetPassword(email) {
    try {
      await auth.sendPasswordResetEmail(email);
      EmotionApp.showAlert('Se envió un link de recuperación a tu email.', 'success');
    } catch (err) {
      let msg = 'Error al enviar el email de recuperación.';
      if (err.code === 'auth/user-not-found') msg = 'No existe cuenta con ese email.';
      EmotionApp.showAlert(msg, 'error');
    }
  }

  // ═══════════════════════════════════════════════════════
  // VALIDACIONES
  // ═══════════════════════════════════════════════════════
  function validatePatientForm(data) {
    if (!data.nombre || data.nombre.trim().length < 3) {
      throw new Error('Por favor ingresa tu nombre completo (mínimo 3 caracteres).');
    }
    if (!data.email || !data.email.includes('@')) {
      throw new Error('Por favor ingresa un email válido.');
    }
    if (!data.password || data.password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }
    if (data.password !== data.confirmPassword) {
      throw new Error('Las contraseñas no coinciden.');
    }
    if (!data.pais) {
      throw new Error('Por favor selecciona tu país.');
    }
  }

  function validatePsychologistForm(data) {
    validatePatientForm(data);
    if (!data.especialidad) throw new Error('Por favor selecciona tu especialidad.');
    if (!data.titulo || data.titulo.trim().length < 3) throw new Error('Por favor ingresa tu título profesional.');
    if (!data.numeroColegiatura) throw new Error('Por favor ingresa tu número de colegiatura.');
    if (!data.precio || parseFloat(data.precio) <= 0) throw new Error('Por favor ingresa un precio válido por sesión.');
    if (!data.moneda) throw new Error('Por favor selecciona la moneda de tu tarifa.');
    if (!data.descripcion || data.descripcion.trim().length < 50) {
      throw new Error('La descripción profesional debe tener al menos 50 caracteres.');
    }
  }

  // Mensaje de psicólogo pendiente de aprobación
  function showPendingMessage() {
    const overlay = document.getElementById('em-loading-overlay');
    if (overlay) overlay.style.display = 'none';

    // Limpiar el formulario y mostrar mensaje
    document.querySelector('.em-auth-panel').innerHTML = `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:4rem;margin-bottom:20px">⏳</div>
        <h2 style="color:var(--em-text);margin-bottom:12px">¡Registro exitoso!</h2>
        <p style="color:var(--em-text-light);margin-bottom:20px;line-height:1.6">
          Tu perfil está siendo revisado por nuestro equipo.<br>
          Te notificaremos por email cuando sea aprobado<br>
          (proceso de 24 a 48 horas hábiles).
        </p>
        <div class="em-alert em-alert-info" style="text-align:left;margin-bottom:24px">
          <span>ℹ️</span>
          <div>Recibirás un email a <strong>${auth.currentUser?.email}</strong> con la confirmación.</div>
        </div>
        <a href="index.html" class="em-btn em-btn-primary">Volver al inicio</a>
      </div>
    `;
  }

  // Exponer funciones públicas
  return { login, registerPatient, registerPsychologist, logout, resetPassword };
})();

window.AuthModule = AuthModule;
