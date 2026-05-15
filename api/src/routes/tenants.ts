import type { FastifyPluginAsync } from 'fastify'
import { TenantStatus } from '@prisma/client'
import { provisionTenant, deprovisionTenant } from '../services/provisioner.js'

interface CreateTenantBody {
  slug: string
  domain?: string
  plan?: string
  n8nOwnerEmail?: string
}

interface UpdateTenantBody {
  plan?: string
  status?: TenantStatus
  n8nOwnerEmail?: string
}

const tenantRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return app.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    })
  })

  app.get<{ Params: { slug: string } }>('/:slug', async (req, reply) => {
    const tenant = await app.prisma.tenant.findUnique({
      where: { slug: req.params.slug },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })
    return tenant
  })

  app.post<{ Body: CreateTenantBody }>('/', async (req, reply) => {
    const { slug, plan = 'starter', n8nOwnerEmail } = req.body
    const domain = req.body.domain ?? `${slug}.${process.env.BASE_DOMAIN ?? 'meun8n.theretech.com.br'}`

    const existing = await app.prisma.tenant.findFirst({
      where: { OR: [{ slug }, { domain }] },
    })
    if (existing) return reply.status(409).send({ error: 'Slug or domain already exists' })

    const encryptionKey = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')

    const tenant = await app.prisma.tenant.create({
      data: { slug, domain, plan, n8nOwnerEmail, encryptionKey },
    })

    // provision async — não bloqueia resposta
    provisionTenant(app.prisma, tenant.id).catch((err) =>
      app.log.error({ err, tenantId: tenant.id }, 'provisioning failed'),
    )

    return reply.status(202).send(tenant)
  })

  app.patch<{ Params: { slug: string }; Body: UpdateTenantBody }>('/:slug', async (req, reply) => {
    const tenant = await app.prisma.tenant.findUnique({
      where: { slug: req.params.slug },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    return app.prisma.tenant.update({
      where: { slug: req.params.slug },
      data: req.body,
    })
  })

  app.delete<{ Params: { slug: string } }>('/:slug', async (req, reply) => {
    const tenant = await app.prisma.tenant.findUnique({
      where: { slug: req.params.slug },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    await deprovisionTenant(app.prisma, tenant.id)
    return reply.status(204).send()
  })
}

export default tenantRoutes
