import { Prisma, type PrismaClient } from "@prisma/client";

type DeleteUnitDataResult = {
  companyId: string;
  deletedModels: Record<string, number>;
};

function prismaClientKey(modelName: string) {
  return `${modelName.slice(0, 1).toLowerCase()}${modelName.slice(1)}`;
}

export async function deleteUnitData(
  prisma: PrismaClient,
  companyId: string,
): Promise<DeleteUnitDataResult> {
  const deletedModels: Record<string, number> = {};

  const feedbackDelete = await prisma.feedback.deleteMany({
    where: { checklistTask: { companyId } },
  });
  deletedModels.Feedback = feedbackDelete.count;

  const companyOwnedModels = Prisma.dmmf.datamodel.models
    .filter((model) => model.name !== "Company")
    .filter((model) => model.fields.some((field) => field.name === "companyId"));

  for (const model of companyOwnedModels) {
    const clientKey = prismaClientKey(model.name) as keyof PrismaClient;
    const delegate = prisma[clientKey] as unknown as {
      deleteMany?: (input: { where: { companyId: string } }) => Promise<{ count: number }>;
    };
    if (!delegate?.deleteMany) continue;
    const result = await delegate.deleteMany({ where: { companyId } });
    deletedModels[model.name] = result.count;
  }

  await prisma.company.delete({ where: { id: companyId } });
  deletedModels.Company = 1;

  return { companyId, deletedModels };
}
