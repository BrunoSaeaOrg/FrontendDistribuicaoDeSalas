import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly obscurePassword = signal(true);
  readonly isLoading = signal(false);
  readonly currentYear = new Date().getFullYear();

  readonly loginForm = this.formBuilder.group({
    usuario: ['', Validators.required],
    senha: ['', Validators.required],
  });

  togglePassword(): void {
    this.obscurePassword.update((v) => !v);
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
          this.toast.danger('Não foi possível entrar', response.message || 'Usuário ou senha inválidos.');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 401 || err.status === 400) {
          this.toast.danger('Não foi possível entrar', 'Usuário ou senha inválidos.');
        } else {
          this.toast.danger('Falha de comunicação', err.message || 'Não foi possível contatar o servidor.');
        }
      },
    });
  }
}
