export function isLoginEncryptionSupported(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle;
}

export async function importRsaPublicKeyFromSpki(publicKeyBase64: string): Promise<CryptoKey> {
  const binary = atob(publicKeyBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return window.crypto.subtle.importKey(
    'spki',
    bytes.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

export async function encryptLoginPayload(publicKey: CryptoKey, payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, data);

  const cipherArray = new Uint8Array(cipherBuffer);
  let binary = '';
  for (let i = 0; i < cipherArray.length; i++) binary += String.fromCharCode(cipherArray[i]);
  return btoa(binary);
}
