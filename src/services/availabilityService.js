import { In } from 'typeorm';
import { AppDataSource } from '../db/index.js';
import Appointment from '../entities/Appointment.js';

function generateTimeSlots() {
  const slots = [];
  for (let h = 9; h < 19; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 18 || h === 18) {
      slots.push(`${String(h).padStart(2, '0')}:30`);
    }
  }
  return slots.filter(s => {
    const [hh] = s.split(':').map(Number);
    return hh < 19;
  });
}

async function getAvailableSlots(date) {
  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);

  if (dateObj.getDay() === 0) {
    return [];
  }

  const validSlots = generateTimeSlots();

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

  return validSlots.filter(s => !bookedTimes.has(s));
}

export { getAvailableSlots };
