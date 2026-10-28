import { Injectable, signal } from '@angular/core';

/**
 * Os dois layouts do desktop (documentados no handoff do design system, LAYOUTS.md):
 * - padrao: cabeçalho na cor da moldura, menu num cartão ao lado do conteúdo, telas em cartões;
 * - lateral: cabeçalho e conteúdo numa superfície só, sem cartões, e o menu é um bloco na cor
 *   da moldura colado à esquerda, com o canto superior direito bem arredondado.
 * A escolha fica no menu do avatar e no navegador (localStorage). O mobile é o mesmo nos dois.
 */
export type LayoutApp = 'padrao' | 'lateral';

export const LAYOUTS: { valor: LayoutApp; nome: string }[] = [
  { valor: 'padrao', nome: 'Padrão' },
  { valor: 'lateral', nome: 'Barra lateral' },
];

const CHAVE = 'saea.layout';
/** Chave do tempo do protótipo: quem já tinha escolhido a barra lateral continua nela. */
const CHAVE_PROTOTIPO = 'saea.layoutPrototipo';

function lerPreferencia(): LayoutApp {
  try {
    const salvo = localStorage.getItem(CHAVE) ?? localStorage.getItem(CHAVE_PROTOTIPO);
    return salvo === 'lateral' ? 'lateral' : 'padrao';
  } catch {
    return 'padrao';
  }
}

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly _layout = signal<LayoutApp>(lerPreferencia());
  readonly layout = this._layout.asReadonly();

  escolher(layout: LayoutApp): void {
    this._layout.set(layout);
    try {
      localStorage.setItem(CHAVE, layout);
      localStorage.removeItem(CHAVE_PROTOTIPO);
    } catch {
      // Sem armazenamento (aba privada, bloqueio): vale só até recarregar.
    }
  }
}
