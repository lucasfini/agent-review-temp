const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_NUMBER_REGEX = /\d/;
const PASSWORD_SYMBOL_REGEX = /[^A-Za-z0-9]/;

export const PASSWORD_MIN_LENGTH = 8;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function getPasswordValidationError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }

  if (!PASSWORD_NUMBER_REGEX.test(password)) {
    return 'Password must include at least one number';
  }

  if (!PASSWORD_SYMBOL_REGEX.test(password)) {
    return 'Password must include at least one symbol';
  }

  return null;
}
