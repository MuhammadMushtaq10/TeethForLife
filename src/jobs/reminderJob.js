// Vercel Cron handler: sends 24h and 2h WhatsApp appointment reminders.
//
// Invoked by GET /api/cron/reminders (see src/routes/cron.js) every 15 min.
// Idempotent: the reminder_sent_24h / reminder_sent_2h boolean columns guarantee
// each reminder is sent at most once, even if cron double-fires or overlaps.
//
// All time math is done in Asia/Karachi (UTC+5, no DST). Appointments are
// stored as a clinic-local DATE + TIME, so an appointment's true instant is
// `${date}T${time}+05:00`. We compare that against "now" (a UTC instant).
import * as appointmentService from '../services/appointmentService.js';
import {
  sendReminder24h,
  sendReminder2h,
} from '../services/whatsappService.js';

const KARACHI_OFFSET = '+05:00';

// Build the absolute (UTC) instant for a clinic-local appointment.
function appointmentInstant(dateStr, timeStr) {
  const date = String(dateStr).slice(0, 10);              // 'YYYY-MM-DD'
  let time = String(timeStr || '00:00:00');
  if (time.length === 5) time += ':00';                   // 'HH:MM' -> 'HH:MM:SS'
  return new Date(`${date}T${time}${KARACHI_OFFSET}`);
}

async function runReminders(now = new Date()) {
  const candidates = await appointmentService.findRemindable({ fromDate: now, days: 2 });

  let sent24h = 0;
  let sent2h = 0;

  for (const appt of candidates) {
    const instant = appointmentInstant(appt.appointment_date, appt.appointment_time);
    const diffHours = (instant.getTime() - now.getTime()) / 3_600_000;

    // 24h reminder: appointment is within the next 24–25 hours.
    if (!appt.reminder_sent_24h && diffHours >= 24 && diffHours <= 25) {
      await sendReminder24h(appt);
      await appointmentService.markReminderSent(appt.id, 'reminder_sent_24h');
      sent24h++;
      continue; // can't also be in the 2–3h window
    }

    // 2h reminder: appointment is within the next 2–3 hours.
    if (!appt.reminder_sent_2h && diffHours >= 2 && diffHours <= 3) {
      await sendReminder2h(appt);
      await appointmentService.markReminderSent(appt.id, 'reminder_sent_2h');
      sent2h++;
    }
  }

  return { checked: candidates.length, sent24h, sent2h };
}

// Express handler.
export default async function reminderJob(req, res) {
  try {
    const result = await runReminders();
    console.log('[cron] reminders:', result);
    res.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch (err) {
    console.error('[cron] reminder job failed:', err);
    res.status(500).json({ ok: false, error: 'Reminder job failed' });
  }
}

export { runReminders };
