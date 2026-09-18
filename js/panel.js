// Lógica del panel de gestión — ahora lee/escribe en la nube (Supabase) a
// través de DPStore. El motor de recordatorios/resumen diario ya no corre
// aquí: lo dispara un Cron Trigger de Supabase cada 5 minutos, funcione o no
// esta página. Aquí solo refrescamos la vista periódicamente para reflejarlo.
(function () {
  const D = DPDates;
  let biz = null, svcs = [];
  let currentTab = 'agenda';
  let weekStart = null;
  let selectedDay = null;
  let weekAppointments = [];

  let modalMode = 'new';
  let modalApptId = null;
  let modalSelectedTime = null;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- carga inicial ----------
  function loadBusiness() {
    biz = DPStore.getBusiness();
    svcs = DPStore.getServices();
    document.getElementById('biz-name').textContent = `${biz.name} · Panel de gestión`;
    fillSettingsForm();
    fillServiceSelect();
  }

  function fillSettingsForm() {
    document.getElementById('set-name').value = biz.name;
    document.getElementById('set-address').value = biz.address;
    document.getElementById('set-phone').value = biz.phone;
    document.getElementById('set-open').value = biz.open_time;
    document.getElementById('set-close').value = biz.close_time;
    document.getElementById('set-closed-weekday').value = String(biz.closed_weekday);
    document.getElementById('set-online-booking').checked = !!biz.online_booking_enabled;
    document.getElementById('booking-link-row').style.display = biz.online_booking_enabled ? 'block' : 'none';
  }

  function fillServiceSelect() {
    const sel = document.getElementById('m-service');
    const prev = sel.value;
    sel.innerHTML = svcs.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.duration_min} min · ${s.price_eur}€)</option>`).join('');
    if (prev && svcs.some(s => String(s.id) === prev)) sel.value = prev;
  }

  function renderServiceManageList() {
    const wrap = document.getElementById('service-manage-list');
    if (!svcs.length) {
      wrap.innerHTML = '<p class="footer-note" style="text-align:left">Todavía no hay servicios.</p>';
      return;
    }
    wrap.innerHTML = svcs.map(s => `
      <div class="appt-row">
        <div class="appt-info">
          <strong>${escapeHtml(s.name)}</strong>
          <small>${s.duration_min} min · ${s.price_eur.toFixed(2)} €</small>
        </div>
        <div class="appt-actions">
          <button class="btn-cancel" data-delete-svc="${s.id}">Eliminar</button>
        </div>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-delete-svc]').forEach(btn => {
      btn.addEventListener('click', () => deleteService(btn.dataset.deleteSvc));
    });
  }

  async function deleteService(id) {
    const ok = await DPUI.confirm('¿Eliminar este servicio?', { okText: 'Eliminar', cancelText: 'Cancelar' });
    if (!ok) return;
    const result = await DPStore.deleteService(id);
    if (result && result.error) { await DPUI.info(result.error, { title: 'No se puede eliminar' }); return; }
    loadBusiness();
    renderServiceManageList();
  }

  function initSettingsHandlers() {
    document.getElementById('add-service').addEventListener('click', async () => {
      const name = document.getElementById('new-svc-name').value.trim();
      const duration_min = document.getElementById('new-svc-duration').value;
      const price_eur = document.getElementById('new-svc-price').value;
      if (!name || !duration_min || !price_eur) return DPUI.toast('Rellena nombre, minutos y precio.');
      await DPStore.addService({ name, duration_min, price_eur });
      document.getElementById('new-svc-name').value = '';
      document.getElementById('new-svc-duration').value = '';
      document.getElementById('new-svc-price').value = '';
      loadBusiness();
      renderServiceManageList();
    });

    document.getElementById('save-business').addEventListener('click', async () => {
      const fields = {
        name: document.getElementById('set-name').value.trim(),
        address: document.getElementById('set-address').value.trim(),
        phone: document.getElementById('set-phone').value.trim(),
        open_time: document.getElementById('set-open').value,
        close_time: document.getElementById('set-close').value,
        closed_weekday: Number(document.getElementById('set-closed-weekday').value),
        online_booking_enabled: document.getElementById('set-online-booking').checked,
      };
      await DPStore.updateBusiness(fields);
      loadBusiness();
      loadWeek();
      DPUI.toast('Cambios guardados.');
    });

    document.getElementById('reset-demo-btn').addEventListener('click', async () => {
      const ok = await DPUI.confirm('¿Reiniciar la demo? Se perderán los cambios hechos hasta ahora.', { okText: 'Reiniciar', cancelText: 'Cancelar' });
      if (!ok) return;
      await DPStore.resetDemo();
      loadBusiness();
      loadWeek();
      loadDigestPreview();
      renderServiceManageList();
      DPUI.toast('Demo reiniciada.');
    });
  }

  // ---------- pestañas ----------
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        document.getElementById('tab-agenda').style.display = currentTab === 'agenda' ? 'block' : 'none';
        document.getElementById('tab-settings').style.display = currentTab === 'settings' ? 'block' : 'none';
        if (currentTab === 'settings') renderServiceManageList();
      });
    });
  }

  // ---------- agenda semanal ----------
  function loadWeek() {
    const from = weekStart;
    const to = D.addDays(weekStart, 6);
    weekAppointments = DPStore.getAppointmentsInRange(from, to).filter(a => a.status === 'confirmada');
    renderWeekStrip();
    renderStats();
    renderDayAgenda();
  }

  function renderWeekStrip() {
    const wrap = document.getElementById('week-strip');
    let html = '';
    for (let i = 0; i < 7; i++) {
      const iso = D.addDays(weekStart, i);
      const count = weekAppointments.filter(a => a.date === iso).length;
      const isSelected = iso === selectedDay;
      const isToday = iso === D.todayISO();
      html += `
        <button type="button" class="day-chip ${isSelected ? 'selected' : ''} ${isToday ? 'is-today' : ''}" data-day="${iso}">
          ${D.fmtDayLabel(iso)}
          <span class="day-chip-count">${count}</span>
        </button>`;
    }
    wrap.innerHTML = `
      <button type="button" class="week-nav" id="week-prev">‹</button>
      <div class="week-days">${html}</div>
      <button type="button" class="week-nav" id="week-next">›</button>
    `;
    wrap.querySelectorAll('[data-day]').forEach(btn => {
      btn.addEventListener('click', () => selectDay(btn.dataset.day));
    });
    document.getElementById('week-prev').addEventListener('click', () => shiftWeek(-1));
    document.getElementById('week-next').addEventListener('click', () => shiftWeek(1));
  }

  function shiftWeek(dir) {
    weekStart = D.addDays(weekStart, dir * 7);
    selectedDay = weekStart;
    loadWeek();
  }

  function selectDay(iso) {
    selectedDay = iso;
    renderWeekStrip();
    renderStats();
    renderDayAgenda();
  }

  function renderStats() {
    const isToday = selectedDay === D.todayISO();
    const dayLabel = isToday ? 'hoy' : D.fmtDayLabel(selectedDay);
    document.getElementById('stat-day-count-label').textContent = `Citas ${dayLabel}`;
    document.getElementById('stat-day-revenue-label').textContent = `Ingresos previstos ${dayLabel}`;

    const dayAppts = weekAppointments.filter(a => a.date === selectedDay);
    document.getElementById('stat-day-count').textContent = dayAppts.length;
    const revenue = dayAppts.reduce((sum, a) => sum + (a.price_eur || 0), 0);
    document.getElementById('stat-day-revenue').textContent = revenue.toFixed(2) + ' €';

    const today = D.todayISO();
    const nowHHMM = D.nowHHMM();
    const upcoming = weekAppointments
      .filter(a => a.date > today || (a.date === today && a.time >= nowHHMM))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    document.getElementById('stat-next').textContent = upcoming
      ? `${upcoming.customer_name.split(' (')[0]} · ${D.fmtDayLabel(upcoming.date)} ${upcoming.time}`
      : 'Sin citas próximas';
  }

  const OFFSET_LABELS = { 30: '30 min antes', 60: '1h antes', 360: '6h antes', 1440: '1 día antes' };

  function renderDayAgenda() {
    const wrap = document.getElementById('day-agenda');
    const rows = weekAppointments.filter(a => a.date === selectedDay);
    if (!rows.length) {
      wrap.innerHTML = `<div class="card"><p class="empty-note">Sin citas este día.</p></div>`;
      return;
    }
    wrap.innerHTML = rows.map(a => `
      <div class="appt-row">
        <div class="appt-time">${a.time}</div>
        <div class="appt-info">
          <strong>${escapeHtml(a.customer_name)}</strong> — ${escapeHtml(a.service_name || '')}
          ${a.reminder_sent_at
            ? '<span class="badge-sent">Recordatorio enviado ✓</span>'
            : `<span class="badge-pending">Recordatorio: ${OFFSET_LABELS[a.reminder_offset_minutes] || '1h antes'}</span>`}
          <small>${escapeHtml(a.customer_phone)} · ${a.duration_min} min · ${(a.price_eur || 0).toFixed(2)} €</small>
        </div>
        <div class="appt-actions">
          <button class="btn-remind" data-edit="${a.id}">Editar</button>
          <button class="btn-remind" data-remind="${a.id}">Recordar ahora</button>
          <button class="btn-cancel" data-cancel="${a.id}">Cancelar</button>
        </div>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.edit)));
    wrap.querySelectorAll('[data-remind]').forEach(b => b.addEventListener('click', () => remind(b.dataset.remind)));
    wrap.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => cancelAppt(b.dataset.cancel)));
  }

  // ---------- resumen diario ----------
  function loadDigestPreview() {
    const data = DPStore.previewDigest();
    document.getElementById('digest-preview').textContent = data.message;
    document.getElementById('digest-status').textContent = data.already_sent_today ? 'Ya enviado hoy ✓' : 'Pendiente de enviar hoy';
    document.getElementById('digest-time-input').value = biz.digest_time || biz.open_time;
  }

  function initDigestHandlers() {
    document.getElementById('digest-send-now').addEventListener('click', async () => {
      const message = await DPStore.sendDigestNow();
      loadDigestPreview();
      await DPUI.info(message, { title: 'Resumen simulado enviado' });
    });

    document.getElementById('digest-time-save').addEventListener('click', async () => {
      const digest_time = document.getElementById('digest-time-input').value;
      if (!digest_time) return;
      await DPStore.updateBusiness({ digest_time });
      loadBusiness();
      loadDigestPreview();
      DPUI.toast('Hora guardada.');
    });
  }

  async function remind(id) {
    const message = await DPStore.sendReminderNow(id);
    if (!message) { DPUI.toast('No se encontró la cita.'); return; }
    loadWeek();
    await DPUI.info(message, { title: 'Recordatorio simulado enviado' });
  }

  async function cancelAppt(id) {
    const ok = await DPUI.confirm('¿Cancelar esta cita?', { okText: 'Cancelar cita', cancelText: 'Volver' });
    if (!ok) return;
    await DPStore.cancelAppointment(id);
    loadWeek();
  }

  // ---------- modal nueva cita / editar ----------
  function initModalHandlers() {
    const modalBackdrop = document.getElementById('modal-backdrop');
    document.getElementById('btn-new-appt').addEventListener('click', () => openNewModal());
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-date').addEventListener('change', loadModalSlots);
    document.getElementById('m-service').addEventListener('change', loadModalSlots);

    function closeModal() { modalBackdrop.classList.remove('open'); }

    function openNewModal() {
      modalMode = 'new'; modalApptId = null; modalSelectedTime = null;
      document.getElementById('modal-title').textContent = 'Nueva cita';
      document.getElementById('m-name').value = '';
      document.getElementById('m-phone').value = '';
      document.getElementById('m-date').value = selectedDay || D.todayISO();
      document.getElementById('m-service').selectedIndex = 0;
      document.getElementById('m-reminder-offset').value = '60';
      modalBackdrop.classList.add('open');
      loadModalSlots();
    }

    function openEditModal(id) {
      const appt = weekAppointments.find(a => String(a.id) === String(id)) || DPStore.getAppointmentById(id);
      if (!appt) return;
      modalMode = 'edit'; modalApptId = id; modalSelectedTime = appt.time;
      document.getElementById('modal-title').textContent = 'Editar cita';
      document.getElementById('m-name').value = appt.customer_name;
      document.getElementById('m-phone').value = appt.customer_phone;
      document.getElementById('m-date').value = appt.date;
      document.getElementById('m-service').value = appt.service_id;
      document.getElementById('m-reminder-offset').value = String(appt.reminder_offset_minutes || 60);
      modalBackdrop.classList.add('open');
      loadModalSlots();
    }
    window.__dpOpenEditModal = openEditModal;

    async function loadModalSlots() {
      const date = document.getElementById('m-date').value;
      const service_id = document.getElementById('m-service').value;
      if (!date || !service_id) return;
      const excludeId = modalMode === 'edit' ? modalApptId : undefined;
      const grid0 = document.getElementById('m-slots');
      grid0.innerHTML = '<p class="footer-note">Buscando huecos…</p>';
      let slots = await DPStore.computeAvailability(date, service_id, excludeId);

      if (modalMode === 'edit' && modalSelectedTime && !slots.includes(modalSelectedTime)) {
        slots = [modalSelectedTime, ...slots];
      }

      const grid = document.getElementById('m-slots');
      grid.innerHTML = slots.map(t => `
        <button type="button" class="slot-btn ${t === modalSelectedTime ? 'selected' : ''}" data-t="${t}">${t}</button>
      `).join('') || '<p class="footer-note">No hay huecos ese día.</p>';
      grid.querySelectorAll('.slot-btn').forEach(btn => {
        btn.addEventListener('click', () => pickModalSlot(btn.dataset.t));
      });
    }

    function pickModalSlot(t) {
      modalSelectedTime = t;
      document.querySelectorAll('#m-slots .slot-btn').forEach(b => b.classList.toggle('selected', b.dataset.t === t));
    }

    document.getElementById('m-save').addEventListener('click', async () => {
      const service_id = document.getElementById('m-service').value;
      const date = document.getElementById('m-date').value;
      const customer_name = document.getElementById('m-name').value.trim();
      const customer_phone = document.getElementById('m-phone').value.trim();

      if (!service_id || !date || !modalSelectedTime || !customer_name || !customer_phone) {
        DPUI.toast('Rellena todos los campos y elige una hora.');
        return;
      }

      const reminder_offset_minutes = Number(document.getElementById('m-reminder-offset').value);
      const conflict = await DPStore.findConflict(date, modalSelectedTime, modalMode === 'edit' ? modalApptId : undefined);
      if (conflict) { DPUI.toast('Ese hueco ya está ocupado.'); return; }

      const saveBtn = document.getElementById('m-save');
      saveBtn.disabled = true;
      if (modalMode === 'new') {
        await DPStore.createAppointment({ service_id, customer_name, customer_phone, date, time: modalSelectedTime, reminder_offset_minutes });
      } else {
        await DPStore.rescheduleAppointment(modalApptId, { date, time: modalSelectedTime, service_id, reminder_offset_minutes });
      }
      saveBtn.disabled = false;

      closeModal();
      selectedDay = date;
      if (D.mondayOf(date) !== weekStart) weekStart = D.mondayOf(date);
      loadWeek();
    });
  }

  function openEditModal(id) { window.__dpOpenEditModal(id); }

  // ---------- acceso (login) ----------
  let autoRefreshTimer = null;

  function showLogin() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'block';
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  }

  async function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'block';

    await DPStore.refresh(); // recarga las citas: antes de iniciar sesión no eran visibles
    loadBusiness();
    loadWeek();
    loadDigestPreview();

    // El motor de recordatorios/resumen diario ya corre en la nube (Cron
    // Trigger de Supabase) aunque esta página esté cerrada. Aquí solo
    // refrescamos la vista cada minuto para reflejar lo que haya hecho.
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(async () => {
      await DPStore.refresh();
      loadWeek();
      loadDigestPreview();
    }, 60 * 1000);
  }

  function initAuthHandlers() {
    document.getElementById('login-submit').addEventListener('click', doLogin);
    document.getElementById('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await DPStore.signOut();
      showLogin();
    });

    async function doLogin() {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      errEl.style.display = 'none';
      if (!email || !password) { errEl.textContent = 'Escribe email y contraseña.'; errEl.style.display = 'block'; return; }

      const submitBtn = document.getElementById('login-submit');
      submitBtn.disabled = true;
      const result = await DPStore.signIn(email, password);
      submitBtn.disabled = false;

      if (result.error) { errEl.textContent = result.error; errEl.style.display = 'block'; return; }
      await showApp();
    }
  }

  // ---------- arranque ----------
  document.addEventListener('DOMContentLoaded', async () => {
    weekStart = D.mondayOf(D.todayISO());
    selectedDay = D.todayISO();

    initTabs();
    initSettingsHandlers();
    initDigestHandlers();
    initModalHandlers();
    initAuthHandlers();

    await DPStore.ready;

    const session = await DPStore.getSession();
    if (session) {
      await showApp();
    } else {
      showLogin();
    }
  });

  // Reasignamos la función global usada por renderDayAgenda antes de que
  // initModalHandlers exista (orden de declaración) — openEditModal ya
  // delega en window.__dpOpenEditModal, definido dentro de initModalHandlers.
})();
