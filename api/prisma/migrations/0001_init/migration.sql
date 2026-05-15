CREATE TYPE "TenantStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DEPROVISIONED');

CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "status" "TenantStatus" NOT NULL DEFAULT 'PROVISIONING',
    "encryptionKey" TEXT NOT NULL,
    "railwayServiceId" TEXT,
    "railwayDbServiceId" TEXT,
    "n8nOwnerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");
