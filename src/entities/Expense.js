import { EntitySchema } from 'typeorm';

const Expense = new EntitySchema({
  name: 'Expense',
  tableName: 'expenses',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    expense_date: {
      type: 'date',
    },
    category: {
      type: 'varchar',
      length: 50,
    },
    description: {
      type: 'text',
    },
    amount: {
      type: 'decimal',
      precision: 10,
      scale: 2,
    },
    vendor: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    receipt_number: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
});

export default Expense;
