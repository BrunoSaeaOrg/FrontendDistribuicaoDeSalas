/** "Bom dia" até 12h, "Boa tarde" até 18h, depois "Boa noite". */
export function saudacao(agora = new Date()): string {
  const hora = agora.getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}
