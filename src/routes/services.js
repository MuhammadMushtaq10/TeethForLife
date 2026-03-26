const { Router } = require('express');
const { AppDataSource } = require('../db/index');
const { Service } = require('../db/schema');

const router = Router();

// GET /api/services — list active services
router.get('/', async (req, res) => {
  try {
    const serviceRepo = AppDataSource.getRepository(Service);
    const services = await serviceRepo.find({
      where: { is_active: true },
      order: { name: 'ASC' },
    });
    res.json(services);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

module.exports = router;
