-- Atualiza os 3 planos existentes para a nova oferta (Sem IA / IA Completo / IA Sob Medida).
-- Rode no SQL Editor do Supabase. Reaproveita os ids antigos (essencial/profissional/empresarial)
-- para não quebrar assinaturas que já apontam para eles — muda só título, preço, descrição e benefícios.

update public.plans set
  title = 'Sem IA',
  description = 'A vitrine essencial para sua loja aparecer bem e vender mais.',
  monthly = 89.90,
  features = array[
    'Vitrine da loja',
    'Catálogo de produtos',
    'Link para WhatsApp',
    'Página de contato',
    'Localização da loja',
    'Suporte básico'
  ],
  accent = 'pink', icon = 'bolt', highlight = false, sort_order = 0, active = true,
  updated_at = now()
where id = 'essencial';

update public.plans set
  title = 'IA Completo',
  description = 'Atendimento inteligente com IA para responder rápido e vender melhor.',
  monthly = 500.00,
  features = array[
    'Tudo do plano Sem IA',
    'IA para tirar dúvidas dos clientes',
    'Respostas sobre valores e produtos',
    'Envio do link do catálogo',
    'Envio de catálogo em PDF',
    'Localização da loja pela IA',
    'Até 1.000 conversas com clientes por mês',
    'Ideal para atendimento frequente'
  ],
  accent = 'cyan', icon = 'star', highlight = true, sort_order = 1, active = true,
  updated_at = now()
where id = 'profissional';

update public.plans set
  title = 'IA Sob Medida',
  description = 'IA personalizada para o seu negócio, com pagamento por uso.',
  monthly = 350.00,
  features = array[
    'Ajustes personalizados nas respostas',
    'Treinamento com dados da sua loja',
    'Configuração mais fina do fluxo',
    'Integrações específicas',
    'Suporte mais próximo',
    'Créditos pré-pagos para uso da IA',
    'Recarrega quando quiser, a partir de R$ 30',
    'Controle total do seu custo'
  ],
  accent = 'purple', icon = 'briefcase', highlight = false, sort_order = 2, active = true,
  updated_at = now()
where id = 'empresarial';
