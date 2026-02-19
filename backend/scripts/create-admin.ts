/**
 * Cria o primeiro usuário admin.
 * Uso: ADMIN_EMAIL=admin@exemplo.com ADMIN_PASSWORD=senha123 npx tsx scripts/create-admin.ts
 * Ou edite .env com ADMIN_EMAIL e ADMIN_PASSWORD antes de rodar.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@radarzone.com";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  if (!email || !password) {
    console.error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "admin", password: await bcrypt.hash(password, 10) },
    });
    console.log("✅ Usuário existente atualizado como admin:", email);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashed,
      name: "Admin",
      role: "admin",
    },
  });
  console.log("✅ Admin criado:", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
