export class AddActiveSlotUniqueIndex1700000000001 {
  name = 'AddActiveSlotUniqueIndex1700000000001';

  async up(queryRunner) {
    // Prevent two *active* appointments (PENDING/CONFIRMED) from occupying the
    // same date+time. Partial index so CANCELLED/NO_SHOW/COMPLETED rows still
    // free the slot for re-booking. This closes the isSlotBooked race window:
    // concurrent bookings that both pass the check will fail at insert time
    // with a unique violation (handled as a 409 in the service layer).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_slot
      ON appointments (appointment_date, appointment_time)
      WHERE status IN ('PENDING', 'CONFIRMED')
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_appointments_active_slot`);
  }
}
