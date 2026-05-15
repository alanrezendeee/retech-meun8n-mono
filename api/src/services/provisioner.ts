import { PrismaClient, TenantStatus } from '@prisma/client'
import { createPostgresService, createN8nService, deleteService } from './railway.js'

export async function provisionTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })

  try {
    const dbServiceId = await createPostgresService(tenant.slug)
    const n8nServiceId = await createN8nService(tenant.slug, dbServiceId, tenant.encryptionKey)

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.ACTIVE,
        railwayDbServiceId: dbServiceId,
        railwayServiceId: n8nServiceId,
        provisionError: null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[provisioner] tenant=${tenant.slug} error=${message}`, err)

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.DEPROVISIONED,
        provisionError: message,
      },
    })
    throw err
  }
}

export async function deprovisionTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })

  const deleteOps: Promise<void>[] = []
  if (tenant.railwayServiceId) deleteOps.push(deleteService(tenant.railwayServiceId))
  if (tenant.railwayDbServiceId) deleteOps.push(deleteService(tenant.railwayDbServiceId))
  await Promise.all(deleteOps)

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: TenantStatus.DEPROVISIONED },
  })
}
