const { PrismaClient, UserRole, SequenceType } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const db = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("admin1234", 10);

  await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      displayName: "Administrateur",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      isActive: true
    }
  });

  const categories = ["Monture", "Verre", "Lentille", "Accessoire"];
  for (const name of categories) {
    await db.productCategory.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  for (const type of Object.values(SequenceType)) {
    await db.sequence.upsert({
      where: { type },
      update: {},
      create: { type, currentValue: 0 }
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });