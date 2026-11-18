/** Creates indexes and the default catalogue (also done automatically on server start). */
import mongoose from 'mongoose';
import { connectDb } from '../db';

connectDb()
  .then(async () => {
    console.log('Indexes and default catalogue are in place.');
    await mongoose.disconnect();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
