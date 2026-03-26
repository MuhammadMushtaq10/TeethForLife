const { EntitySchema } = require('typeorm');

const Patient = new EntitySchema({
  name: 'Patient',
  tableName: 'patients',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    full_name: {
      type: 'varchar',
      length: 255,
    },
    phone: {
      type: 'varchar',
      length: 20,
      unique: true,
    },
    email: {
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    date_of_birth: {
      type: 'date',
      nullable: true,
    },
    created_at: {
      type: 'timestamp',
      createDate: true,
    },
  },
  relations: {
    appointments: {
      type: 'one-to-many',
      target: 'Appointment',
      inverseSide: 'patient',
    },
    reviews: {
      type: 'one-to-many',
      target: 'Review',
      inverseSide: 'patient',
    },
  },
});

const Service = new EntitySchema({
  name: 'Service',
  tableName: 'services',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    name: {
      type: 'varchar',
      length: 255,
    },
    description: {
      type: 'text',
      nullable: true,
    },
    duration_minutes: {
      type: 'int',
    },
    price_pkr: {
      type: 'int',
    },
    is_active: {
      type: 'boolean',
      default: true,
    },
  },
  relations: {
    appointments: {
      type: 'one-to-many',
      target: 'Appointment',
      inverseSide: 'service',
    },
  },
});

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

const Review = new EntitySchema({
  name: 'Review',
  tableName: 'reviews',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    patient_id: {
      type: 'uuid',
    },
    rating: {
      type: 'int',
    },
    comment: {
      type: 'text',
      nullable: true,
    },
    is_visible: {
      type: 'boolean',
      default: true,
    },
    created_at: {
      type: 'timestamp',
      createDate: true,
    },
  },
  relations: {
    patient: {
      type: 'many-to-one',
      target: 'Patient',
      joinColumn: { name: 'patient_id' },
      inverseSide: 'reviews',
    },
  },
});

module.exports = { Patient, Service, Appointment, Review };
