import mongoose from 'mongoose';
import { config } from './config';
import { allModels } from './models';
import { seedCatalog } from './scripts/seedCatalog';

export async function connectDb(uri = config.mongoUri): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000, maxPoolSize: 20 });
  await Promise.all(allModels.map((m) => m.init())); // build indexes / unique constraints
  await seedCatalog(); // idempotent: inserts missing default skills, roles, interests
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
