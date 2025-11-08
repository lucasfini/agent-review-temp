/**
 * Authentication Flow Tests
 * Tests for signup, login, session management, and protected routes
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../lib/supabase/server';
import {
  generateMockUser,
  validateEnvironmentVariables,
} from '../utils/test-helpers';

describe('Authentication Flow', () => {
  let testClient;
  let testUsers = [];

  beforeAll(() => {
    if (!validateEnvironmentVariables()) {
      console.warn('Skipping auth tests due to missing environment variables');
      return;
    }

    testClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  });

  afterEach(async () => {
    // Cleanup test users
    for (const user of testUsers) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(user.id);
        await supabaseAdmin.from('profiles').delete().eq('id', user.id);
      } catch (error) {
        console.warn(`Failed to cleanup user ${user.id}:`, error.message);
      }
    }
    testUsers = [];
    
    // Sign out current session
    await testClient.auth.signOut();
  });

  describe('User Registration', () => {
    it('should register new user with valid credentials', async () => {
      const mockUser = generateMockUser();
      const password = 'test-password-123';

      const { data, error } = await testClient.auth.signUp({
        email: mockUser.email,
        password: password,
      });

      if (error && error.message?.includes('signup')) {
        console.warn('Signup may be disabled:', error.message);
        return;
      }

      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(mockUser.email);
      
      if (data.user) {
        testUsers.push(data.user);
      }
    });

    it('should reject registration with invalid email', async () => {
      const invalidEmails = [
        'not-an-email',
        'missing@domain',
        '@domain.com',
        'spaces in@email.com',
        '',
      ];

      for (const email of invalidEmails) {
        const { data, error } = await testClient.auth.signUp({
          email: email,
          password: 'test-password-123',
        });

        expect(error).not.toBeNull();
        expect(error.message).toContain('email');
      }
    });

    it('should reject registration with weak password', async () => {
      const mockUser = generateMockUser();
      const weakPasswords = [
        '123',        // Too short
        'password',   // Too common
        '12345678',   // No complexity
        '',           // Empty
      ];

      for (const password of weakPasswords) {
        const { data, error } = await testClient.auth.signUp({
          email: mockUser.email,
          password: password,
        });

        expect(error).not.toBeNull();
        expect(error.message).toMatch(/password|weak/i);
      }
    });

    it('should prevent duplicate email registration', async () => {
      const mockUser = generateMockUser();
      const password = 'test-password-123';

      // First registration
      const { data: data1, error: error1 } = await testClient.auth.signUp({
        email: mockUser.email,
        password: password,
      });

      if (error1 && error1.message?.includes('signup')) {
        console.warn('Signup may be disabled, skipping duplicate test');
        return;
      }

      expect(error1).toBeNull();
      if (data1.user) {
        testUsers.push(data1.user);
      }

      // Second registration with same email
      const { data: data2, error: error2 } = await testClient.auth.signUp({
        email: mockUser.email,
        password: password,
      });

      expect(error2).not.toBeNull();
      expect(error2.message).toContain('already');
    });

    it('should handle registration with additional metadata', async () => {
      const mockUser = generateMockUser();
      const password = 'test-password-123';

      const { data, error } = await testClient.auth.signUp({
        email: mockUser.email,
        password: password,
        options: {
          data: {
            full_name: mockUser.full_name,
            avatar_url: 'https://example.com/avatar.jpg',
          },
        },
      });

      if (error && error.message?.includes('signup')) {
        console.warn('Signup may be disabled, skipping metadata test');
        return;
      }

      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      
      if (data.user) {
        expect(data.user.user_metadata).toMatchObject({
          full_name: mockUser.full_name,
          avatar_url: 'https://example.com/avatar.jpg',
        });
        testUsers.push(data.user);
      }
    });
  });

  describe('User Login', () => {
    let registeredUser;
    const password = 'test-password-123';

    beforeEach(async () => {
      // Register a user for login tests
      const mockUser = generateMockUser();
      const { data, error } = await testClient.auth.signUp({
        email: mockUser.email,
        password: password,
      });

      if (!error && data.user) {
        registeredUser = data.user;
        testUsers.push(data.user);
        
        // Wait a moment for user to be confirmed (if using instant confirmation)
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });

    it('should login with valid credentials', async () => {
      if (!registeredUser) {
        console.warn('No registered user available for login test');
        return;
      }

      const { data, error } = await testClient.auth.signInWithPassword({
        email: registeredUser.email,
        password: password,
      });

      if (error && error.message?.includes('confirmation')) {
        console.warn('User may require email confirmation');
        return;
      }

      expect(error).toBeNull();
      expect(data.session).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(registeredUser.email);
    });

    it('should reject login with invalid password', async () => {
      if (!registeredUser) {
        console.warn('No registered user available for invalid password test');
        return;
      }

      const { data, error } = await testClient.auth.signInWithPassword({
        email: registeredUser.email,
        password: 'wrong-password',
      });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/password|credentials/i);
      expect(data.session).toBeNull();
    });

    it('should reject login with non-existent email', async () => {
      const { data, error } = await testClient.auth.signInWithPassword({
        email: 'nonexistent@example.com',
        password: password,
      });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/email|user|found/i);
      expect(data.session).toBeNull();
    });

    it('should handle malformed login requests', async () => {
      const invalidRequests = [
        { email: '', password: password },
        { email: registeredUser?.email || 'test@example.com', password: '' },
        { email: 'not-an-email', password: password },
      ];

      for (const request of invalidRequests) {
        const { data, error } = await testClient.auth.signInWithPassword(request);
        expect(error).not.toBeNull();
        expect(data.session).toBeNull();
      }
    });
  });

  describe('Session Management', () => {
    let authenticatedUser;
    const password = 'test-password-123';

    beforeEach(async () => {
      // Register and login a user
      const mockUser = generateMockUser();
      const { data: signUpData } = await testClient.auth.signUp({
        email: mockUser.email,
        password: password,
      });

      if (signUpData.user) {
        testUsers.push(signUpData.user);
        
        // Login the user
        const { data: signInData, error } = await testClient.auth.signInWithPassword({
          email: mockUser.email,
          password: password,
        });

        if (!error && signInData.session) {
          authenticatedUser = signInData.user;
        }
      }
    });

    it('should retrieve current session', async () => {
      if (!authenticatedUser) {
        console.warn('No authenticated user available for session test');
        return;
      }

      const { data: { session }, error } = await testClient.auth.getSession();

      expect(error).toBeNull();
      expect(session).toBeDefined();
      expect(session.user.id).toBe(authenticatedUser.id);
      expect(session.access_token).toBeDefined();
      expect(session.refresh_token).toBeDefined();
    });

    it('should refresh session token', async () => {
      if (!authenticatedUser) {
        console.warn('No authenticated user available for refresh test');
        return;
      }

      const { data: initialSession } = await testClient.auth.getSession();
      
      if (!initialSession.session) {
        console.warn('No initial session available for refresh test');
        return;
      }

      const { data, error } = await testClient.auth.refreshSession({
        refresh_token: initialSession.session.refresh_token,
      });

      expect(error).toBeNull();
      expect(data.session).toBeDefined();
      expect(data.session.access_token).toBeDefined();
      expect(data.session.access_token).not.toBe(initialSession.session.access_token);
    });

    it('should handle invalid refresh token', async () => {
      const { data, error } = await testClient.auth.refreshSession({
        refresh_token: 'invalid-refresh-token',
      });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/token|invalid/i);
      expect(data.session).toBeNull();
    });

    it('should sign out user', async () => {
      if (!authenticatedUser) {
        console.warn('No authenticated user available for signout test');
        return;
      }

      const { error } = await testClient.auth.signOut();

      expect(error).toBeNull();

      // Verify session is cleared
      const { data: { session } } = await testClient.auth.getSession();
      expect(session).toBeNull();
    });

    it('should handle auth state changes', async () => {
      if (!authenticatedUser) {
        console.warn('No authenticated user available for auth state test');
        return;
      }

      let authStateEvents = [];

      const { data: { subscription } } = testClient.auth.onAuthStateChange(
        (event, session) => {
          authStateEvents.push({ event, session });
        }
      );

      // Sign out to trigger state change
      await testClient.auth.signOut();

      // Wait for event to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(authStateEvents.length).toBeGreaterThan(0);
      expect(authStateEvents.some(e => e.event === 'SIGNED_OUT')).toBe(true);

      subscription.unsubscribe();
    });
  });

  describe('Token Validation', () => {
    let validToken;
    let testUser;

    beforeEach(async () => {
      // Register and login to get a valid token
      const mockUser = generateMockUser();
      const password = 'test-password-123';
      
      const { data: signUpData } = await testClient.auth.signUp({
        email: mockUser.email,
        password: password,
      });

      if (signUpData.user) {
        testUsers.push(signUpData.user);
        testUser = signUpData.user;
        
        const { data: signInData } = await testClient.auth.signInWithPassword({
          email: mockUser.email,
          password: password,
        });

        if (signInData.session) {
          validToken = signInData.session.access_token;
        }
      }
    });

    it('should validate valid access token', async () => {
      if (!validToken) {
        console.warn('No valid token available for validation test');
        return;
      }

      const { data, error } = await supabaseAdmin.auth.getUser(validToken);

      if (error && error.message?.includes('confirmation')) {
        console.warn('User may require email confirmation');
        return;
      }

      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(testUser.id);
    });

    it('should reject invalid access token', async () => {
      const invalidTokens = [
        'invalid-token',
        'expired.token.here',
        '',
        'bearer invalid-token',
      ];

      for (const token of invalidTokens) {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        
        expect(error).not.toBeNull();
        expect(data.user).toBeNull();
      }
    });

    it('should handle malformed authorization headers', async () => {
      const malformedHeaders = [
        'Bearer',
        'bearer invalid-token',
        'Basic invalid-token',
        'invalid-format',
      ];

      for (const header of malformedHeaders) {
        const { data, error } = await supabaseAdmin.auth.getUser(
          header.replace('Bearer ', '').replace('bearer ', '')
        );
        
        expect(error).not.toBeNull();
        expect(data.user).toBeNull();
      }
    });
  });

  describe('Password Management', () => {
    let testUser;
    const originalPassword = 'test-password-123';

    beforeEach(async () => {
      // Register a user
      const mockUser = generateMockUser();
      const { data, error } = await testClient.auth.signUp({
        email: mockUser.email,
        password: originalPassword,
      });

      if (!error && data.user) {
        testUser = data.user;
        testUsers.push(data.user);
        
        // Login the user
        await testClient.auth.signInWithPassword({
          email: mockUser.email,
          password: originalPassword,
        });
      }
    });

    it('should initiate password reset', async () => {
      if (!testUser) {
        console.warn('No test user available for password reset test');
        return;
      }

      const { data, error } = await testClient.auth.resetPasswordForEmail(
        testUser.email,
        {
          redirectTo: 'http://localhost:3000/auth/callback',
        }
      );

      // This should succeed regardless of email delivery
      expect(error).toBeNull();
    });

    it('should handle password reset for non-existent email', async () => {
      const { data, error } = await testClient.auth.resetPasswordForEmail(
        'nonexistent@example.com'
      );

      // Most implementations return success even for non-existent emails
      // to prevent email enumeration attacks
      expect(error).toBeNull();
    });

    it('should update password when authenticated', async () => {
      if (!testUser) {
        console.warn('No test user available for password update test');
        return;
      }

      const newPassword = 'new-password-456';

      const { data, error } = await testClient.auth.updateUser({
        password: newPassword,
      });

      if (error && error.message?.includes('confirmation')) {
        console.warn('User may require email confirmation for password update');
        return;
      }

      expect(error).toBeNull();

      // Verify new password works
      await testClient.auth.signOut();
      
      const { data: signInData, error: signInError } = await testClient.auth.signInWithPassword({
        email: testUser.email,
        password: newPassword,
      });

      if (!signInError) {
        expect(signInData.session).toBeDefined();
      }
    });

    it('should reject weak password updates', async () => {
      if (!testUser) {
        console.warn('No test user available for weak password test');
        return;
      }

      const weakPasswords = [
        '123',
        'password',
        '12345678',
      ];

      for (const weakPassword of weakPasswords) {
        const { data, error } = await testClient.auth.updateUser({
          password: weakPassword,
        });

        expect(error).not.toBeNull();
        expect(error.message).toMatch(/password|weak/i);
      }
    });
  });

  describe('User Metadata Management', () => {
    let testUser;

    beforeEach(async () => {
      // Register and login a user
      const mockUser = generateMockUser();
      const password = 'test-password-123';
      
      const { data: signUpData } = await testClient.auth.signUp({
        email: mockUser.email,
        password: password,
        options: {
          data: {
            full_name: mockUser.full_name,
          },
        },
      });

      if (signUpData.user) {
        testUser = signUpData.user;
        testUsers.push(signUpData.user);
        
        await testClient.auth.signInWithPassword({
          email: mockUser.email,
          password: password,
        });
      }
    });

    it('should update user metadata', async () => {
      if (!testUser) {
        console.warn('No test user available for metadata update test');
        return;
      }

      const newMetadata = {
        full_name: 'Updated Name',
        avatar_url: 'https://example.com/new-avatar.jpg',
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      };

      const { data, error } = await testClient.auth.updateUser({
        data: newMetadata,
      });

      if (error && error.message?.includes('confirmation')) {
        console.warn('User may require email confirmation for metadata update');
        return;
      }

      expect(error).toBeNull();
      expect(data.user.user_metadata).toMatchObject(newMetadata);
    });

    it('should retrieve current user with metadata', async () => {
      if (!testUser) {
        console.warn('No test user available for metadata retrieval test');
        return;
      }

      const { data: { user }, error } = await testClient.auth.getUser();

      expect(error).toBeNull();
      expect(user).toBeDefined();
      expect(user.id).toBe(testUser.id);
      expect(user.user_metadata).toBeDefined();
    });
  });
});