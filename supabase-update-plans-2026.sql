-- Atualiza preços e recursos dos planos (junho/2026).
-- Supabase → SQL Editor: cole e execute TODO este ficheiro.
--
-- A migration `supabase-migration-admin.sql` usa `on conflict do nothing`, então
-- NÃO sobrescreve planos já existentes. Estes UPDATEs aplicam os novos valores
-- nas linhas que já estão no banco (é o que a landing e o painel leem).

update public.plans set
  monthly = 89.90,
  description = 'A opção perfeita para quem precisa criar um catálogo virtual simples e receber pedidos pelo WhatsApp.',
  features = array[
    '1 número de WhatsApp para atendimento',
    'Cadastro de produtos ilimitados',
    'Pedidos ilimitados sem taxas',
    'Controle de pedidos e clientes',
    'Pagamento via PIX'
  ],
  updated_at = now()
where id = 'essencial';

update public.plans set
  monthly = 299.00,
  description = 'A melhor escolha para quem quer uma IA atendendo no WhatsApp e receber pagamentos direto pela plataforma.',
  features = array[
    'Todos os recursos do plano Essencial',
    'Atendimento por IA no WhatsApp 24h',
    'Gateway de pagamento (cartão, PIX e link de cobrança)',
    '1 número de WhatsApp para atendimento',
    'Conecte seu domínio (ex: sualoja.com.br)',
    'Cálculo do valor e prazo de entrega',
    'Criação de cupons de desconto',
    'Vídeo nos produtos (limitado)'
  ],
  updated_at = now()
where id = 'profissional';

update public.plans set
  monthly = 599.00,
  description = 'Ideal para empresas com grande demanda que precisam de CRM, IA e múltiplos atendentes no WhatsApp.',
  features = array[
    'Todos os recursos do plano Profissional',
    'CRM de clientes completo',
    'Até 3 números de WhatsApp para atendimento',
    'Vídeos ilimitados nos produtos',
    'Recuperação de carrinhos abandonados',
    'API ilimitada e integração com ERP',
    'Cadastro de equipe e permissões'
  ],
  updated_at = now()
where id = 'empresarial';

select pg_notify('pgrst', 'reload schema');
