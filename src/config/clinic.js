// Central clinic info used by WhatsApp confirmations, reminders and FAQ replies.
//
// ⚠️  ADDRESS / MAPS LINK ARE PLACEHOLDERS.
// CLAUDE.md does not contain a verified Google Maps address, so these default
// to obvious placeholders. Set CLINIC_ADDRESS and CLINIC_MAPS_URL in .env /
// Vercel before going live, or patients will receive the placeholder text.
export const clinic = {
  name: process.env.CLINIC_NAME || 'Teeth for Life Dental Clinic',
  address:
    process.env.CLINIC_ADDRESS ||
    '[SET CLINIC_ADDRESS] — Karachi, Pakistan',
  mapsUrl: process.env.CLINIC_MAPS_URL || '',
  // Mon–Sat 10:00 AM – 8:00 PM, Sunday closed (per Phase 4 spec).
  hours: {
    en: 'Mon–Sat 10:00 AM – 8:00 PM, Sunday Closed',
    ur: 'Peer se Hafta 10 baje se 8 baje tak, Itwaar band',
  },
  phone: process.env.CLINIC_PHONE || '',
};

// Service catalog shown in FAQ (static copy). The live, bookable list still
// comes from the DB via dentalService — this is just the human-readable blurb.
export const FAQ_SERVICES = [
  'Root Canal',
  'Teeth Whitening',
  'Braces',
  'Implants',
  'Scaling & Cleaning',
  'Fillings',
  'Veneers',
  'Extractions',
];
