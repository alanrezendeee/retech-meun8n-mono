#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# provision-client.sh
# Cria o database de um cliente no Postgres compartilhado (Railway).
#
# Uso:
#   ./scripts/provision-client.sh <slug-cliente>
#
# Exemplos:
#   ./scripts/provision-client.sh brbit
#   ./scripts/provision-client.sh retech
#
# Requer psql instalado e as variáveis abaixo exportadas (ou preenchidas):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD
# ---------------------------------------------------------------------------

SLUG="${1:-}"

if [[ -z "$SLUG" ]]; then
  echo "Uso: $0 <slug-cliente>"
  echo "Exemplo: $0 brbit"
  exit 1
fi

DB_NAME="n8n_${SLUG}"

# Lê credenciais do ambiente ou pede interativamente
PGHOST="${PGHOST:-}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-}"
PGPASSWORD="${PGPASSWORD:-}"

if [[ -z "$PGHOST" ]]; then
  read -rp "Host do Postgres (Railway): " PGHOST
fi
if [[ -z "$PGUSER" ]]; then
  read -rp "Usuário do Postgres: " PGUSER
fi
if [[ -z "$PGPASSWORD" ]]; then
  read -rsp "Senha do Postgres: " PGPASSWORD
  echo
fi

export PGHOST PGPORT PGUSER PGPASSWORD

echo ""
echo "→ Conectando em $PGHOST:$PGPORT como $PGUSER"

# Verifica se o database já existe
DB_EXISTS=$(psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")

if [[ "$DB_EXISTS" == "1" ]]; then
  echo "! Database '${DB_NAME}' já existe. Nada a fazer."
  exit 0
fi

# Cria o database
echo "→ Criando database '${DB_NAME}'..."
psql -d postgres -c "CREATE DATABASE ${DB_NAME};"

# Confirma criação
DB_CHECK=$(psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")
if [[ "$DB_CHECK" == "1" ]]; then
  echo "✓ Database '${DB_NAME}' criado com sucesso."
else
  echo "✗ Falha ao criar database '${DB_NAME}'."
  exit 1
fi

echo ""
echo "Próximos passos para o cliente '${SLUG}':"
echo "  1. Crie o service no Railway: n8n-${SLUG}"
echo "  2. Configure as vars de: clients/${SLUG}/config.env.example"
echo "  3. Preencha DB_POSTGRESDB_DATABASE=${DB_NAME}"
echo "  4. Configure o domínio: ${SLUG}.meun8n.theretech.com.br"
echo "  5. Marque checklist em: clients/${SLUG}/info.md"
