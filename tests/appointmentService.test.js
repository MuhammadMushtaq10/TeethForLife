import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, resetDb, closeDb, makeAppointment, AppDataSource } from './helpers.mjs';
import * as appointmentService from '../src/services/appointmentService.js';
import * as invoiceService from '../src/services/invoiceService.js';

before(initDb);
after(closeDb);
beforeEach(resetDb);

describe('deleteAppointment', () => {
  test('deletes an appointment with no linked invoice', async () => {
    const { appt } = await makeAppointment();
    assert.equal(await appointmentService.deleteAppointment(appt.id), true);
    assert.equal(await appointmentService.findById(appt.id), null);
  });

  test('returns null for unknown id', async () => {
    assert.equal(await appointmentService.deleteAppointment('11111111-1111-1111-1111-111111111111'), null);
  });

  test('refuses (throws HAS_INVOICE) when an active invoice is linked and force is not set', async () => {
    const { appt } = await makeAppointment();
    await invoiceService.autoCreateForAppointment(appt.id);
    await assert.rejects(
      () => appointmentService.deleteAppointment(appt.id),
      (e) => e.code === 'HAS_INVOICE' && e.invoiceCount === 1
    );
    assert.notEqual(await appointmentService.findById(appt.id), null);
  });

  test('a CANCELLED invoice does not block the delete', async () => {
    const { appt } = await makeAppointment();
    const inv = await invoiceService.autoCreateForAppointment(appt.id);
    await invoiceService.cancelInvoice(inv.id);
    assert.equal(await appointmentService.deleteAppointment(appt.id), true);
  });

  test('force=true deletes the appointment but keeps the invoice (unlinked)', async () => {
    const { appt } = await makeAppointment();
    const inv = await invoiceService.autoCreateForAppointment(appt.id);
    assert.equal(await appointmentService.deleteAppointment(appt.id, { force: true }), true);
    assert.equal(await appointmentService.findById(appt.id), null);
    // invoice survives with appointment_id set to NULL (ON DELETE SET NULL)
    const [row] = await AppDataSource.query('SELECT appointment_id FROM invoices WHERE id = $1', [inv.id]);
    assert.ok(row);
    assert.equal(row.appointment_id, null);
  });
});
