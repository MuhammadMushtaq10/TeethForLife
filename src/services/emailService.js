import nodemailer from 'nodemailer';

let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendAppointmentConfirmation({ email, fullName, serviceName, date, time, phone }) {
  if (!transporter || !email) return;

  // Must be awaited by the caller — on serverless (Vercel), the function instance
  // is frozen right after the response, so fire-and-forget mail never completes.
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Appointment Confirmation — Teeth For Life',
    html: `
      <h2>Appointment Confirmed!</h2>
      <p>Dear ${fullName},</p>
      <p>Your appointment has been booked:</p>
      <ul>
        <li><strong>Service:</strong> ${serviceName}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Time:</strong> ${time}</li>
      </ul>
      <p>We'll confirm via WhatsApp at ${phone} within 1 hour.</p>
      <p>— Teeth For Life Dental Clinic</p>
    `,
  });
}

async function sendContactMessage({ name, email, phone, subject, message }) {
  if (!transporter) {
    throw new Error('Email is not configured (SMTP env vars missing)');
  }

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.CONTACT_TO || process.env.SMTP_USER,
    replyTo: email,
    subject: `Contact Form: ${subject}`,
    html: `
      <h2>New Contact Message — Teeth For Life</h2>
      <ul>
        <li><strong>Name:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Phone:</strong> ${phone || '—'}</li>
        <li><strong>Subject:</strong> ${subject}</li>
      </ul>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    `,
  });
}

export { sendAppointmentConfirmation, sendContactMessage };
