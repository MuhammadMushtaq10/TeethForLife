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

function sendAppointmentConfirmation({ email, fullName, serviceName, date, time, phone }) {
  if (!transporter || !email) return;

  transporter.sendMail({
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
  }).catch(err => console.error('Email send failed:', err));
}

export { sendAppointmentConfirmation };
