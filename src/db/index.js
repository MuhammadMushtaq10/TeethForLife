import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Patient from '../entities/Patient.js';
import Service from '../entities/Service.js';
import Appointment from '../entities/Appointment.js';
import Review from '../entities/Review.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isLambda = !!process.env.DATABASE_URL;

const AppDataSource = new DataSource({
  type: 'postgres',
  url: isLambda ? process.env.DATABASE_URL : undefined,
  host: !isLambda ? (process.env.DB_HOST || '127.0.0.1') : undefined,
  port: !isLambda ? parseInt(process.env.DB_PORT || '5432') : undefined,
  username: !isLambda ? (process.env.DB_USERNAME || 'postgres') : undefined,
  password: !isLambda ? (process.env.DB_PASSWORD || undefined) : undefined,
  database: !isLambda ? (process.env.DB_NAME || 'TeethForLife1') : undefined,
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [Patient, Service, Appointment, Review],
  migrations: [__dirname + '/../migrations/*-*.js'],
  ssl: isLambda ? { rejectUnauthorized: false } : false,
  extra: {
    max: 1,
    idleTimeoutMillis: 120000,
    connectionTimeoutMillis: 10000,
  },
});

export { AppDataSource };
