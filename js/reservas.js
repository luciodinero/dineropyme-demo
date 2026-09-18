// Lógica de la página pública de reservas — lee/escribe en la nube
// (Supabase) a través de DPStore, como visitante anónimo (sin iniciar
// sesión). Las políticas de seguridad de la base de datos son las que
// impiden que esta página vea el nombre o teléfono de otros clientes.
(function () {
  const D = DPDates;
  let biz = null, svcs = [];
  let selectedService = null, selectedDate = null, selectedSlot = null;

  async function init() {
    await DPStore.ready;
    biz = DPStore.getBusiness();
    svcs = DPStore.getServices();

    if (!biz) {
      document.getElementById('biz-name').textContent = 'No disponible';
      return;
    }

    document.getElementById('biz-name').textContent = biz.name;
    document.getElementById('biz-tagline').textContent = biz.tagline;
    document.getElementById('biz-meta').textContent = `${biz.address} · ${biz.phone}`;

    if (!biz.online_booking_enabled) {
      document.getElementById('step-disabled').style.display = 'block';
      document.getElementById('step-service').style.display = 'none';
      return;
    }

    const list = document.getElementById('service-list');
    list.innerHTML = svcs.map(s => `
      <button type="button" class="option-btn" data-id="${s.id}">
        ${escapeHtml(s.name)}
        <small>${s.duration_min} min · ${s.price_eur.toFixed(2)} €</small>
      </button>
    `).join('');
    list.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => pickService(btn.dataset.id));
    });

    const dateInput = document.getElementById('date-input');
    const today = D.todayISO();
    dateInput.min = today;
    dateInput.value = today;
    dateInput.addEventListener('change', () => { selectedDate = dateInput.value; loadSlots(); });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function pickService(id) {
    selectedService = id;
    document.querySelectorAll('#service-list .option-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.id === id);
    });
    document.getElementById('step-date').style.display = 'block';
    selectedDate = document.getElementById('date-input').value;
    loadSlots();
  }

  async function loadSlots() {
    if (!selectedService || !selectedDate) return;
    selectedSlot = null;
    updateConfirmButton();
    const grid = document.getElementById('slot-grid');
    const noSlots = document.getElementById('no-slots');
    grid.innerHTML = '<p class="footer-note">Buscando huecos…</p>';
    noSlots.style.display = 'none';
    const slots = await DPStore.computeAvailability(selectedDate, selectedService);
    if (!slots.length) {
      grid.innerHTML = ''; noSlots.style.display = 'block';
      return;
    }
    grid.innerHTML = slots.map(t => `<button type="button" class="slot-btn" data-t="${t}">${t}</button>`).join('');
    grid.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', () => pickSlot(btn.dataset.t));
    });
  }

  function pickSlot(t) {
    selectedSlot = t;
    document.querySelectorAll('.slot-btn').forEach(b => b.classList.toggle('selected', b.dataset.t === t));
    document.getElementById('step-details').style.display = 'block';
    updateConfirmButton();
  }

  function updateConfirmButton() {
    const name = document.getElementById('name-input').value.trim();
    const phone = document.getElementById('phone-input').value.trim();
    document.getElementById('confirm-btn').disabled = !(selectedService && selectedDate && selectedSlot && name && phone);
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    document.getElementById('name-input').addEventListener('input', updateConfirmButton);
    document.getElementById('phone-input').addEventListener('input', updateConfirmButton);

    document.getElementById('confirm-btn').addEventListener('click', async () => {
      const customer_name = document.getElementById('name-input').value.trim();
      const customer_phone = document.getElementById('phone-input').value.trim();
      if (!selectedService || !selectedDate || !selectedSlot || !customer_name || !customer_phone) return;

      const confirmBtn = document.getElementById('confirm-btn');
      confirmBtn.disabled = true;

      const conflict = await DPStore.findConflict(selectedDate, selectedSlot);
      if (conflict) {
        DPUI.toast('Ese hueco ya no está disponible, elige otro.');
        confirmBtn.disabled = false;
        loadSlots();
        return;
      }

      const appt = await DPStore.createAppointment({
        service_id: selectedService, customer_name, customer_phone,
        date: selectedDate, time: selectedSlot,
      });
      if (!appt) { confirmBtn.disabled = false; return; }

      const svc = svcs.find(s => s.id === selectedService);
      document.getElementById('confirm-summary').textContent = `${svc.name} el ${D.fmtDateLong(selectedDate)} a las ${selectedSlot}`;
      ['step-service', 'step-date', 'step-details'].forEach(id => document.getElementById(id).style.display = 'none');
      document.getElementById('step-confirmed').style.display = 'block';
    });

    document.getElementById('book-another-btn').addEventListener('click', () => {
      selectedService = null; selectedDate = null; selectedSlot = null;
      document.getElementById('name-input').value = '';
      document.getElementById('phone-input').value = '';
      document.getElementById('confirm-btn').disabled = true;
      document.getElementById('step-confirmed').style.display = 'none';
      document.getElementById('step-date').style.display = 'none';
      document.getElementById('step-details').style.display = 'none';
      document.getElementById('step-service').style.display = 'block';
      document.querySelectorAll('#service-list .option-btn').forEach(b => b.classList.remove('selected'));
      document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      document.getElementById('step-service').scrollIntoView({ behavior: 'smooth' });
    });
  });
})();
