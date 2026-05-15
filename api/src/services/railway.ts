import { GraphQLClient, gql } from 'graphql-request'

const client = new GraphQLClient('https://backboard.railway.app/graphql/v2', {
  headers: {
    Authorization: `Bearer ${process.env.RAILWAY_API_TOKEN}`,
  },
})

const PROJECT_ID = process.env.RAILWAY_PROJECT_ID!
const ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID!
const N8N_IMAGE = process.env.N8N_IMAGE ?? 'n8nio/n8n:2.13.4'
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? 'meun8n.theretech.com.br'

// Naming conventions
const svcName = (slug: string) => `retech-meun8n-${slug}`
const dbName  = (slug: string) => `retech-meun8n-${slug}-db`

export async function createPostgresService(slug: string): Promise<string> {
  const mutation = gql`
    mutation serviceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
      }
    }
  `
  const data = await client.request<{ serviceCreate: { id: string } }>(mutation, {
    input: {
      projectId: PROJECT_ID,
      name: dbName(slug),
      source: { image: 'postgres:16-alpine' },
    },
  })

  const serviceId = data.serviceCreate.id
  const password = generatePassword()

  await setServiceVariables(serviceId, {
    POSTGRES_DB: `n8n_${slug}`,
    POSTGRES_USER: 'n8n',
    POSTGRES_PASSWORD: password,
    PGDATA: '/var/lib/postgresql/data/pgdata',
  })

  await createVolume(serviceId, '/var/lib/postgresql/data')
  await redeployService(serviceId)

  return serviceId
}

export async function createN8nService(
  slug: string,
  dbServiceId: string,
  encryptionKey: string,
): Promise<string> {
  const mutation = gql`
    mutation serviceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
      }
    }
  `
  const data = await client.request<{ serviceCreate: { id: string } }>(mutation, {
    input: {
      projectId: PROJECT_ID,
      name: svcName(slug),
      source: { image: N8N_IMAGE },
    },
  })

  const serviceId = data.serviceCreate.id
  const domain = `${slug}.${BASE_DOMAIN}`

  await setServiceVariables(serviceId, {
    DB_TYPE: 'postgresdb',
    DB_POSTGRESDB_HOST: '${{' + dbName(slug) + '.RAILWAY_PRIVATE_DOMAIN}}',
    DB_POSTGRESDB_PORT: '5432',
    DB_POSTGRESDB_DATABASE: `n8n_${slug}`,
    DB_POSTGRESDB_USER: 'n8n',
    DB_POSTGRESDB_PASSWORD: '${{' + dbName(slug) + '.POSTGRES_PASSWORD}}',
    N8N_HOST: domain,
    N8N_PORT: '5678',
    N8N_PROTOCOL: 'https',
    N8N_EDITOR_BASE_URL: `https://${domain}`,
    WEBHOOK_URL: `https://${domain}/`,
    N8N_ENCRYPTION_KEY: encryptionKey,
    N8N_SECURE_COOKIE: 'true',
    GENERIC_TIMEZONE: 'America/Sao_Paulo',
    TZ: 'America/Sao_Paulo',
    N8N_RUNNERS_ENABLED: 'true',
    N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
  })

  await addCustomDomain(serviceId, domain)
  await createVolume(serviceId, '/home/node/.n8n')
  await redeployService(serviceId)

  return serviceId
}

export async function deleteService(serviceId: string): Promise<void> {
  const mutation = gql`
    mutation serviceDelete($id: String!) {
      serviceDelete(id: $id)
    }
  `
  await client.request(mutation, { id: serviceId })
}

async function setServiceVariables(
  serviceId: string,
  variables: Record<string, string>,
): Promise<void> {
  const mutation = gql`
    mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `
  await client.request(mutation, {
    input: {
      projectId: PROJECT_ID,
      environmentId: ENVIRONMENT_ID,
      serviceId,
      variables,
    },
  })
}

async function createVolume(serviceId: string, mountPath: string): Promise<void> {
  const mutation = gql`
    mutation volumeCreate($input: VolumeCreateInput!) {
      volumeCreate(input: $input) {
        id
      }
    }
  `
  await client.request(mutation, {
    input: {
      projectId: PROJECT_ID,
      environmentId: ENVIRONMENT_ID,
      serviceId,
      mountPath,
    },
  })
}

async function addCustomDomain(serviceId: string, domain: string): Promise<void> {
  const mutation = gql`
    mutation customDomainCreate($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
      }
    }
  `
  await client.request(mutation, {
    input: {
      projectId: PROJECT_ID,
      environmentId: ENVIRONMENT_ID,
      serviceId,
      domain,
    },
  })
}

async function redeployService(serviceId: string): Promise<void> {
  const mutation = gql`
    mutation serviceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `
  await client.request(mutation, { serviceId, environmentId: ENVIRONMENT_ID })
}

function generatePassword(): string {
  return crypto.randomUUID().replace(/-/g, '')
}
