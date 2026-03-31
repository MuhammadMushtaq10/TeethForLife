import * as dentalService from '../services/dentalService.js';

async function listServices(req, res) {
  try {
    const services = await dentalService.findAllActive();
    res.json(services);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
}

export { listServices };
