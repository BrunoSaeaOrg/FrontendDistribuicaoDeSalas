import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';

/** request = pedir o token · reset = colar o token e escolher a nova senha · done = senha trocada. */
type RecoveryStep = 'request' | 'reset' | 'done';

const STEP_SUBTITLES: Record<RecoveryStep, string> = {
  request: 'Recuperar senha',
  reset: 'Redefinir senha',
  done: 'Senha redefinida',
};

/**
 * Recomendação para a nova senha, marcada conforme a pessoa digita. Não bloqueia
 * o envio: quem impõe a política de senha é o TOTVS, e a recusa dele volta na tela.
 */
const RECOMENDACOES_SENHA: { texto: string; atende: (senha: string) => boolean }[] = [
  { texto: 'Letras', atende: (senha) => /\p{L}/u.test(senha) },
  { texto: 'Números', atende: (senha) => /\d/.test(senha) },
  { texto: 'Caractere especial (! @ # $ %...)', atende: (senha) => /[^\p{L}\d\s]/u.test(senha) },
];

/** Só compara depois que a confirmação foi digitada, para não acusar erro com o campo vazio. */
function senhasConferem(group: AbstractControl): ValidationErrors | null {
  const nova = group.get('novaSenha')?.value ?? '';
  const confirmacao = group.get('confirmacao')?.value ?? '';
  return confirmacao && nova !== confirmacao ? { senhasDiferentes: true } : null;
}

/**
 * "Esqueceu sua senha?" dentro da tela de login (o `LoginComponent` troca o formulário
 * por este componente e mantém fundo, logo e rodapé):
 * 1. a pessoa informa o CODUSUARIO (CPF, e-mail ou login) e o TOTVS envia um token por e-mail;
 * 2. ela cola o token — só então os campos de nova senha são liberados — e confirma a troca.
 * "Já tenho um token" pula direto para a etapa 2 (token pedido em outra visita).
 *
 * Reaproveita o visual do login (`../login.component.css`) e acrescenta só o que falta.
 */
@Component({
  selector: 'app-password-recovery',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './password-recovery.component.html',
  styleUrls: ['../login.component.css', './password-recovery.component.css'],
})
export class PasswordRecoveryComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  private readonly novaSenhaInput = viewChild<ElementRef<HTMLInputElement>>('novaSenhaInput');

  /** Usuário já digitado na tela de login, para não precisar digitar de novo. */
  readonly usuarioInicial = input('');
  /** Volta para o login levando o usuário, para o campo já vir preenchido. */
  readonly voltar = output<string>();

  readonly step = signal<RecoveryStep>('request');
  readonly subtitle = computed(() => STEP_SUBTITLES[this.step()]);
  readonly isLoading = signal(false);
  /** O token foi pedido nesta visita: mostra o aviso de e-mail enviado em vez da instrução genérica. */
  readonly tokenSent = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly obscurePassword = signal(true);

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      usuario: ['', Validators.required],
      token: ['', Validators.required],
      // Bloqueados até o token ser preenchido — ver o valueChanges no construtor.
      novaSenha: [{ value: '', disabled: true }, Validators.required],
      confirmacao: [{ value: '', disabled: true }, Validators.required],
    },
    { validators: senhasConferem },
  );

  private readonly novaSenha = toSignal(this.form.controls.novaSenha.valueChanges, { initialValue: '' });
  readonly recomendacoesSenha = computed(() =>
    RECOMENDACOES_SENHA.map((r) => ({ texto: r.texto, atendida: r.atende(this.novaSenha()) })),
  );

  constructor() {
    this.form.controls.token.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((token) => this.setPasswordFieldsEnabled(!!token.trim()));
  }

  ngOnInit(): void {
    if (this.usuarioInicial()) {
      this.form.controls.usuario.setValue(this.usuarioInicial().trim());
    }
  }

  goToStep(step: RecoveryStep): void {
    this.errorMessage.set(null);
    this.step.set(step);
  }

  togglePassword(): void {
    this.obscurePassword.update((v) => !v);
  }

  showError(field: 'usuario' | 'token'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  /** O valor colado só chega ao controle depois deste evento; até lá os campos já foram liberados. */
  onTokenPaste(): void {
    window.setTimeout(() => this.novaSenhaInput()?.nativeElement.focus(), 0);
  }

  sendToken(): void {
    const usuario = this.form.controls.usuario;
    usuario.markAsTouched();
    if (!usuario.value.trim() || this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.requestPasswordRecovery(usuario.value.trim()).subscribe({
      next: () => {
        this.isLoading.set(false);
        if (this.tokenSent()) this.toast.success('Token reenviado.');
        this.tokenSent.set(true);
        this.step.set('reset');
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  resetPassword(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading()) return;

    const { usuario, token, novaSenha } = this.form.getRawValue();
    this.isLoading.set(true);
    this.errorMessage.set(null);

    // A senha vai como digitada, igual ao login (que também não faz trim nela).
    this.authService.resetPassword(usuario.trim(), token.trim(), novaSenha).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.form.controls.token.reset();
        this.form.controls.novaSenha.reset();
        this.form.controls.confirmacao.reset();
        this.step.set('done');
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  backToLogin(): void {
    this.voltar.emit(this.form.controls.usuario.value.trim());
  }

  private setPasswordFieldsEnabled(enabled: boolean): void {
    const { novaSenha, confirmacao } = this.form.controls;
    if (novaSenha.enabled === enabled) return;
    for (const control of [novaSenha, confirmacao]) {
      if (enabled) control.enable({ emitEvent: false });
      else control.disable({ emitEvent: false });
    }
  }

  /**
   * 400 e 429 trazem uma `message` feita para a tela (a recusa do TOTVS ou a nossa). Nos
   * demais erros, como no login, não se mostra a mensagem crua da API: só falha de comunicação.
   */
  private fail(err: unknown): void {
    this.isLoading.set(false);
    const curada = err instanceof HttpErrorResponse && (err.status === 400 || err.status === 429);
    const message = curada ? err.error?.message : null;
    if (typeof message === 'string' && message) {
      this.errorMessage.set(message);
    } else {
      this.errorMessage.set(err instanceof Error && err.message ? err.message : 'Falha de comunicação com o servidor.');
      console.error('Erro na recuperação de senha:', err);
    }
  }
}
