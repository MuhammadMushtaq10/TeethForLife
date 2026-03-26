require('reflect-metadata');
const { DataSource } = require('typeorm');
const { Patient, Service, Appointment, Review } = require('./schema');

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

module.exports = { AppDataSource };
