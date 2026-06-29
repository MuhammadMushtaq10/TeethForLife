import { treatmentCreateSchema, treatmentUpdateSchema } from '../validators/schemas.js';
import * as treatmentService from '../services/treatmentService.js';

async function createTreatment(req, res) {
  try {
    const result = treatmentCreateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const treatment = await treatmentService.createTreatment(result.data);
    res.status(201).json({ message: 'Treatment recorded', treatment });
  } catch (err) {
    if (err?.code === '23503') {
      return res.status(400).json({ error: 'Invalid patient, appointment or service reference' });
    }
    console.error('Create treatment error:', err);
    res.status(500).json({ error: 'Failed to record treatment' });
  }
}

async function getTreatment(req, res) {
  try {
    const treatment = await treatmentService.getById(req.params.id);
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
    res.json(treatment);
  } catch (err) {
    console.error('Get treatment error:', err);
    res.status(500).json({ error: 'Failed to fetch treatment' });
  }
}

async function updateTreatment(req, res) {
  try {
    const result = treatmentUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const updated = await treatmentService.updateTreatment(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Treatment not found' });
    res.json({ message: 'Treatment updated', treatment: updated });
  } catch (err) {
    console.error('Update treatment error:', err);
    res.status(500).json({ error: 'Failed to update treatment' });
  }
}

async function getPatientTreatments(req, res) {
  try {
    const treatments = await treatmentService.getPatientTreatmentHistory(req.params.id);
    res.json(treatments);
  } catch (err) {
    console.error('Patient treatment history error:', err);
    res.status(500).json({ error: 'Failed to fetch treatment history' });
  }
}

export { createTreatment, getTreatment, updateTreatment, getPatientTreatments };
