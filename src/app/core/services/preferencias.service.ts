import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SaeaThemeService } from '@sistemas-saea/saea-design-system';
import { filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LayoutApp, LayoutService } from './layout.service';

export type Tema = 'light' | 'dark';

/** O que o colaborador escolheu: o layout (menu do avatar) e o tema (o switch de claro/escuro). */
export interface Preferencias {
  layout: LayoutApp;
  tema: Tema;
}

/** Quem nunca escolheu abre no Clássico e no claro. */
export const PREFERENCIAS_PADRAO: Preferencias = { layout: 'padrao', tema: 'light' };

/** Uma chave por app e por colaborador: os apps SAEA dividem o endereço e o computador pode ser de vários. */
const PREFIXO = 'saea.preferencias.distribuicao-salas.';
/** De quando o layout era um só por navegador e todo login voltava ao Clássico. */
const CHAVE_ANTIGA = 'saea.layout.distribuicao-salas';

/**
 * A chave do colaborador no navegador. O login é o CPF ou o e-mail: vai como um resumo (FNV-1a de
 * 32 bits), para não ficar gravado em texto no computador depois que a pessoa sai.
 */
export function chaveDoColaborador(usuario: string): string {
  let h = 0x811c9dc5;
  for (const c of usuario.trim().toLowerCase()) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return PREFIXO + h.toString(16).padStart(8, '0');
}

export function lerPreferencias(usuario: string): Preferencias {
  try {
    const salvo = JSON.parse(localStorage.getItem(chaveDoColaborador(usuario)) ?? 'null') as Partial<Preferencias> | null;
    return {
      layout: salvo?.layout === 'lateral' ? 'lateral' : 'padrao',
      tema: salvo?.tema === 'dark' ? 'dark' : 'light',
    };
  } catch {
    return { ...PREFERENCIAS_PADRAO };
  }
}

function salvarPreferencias(usuario: string, preferencias: Preferencias): void {
  try {
    localStorage.setItem(chaveDoColaborador(usuario), JSON.stringify(preferencias));
  } catch {
    // Sem armazenamento (aba privada, bloqueio): vale só até sair.
  }
}

const ehLogin = (url: string) => /(^|\/)login(\/|\?|#|$)/.test(url);

/**
 * Layout e tema de cada colaborador. Ao entrar, aplica o que ele escolheu da última vez; o que ele
 * mudar depois (menu do avatar ou switch do tema) fica guardado na chave dele. A tela de login é
 * sempre clara: sem ninguém logado (ou na rota de login), o tema vai para o claro sem mexer no que
 * está guardado, e volta ao do colaborador quando ele entra.
 *
 * O tema em si é o SaeaThemeService da biblioteca, que também grava a última escolha numa chave
 * única ("saea-theme"); aqui ela é só o estado da tela, a escolha de cada um é a desta chave.
 * Sobe no início do app (provideAppInitializer), antes da primeira tela.
 */
@Injectable({ providedIn: 'root' })
export class PreferenciasService {
  private readonly auth = inject(AuthService);
  private readonly tema = inject(SaeaThemeService);
  private readonly layout = inject(LayoutService);
  private readonly document = inject(DOCUMENT);

  private readonly naTelaDeLogin = signal(ehLogin(this.document.location?.pathname ?? ''));
  /** O colaborador cujas preferências estão na tela; null = a tela de login (claro forçado). */
  private aplicadasDe: string | null = null;

  constructor() {
    try {
      localStorage.removeItem(CHAVE_ANTIGA);
    } catch {
      // Sem armazenamento: nada a limpar.
    }

    inject(Router)
      .events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.naTelaDeLogin.set(ehLogin(e.urlAfterRedirects)));

    // Entrou, saiu ou foi para o login: aplica o que vale para a tela.
    effect(() => {
      const usuario = this.auth.currentUser()?.username ?? null;
      const login = this.naTelaDeLogin();
      untracked(() => this.aplicar(login ? null : usuario));
    });

    // Mudou o layout ou o tema com alguém na tela: guarda para ele. Lê o colaborador sem depender
    // dele, então trocar de usuário não grava as preferências de um na chave do outro.
    effect(() => {
      const preferencias: Preferencias = { layout: this.layout.layout(), tema: this.tema.isDark() ? 'dark' : 'light' };
      untracked(() => {
        if (this.aplicadasDe) salvarPreferencias(this.aplicadasDe, preferencias);
      });
    });
  }

  private aplicar(usuario: string | null): void {
    if (!usuario) {
      this.aplicadasDe = null;
      this.tema.setMode('light');
      return;
    }
    if (this.aplicadasDe === usuario) return;
    const preferencias = lerPreferencias(usuario);
    this.aplicadasDe = usuario;
    this.layout.escolher(preferencias.layout);
    this.tema.setMode(preferencias.tema);
  }
}
