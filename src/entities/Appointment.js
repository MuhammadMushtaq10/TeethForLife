import { EntitySchema } from 'typeorm';

const Appointment = new EntitySchema({
  name: 'Appointment',
  tableName: 'appointments',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    patient_id: {
      type: 'uuid',
    },
    service_id: {
      type: 'uuid',
    },
    appointment_date: {
      type: 'date',
    },
    appointment_time: {
      type: 'time',
    },
    status: {
      type: 'enum',
      enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED'],
      default: 'PENDING',
    },
    source: {
      type: 'enum',
      enum: ['ONLINE', 'MANUAL'],
      default: 'ONLINE',
    },
    notes: {
      type: 'text',
      nullable: true,
    },
    showed_up: {
      type: 'boolean',
      default: false,
    },
    reminder_sent_24h: {
      type: 'boolean',
      default: false,
    },
    reminder_sent_2h: {
      type: 'boolean',
      default: false,
    },
    booked_via: {
      type: 'varchar',
      length: 20,
      default: 'website',
    },
    created_at: {
      type: 'timestamp',
      createDate: true,
    },
    updated_at: {
      type: 'timestamp',
      updateDate: true,
    },
  },
  relations: {
    patient: {
      type: 'many-to-one',
      target: 'Patient',
      joinColumn: { name: 'patient_id' },
      inverseSide: 'appointments',
    },
    service: {
      type: 'many-to-one',
      target: 'Service',
      joinColumn: { name: 'service_id' },
      inverseSide: 'appointments',
    },
  },
});

export default Appointment;
