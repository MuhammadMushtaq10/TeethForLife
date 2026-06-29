import { EntitySchema } from 'typeorm';

const Payment = new EntitySchema({
  name: 'Payment',
  tableName: 'payments',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    invoice_id: {
      type: 'uuid',
    },
    patient_id: {
      type: 'uuid',
    },
    amount: {
      type: 'decimal',
      precision: 10,
      scale: 2,
    },
    payment_method: {
      type: 'varchar',
      length: 20,
    },
    payment_date: {
      type: 'date',
    },
    received_by: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    notes: {
      type: 'text',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    invoice: {
      type: 'many-to-one',
      target: 'Invoice',
      joinColumn: { name: 'invoice_id' },
      inverseSide: 'payments',
    },
    patient: {
      type: 'many-to-one',
      target: 'Patient',
      joinColumn: { name: 'patient_id' },
    },
  },
});

export default Payment;
