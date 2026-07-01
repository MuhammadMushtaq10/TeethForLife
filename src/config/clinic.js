// Central clinic info used by WhatsApp confirmations, reminders, FAQ replies and
// PDF letterheads (invoices, reports, ledgers). The defaults below are the real
// verified clinic details; env vars still override them per-environment.
export const clinic = {
  name: process.env.CLINIC_NAME || 'Teeth for Life Dental Clinic',
  address:
    process.env.CLINIC_ADDRESS ||
    'Shop # 2, Al Hayat Chamber, Plot # A7 KCHS Block 7, 8C, near Duty Free Shop, off Shahra-e-Faisal, C Area, Karachi, Pakistan',
  mapsUrl: process.env.CLINIC_MAPS_URL || '',
  // Mon–Sat 10:00 AM – 8:00 PM, Sunday closed (per Phase 4 spec).
  hours: {
    en: 'Mon–Sat 10:00 AM – 8:00 PM, Sunday Closed',
    ur: 'Peer se Hafta 10 baje se 8 baje tak, Itwaar band',
  },
  phone: process.env.CLINIC_PHONE || '0315 8565662',
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
