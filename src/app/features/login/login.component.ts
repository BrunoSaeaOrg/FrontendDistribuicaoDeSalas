import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ThemeService } from '../../core/services/theme.service';
import { PasswordRecoveryComponent } from './password-recovery/password-recovery.component';

/**
 * Tela de login. "Esqueceu sua senha?" troca o formulário pelo PasswordRecoveryComponent
 * na mesma tela (fundo, logo e rodapé continuam) e volta com o usuário preenchido.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, PasswordRecoveryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly theme = inject(ThemeService);

  readonly obscurePassword = signal(true);
  readonly isLoading = signal(false);
  /** O formulário de login deu lugar ao "Esqueceu sua senha?". */
  readonly recuperandoSenha = signal(false);
  readonly currentYear = new Date().getFullYear();
  readonly backgroundImageUrl = `url('${document.baseURI}assets/login-bg.png')`;

  readonly loginForm = this.formBuilder.group({
    usuario: ['', Validators.required],
    senha: ['', Validators.required],
  });

  togglePassword(): void {
    this.obscurePassword.update((v) => !v);
  }

  abrirRecuperacaoSenha(): void {
    this.recuperandoSenha.set(true);
  }

  /** Volta do "Esqueceu sua senha?" com o usuário que a pessoa usou lá. */
  voltarDaRecuperacao(usuario: string): void {
    if (usuario) this.loginForm.controls.usuario.setValue(usuario);
    this.loginForm.controls.senha.reset('');
    this.recuperandoSenha.set(false);
  }

  onSubmit(): void {
    if (this.loginForm.invalid || this.isLoading()) return;

    const { usuario, senha } = this.loginForm.getRawValue();
    this.isLoading.set(true);

    this.authService.login(usuario ?? '', senha ?? '').subscribe({
      next: (response) => {
        this.isLoading.set(false);
        if (response.success) {
          this.router.navigate(['/painel']);
        } else {
          this.toast.danger('Não foi possível entrar', 'Usuário ou senha inválidos.');
        }
      },
      // Nunca mostra a mensagem crua da API/RM: pode ter dado sensível ou jargão de sistema.
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 401 || err.status === 400) {
          this.toast.danger('Não foi possível entrar', 'Usuário ou senha inválidos.');
        } else {
          this.toast.danger('Não foi possível entrar', 'Falha de comunicação com o servidor.');
        }
      },
    });
  }
}
