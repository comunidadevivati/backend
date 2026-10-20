// Dados da conta verificada que viram a Pessoa (cadastro completo) no momento da conversão.
export interface MemberRegistration {
  accountId: string;
  fullName: string;
  email: string;
  phone: string | null;
}

// Conversão no contexto Members (Core API): a conta vira Pessoa e a Pessoa vira membro, de forma
// idempotente por conta. Devolve o ID da Pessoa, ou null se os dados forem recusados pelas regras do
// Members. Falhas de comunicação são exceções.
export abstract class MemberRegistry {
  abstract register(registration: MemberRegistration): Promise<string | null>;
}
