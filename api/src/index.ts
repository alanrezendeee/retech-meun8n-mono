import Fastify from 'fastify'
import cors from '@fastify/cors'
import prismaPlugin from './plugins/prisma.js'
import healthRoutes from './routes/health.js'
import tenantRoutes from './routes/tenants.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: process.env.CORS_ORIGIN ?? false })
await app.register(prismaPlugin)
await app.register(healthRoutes)
await app.register(tenantRoutes, { prefix: '/tenants' })

try {
  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
