export interface AuthUser {
  id: string;
  nome: string;
  email: string;
  foto?: string | null;
  username: string;
}

export interface LoginApiResponse {
  success: boolean;
  message: string;
  token: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
}

export interface EncryptionKeyResponse {
  keyId: string;
  publicKey: string;
}

/** Resposta de POST /auth/password/recovery e /password/reset; as recusas vêm como erro HTTP com `message`. */
export interface PasswordRecoveryResponse {
  success: boolean;
  message: string;
}

/**
 * Linha de FV.APP.DESKUSER. NOME e FOTO são confirmados (o formato do conteúdo da FOTO ainda
 * não: ver fotoParaSrc no UsuarioService) — demais campos ficam no indice generico.
 */
export interface DadosUsuarioDto {
  NOME?: string;
  FOTO?: string | null;
  [campo: string]: unknown;
}
