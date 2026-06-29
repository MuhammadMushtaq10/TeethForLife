import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, resetDb, closeDb, makePatient, makeAppointment, firstService } from './helpers.mjs';
import * as treatmentService from '../src/services/treatmentService.js';

before(initDb);
after(closeDb);
beforeEach(resetDb);

describe('treatmentService', () => {
  test('createTreatment persists fields', async () => {
    const p = await makePatient();
    const t = await treatmentService.createTreatment({
      patient_id: p.id,
      treatment_date: '2026-06-20',
      tooth_numbers: '14, 15',
      diagnosis: 'Caries',
      treatment_notes: 'Filling done',
    });
    assert.ok(t.id);
    assert.equal(t.tooth_numbers, '14, 15');
    assert.equal(t.diagnosis, 'Caries');
  });

  test('getById joins the service name', async () => {
    const svc = await firstService();
    const p = await makePatient();
    const created = await treatmentService.createTreatment({ patient_id: p.id, service_id: svc.id, treatment_date: '2026-06-20' });
    const got = await treatmentService.getById(created.id);
    assert.equal(got.service_name, svc.name);
  });

  test('getPatientTreatmentHistory returns newest first', async () => {
    const p = await makePatient();
    await treatmentService.createTreatment({ patient_id: p.id, treatment_date: '2026-06-01', diagnosis: 'old' });
    await treatmentService.createTreatment({ patient_id: p.id, treatment_date: '2026-06-20', diagnosis: 'new' });
    const history = await treatmentService.getPatientTreatmentHistory(p.id);
    assert.equal(history.length, 2);
    assert.equal(history[0].diagnosis, 'new'); // DESC by treatment_date
  });

  test('updateTreatment changes fields; unknown id -> null', async () => {
    const p = await makePatient();
    const t = await treatmentService.createTreatment({ patient_id: p.id, treatment_date: '2026-06-20', diagnosis: 'A' });
    const updated = await treatmentService.updateTreatment(t.id, { diagnosis: 'B' });
    assert.equal(updated.diagnosis, 'B');
    assert.equal(await treatmentService.updateTreatment('11111111-1111-1111-1111-111111111111', { diagnosis: 'C' }), null);
  });

  test('getByAppointment scopes to that appointment', async () => {
    const { appt, patient } = await makeAppointment();
    await treatmentService.createTreatment({ patient_id: patient.id, appointment_id: appt.id, treatment_date: '2026-06-20' });
    const list = await treatmentService.getByAppointment(appt.id);
    assert.equal(list.length, 1);
  });
});
