import { contactSchema } from '../validators/schemas.js';
import * as emailService from '../services/emailService.js';

async function submitContact(req, res) {
  try {
    const result = contactSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    await emailService.sendContactMessage(result.data);

    res.status(200).json({ message: 'Message sent successfully' });
  } catch (err) {
    console.error('Error submitting contact form:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

export { submitContact };
