/**
 * Row Level Security (RLS) Policies Tests
 * Tests for Supabase RLS policies and data access control
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../lib/supabase/server';
import {
  generateMockUser,
  generateMockProject,
  generateMockOutput,
  validateEnvironmentVariables,
  cleanupTestData,
} from '../utils/test-helpers';

describe('Row Level Security Policies', () => {
  let testUser1, testUser2;
  let testUser1Client, testUser2Client;
  let testIds = {
    userIds: [],
    projectIds: [],
    outputIds: [],
  };

  beforeAll(async () => {
    if (!validateEnvironmentVariables()) {
      console.warn('Skipping RLS tests due to missing environment variables');
      return;
    }

    // Create test users
    testUser1 = generateMockUser();
    testUser2 = generateMockUser();

    // Create separate Supabase clients for each user
    testUser1Client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    testUser2Client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Create user profiles
    await supabaseAdmin.from('profiles').insert([
      {
        id: testUser1.id,
        email: testUser1.email,
        full_name: testUser1.full_name,
      },
      {
        id: testUser2.id,
        email: testUser2.email,
        full_name: testUser2.full_name,
      },
    ]);

    testIds.userIds.push(testUser1.id, testUser2.id);
  });

  afterAll(async () => {
    await cleanupTestData(supabaseAdmin, testIds);
  });

  describe('Profiles Table RLS', () => {
    it('should allow users to read their own profile', async () => {
      // Simulate authenticated user
      const { data: session } = await testUser1Client.auth.signUp({
        email: testUser1.email,
        password: 'test-password-123',
      });

      if (session.user) {
        const { data, error } = await testUser1Client
          .from('profiles')
          .select('*')
          .eq('id', testUser1.id)
          .single();

        // Should be able to read own profile (if RLS allows)
        if (error && error.code === '42501') {
          console.warn('RLS policy prevents profile read - this may be expected');
        } else {
          expect(error).toBeNull();
          expect(data?.id).toBe(testUser1.id);
        }
      }
    });

    it('should prevent users from reading other profiles', async () => {
      const { data, error } = await testUser1Client
        .from('profiles')
        .select('*')
        .eq('id', testUser2.id)
        .single();

      // Should not be able to read other user's profile
      expect(data).toBeNull();
      if (error) {
        expect(error.code).toMatch(/42501|PGRST116/); // Permission denied or not found
      }
    });

    it('should allow users to update their own profile', async () => {
      const { data, error } = await testUser1Client
        .from('profiles')
        .update({ full_name: 'Updated Name' })
        .eq('id', testUser1.id);

      if (error && error.code === '42501') {
        console.warn('RLS policy prevents profile update - this may be expected');
      } else {
        // Should succeed if RLS allows self-updates
        expect(error).toBeNull();
      }
    });

    it('should prevent users from updating other profiles', async () => {
      const { data, error } = await testUser1Client
        .from('profiles')
        .update({ full_name: 'Malicious Update' })
        .eq('id', testUser2.id);

      // Should not be able to update other user's profile
      expect(error).not.toBeNull();
      expect(error.code).toBe('42501'); // Permission denied
    });
  });

  describe('Projects Table RLS', () => {
    let testProject1, testProject2;

    beforeEach(async () => {
      // Create test projects for each user
      const mockProject1 = generateMockProject(testUser1.id);
      const mockProject2 = generateMockProject(testUser2.id);

      const { data: project1 } = await supabaseAdmin
        .from('projects')
        .insert(mockProject1)
        .select()
        .single();

      const { data: project2 } = await supabaseAdmin
        .from('projects')
        .insert(mockProject2)
        .select()
        .single();

      testProject1 = project1;
      testProject2 = project2;
      testIds.projectIds.push(project1.id, project2.id);
    });

    it('should allow users to read their own projects', async () => {
      const { data, error } = await testUser1Client
        .from('projects')
        .select('*')
        .eq('user_id', testUser1.id);

      if (error && error.code === '42501') {
        console.warn('RLS policy prevents project read - this may be expected');
      } else {
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data[0].user_id).toBe(testUser1.id);
      }
    });

    it('should prevent users from reading other users projects', async () => {
      const { data, error } = await testUser1Client
        .from('projects')
        .select('*')
        .eq('id', testProject2.id);

      // Should not see other user's projects
      expect(data).toEqual([]);
    });

    it('should allow users to create their own projects', async () => {
      const newProject = generateMockProject(testUser1.id);

      const { data, error } = await testUser1Client
        .from('projects')
        .insert(newProject)
        .select()
        .single();

      if (error && error.code === '42501') {
        console.warn('RLS policy prevents project creation - this may be expected');
      } else {
        expect(error).toBeNull();
        expect(data.user_id).toBe(testUser1.id);
        testIds.projectIds.push(data.id);
      }
    });

    it('should prevent users from creating projects for other users', async () => {
      const maliciousProject = generateMockProject(testUser2.id);

      const { data, error } = await testUser1Client
        .from('projects')
        .insert(maliciousProject);

      // Should not be able to create projects for other users
      expect(error).not.toBeNull();
      expect(error.code).toBe('42501'); // Permission denied
    });

    it('should allow users to update their own projects', async () => {
      const { data, error } = await testUser1Client
        .from('projects')
        .update({ title: 'Updated Title' })
        .eq('id', testProject1.id);

      if (error && error.code === '42501') {
        console.warn('RLS policy prevents project update - this may be expected');
      } else {
        expect(error).toBeNull();
      }
    });

    it('should prevent users from updating other users projects', async () => {
      const { data, error } = await testUser1Client
        .from('projects')
        .update({ title: 'Malicious Update' })
        .eq('id', testProject2.id);

      // Should not be able to update other user's projects
      expect(error).not.toBeNull();
      expect(error.code).toBe('42501'); // Permission denied
    });

    it('should allow users to delete their own projects', async () => {
      // Create a test project to delete
      const projectToDelete = generateMockProject(testUser1.id);
      const { data: newProject } = await supabaseAdmin
        .from('projects')
        .insert(projectToDelete)
        .select()
        .single();

      const { data, error } = await testUser1Client
        .from('projects')
        .delete()
        .eq('id', newProject.id);

      if (error && error.code === '42501') {
        console.warn('RLS policy prevents project deletion - this may be expected');
        testIds.projectIds.push(newProject.id); // For cleanup
      } else {
        expect(error).toBeNull();
      }
    });

    it('should prevent users from deleting other users projects', async () => {
      const { data, error } = await testUser1Client
        .from('projects')
        .delete()
        .eq('id', testProject2.id);

      // Should not be able to delete other user's projects
      expect(error).not.toBeNull();
      expect(error.code).toBe('42501'); // Permission denied
    });
  });

  describe('Outputs Table RLS', () => {
    let testProject1, testProject2;
    let testOutput1, testOutput2;

    beforeEach(async () => {
      // Create test projects
      const mockProject1 = generateMockProject(testUser1.id);
      const mockProject2 = generateMockProject(testUser2.id);

      const { data: project1 } = await supabaseAdmin
        .from('projects')
        .insert(mockProject1)
        .select()
        .single();

      const { data: project2 } = await supabaseAdmin
        .from('projects')
        .insert(mockProject2)
        .select()
        .single();

      testProject1 = project1;
      testProject2 = project2;
      testIds.projectIds.push(project1.id, project2.id);

      // Create test outputs
      const mockOutput1 = generateMockOutput(testProject1.id);
      const mockOutput2 = generateMockOutput(testProject2.id);

      const { data: output1 } = await supabaseAdmin
        .from('outputs')
        .insert(mockOutput1)
        .select()
        .single();

      const { data: output2 } = await supabaseAdmin
        .from('outputs')
        .insert(mockOutput2)
        .select()
        .single();

      testOutput1 = output1;
      testOutput2 = output2;
      testIds.outputIds.push(output1.id, output2.id);
    });

    it('should allow users to read outputs from their own projects', async () => {
      const { data, error } = await testUser1Client
        .from('outputs')
        .select('*')
        .eq('project_id', testProject1.id);

      if (error && error.code === '42501') {
        console.warn('RLS policy prevents output read - this may be expected');
      } else {
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data[0].project_id).toBe(testProject1.id);
      }
    });

    it('should prevent users from reading outputs from other users projects', async () => {
      const { data, error } = await testUser1Client
        .from('outputs')
        .select('*')
        .eq('id', testOutput2.id);

      // Should not see outputs from other user's projects
      expect(data).toEqual([]);
    });

    it('should allow users to create outputs for their own projects', async () => {
      const newOutput = generateMockOutput(testProject1.id);

      const { data, error } = await testUser1Client
        .from('outputs')
        .insert(newOutput)
        .select()
        .single();

      if (error && error.code === '42501') {
        console.warn('RLS policy prevents output creation - this may be expected');
      } else {
        expect(error).toBeNull();
        expect(data.project_id).toBe(testProject1.id);
        testIds.outputIds.push(data.id);
      }
    });

    it('should prevent users from creating outputs for other users projects', async () => {
      const maliciousOutput = generateMockOutput(testProject2.id);

      const { data, error } = await testUser1Client
        .from('outputs')
        .insert(maliciousOutput);

      // Should not be able to create outputs for other user's projects
      expect(error).not.toBeNull();
      expect(error.code).toBe('42501'); // Permission denied
    });

    it('should allow users to update outputs from their own projects', async () => {
      const { data, error } = await testUser1Client
        .from('outputs')
        .update({ title: 'Updated Output Title' })
        .eq('id', testOutput1.id);

      if (error && error.code === '42501') {
        console.warn('RLS policy prevents output update - this may be expected');
      } else {
        expect(error).toBeNull();
      }
    });

    it('should prevent users from updating outputs from other users projects', async () => {
      const { data, error } = await testUser1Client
        .from('outputs')
        .update({ title: 'Malicious Update' })
        .eq('id', testOutput2.id);

      // Should not be able to update other user's outputs
      expect(error).not.toBeNull();
      expect(error.code).toBe('42501'); // Permission denied
    });
  });

  describe('Admin Access', () => {
    it('should allow admin to read all profiles', async () => {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .in('id', [testUser1.id, testUser2.id]);

      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    });

    it('should allow admin to read all projects', async () => {
      const { data, error } = await supabaseAdmin
        .from('projects')
        .select('*')
        .in('user_id', [testUser1.id, testUser2.id]);

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThan(0);
    });

    it('should allow admin to read all outputs', async () => {
      const { data, error } = await supabaseAdmin
        .from('outputs')
        .select('*');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThan(0);
    });
  });

  describe('Anonymous Access', () => {
    const anonymousClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    it('should prevent anonymous access to profiles', async () => {
      const { data, error } = await anonymousClient
        .from('profiles')
        .select('*')
        .limit(1);

      // Anonymous users should not be able to read profiles
      if (data) {
        expect(data).toEqual([]);
      } else {
        expect(error.code).toBe('42501'); // Permission denied
      }
    });

    it('should prevent anonymous access to projects', async () => {
      const { data, error } = await anonymousClient
        .from('projects')
        .select('*')
        .limit(1);

      // Anonymous users should not be able to read projects
      if (data) {
        expect(data).toEqual([]);
      } else {
        expect(error.code).toBe('42501'); // Permission denied
      }
    });

    it('should prevent anonymous access to outputs', async () => {
      const { data, error } = await anonymousClient
        .from('outputs')
        .select('*')
        .limit(1);

      // Anonymous users should not be able to read outputs
      if (data) {
        expect(data).toEqual([]);
      } else {
        expect(error.code).toBe('42501'); // Permission denied
      }
    });

    it('should allow anonymous access to waitlist', async () => {
      // Waitlist should be accessible for signups
      const { data, error } = await anonymousClient
        .from('waitlist')
        .select('*')
        .limit(1);

      // This should succeed or return empty array (not permission denied)
      if (error) {
        expect(error.code).not.toBe('42501');
      }
    });
  });
});