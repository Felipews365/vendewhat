# VendeWhat

Plataforma de e-commerce para quem vende pelo WhatsApp. Catálogo digital, pedidos organizados e um link simples para compartilhar com seus clientes.

## Pré-requisitos

- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- npm (vem junto com o Node.js)

## Como rodar

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

3. Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Scripts

- `npm run dev` - Servidor de desenvolvimento
- `npm run build` - Build para produção
- `npm run start` - Servidor de produção (após o build)
- `npm run lint` - Verificar código com ESLint

## Tecnologias

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Supabase (Auth + PostgreSQL + Storage)

---

## Deploy na Vercel

### 1. Enviar o código para o GitHub

1. Crie um repositório em [github.com/new](https://github.com/new)
2. Na pasta do projeto:

   ```bash
   git init
   git add .
   git commit -m "Primeiro commit"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/vendewhat.git
   git push -u origin main
   ```

   > O arquivo `.env` **não** sobe (está no `.gitignore`). As chaves você cola só na Vercel.

### 2. Conectar na Vercel

1. Acesse [vercel.com](https://vercel.com) e entre com GitHub
2. **Add New…** → **Project** → importe o repositório `vendewhat`
3. Deixe o framework **Next.js** detectado automaticamente
4. Em **Environment Variables**, adicione (mesmos valores do seu `.env` local):

   | Nome | Valor |
   |------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto (Supabase → Settings → API → Project URL) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave **anon public** do Supabase (Settings → API) |

5. Clique **Deploy**

Depois do deploy, a Vercel mostra a URL (ex: `https://vendewhat.vercel.app`).

### 3. Ajustar o Supabase para produção

Sem isso, login e cookies podem falhar no site publicado.

1. No [Supabase](https://supabase.com) → seu projeto → **Authentication** → **URL Configuration**
2. **Site URL:** coloque a URL da Vercel, ex: `https://vendewhat.vercel.app`
3. **Redirect URLs:** adicione:
   - `https://vendewhat.vercel.app/**`
   - `https://vendewhat.vercel.app/*`  
   (troque pelo seu domínio real; pode manter também `http://localhost:3000/**` para desenvolvimento)

4. Salve.

### 4. Domínio próprio (opcional)

Na Vercel: **Project** → **Settings** → **Domains** → adicione `seudominio.com.br` e siga as instruções de DNS.

Depois atualize no Supabase o **Site URL** e **Redirect URLs** com o domínio novo.

### Checklist rápido

- [ ] Variáveis `NEXT_PUBLIC_SUPABASE_*` na Vercel
- [ ] **Site URL** e **Redirect URLs** no Supabase apontando para a URL de produção
- [ ] Bucket **product-images** no Storage já existe (não muda com o deploy)
- [ ] Tabelas `stores` / `products` já criadas via SQL

### CLI (alternativa)

Se preferir deploy pelo terminal:

```bash
npm i -g vercel
vercel login
vercel
```

Na primeira vez, a CLI pergunta se quer linkar ao projeto e configurar env vars — use as mesmas duas variáveis acima.
