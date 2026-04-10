import { getPasswordValidationError, isValidEmail, PASSWORD_MIN_LENGTH } from '@/lib/auth/validation';

describe('auth validation', () => {
  describe('isValidEmail', () => {
    it('accepts valid email addresses', () => {
      expect(isValidEmail('person@example.com')).toBe(true);
      expect(isValidEmail(' person@example.com ')).toBe(true);
      expect(isValidEmail('first.last+tag@example.co')).toBe(true);
    });

    it('rejects malformed email addresses', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('missing@domain')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('spaces in@email.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('getPasswordValidationError', () => {
    it('requires a minimum length', () => {
      expect(getPasswordValidationError('Ab1!xyz')).toBe(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
      );
    });

    it('requires a number', () => {
      expect(getPasswordValidationError('Password!')).toBe(
        'Password must include at least one number'
      );
    });

    it('requires a symbol', () => {
      expect(getPasswordValidationError('Password1')).toBe(
        'Password must include at least one symbol'
      );
    });

    it('accepts strong passwords', () => {
      expect(getPasswordValidationError('Password1!')).toBeNull();
    });
  });
});
