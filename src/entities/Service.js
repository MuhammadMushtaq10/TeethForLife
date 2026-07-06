import { EntitySchema } from 'typeorm';

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
    // Public URL/path to the service's photo. Left NULL as a placeholder until
    // real images are supplied — the frontend should fall back to a placeholder.
    image_url: {
      type: 'varchar',
      length: 500,
      nullable: true,
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

export default Service;
