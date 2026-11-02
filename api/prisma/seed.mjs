import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const [email, password, role = 'ADMIN'] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node --env-file=.env prisma/seed.mjs <email> <password> [ROLE]');
  process.exit(1);
}

const prisma = new PrismaClient();
const user = await prisma.user.upsert({
  where: { email },
  update: { password: await bcrypt.hash(password, 10), role },
  create: { email, password: await bcrypt.hash(password, 10), role },
});
console.log('Created/updated:', user.email, user.role);
await prisma.$disconnect();