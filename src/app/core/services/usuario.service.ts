import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DadosUsuarioDto } from '../auth/auth.model';

/** "carregando" até a consulta responder; "indisponivel" sem sessão, se ela falhar ou vier sem nome. */
export type StatusUsuario = 'carregando' | 'ok' | 'indisponivel';

// O RM manda a FOTO sem o prefixo "data:<mime>;base64,", então o tipo sai do começo do Base64
// (a assinatura do arquivo). Sem assinatura conhecida, vai como JPEG, que é o caso comum.
const ASSINATURAS_IMAGEM: [inicio: string, mime: string][] = [
  ['/9j/', 'image/jpeg'],
  ['iVBORw0KGgo', 'image/png'],
  ['R0lGOD', 'image/gif'],
  ['UklGR', 'image/webp'],
  ['Qk', 'image/bmp'],
];

function fotoParaSrc(foto: unknown): string | null {
  const valor = typeof foto === 'string' ? foto.trim() : '';
  if (!valor) return null;
  if (/^(data:|https?:)/i.test(valor)) return valor;
  const mime = ASSINATURAS_IMAGEM.find(([inicio]) => valor.startsWith(inicio))?.[1] ?? 'image/jpeg';
  return `data:${mime};base64,${valor}`;
}

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private readonly authService = inject(AuthService);

  private readonly _dados = signal<DadosUsuarioDto | null>(null);
  private readonly _status = signal<StatusUsuario>('indisponivel');
  readonly status = this._status.asReadonly();

  readonly nome = computed(() => {
    const nome = this._dados()?.['NOME'];
    return typeof nome === 'string' && nome.trim() ? nome.trim() : null;
  });

  readonly primeiroNome = computed(() => {
    const primeiro = this.nome()?.split(/\s+/)[0];
    if (!primeiro) return null;
    return (
      primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR')
    );
  });

  /** Foto do RM pronta para o src de um <img>, ou null se a pessoa não tem foto. */
  readonly foto = computed(() => fotoParaSrc(this._dados()?.['FOTO']));

  constructor() {
    effect((onCleanup) => {
      const codUsuario = this.authService.currentUser()?.id;
      this._dados.set(null);
      if (!codUsuario) {
        this._status.set('indisponivel');
        return;
      }

      this._status.set('carregando');
      const sub = this.authService.dadosUsuario().subscribe({
        next: (rows) => {
          this._dados.set(Array.isArray(rows) ? (rows[0] ?? null) : null);
          this._status.set(this.nome() ? 'ok' : 'indisponivel');
        },
        error: (err) => {
          this._status.set('indisponivel');
          console.error('Auth/dados-usuario falhou', err);
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }
}
