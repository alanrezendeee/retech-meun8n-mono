# Autonomous Support Flow

Fluxo de suporte autônomo orquestrado pelo n8n, do WhatsApp do cliente até o merge da PR e notificação de resolução.

## Visão geral

```
Cliente WhatsApp → LLM intake → Linear ticket → Claude Code Agent
→ GitHub PR → Aprovação CTO → Merge → CI/CD → Cliente notificado
```

## Stack

| Componente | Ferramenta |
|---|---|
| Orquestração | n8n |
| WhatsApp | Evolution API |
| LLM intake | Claude Sonnet (Anthropic API) |
| Code agent | Claude Code SDK (Railway service) |
| Tickets | Linear API |
| Repositório | GitHub API |
| CI/CD | GitHub Actions |
| Sessão state | Postgres (control plane) ou Redis |

---

## Fase 1 — Intake (WhatsApp → LLM → Linear)

### Fluxo

```
WhatsApp cliente
  → Evolution API webhook
  → n8n: lookup sessão ativa por número
    ┌ Sessão existe → append message + continua
    └ Nova sessão → cria sessão + lookup phone → repo
  → n8n: envia histórico para Claude
    Claude retorna JSON estruturado:
      { enough: false, question: "Qual versão do app?" }
        → Evolution API envia pergunta ao cliente
        → aguarda próxima mensagem (loop)
      { enough: true, summary, severity }
        → n8n: checa Linear por ticket aberto desse cliente
          ┌ Existe → atualiza ticket com novo contexto
          └ Não existe → cria ticket com summary + transcript
```

### Schema de resposta da LLM

```json
{
  "enough": true,
  "missing": [],
  "summary": "Usuário não consegue fazer login após atualização v2.3",
  "severity": "high",
  "question": null
}
```

### Dados necessários por cliente

```
número_whatsapp → tenant_slug → repo_url + base_branch + linear_team_id
```

Mantido na tabela `tenants` do control plane.

---

## Fase 2 — Desenvolvimento (Linear → Agent → PR)

### Fluxo

```
Linear webhook (ticket created)
  → n8n: monta payload para agent
  → n8n: POST → Claude Code Agent Service

Agent Service:
  → clone repo + cria branch fix/LIN-{id}
  → roda Claude Code com contexto do ticket
  → roda testes localmente
    ┌ Passam → commit + push + abre PR
    └ Falham → tenta correção (máx 3 tentativas)
      └ Ainda falha → notifica n8n com erro detalhado
  → retorna { pr_url, pr_number }
```

### Branch naming

```
fix/LIN-{ticket_id}-{slug}
```

### PR body template

```markdown
## Problema
{ticket_description}

## Solução
{agent_summary}

## Testes
{test_output}

Closes LIN-{ticket_id}
```

### Critérios obrigatórios para PR subir

- [ ] Testes passando localmente
- [ ] Lint sem erros
- [ ] Branch protection ativa no GitHub (impede merge sem CI verde)
- [ ] PR linkada ao ticket Linear via `Closes LIN-{id}`
- [ ] Labels: `automated`, `fix`

---

## Fase 3 — Aprovação CTO (WhatsApp → Merge)

### Fluxo

```
n8n → Evolution API → WhatsApp CTO:
  "PR pronta — LIN-{id}: {title}
   PR: github.com/.../pull/{n}
   Linear: linear.app/...
   Responda APROVAR ou REJEITAR"

CTO responde:
  APROVAR  → GitHub API: merge PR (squash)
             Linear: ticket → In Review
  REJEITAR → GitHub API: close PR
             Linear: ticket → Todo + comment
             WhatsApp CTO: confirmação de rejeição
  Timeout 4h → lembrete via WhatsApp
  Texto inválido → pede APROVAR ou REJEITAR
```

### Parsing de resposta

| Resposta CTO | Ação |
|---|---|
| `aprovar`, `ok`, `sim`, `👍` | merge |
| `rejeitar`, `não`, `recusar` | close PR + reabrir ticket |
| qualquer outro texto | pede confirmação |
| silêncio > 4h | reenvio de lembrete |

---

## Fase 4 — Pipeline e Conclusão

### GitHub Actions (após merge na main)

```yaml
jobs:
  release:
    steps:
      - lint
      - test
      - build
      - semantic-version-bump   # conventional commits → vX.Y.Z
      - git-tag
      - github-release          # changelog automático
      - deploy                  # se configurado
```

### Fluxo pós-pipeline

```
GitHub Actions webhook → n8n:
  workflow_run: { status: completed, conclusion: ? }

  ✅ success:
    → WhatsApp cliente:
        "Seu problema foi resolvido! Versão X.Y.Z liberada."
    → Linear: ticket → Done
               comment: PR #{n} + Release vX.Y.Z
    → encerra sessão

  ❌ failure:
    → WhatsApp CTO: "Pipeline falhou após merge. [link actions]"
    → Linear: ticket → Bug + comment com log de erro
    → sessão permanece aberta
```

---

## Lacunas resolvidas na proposta

| Lacuna | Solução |
|---|---|
| Sessão multi-turn | Store por número no Postgres/Redis |
| Phone → repo mapping | Tabela `tenants` com campos de repo |
| Critério de satisfação da LLM | JSON estruturado com campo `enough` |
| Hosting do agent | Railway service HTTP dedicado |
| Parsing resposta CTO | Parser com sinônimos + fallback |
| Falha do agente | Máx 3 tentativas + notificação |
| Falha do pipeline | Notifica CTO + mantém ticket aberto |
| Deduplicação | Checa tickets abertos antes de criar |
| Branch naming | `fix/LIN-{id}` rastreável |
| PR body | Template com `Closes LIN-{id}` |
| Timeout CTO | Lembrete automático em 4h |

---

## Fases de implementação

### Fase 1 — Fundação
- [ ] Campos de repo/Linear na tabela `tenants` da API
- [ ] Tabela `sessions` (número, histórico, status, tenant_id)
- [ ] Webhook Evolution API → n8n configurado
- [ ] Workflow n8n: intake com Claude (multi-turn)
- [ ] Workflow n8n: criação de ticket no Linear

### Fase 2 — Agent Service
- [ ] Serviço Railway: Claude Code Agent HTTP
- [ ] Endpoint `POST /agent/run` com payload de contexto
- [ ] Branch + commit + PR automáticos via GitHub API
- [ ] Testes locais antes de abrir PR

### Fase 3 — Aprovação
- [ ] Workflow n8n: notificação WhatsApp CTO
- [ ] Workflow n8n: parser de resposta + merge/close
- [ ] Timeout e lembrete automático

### Fase 4 — Pipeline
- [ ] GitHub Actions: lint + test + build + release + tag
- [ ] Webhook GitHub Actions → n8n
- [ ] Workflow n8n: notificação cliente + fechamento Linear

---

## Decisões pendentes

1. **Agent Service hosting** — Railway service (sempre ativo, HTTP) ou GitHub Actions `workflow_dispatch` (ephemeral, mais barato)?
2. **Sessão state** — Redis dedicado ou tabela `sessions` no Postgres do control plane?
