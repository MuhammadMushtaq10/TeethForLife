import { EntitySchema } from 'typeorm';

const Treatment = new EntitySchema({
  name: 'Treatment',
  tableName: 'treatments',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    appointment_id: {
      type: 'uuid',
      nullable: true,
    },
    patient_id: {
      type: 'uuid',
    },
    service_id: {
      type: 'uuid',
      nullable: true,
    },
    treatment_date: {
      type: 'date',
    },
    tooth_numbers: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    diagnosis: {
      type: 'text',
      nullable: true,
    },
    treatment_notes: {
      type: 'text',
      nullable: true,
    },
    next_visit_notes: {
      type: 'text',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    patient: {
      type: 'many-to-one',
      target: 'Patient',
      joinColumn: { name: 'patient_id' },
    },
    service: {
      type: 'many-to-one',
      target: 'Service',
      joinColumn: { name: 'service_id' },
    },
    appointment: {
      type: 'many-to-one',
      target: 'Appointment',
      joinColumn: { name: 'appointment_id' },
    },
  },
});

export default Treatment;
