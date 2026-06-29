import { EntitySchema } from 'typeorm';

// NUMERIC(10,2) columns (subtotal/discount_amount/total_amount) are returned by
// the pg driver as STRINGS. Always coerce with Number(...) before doing math —
// invoiceService/reportsService do this via a shared helper.
const Invoice = new EntitySchema({
  name: 'Invoice',
  tableName: 'invoices',
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
    invoice_number: {
      type: 'varchar',
      length: 20,
      unique: true,
    },
    subtotal: {
      type: 'decimal',
      precision: 10,
      scale: 2,
    },
    discount_amount: {
      type: 'decimal',
      precision: 10,
      scale: 2,
      default: 0,
    },
    discount_reason: {
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    total_amount: {
      type: 'decimal',
      precision: 10,
      scale: 2,
    },
    status: {
      type: 'varchar',
      length: 20,
      default: 'UNPAID',
    },
    notes: {
      type: 'text',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
    updated_at: {
      type: 'timestamptz',
      updateDate: true,
    },
  },
  relations: {
    patient: {
      type: 'many-to-one',
      target: 'Patient',
      joinColumn: { name: 'patient_id' },
    },
    appointment: {
      type: 'many-to-one',
      target: 'Appointment',
      joinColumn: { name: 'appointment_id' },
    },
    payments: {
      type: 'one-to-many',
      target: 'Payment',
      inverseSide: 'invoice',
    },
  },
});

export default Invoice;
