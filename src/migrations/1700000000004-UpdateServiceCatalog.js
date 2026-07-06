export class UpdateServiceCatalog1700000000004 {
  name = 'UpdateServiceCatalog1700000000004';

  async up(queryRunner) {
    // 1) Add a placeholder photo column. Real image URLs are supplied later;
    //    the frontend falls back to a placeholder while this is NULL.
    await queryRunner.query(
      `ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)`
    );

    // 2) ADD the services that are missing from the current catalogue — existing
    //    rows are left completely untouched. Prices are placeholders (PKR 0) to be
    //    set later; durations are sensible defaults; image_url stays NULL until a
    //    photo is provided. The anti-join makes this idempotent and guarantees we
    //    never duplicate a service that already exists (by name).
    await queryRunner.query(`
      INSERT INTO services (name, description, duration_minutes, price_pkr, is_active)
      SELECT v.name, v.description, v.duration_minutes, v.price_pkr, true
      FROM (VALUES
        ('Tooth Filling (Upper)', 'Tooth-coloured restorative filling for a decayed or damaged upper tooth.', 45, 0),
        ('Tooth Filling (Lower)', 'Tooth-coloured restorative filling for a decayed or damaged lower tooth.', 45, 0),
        ('Dental Bridges',        'Fixed prosthetic bridge to replace one or more missing teeth.',           60, 0),
        ('Dentures (Acrylic)',    'Removable acrylic dentures to replace missing teeth.',                    60, 0),
        ('Cast Partial Denture',  'Metal-framework removable partial denture for a durable, precise fit.',   60, 0),
        ('Flexible Denture',      'Lightweight, comfortable flexible partial denture with no metal clasps.',  60, 0)
      ) AS v(name, description, duration_minutes, price_pkr)
      WHERE NOT EXISTS (
        SELECT 1 FROM services s WHERE s.name = v.name
      )
    `);
  }

  async down(queryRunner) {
    // Remove only the services this migration added (FKs are ON DELETE SET NULL,
    // so any referencing rows survive but lose the link), then drop the column.
    await queryRunner.query(`
      DELETE FROM services
      WHERE price_pkr = 0 AND name IN (
        'Tooth Filling (Upper)', 'Tooth Filling (Lower)', 'Dental Bridges',
        'Dentures (Acrylic)', 'Cast Partial Denture', 'Flexible Denture'
      )
    `);
    await queryRunner.query(`ALTER TABLE services DROP COLUMN IF EXISTS image_url`);
  }
}
