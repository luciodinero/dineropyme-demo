// Utilidades de fecha sin dependencias externas (para que la demo no
// dependa de ninguna librería cargada desde fuera).
const DPDates = (() => {
  function toISO(d) { return d.toISOString().slice(0, 10); }
  function parseISO(iso) { return new Date(iso + 'T00:00:00'); }
  function addDays(iso, n) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  function addMinutesToTime(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
    const mm = ((total % 60) + 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
  function mondayOf(iso) {
    const d = parseISO(iso);
    const day = d.getDay(); // 0=domingo
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(iso, diff);
  }
  function weekdayOf(iso) { return parseISO(iso).getDay(); }
  const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function fmtDayLabel(iso) {
    const d = parseISO(iso);
    return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}`;
  }
  function todayISO() { return toISO(new Date()); }
  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function fmtDateLong(iso) {
    const d = parseISO(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return { toISO, parseISO, addDays, addMinutesToTime, timeToMinutes, mondayOf, weekdayOf, fmtDayLabel, todayISO, nowHHMM, fmtDateLong };
})();
