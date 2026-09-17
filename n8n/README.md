# Agendamentos (n8n)

Os dois workflows que fazem o VendeWhat funcionar sozinho. **Estão versionados aqui de
propósito:** eles viviam só dentro do VPS e se perderam quando o provedor caiu — com os JSON no
repositório, restaurar vira importar dois arquivos.

| Arquivo | Intervalo | O que quebra sem ele |
|---|---|---|
| `whatsapp-debounce.json` | **1 min** | **A IA não responde ninguém.** O webhook só grava a mensagem e agenda; quem responde é este cron. |
| `whatsapp-followups.json` | **5 min** | Follow-up de silêncio, pós-venda, carrinho abandonado, purga das mensagens de 30 dias, campanhas do CRM e automações do CRM. |

## Como restaurar

1. No n8n: **Workflows → ⋯ → Import from File** (um arquivo por vez).
2. Em cada workflow, abra o nó **HTTP Request** e troque os dois espaços reservados:
   - `COLE_AQUI_A_URL_DO_APP` → o domínio do app na Vercel, **sem barra no final**
     (o mesmo valor de `APP_BASE_URL`).
   - `COLE_AQUI_O_CRON_SECRET` → o valor de `CRON_SECRET` (o mesmo que está na Vercel).
3. **Ative** os dois (o botão Active no topo). Schedule Trigger só dispara com o workflow ativo.

## Por que header e não `?key=` na URL

As rotas aceitam os dois (`url.searchParams.get("key") ?? req.headers.get("x-cron-key")`), mas o
header mantém o segredo **fora da URL** — que aparece em log de acesso, histórico e na lista de
execuções do n8n. Por isso os workflows usam `x-cron-key`.

## Detalhes que evitam alarme falso

- **`timeout: 60000`** — as rotas têm `maxDuration = 60` e param sozinhas aos 45s
  (`RUN_DEADLINE_MS`). Timeout menor cortaria execução saudável.
- **`neverError: true`** — um 500 ocasional não pinta o workflow de vermelho nem manda alerta. As
  duas rotas são **idempotentes** e retomam na passada seguinte: no debounce quem não foi reservado
  continua vencido, e quem foi volta à fila quando o lock expira (5 min). Se quiser investigar, o
  corpo da resposta fica na execução.
- **`saveDataSuccessExecution: "none"`** — são ~1.440 execuções/dia só no debounce; guardar todas
  enche o banco do n8n à toa. Falhas continuam sendo guardadas.

## Onde hospedar

**Não ponha no mesmo servidor da Evolution.** Já foi assim uma vez: o provedor caiu e levou
Evolution *e* cron juntos, então a IA parou de responder mesmo nas lojas que reconectaram o
WhatsApp. São coisas independentes — o n8n só precisa alcançar a URL pública da Vercel.

## Conferir se está no ar

Abra no navegador (ou `curl`):

```
https://SEU-APP.vercel.app/api/whatsapp/followups?key=SEU_CRON_SECRET
```

- `{"ok":true,...}` → funcionando.
- `{"ok":false,"error":"Não autorizado."}` → `CRON_SECRET` errado ou ausente na Vercel.
