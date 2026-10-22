// Mantém o e-mail principal da Pessoa (Core API) igual ao e-mail de acesso da conta. Falhas de
// comunicação ou recusa são exceções: a troca na conta é desfeita.
export abstract class PersonEmailSync {
  abstract sync(personId: string, email: string): Promise<void>;
}
