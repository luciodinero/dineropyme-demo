// ---------------------------------------------------------------------------
// Almacén de datos de la DEMO. Ahora vive en Supabase (nube), no solo en el
// navegador: así el negocio ve las mismas citas entre dispositivos y los
// recordatorios/resumen diario funcionan aunque nadie tenga esta página
// abierta (los dispara un Cron Trigger de Supabase, no el navegador).
//
// Por simplicidad seguimos usando una caché local (misma forma que antes)
// para que el resto de la app (panel.js / reservas.js) pueda seguir leyendo
// de forma síncrona. Cada mutación escribe también en Supabase.
// ---------------------------------------------------------------------------
const DPStore = (() => {
  const SUPABASE_URL = 'https://rbknaeoowkosqfyofeqs.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJia25hZW9vd2tvc3FmeW9mZXFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjM1NDUsImV4cCI6MjEwNTI5OTU0NX0.TiofIhv6SuGmDxu_fXjSf5ZyYXwWBV5QHr5_lgNFtGE';
  const BUSINESS_ID = 'd96e7058-85ac-49f4-86cc-0de7f6a59211';
  const D = DPDates;

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let data = { business: null, services: [], appointments: [] };
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  // ---- Autenticación (solo la necesita el panel del negocio) --------------
  // La página pública de reservas nunca inicia sesión: actúa como visitante
  // anónimo, y las políticas de seguridad de la base de datos son las que
  // le impiden leer o tocar los datos de otros clientes.
  async function getSession() {
    const { data: { session } } = await client.auth.getSession();
    return session;
  }
  async function signIn(email, password) {
    const { data: res, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : error.message };
    return { session: res.session };
  }
  async function signOut() {
    await client.auth.signOut();
  }

  function warnOffline(err) {
    console.error('DPStore/Supabase error:', err);
    if (window.DPUI) DPUI.toast('No se pudo conectar con la nube. Revisa tu conexión e inténtalo de nuevo.');
  }

  function hydrateBusinessRow(row) {
    return {
      ...row,
      open_time: (row.open_time || '').slice(0, 5),
      close_time: (row.close_time || '').slice(0, 5),
      digest_time: (row.digest_time || row.open_time || '').slice(0, 5),
    };
  }
  function hydrateApptRow(row) {
    return { ...row, time: (row.time || '').slice(0, 5) };
  }

  async function loadAll() {
    const [bizRes, svcRes, apptRes] = await Promise.all([
      client.from('businesses').select('*').eq('id', BUSINESS_ID).single(),
      client.from('services').select('*').eq('business_id', BUSINESS_ID).order('created_at'),
      client.from('appointments').select('*').eq('business_id', BUSINESS_ID).order('date').order('time'),
    ]);
    if (bizRes.error) warnOffline(bizRes.error);
    if (svcRes.error) warnOffline(svcRes.error);
    if (apptRes.error) warnOffline(apptRes.error);
    data.business = bizRes.data ? hydrateBusinessRow(bizRes.data) : data.business;
    data.services = svcRes.data || [];
    data.appointments = (apptRes.data || []).map(hydrateApptRow);
  }

  (async function init() {
    await client.auth.getSession(); // espera a que se restaure la sesión (si la hay) antes de leer datos
    await loadAll();
    readyResolve();
  })();

  async function resetDemo() {
    const { error: delA } = await client.from('appointments').delete().eq('business_id', BUSINESS_ID);
    if (delA) return warnOffline(delA);
    const { error: delS } = await client.from('services').delete().eq('business_id', BUSINESS_ID);
    if (delS) return warnOffline(delS);

    const seedServices = [
      { business_id: BUSINESS_ID, name: 'Corte de pelo', duration_min: 30, price_eur: 18 },
      { business_id: BUSINESS_ID, name: 'Corte + barba', duration_min: 45, price_eur: 25 },
      { business_id: BUSINESS_ID, name: 'Tinte', duration_min: 90, price_eur: 45 },
      { business_id: BUSINESS_ID, name: 'Peinado especial', duration_min: 60, price_eur: 35 },
    ];
    const { data: newSvcs, error: insS } = await client.from('services').insert(seedServices).select();
    if (insS) return warnOffline(insS);

    const byName = (n) => newSvcs.find((s) => s.name === n).id;
    const today = D.todayISO();
    const seedAppts = [
      { business_id: BUSINESS_ID, service_id: byName('Corte de pelo'), customer_name: 'Marta López (ejemplo)', customer_phone: '611 111 111', date: D.addDays(today, 1), time: '11:00', reminder_offset_minutes: 60 },
      { business_id: BUSINESS_ID, service_id: byName('Tinte'), customer_name: 'Javier Ruiz (ejemplo)', customer_phone: '622 222 222', date: D.addDays(today, 1), time: '16:30', reminder_offset_minutes: 60 },
      { business_id: BUSINESS_ID, service_id: byName('Corte + barba'), customer_name: 'Ana Torres (ejemplo)', customer_phone: '633 333 333', date: D.addDays(today, 2), time: '10:00', reminder_offset_minutes: 1440 },
    ];
    const { error: insA } = await client.from('appointments').insert(seedAppts);
    if (insA) return warnOffline(insA);

    const { error: updB } = await client.from('businesses').update({
      name: 'Salón Raíz',
      tagline: 'Reserva tu cita en 30 segundos. Sin comisiones, sin marketplace.',
      address: 'Calle Ejemplo 12, Madrid',
      phone: '600 000 000',
      open_time: '10:00',
      close_time: '20:00',
      closed_weekday: 0,
      digest_time: '09:00',
      last_digest_sent_date: null,
      online_booking_enabled: true,
    }).eq('id', BUSINESS_ID);
    if (updB) return warnOffline(updB);

    await loadAll();
  }

  // ---- Negocio y servicios --------------------------------------------
  function getBusiness() { return data.business; }
  async function updateBusiness(fields) {
    Object.assign(data.business, fields); // optimista, para que la UI responda al instante
    const { error } = await client.from('businesses').update(fields).eq('id', BUSINESS_ID);
    if (error) { warnOffline(error); await loadAll(); return data.business; }
    return data.business;
  }

  function getServices() { return data.services; }
  function getServiceById(id) { return data.services.find((s) => String(s.id) === String(id)); }

  async function addService({ name, duration_min, price_eur }) {
    const row = { business_id: BUSINESS_ID, name, duration_min: Number(duration_min), price_eur: Number(price_eur) };
    const { data: inserted, error } = await client.from('services').insert(row).select().single();
    if (error) { warnOffline(error); return null; }
    data.services.push(inserted);
    return inserted;
  }
  async function deleteService(id) {
    const inUse = data.appointments.some((a) => String(a.service_id) === String(id) && a.status === 'confirmada');
    if (inUse) return { error: 'Ese servicio tiene citas confirmadas — cancélalas primero o no lo borres.' };
    const { error } = await client.from('services').delete().eq('id', id);
    if (error) { warnOffline(error); return { error: 'No se pudo eliminar. Inténtalo de nuevo.' }; }
    data.services = data.services.filter((s) => String(s.id) !== String(id));
    return { ok: true };
  }

  // ---- Citas -------------------------------------------------------------
  function hydrate(a) {
    const s = getServiceById(a.service_id) || {};
    return { ...a, service_name: s.name, duration_min: s.duration_min, price_eur: s.price_eur };
  }

  function getAppointments(date) {
    return data.appointments
      .filter((a) => !date || a.date === date)
      .map(hydrate)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  function getAppointmentsRaw(date) { return data.appointments.filter((a) => !date || a.date === date); }
  function getAppointmentsInRange(from, to) {
    return data.appointments
      .filter((a) => a.date >= from && a.date <= to)
      .map(hydrate)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  function getAppointmentById(id) {
    const appt = data.appointments.find((a) => String(a.id) === String(id));
    return appt ? hydrate(appt) : null;
  }
  // Consulta huecos ocupados de un día a través de una función pública
  // (get_busy_slots) que NO expone nombre ni teléfono de clientes — así la
  // página de reservas (visitante anónimo) puede saber qué horas están
  // libres sin poder leer la lista de citas de nadie.
  async function fetchBusySlots(date, excludeId) {
    const { data: rows, error } = await client.rpc('get_busy_slots', {
      p_business_id: BUSINESS_ID, p_date: date,
    });
    if (error) { warnOffline(error); return []; }
    return (rows || [])
      .filter((r) => !excludeId || String(r.id) !== String(excludeId))
      .map((r) => ({ time: String(r.start_time).slice(0, 5), duration_min: r.duration_min }));
  }
  async function findConflict(date, time, excludeId) {
    const busy = await fetchBusySlots(date, excludeId);
    return busy.find((b) => b.time === time) || null;
  }
  async function createAppointment({ service_id, customer_name, customer_phone, date, time, reminder_offset_minutes }) {
    const row = {
      business_id: BUSINESS_ID,
      service_id,
      customer_name, customer_phone, date, time,
      status: 'confirmada',
      reminder_offset_minutes: reminder_offset_minutes !== undefined ? Number(reminder_offset_minutes) : 60,
      reminder_sent_at: null,
      reminder_preview: null,
    };
    // Un visitante anónimo (página pública de reservas) puede crear la cita,
    // pero no tiene permiso para releerla después (protege los datos de
    // otros clientes) — así que solo pedimos la fila de vuelta si hay una
    // sesión de dueño/a. Sin sesión, confiamos en que no hubo error.
    const session = await getSession();
    if (session) {
      const { data: inserted, error } = await client.from('appointments').insert(row).select().single();
      if (error) { warnOffline(error); return null; }
      const appt = hydrateApptRow(inserted);
      data.appointments.push(appt);
      return appt;
    }
    const { error } = await client.from('appointments').insert(row);
    if (error) { warnOffline(error); return null; }
    return { ...row, id: null };
  }
  async function rescheduleAppointment(id, { date, time, service_id, reminder_offset_minutes }) {
    const appt = data.appointments.find((a) => String(a.id) === String(id));
    if (!appt) return null;
    const fields = {};
    if (date) fields.date = date;
    if (time) fields.time = time;
    if (service_id) fields.service_id = service_id;
    if (reminder_offset_minutes !== undefined) {
      fields.reminder_offset_minutes = Number(reminder_offset_minutes);
      fields.reminder_sent_at = null;
      fields.reminder_preview = null;
    } else if (date || time) {
      fields.reminder_sent_at = null;
      fields.reminder_preview = null;
    }
    const { error } = await client.from('appointments').update(fields).eq('id', id);
    if (error) { warnOffline(error); await loadAll(); return getAppointmentById(id); }
    Object.assign(appt, fields);
    return appt;
  }
  async function cancelAppointment(id) {
    const appt = data.appointments.find((a) => String(a.id) === String(id));
    if (!appt) return null;
    const { error } = await client.from('appointments').update({ status: 'cancelada' }).eq('id', id);
    if (error) { warnOffline(error); return appt; }
    appt.status = 'cancelada';
    return appt;
  }
  async function markReminderSent(id, sentAt, message) {
    const appt = data.appointments.find((a) => String(a.id) === String(id));
    const { error } = await client.from('appointments').update({ reminder_sent_at: sentAt, reminder_preview: message }).eq('id', id);
    if (error) { warnOffline(error); return; }
    if (appt) { appt.reminder_sent_at = sentAt; appt.reminder_preview = message; }
  }
  async function markDigestSent(dateISO) {
    const { error } = await client.from('businesses').update({ last_digest_sent_date: dateISO }).eq('id', BUSINESS_ID);
    if (error) { warnOffline(error); return; }
    data.business.last_digest_sent_date = dateISO;
  }

  // ---- Disponibilidad ------------------------------------------------------
  // Devuelve huecos libres (HH:mm) para un día/servicio, respetando el
  // horario del negocio y las citas ya confirmadas ese día. Async porque
  // consulta get_busy_slots (ver más arriba) en vez de la caché local, para
  // que también funcione desde la página pública de reservas (sin sesión).
  async function computeAvailability(date, serviceId, excludeId) {
    const biz = getBusiness();
    const svc = getServiceById(serviceId);
    if (!svc || !biz) return [];
    if (D.weekdayOf(date) === biz.closed_weekday) return [];

    const dayAppts = await fetchBusySlots(date, excludeId);
    const busy = dayAppts.map((a) => {
      const start = D.timeToMinutes(a.time);
      return { start, end: start + (a.duration_min || 0) };
    });

    const slots = [];
    const openMin = D.timeToMinutes(biz.open_time);
    const closeMin = D.timeToMinutes(biz.close_time);
    const step = 15;
    const isToday = date === D.todayISO();
    const nowMin = isToday ? D.timeToMinutes(D.nowHHMM()) : -1;

    for (let cursor = openMin; cursor + svc.duration_min <= closeMin; cursor += step) {
      const slotEnd = cursor + svc.duration_min;
      const overlaps = busy.some((b) => cursor < b.end && slotEnd > b.start);
      const isPast = isToday && cursor < nowMin;
      if (!overlaps && !isPast) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, '0');
        const mm = String(cursor % 60).padStart(2, '0');
        slots.push(`${hh}:${mm}`);
      }
    }
    return slots;
  }

  // ---- Recordatorios y resumen diario (simulados) --------------------------
  // El envío real ya no depende de esta página: lo dispara un Cron Trigger de
  // Supabase cada 5 minutos, funcione o no el navegador. Estos botones de
  // "ahora mismo" siguen aquí solo para que la dueña pueda forzar un envío
  // (simulado) al instante, y guardan el resultado en la nube para que el
  // motor automático no lo repita.
  function buildReminderMessage({ businessName, customerName, serviceName, date, time }) {
    return (
      `Hola ${customerName} 👋, te escribimos de ${businessName} para recordarte tu cita:\n\n` +
      `📅 ${D.fmtDateLong(date)} a las ${time}\n💈 ${serviceName}\n\n` +
      `Si no puedes venir, responde a este mensaje para cambiarla. ¡Te esperamos!`
    );
  }
  function buildDailyDigestMessage({ businessName, appointments }) {
    const dateLabel = D.fmtDateLong(D.todayISO());
    if (!appointments.length) return `Buenos días 👋 Hoy (${dateLabel}) no tienes citas en ${businessName}.`;
    const lines = appointments.map((a) => `• ${a.time} — ${a.customer_name} (${a.service_name})`).join('\n');
    return (
      `Buenos días 👋 Estas son las citas de hoy (${dateLabel}) en ${businessName}:\n\n${lines}\n\n` +
      `Total: ${appointments.length} cita${appointments.length === 1 ? '' : 's'}.`
    );
  }
  function simulateSend(message) {
    return { simulated: true, sentAt: new Date().toISOString(), message };
  }

  async function sendReminderNow(apptId) {
    const appt = getAppointmentById(apptId);
    if (!appt) return null;
    const biz = getBusiness();
    const message = buildReminderMessage({
      businessName: biz.name, customerName: appt.customer_name,
      serviceName: appt.service_name, date: appt.date, time: appt.time,
    });
    const result = simulateSend(message);
    await markReminderSent(appt.id, result.sentAt, message);
    return message;
  }

  function previewDigest() {
    const biz = getBusiness();
    const today = D.todayISO();
    const todays = getAppointmentsInRange(today, today).filter((a) => a.status === 'confirmada');
    return {
      message: buildDailyDigestMessage({ businessName: biz.name, appointments: todays }),
      already_sent_today: biz.last_digest_sent_date === today,
    };
  }
  async function sendDigestNow() {
    const biz = getBusiness();
    const today = D.todayISO();
    const todays = getAppointmentsInRange(today, today).filter((a) => a.status === 'confirmada');
    const message = buildDailyDigestMessage({ businessName: biz.name, appointments: todays });
    simulateSend(message);
    await markDigestSent(today);
    return message;
  }

  return {
    ready,
    getSession, signIn, signOut,
    getBusiness, updateBusiness,
    getServices, getServiceById, addService, deleteService,
    getAppointments, getAppointmentsRaw, getAppointmentsInRange, getAppointmentById,
    findConflict, createAppointment, rescheduleAppointment, cancelAppointment,
    computeAvailability,
    sendReminderNow, previewDigest, sendDigestNow,
    resetDemo, refresh: loadAll,
  };
})();
