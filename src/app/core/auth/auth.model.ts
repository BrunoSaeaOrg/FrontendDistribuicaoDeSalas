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
