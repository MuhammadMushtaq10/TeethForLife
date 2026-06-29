// Inbound WhatsApp webhook (Twilio).
//
// Handles three things, in priority order:
//   1. Mid-conversation booking/FAQ steps (if the sender has active state)
//   2. Top-level CONFIRM / CANCEL on an existing appointment (no active state)
//   3. First contact / "Hi" / anything else -> Welcome menu (starts a flow)
//
// This is a plain conversational text flow: every prompt is a normal WhatsApp
// message and the patient replies in natural text — a number ("1", "2"), a
// keyword ("book", "faq", "confirm"), or free text (their name, date, etc.).
// No interactive buttons or list pickers; just a friendly back-and-forth that
// works identically on the Twilio sandbox and in production.
//
// Replies are sent via the REST API (sendWhatsAppMessage) and the webhook
// returns an empty TwiML <Response/> 200 — fast, well under Twilio's 5s limit.
import * as appointmentService from '../services/appointmentService.js';
import * as patientService from '../services/patientService.js';
import * as dentalService from '../services/dentalService.js';
import * as availabilityService from '../services/availabilityService.js';
import {
  sendWhatsAppMessage,
  sendBookingConfirmation,
  toE164,
  formatTime,
  formatDate,
} from '../services/whatsappService.js';
import { getState, setState, patchState, clearState, sweep } from '../services/conversationStore.js';
import { clinic, FAQ_SERVICES } from '../config/clinic.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Both stored forms of a Pakistani number, so lookups match regardless of
// whether the patient was first created via website ('0…') or WhatsApp ('+92…').
function phoneVariants(e164) {
  const set = new Set([e164]);
  if (e164.startsWith('+92')) set.add('0' + e164.slice(3));
  if (e164.startsWith('0') && e164.length === 11) set.add('+92' + e164.slice(1));
  return [...set];
}

// Parse a 1-based numeric menu choice; returns 0-based index or -1.
function parseChoice(text, length) {
  const n = parseInt(String(text).trim(), 10);
  if (Number.isInteger(n) && n >= 1 && n <= length) return n - 1;
  return -1;
}

// 'DD/MM/YYYY' (or with '-') -> 'YYYY-MM-DD', or null if malformed.
function parseDate(text) {
  const m = String(text).trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dd = d.padStart(2, '0');
  const mm = mo.padStart(2, '0');
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
  return `${y}-${mm}-${dd}`;
}

// ── Message templates ───────────────────────────────────────────────────────

function welcomeMenu() {
  return (
`🦷 *${clinic.name}*
Hi! Welcome 👋 Aap ka swagat hai!

How can we help you today? Just reply:
📅  *1* — to book an appointment
❓  *2* — to ask a question (FAQs)

Aap number bhej dein ya seedha "book" likhein. 🙂`
  );
}

function faqMenu() {
  return (
`❓ Sure — what would you like to know? Just reply:
🕐  *1* — Clinic hours
📍  *2* — Location
🦷  *3* — Our services
💰  *4* — Pricing
⬅️  *0* — Back to the main menu

Kya jaanna chahenge? Number bhej dein.`
  );
}

function faqAnswer(idx) {
  switch (idx) {
    case 0:
      return `🕐 *Clinic Hours*\n${clinic.hours.en}\n${clinic.hours.ur}`;
    case 1:
      return `📍 *Location*\n${clinic.address}${clinic.mapsUrl ? `\n🗺️ ${clinic.mapsUrl}` : ''}`;
    case 2:
      return `🦷 *Our Services*\n${FAQ_SERVICES.map((s) => `• ${s}`).join('\n')}`;
    case 3:
      return (
`💰 *Pricing*
Please visit our clinic or call us for a personalized quote. Pricing depends on your specific needs.
Qeemat aap ki zaroorat par depend karti hai — tafseel ke liye clinic aayein ya call karein.`
      );
    default:
      return null;
  }
}

// ── Top-level CONFIRM / CANCEL ──────────────────────────────────────────────

async function handleConfirm(e164) {
  const appt = await appointmentService.findLatestByPhone(phoneVariants(e164), ['PENDING']);
  if (!appt) {
    return "🤔 We couldn't find a pending appointment to confirm.\nKoi pending appointment nahi mili. To book, just send *Hi*.";
  }
  try {
    await appointmentService.updateAppointment(appt.id, { status: 'CONFIRMED' });
  } catch (err) {
    console.error('[webhook] confirm failed:', err?.message || err);
    return '⚠️ Sorry, we could not confirm right now. Please try again shortly.';
  }
  return `✅ Confirmed! See you at ${formatTime(appt.appointment_time)} on ${formatDate(appt.appointment_date)}.\nShukriya! Aap ka appointment confirm ho gaya.`;
}

async function handleCancel(e164) {
  const appt = await appointmentService.findLatestByPhone(phoneVariants(e164), ['PENDING', 'CONFIRMED']);
  if (!appt) {
    return "🤔 We couldn't find an appointment to cancel.\nKoi appointment nahi mili jo cancel ho sake.";
  }
  await appointmentService.updateAppointment(appt.id, { status: 'CANCELLED' });
  return 'Your appointment has been cancelled.\nAap ka appointment cancel ho gaya.\nTo rebook call us or visit our website (ya *Hi* bhejein).';
}

// ── Welcome / conversation flow ─────────────────────────────────────────────

function startWelcome(e164) {
  setState(e164, { step: 'welcome', data: {} });
  return welcomeMenu();
}

async function handleConversation(e164, text, state) {
  const lower = text.toLowerCase();

  // Universal escape hatch.
  if (lower === 'menu' || lower === 'hi' || lower === 'hello' || lower === 'start') {
    return startWelcome(e164);
  }

  switch (state.step) {
    // ── Welcome menu ──────────────────────────────────────────────
    case 'welcome': {
      if (lower.includes('book') || text.trim() === '1') {
        patchState(e164, { step: 'book_name', data: {} });
        return '📝 Let\'s book your appointment!\nApna poora naam batayein? (Your full name)';
      }
      if (lower.includes('faq') || text.trim() === '2') {
        patchState(e164, { step: 'faq_menu' });
        return faqMenu();
      }
      return `Sorry, I didn't quite catch that 🙂\n\n${welcomeMenu()}`;
    }

    // ── FAQ menu ──────────────────────────────────────────────────
    case 'faq_menu': {
      if (text.trim() === '0' || lower.includes('back') || lower.includes('menu')) {
        return startWelcome(e164);
      }
      const idx = parseChoice(text, 4);
      const answer = faqAnswer(idx);
      if (!answer) return `Hmm, please pick a number from 1 to 4 🙂\n\n${faqMenu()}`;
      // Answer, then show the Welcome menu again.
      setState(e164, { step: 'welcome', data: {} });
      return `${answer}\n\n────────────\n${welcomeMenu()}`;
    }

    // ── Booking: name ─────────────────────────────────────────────
    case 'book_name': {
      if (text.trim().length < 2) return 'Please enter your full name. Apna poora naam likhein.';
      patchState(e164, { step: 'book_phone', data: { full_name: text.trim() } });
      return `📞 Confirm your phone number.\nReply *YES* to use ${e164}, ya naya number type karein (e.g. 03001234567):`;
    }

    // ── Booking: phone ────────────────────────────────────────────
    case 'book_phone': {
      let phone;
      if (lower === 'yes' || lower === 'y') {
        phone = e164;
      } else {
        const p = toE164(text);
        if (!/^(\+92|0)[0-9]{10}$/.test(p)) {
          return 'That phone number doesn\'t look right. Reply *YES* to use your WhatsApp number, or type a valid Pakistani number (e.g. 03001234567).';
        }
        phone = p;
      }
      patchState(e164, { step: 'book_email', data: { phone } });
      return '📧 Apna email address batayein (optional).\nType *SKIP* to skip / chhodne ke liye *SKIP* likhein.';
    }

    // ── Booking: email ────────────────────────────────────────────
    case 'book_email': {
      let email = '';
      if (!(lower === 'skip' || lower === 'no' || lower === 'n')) {
        if (!EMAIL_RE.test(text.trim())) {
          return 'That email doesn\'t look valid. Type a correct email or *SKIP*.';
        }
        email = text.trim();
      }
      const services = await dentalService.findAllActive();
      patchState(e164, {
        step: 'book_service',
        data: { email, services: services.map((s) => ({ id: s.id, name: s.name })) },
      });
      const list = services.map((s, i) => `*${i + 1}.* ${s.name}`).join('\n');
      return `🦷 Great! Which service would you like? Reply with the number:\n${list}`;
    }

    // ── Booking: service ──────────────────────────────────────────
    case 'book_service': {
      const services = state.data.services || [];
      const idx = parseChoice(text, services.length);
      if (idx < 0) {
        const list = services.map((s, i) => `*${i + 1}.* ${s.name}`).join('\n');
        return `Hmm, that's not on the list — please reply with one of these numbers:\n${list}`;
      }
      const chosen = services[idx];
      patchState(e164, {
        step: 'book_date',
        data: { service_id: chosen.id, service_name: chosen.name },
      });
      return '📅 Kaunsi date prefer karein? (DD/MM/YYYY)\nNote: Sunday closed / Itwaar band.';
    }

    // ── Booking: date ─────────────────────────────────────────────
    case 'book_date': {
      const iso = parseDate(text);
      if (!iso) return 'Please send the date as *DD/MM/YYYY* (e.g. 05/06/2026).';

      const [y, m, d] = iso.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateObj < today) return 'That date is in the past. Koi aane wali date chunein (DD/MM/YYYY).';
      if (dateObj.getDay() === 0) return 'We\'re closed on Sundays. Itwaar band hai — koi aur din chunein (DD/MM/YYYY).';

      const slots = await availabilityService.getAvailableSlots(iso);
      if (!slots.length) {
        return `😔 No slots available on ${formatDate(iso)} (fully booked / closed). Please try another date (DD/MM/YYYY).`;
      }
      patchState(e164, { step: 'book_time', data: { appointment_date: iso, slots } });
      const list = slots.map((s, i) => `*${i + 1}.* ${formatTime(s)}`).join('\n');
      return `🕐 Here are the open times on ${formatDate(iso)} — reply with the number that suits you:\n${list}`;
    }

    // ── Booking: time ─────────────────────────────────────────────
    case 'book_time': {
      const slots = state.data.slots || [];
      const idx = parseChoice(text, slots.length);
      if (idx < 0) {
        const list = slots.map((s, i) => `*${i + 1}.* ${formatTime(s)}`).join('\n');
        return `Hmm, please reply with one of these numbers:\n${list}`;
      }
      const time = slots[idx];
      const next = patchState(e164, { step: 'book_confirm', data: { appointment_time: time } });
      const d = next.data;
      return (
`📋 *Please confirm your booking:*
👤 Name: ${d.full_name}
📞 Phone: ${d.phone}
📧 Email: ${d.email || '—'}
🦷 Service: ${d.service_name}
📅 Date: ${formatDate(d.appointment_date)}
🕐 Time: ${formatTime(d.appointment_time)}

Reply *CONFIRM* to book ✅  or  *CANCEL* to abort ❌`
      );
    }

    // ── Booking: confirm ──────────────────────────────────────────
    case 'book_confirm': {
      if (lower === 'cancel' || text.trim() === '2' || lower === 'no') {
        clearState(e164);
        return 'No problem — booking cancelled. Send *Hi* anytime to start again.';
      }
      if (!(lower === 'confirm' || text.trim() === '1' || lower === 'yes')) {
        return 'Reply *CONFIRM* to book ✅ or *CANCEL* to abort ❌';
      }
      return finalizeBooking(e164, state.data);
    }

    default:
      return startWelcome(e164);
  }
}

async function finalizeBooking(e164, data) {
  // Re-check availability at the last moment (the slot may have been taken
  // while the patient was typing).
  const stillFree = !(await appointmentService.isSlotBooked(data.appointment_date, data.appointment_time));
  if (!stillFree) {
    patchState(e164, { step: 'book_date', data: { slots: null, appointment_time: null } });
    return '😔 That slot was just taken. Please pick another date (DD/MM/YYYY).';
  }

  const patient = await patientService.upsertByPhone({
    full_name: data.full_name,
    phone: data.phone,
    email: data.email || null,
  });

  try {
    const appointment = await appointmentService.createAppointment({
      patient_id: patient.id,
      service_id: data.service_id,
      appointment_date: data.appointment_date,
      appointment_time: data.appointment_time,
      status: 'PENDING',
      source: 'ONLINE',
      booked_via: 'whatsapp',
    });

    clearState(e164);

    // Send the full confirmation details (separate, richer message).
    await sendBookingConfirmation({
      patientName: data.full_name,
      phone: data.phone,
      serviceName: data.service_name,
      date: appointment.appointment_date,
      time: appointment.appointment_time,
    });

    return '🎉 Booked! Check your WhatsApp for confirmation details.\nMubarak ho — aap ka appointment book ho gaya!';
  } catch (err) {
    if (err?.code === 'SLOT_TAKEN') {
      patchState(e164, { step: 'book_date', data: { slots: null, appointment_time: null } });
      return '😔 That slot was just taken. Please pick another date (DD/MM/YYYY).';
    }
    console.error('[webhook] booking failed:', err);
    clearState(e164);
    return '⚠️ Sorry, something went wrong booking your appointment. Please try again or visit our website.';
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

async function route(e164, text) {
  const state = getState(e164);

  // No active flow: top-level CONFIRM / CANCEL operate on existing appointments.
  if (!state) {
    const lower = text.toLowerCase();
    if (lower === 'confirm') return handleConfirm(e164);
    if (lower === 'cancel') return handleCancel(e164);
    return startWelcome(e164);
  }
  // Active flow: the conversation handler owns the input (incl. its own
  // confirm/cancel at the summary step).
  return handleConversation(e164, text, state);
}

// ── Express handler ─────────────────────────────────────────────────────────

export async function handleInbound(req, res) {
  // Always answer Twilio with an empty TwiML 200 (we send replies out-of-band
  // via the REST API). Done in a finally-style guard so a thrown error never
  // leaves Twilio hanging or triggers an aggressive retry storm.
  const respond = () => {
    if (!res.headersSent) res.type('text/xml').status(200).send('<Response></Response>');
  };

  try {
    const from = req.body?.From; // 'whatsapp:+92XXXXXXXXXX'
    const text = (req.body?.Body || '').trim();
    const e164 = toE164(from);

    if (!e164) {
      console.warn('[webhook] inbound without a usable From:', from);
      return respond();
    }

    sweep();
    const reply = await route(e164, text);
    if (reply) {
      await sendWhatsAppMessage(`whatsapp:${e164}`, reply);
    }
    return respond();
  } catch (err) {
    console.error('[webhook] handler error:', err);
    return respond();
  }
}

export default { handleInbound };
