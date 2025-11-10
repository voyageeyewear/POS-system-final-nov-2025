require('reflect-metadata');
require('dotenv').config();
const { DataSource } = require('typeorm');

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: true, // Auto-create tables (enabled for initial setup)
  logging: true, // Enable logging to see what's happening
  entities: ['entities/*.js'],
  migrations: ['migrations/*.js'],
  subscribers: [],
});

module.exports = { AppDataSource };

