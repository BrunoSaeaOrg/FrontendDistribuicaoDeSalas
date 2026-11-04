import { Injectable, signal } from '@angular/core';

/**
 * Os dois layouts do desktop (documentados no handoff do design system, LAYOUTS.md):
 * - padrao: cabeçalho na cor da moldura, menu num cartão ao lado do conteúdo, telas em cartões;
 * - lateral: cabeçalho e conteúdo numa superfície só, sem cartões, e o menu é um bloco na cor
 *   da moldura colado à esquerda, com o canto superior direito bem arredondado.
 * A escolha fica no menu do avatar e é guardada por colaborador (PreferenciasService): cada um
 * entra no layout que escolheu da última vez; quem nunca escolheu abre no Clássico. O mobile é o
 * mesmo nos dois.
 */
export type LayoutApp = 'padrao' | 'lateral';

export const LAYOUTS: { valor: LayoutApp; nome: string }[] = [
  { valor: 'padrao', nome: 'Clássico' },
  { valor: 'lateral', nome: 'Barra lateral' },
];

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly _layout = signal<LayoutApp>('padrao');
  readonly layout = this._layout.asReadonly();

  escolher(layout: LayoutApp): void {
    this._layout.set(layout);
  }
}
