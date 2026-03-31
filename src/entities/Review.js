import { EntitySchema } from 'typeorm';

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

export default Review;
