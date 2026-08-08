import dotenv from 'dotenv';
dotenv.config();
import { User, Role } from './src/models/index.js';
import bcrypt from 'bcrypt';

async function run() {
  try {
    const user = await User.findOne({ where: { email: 'admin@example.com' }, include: Role });
    console.log('User found:', user ? JSON.stringify(user.toJSON(), null, 2) : 'null');
    if (user) {
      console.log('User isActive:', user.isActive);
      const ok = await bcrypt.compare('Admin@123', user.passwordHash);
      console.log('Password comparison for Admin@123:', ok);
    }
  } catch (err) {
    console.error('Error running test login:', err);
  } finally {
    process.exit(0);
  }
}
run();
