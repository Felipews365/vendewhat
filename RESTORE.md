# Restaurar o VendeWhat depois de perder um servidor

Escrito depois de uma queda real (set/2026): o provedor derrubou o VPS que tinha a **Evolution
API** e o **n8n** juntos. Perdemos os workflows inteiros, e a restauração custou horas porque nada
disto estava escrito. Se acontecer de novo, siga daqui.

**Nada do produto se perde numa queda dessas.** Banco (Supabase), código (Vercel/git), histórico de
conversa, etiquetas, CRM, créditos e configuração de IA continuam intactos. O que cai é só a
*conexão* com o WhatsApp e a *execução* dos crons.

> ⚠️ **Não hospede o n8n no mesmo servidor da Evolution.** Foi o erro que transformou uma queda em
> duas: as lojas reconectavam o WhatsApp e **a IA continuava muda**, porque quem responde é o cron
> do debounce, não o webhook.

---

## O que precisa existir

| Peça | Onde vive | Some numa queda? |
|---|---|---|
| App (Next.js) | Vercel | Não |
| Banco | Supabase | Não |
| Evolution API | VPS | **Sim** — e a apikey muda |
| n8n (2 crons) | VPS | **Sim** — e os workflows também |

---

## 1. Evolution nova

Suba a Evolution e anote:

- **URL base** (sem barra no final)
- **`AUTHENTICATION_API_KEY`** — no painel iContainer ela aparece na listagem do container, campo
  **API KEY**, com um olho para revelar e um ícone para copiar. **Ela MUDA junto com o servidor:**
  a antiga responde 401.

⚠️ **`WEBHOOK_GLOBAL_ENABLED` tem que ficar `false`.** Em modo global a Evolution ignora o webhook
por instância e o multi-tenant quebra — todas as lojas cairiam no mesmo endpoint.

Teste antes de seguir (não precisa de credencial):

```bash
curl -s https://SUA-EVOLUTION/ | head -c 200
# espera: {"status":200,"message":"Welcome to the Evolution API...","version":"2.x.x",...}
```

E com a apikey:

```bash
curl -s -H "apikey: SUA_APIKEY" https://SUA-EVOLUTION/instance/fetchInstances
# espera: []   (instalação nova não tem instância — elas nascem no "Conectar")
```

## 2. Variáveis

No `.env` local **e** na Vercel (Settings → Environment Variables):

```
EVOLUTION_API_URL=https://SUA-EVOLUTION
EVOLUTION_API_KEY=<a nova>
```

**O `CRON_SECRET` é o caso chato:** na Vercel ele é *Sensitive* — write-only, ela **nunca mostra o
valor**, só deixa substituir. Não tente recuperar. Gere um novo e use o mesmo nos três lugares
(Vercel + os 2 workflows):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Nada mais depende desse segredo, então trocar não quebra coisa alguma.

## 3. Redeploy

Vercel → **Deployments → ⋯ no último → Redeploy**.

Variável de ambiente **não** vale sozinha: o deploy que está no ar continua com os valores antigos.
Pular este passo é o erro mais fácil de cometer.

## 4. Crons no n8n

Importe [n8n/](n8n/) (`whatsapp-debounce.json` e `whatsapp-followups.json`) — ver
[n8n/README.md](n8n/README.md). Em cada um, troque os **dois** espaços reservados:

- `COLE_AQUI_A_URL_DO_APP` → o domínio da Vercel
- `COLE_AQUI_O_CRON_SECRET` → o segredo do passo 2

Depois **ative os dois** (botão **Published**, bolinha verde).

> O `Execute workflow` roda mesmo com o workflow **inativo**. Então ele passar no teste manual
> **não** significa que vai rodar sozinho — confira o Published. É uma falha silenciosa: nenhum erro
> aparece, a IA só para de responder.

Erros e o que significam:

| Erro | Causa |
|---|---|
| `ENOTFOUND cole_aqui_a_url_do_app` | O campo **URL** ficou com o texto de exemplo |
| `{"ok":false,"error":"Não autorizado."}` | `CRON_SECRET` diferente do que está na Vercel |
| `{"ok":true,"skipped":true}` | As variáveis da Evolution não chegaram na produção |

## 5. Zerar o status de conexão

```sql
update public.store_whatsapp
set connection_status = 'disconnected',
    connected_number  = null,
    updated_at        = now();
```

**Isto não é opcional e não se auto-corrige.** A rota de status consulta a Evolution e, se a
instância não existe lá (404), ela **cai no valor guardado no banco** — que ainda diz `connected`.
Resultado: o painel mostra "Conectado", a faixa âmbar de aviso não aparece, e o lojista nunca
descobre que precisa reescanear.

## 6. Reconectar cada loja (só o lojista faz)

> 🚨 **Abra o painel por `https://SEU-APP.vercel.app` — NUNCA por um link de deploy**
> (`vendewhat-<hash>-<time>.vercel.app`). O webhook é gravado com o **host desta requisição**, e
> deploys que não são produção têm Deployment Protection: a Evolution levaria **401** em toda
> entrega e a IA ficaria muda **sem nenhum erro aparecer**. Foi o último bug da queda de set/2026
> e o mais difícil de achar — detalhes e conserto no fim deste arquivo.

**Configuração da IA → Conexão → Conectar** → escanear o QR com o celular daquele número.

Aqui a instância nasce na Evolution nova — com o **mesmo nome de antes**, porque ele é derivado do
id da loja (`instanceForStore`) — e o webhook se registra sozinho, com a URL tirada do host da
requisição.

**Confira logo depois de conectar** (deve responder `200`; se vier `401`, é o caso acima):

```bash
EU=$(grep -E '^EVOLUTION_API_URL=' .env|cut -d= -f2-); EK=$(grep -E '^EVOLUTION_API_KEY=' .env|cut -d= -f2-)
for N in $(curl -s -H "apikey: $EK" "$EU/instance/fetchInstances" | node -pe "JSON.parse(require('fs').readFileSync(0)).map(i=>i.name).join('\n')"); do
  W=$(curl -s -H "apikey: $EK" "$EU/webhook/find/$N" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).url||''}catch{''}")
  echo "$N"; curl -s -o /dev/null -w "  entrega: %{http_code}  ($W)\n" -X POST -H "Content-Type: application/json" -d '{"event":"ping"}' "$W"
done
```

---

## Conferir tudo de fora

Os comandos leem do `.env`, então **não expõem segredo no terminal**:

```bash
# 1) Evolution autentica? Quantas lojas já conectaram?
EU=$(grep -E '^EVOLUTION_API_URL=' .env|cut -d= -f2-); EK=$(grep -E '^EVOLUTION_API_KEY=' .env|cut -d= -f2-)
curl -s -o /dev/null -w "evolution: HTTP %{http_code}\n" -H "apikey: $EK" "$EU/instance/fetchInstances"

# 2) Produção: redeploy no ar + CRON_SECRET valendo + Evolution configurada, numa chamada
CS=$(grep -E '^CRON_SECRET=' .env|cut -d= -f2-)
curl -s -H "x-cron-key: $CS" https://SEU-APP.vercel.app/api/whatsapp/debounce
# espera: {"ok":true,"sent":0,"due":0}
```

Use o **debounce** para testar, não o followups: o followups *envia mensagem de verdade*
(follow-up, pós-venda, carrinho) para cliente real.

**`purged: 500` na primeira execução do followups é normal** — é a retenção de 30 dias limpando o
backlog acumulado enquanto o cron esteve fora, 500 por passada. Drena sozinho.

## Teste final

Mande uma mensagem de um número qualquer para o WhatsApp de uma loja conectada. Em **até ~1 minuto**
a IA responde.

Conectou e a IA ficou muda? O problema é o **passo 4** — o webhook grava a mensagem, mas quem
responde é o cron do debounce.

---

## 🚨 "Conectou mas a IA não responde" — a armadilha do webhook 401

O erro mais caro da restauração de set/2026, e o mais difícil de ver: **nenhum erro aparece em
lugar nenhum**. WhatsApp conectado, cliente manda mensagem, a IA fica muda, e `whatsapp_messages`
não recebe nada.

**Causa:** o `/api/whatsapp/connect` grava no webhook a URL do **host da requisição**. Se o lojista
clicou em "Conectar" estando numa URL de deployment (`vendewhat-<hash>-<time>.vercel.app`) em vez
de `vendewhat.vercel.app`, é essa que fica registrada — e a Vercel protege deployments que não são
produção com **Deployment Protection**. Toda entrega da Evolution volta **401** e morre ali.

**Diagnóstico (1 comando):**

```bash
EU=$(grep -E '^EVOLUTION_API_URL=' .env|cut -d= -f2-); EK=$(grep -E '^EVOLUTION_API_KEY=' .env|cut -d= -f2-)
W=$(curl -s -H "apikey: $EK" "$EU/webhook/find/NOME_DA_INSTANCIA" | node -pe "JSON.parse(require('fs').readFileSync(0)).url")
echo "$W"
curl -s -o /dev/null -w "webhook responde: %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"event":"ping"}' "$W"
```

- `200` → webhook OK, o problema é outro (veja os crons).
- `401` com `vercel_auth_enabled` → **é isto**.

**Conserto, sem o lojista reescanear nada** — preserve o mesmo `?token=`:

```bash
T=$(echo "$W" | sed -E 's/.*token=//')
curl -X POST -H "apikey: $EK" -H "Content-Type: application/json" \
  -d "{\"webhook\":{\"enabled\":true,\"url\":\"https://SEU-APP.vercel.app/api/whatsapp/webhook?token=$T\",\"byEvents\":false,\"webhookByEvents\":false,\"base64\":false,\"webhookBase64\":false,\"events\":[\"MESSAGES_UPSERT\",\"CONNECTION_UPDATE\",\"QRCODE_UPDATED\"]}}" \
  "$EU/webhook/set/NOME_DA_INSTANCIA"
```

**Prevenção:** mande o lojista conectar **sempre** por `https://SEU-APP.vercel.app`, nunca por um
link de deploy.

## Manager da Evolution vazio / "Unauthorized"

Se o painel `/manager` mostra "No instances found" e "taking longer than expected" enquanto a API
responde normal no `curl`, o culpado costuma ser **`SERVER_URL=http://`** na config da Evolution: a
página abre em https e o navegador **bloqueia** a chamada http (mixed content) antes de sair.

Confira com `curl -s https://SUA-EVOLUTION/ | grep manager` — se vier `http://`, troque
`SERVER_URL` para `https://...` e reinicie o container.

**Não afeta o app** (ele chama a API direto pelo `EVOLUTION_API_URL`), só o painel. Mas conserte se
você usa o manager para tocar outros projetos na mesma Evolution.
