const { Router } = require('express');
const { AppDataSource } = require('../db/index');
const { Appointment } = require('../db/schema');
const { In } = require('typeorm');
const { z } = require('zod');

const router = Router();

// GET /api/availability?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
    });

    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    const { date } = result.data;
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    // Return empty array for Sundays
    if (dateObj.getDay() === 0) {
      return res.json([]);
    }

    // Generate 30-min slots from 09:00 to 18:30
    const slots = [];
    for (let h = 9; h < 19; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (h < 18 || h === 18) {
        slots.push(`${String(h).padStart(2, '0')}:30`);
      }
    }
    // Remove 19:00 — last slot is 18:30
    const validSlots = slots.filter(s => {
      const [hh] = s.split(':').map(Number);
      return hh < 19;
    });

    // Get booked appointment times for this date
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const booked = await appointmentRepo.find({
      where: {
        appointment_date: date,
        status: In(['PENDING', 'CONFIRMED']),
      },
      select: ['appointment_time'],
    });

    const bookedTimes = new Set(
      booked.map(a => {
        const t = a.appointment_time;
        return typeof t === 'string' ? t.substring(0, 5) : t;
      })
    );

    const available = validSlots.filter(s => !bookedTimes.has(s));
    res.json(available);
  } catch (err) {
    console.error('Error fetching availability:', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

module.exports = router;
