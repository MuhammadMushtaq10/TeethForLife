import { EntitySchema } from 'typeorm';

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

export default Patient;
