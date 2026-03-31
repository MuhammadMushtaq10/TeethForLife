import { availabilityQuerySchema } from '../validators/schemas.js';
import * as availabilityService from '../services/availabilityService.js';

async function getAvailability(req, res) {
  try {
    const result = availabilityQuerySchema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    const slots = await availabilityService.getAvailableSlots(result.data.date);
    res.json(slots);
  } catch (err) {
    console.error('Error fetching availability:', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
}

export { getAvailability };
