/**
 * Promote an existing account to administrator:
 *   npm run make-admin -w apps/api -- someone@example.com
 * (Alternatively list emails in ADMIN_EMAILS; they become admins on their next login.)
 */
import mongoose from 'mongoose';
import { connectDb } from '../db';
import { User } from '../models';

async function main() {
  const email = (process.argv[2] ?? '').toLowerCase().trim();
  if (!email) throw new Error('Usage: npm run make-admin -w apps/api -- you@example.com');
  await connectDb();
  const user = await User.findOneAndUpdate({ email }, { $set: { role: 'admin' } }, { new: true });
  console.log(user ? `${email} is now an administrator.` : `No account found for ${email}. Register first.`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message ?? e);
  await mongoose.disconnect();
  process.exit(1);
});
