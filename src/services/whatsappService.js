import twilio from 'twilio';
import { clinic } from '../config/clinic.js';

// ── Twilio client (lazy, graceful no-op) ──────────────────────────────────
// Mirrors emailService: if creds are missing the client stays null and every
// send becomes a logged no-op, so local dev / missing config never crashes the
// booking flow.
let client = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g. 'whatsapp:+14155238886'

// ── Helpers ───────────────────────────────────────────────────────────────

// Normalise any Pakistani phone (DB stores '+92XXXXXXXXXX' or '0XXXXXXXXXX',
// WhatsApp delivers 'whatsapp:+92XXXXXXXXXX') to E.164 '+92XXXXXXXXXX'.
export function toE164(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/^whatsapp:/i, '').replace(/\s+/g, '');
  if (p.startsWith('+92')) return p;
  if (p.startsWith('0') && p.length === 11) return '+92' + p.slice(1);
  if (p.startsWith('92')) return '+' + p;
  return p;
}

// Build the Twilio 'to' address: 'whatsapp:+92XXXXXXXXXX'.
export function toWhatsAppAddress(phone) {
  const e164 = toE164(phone);
  return e164 ? `whatsapp:${e164}` : null;
}

// '13:30:00' | '13:30' -> '1:30 PM'
export function formatTime(time) {
  if (!time) return '';
  const [hStr, mStr] = String(time).split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${period}`;
}

// '2026-06-02' -> 'Tue, 02 Jun 2026' (interpreted as a clinic-local calendar date)
export function formatDate(date) {
  if (!date) return '';
  const raw = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

// Accepts either a TypeORM Appointment entity (with .patient / .service
// relations loaded) or a plain object, and returns the fields the messages
// need. Keeps callers from having to pre-shape the data identically.
function normalize(appointment = {}) {
  const a = appointment;
  return {
    patientName: a.patient?.full_name || a.patientName || a.full_name || 'there',
    phone: a.patient?.phone || a.phone || null,
    serviceName: a.service?.name || a.serviceName || a.service || 'your appointment',
    date: a.appointment_date || a.date || null,
    time: a.appointment_time || a.time || null,
  };
}

// ── Base sender ─────────────────────────────────────────────────────────────
// Wraps client.messages.create. NEVER throws — fire-and-forget safe.
// Returns the message SID on success, or null on failure / not-configured.
export async function sendWhatsAppMessage(to, body) {
  try {
    if (!client || !FROM) {
      console.warn('[whatsapp] not configured (TWILIO_* env missing) — skipping send to', to);
      return null;
    }
    if (!to) {
      console.warn('[whatsapp] missing "to" address — skipping send');
      return null;
    }
    const msg = await client.messages.create({ from: FROM, to, body });
    return msg.sid;
  } catch (err) {
    // Log and swallow: WhatsApp must never break the calling flow.
    console.error('[whatsapp] send failed:', err?.message || err);
    return null;
  }
}

// ── Outbound message builders ───────────────────────────────────────────────

export async function sendBookingConfirmation(appointment) {
  const { patientName, phone, serviceName, date, time } = normalize(appointment);
  const to = toWhatsAppAddress(phone);

  const body =
`✅ *${clinic.name}* — Appointment Booked

Hi ${patientName}!
🦷 Service: ${serviceName}
📅 Date: ${formatDate(date)}
🕐 Time: ${formatTime(time)}
📍 ${clinic.address}${clinic.mapsUrl ? `\n🗺️ ${clinic.mapsUrl}` : ''}

Reply *CONFIRM* to confirm, *CANCEL* to cancel.

────────────
Salam ${patientName}! Aap ka appointment book ho gaya hai.
🦷 Service: ${serviceName}
📅 Tareekh: ${formatDate(date)}
🕐 Waqt: ${formatTime(time)}
Confirm karne ke liye *CONFIRM* likhein, cancel karne ke liye *CANCEL* likhein.`;

  return sendWhatsAppMessage(to, body);
}

export async function sendReminder24h(appointment) {
  const { phone, time } = normalize(appointment);
  const to = toWhatsAppAddress(phone);

  const body =
`⏰ Reminder: Your appointment is *tomorrow* at ${formatTime(time)}.
Reply *CONFIRM* or *CANCEL*.

────────────
Yaad-dehani: Aap ka appointment *kal* ${formatTime(time)} baje hai.
Confirm karne ke liye *CONFIRM*, cancel ke liye *CANCEL* likhein.`;

  return sendWhatsAppMessage(to, body);
}

export async function sendReminder2h(appointment) {
  const { phone, time } = normalize(appointment);
  const to = toWhatsAppAddress(phone);

  const body =
`⏰ Your appointment is in *2 hours* at ${formatTime(time)}. See you soon!

────────────
Aap ka appointment *2 ghante* mein ${formatTime(time)} baje hai. Jald milte hain!`;

  return sendWhatsAppMessage(to, body);
}
