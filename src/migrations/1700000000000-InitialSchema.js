class InitialSchema1700000000000 {
  name = 'InitialSchema1700000000000';

  async up(queryRunner) {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE appointment_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE appointment_source AS ENUM ('ONLINE', 'MANUAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(255),
        date_of_birth DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS services (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        duration_minutes INT NOT NULL,
        price_pkr INT NOT NULL,
        is_active BOOLEAN DEFAULT true
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
        service_id UUID REFERENCES services(id) ON DELETE SET NULL,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status appointment_status DEFAULT 'PENDING',
        source appointment_source DEFAULT 'ONLINE',
        notes TEXT,
        showed_up BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        is_visible BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone)`);

    // Seed services
    await queryRunner.query(`
      INSERT INTO services (name, description, duration_minutes, price_pkr) VALUES
        ('General Checkup', 'Comprehensive dental examination including oral cancer screening, gum health assessment, and treatment planning.', 30, 2000),
        ('Teeth Cleaning', 'Professional scaling and polishing to remove plaque, tartar, and surface stains for healthier gums.', 45, 3500),
        ('Teeth Whitening', 'Advanced professional whitening treatment for a brighter, more confident smile.', 60, 8000),
        ('Root Canal', 'Expert root canal therapy to save infected teeth and eliminate pain with precision care.', 90, 15000),
        ('Dental Implant', 'Permanent tooth replacement with titanium implants — the gold standard for missing teeth.', 120, 50000),
        ('Braces Consultation', 'Orthodontic assessment, digital imaging, and personalized braces or aligner treatment plan.', 45, 3000),
        ('Kids Dentistry', 'Gentle pediatric dental care including check-ups, fluoride treatments, and preventive sealants.', 30, 2500),
        ('Tooth Extraction', 'Safe and comfortable simple or surgical tooth extraction with proper aftercare guidance.', 45, 5000)
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS reviews`);
    await queryRunner.query(`DROP TABLE IF EXISTS appointments`);
    await queryRunner.query(`DROP TABLE IF EXISTS services`);
    await queryRunner.query(`DROP TABLE IF EXISTS patients`);
    await queryRunner.query(`DROP TYPE IF EXISTS appointment_source`);
    await queryRunner.query(`DROP TYPE IF EXISTS appointment_status`);
  }
}

module.exports = InitialSchema1700000000000;
