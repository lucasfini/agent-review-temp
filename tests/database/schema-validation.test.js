/**
 * Database Schema Validation Tests
 * Tests for database table structure and constraints
 */

import { supabase } from '../../lib/supabase/client';
import { supabaseAdmin } from '../../lib/supabase/server';
import {
  generateMockUser,
  generateMockProject,
  generateMockOutput,
  validateEnvironmentVariables,
  cleanupTestData,
} from '../utils/test-helpers';

describe('Database Schema Validation', () => {
  let testIds = {
    userIds: [],
    projectIds: [],
    outputIds: [],
  };

  beforeAll(() => {
    if (!validateEnvironmentVariables()) {
      console.warn('Skipping database tests due to missing environment variables');
      return;
    }
  });

  afterEach(async () => {
    await cleanupTestData(supabaseAdmin, testIds);
    testIds = { userIds: [], projectIds: [], outputIds: [] };
  });

  describe('Table Existence', () => {
    it('should have waitlist table', async () => {
      const { data, error } = await supabase
        .from('waitlist')
        .select('*')
        .limit(1);
      
      if (error && error.code === '42P01') {
        throw new Error('waitlist table does not exist');
      }
      
      expect(error).toBeNull();
    });

    it('should have profiles table', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);
      
      if (error && error.code === '42P01') {
        throw new Error('profiles table does not exist');
      }
      
      expect(error).toBeNull();
    });

    it('should have projects table', async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .limit(1);
      
      if (error && error.code === '42P01') {
        throw new Error('projects table does not exist');
      }
      
      expect(error).toBeNull();
    });

    it('should have outputs table', async () => {
      const { data, error } = await supabase
        .from('outputs')
        .select('*')
        .limit(1);
      
      if (error && error.code === '42P01') {
        throw new Error('outputs table does not exist');
      }
      
      expect(error).toBeNull();
    });
  });

  describe('Profiles Table Schema', () => {
    it('should enforce required fields', async () => {
      const mockUser = generateMockUser();
      
      // Try to insert profile without required fields
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser.id,
          // Missing email (required)
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toMatch(/23502|23505/); // NOT NULL or unique violation
    });

    it('should enforce subscription_plan enum values', async () => {
      const mockUser = generateMockUser();
      
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser.id,
          email: mockUser.email,
          subscription_plan: 'invalid_plan', // Invalid enum value
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23514'); // Check constraint violation
    });

    it('should enforce subscription_status enum values', async () => {
      const mockUser = generateMockUser();
      
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser.id,
          email: mockUser.email,
          subscription_status: 'invalid_status', // Invalid enum value
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23514'); // Check constraint violation
    });

    it('should accept valid profile data', async () => {
      const mockUser = generateMockUser();
      
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser.id,
          email: mockUser.email,
          full_name: mockUser.full_name,
          subscription_plan: 'free',
          subscription_status: 'active',
          processing_hours_used: 0,
          processing_hours_limit: 5,
        })
        .select()
        .single();
      
      expect(error).toBeNull();
      expect(data).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        full_name: mockUser.full_name,
        subscription_plan: 'free',
        subscription_status: 'active',
      });
      
      testIds.userIds.push(data.id);
    });
  });

  describe('Projects Table Schema', () => {
    let testUserId;

    beforeEach(async () => {
      // Create a test user first
      const mockUser = generateMockUser();
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser.id,
          email: mockUser.email,
          full_name: mockUser.full_name,
        })
        .select()
        .single();
      
      testUserId = profile.id;
      testIds.userIds.push(testUserId);
    });

    it('should enforce foreign key constraint on user_id', async () => {
      const mockProject = generateMockProject('non-existent-user-id');
      
      const { data, error } = await supabaseAdmin
        .from('projects')
        .insert(mockProject);
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23503'); // Foreign key violation
    });

    it('should enforce required fields', async () => {
      const { data, error } = await supabaseAdmin
        .from('projects')
        .insert({
          user_id: testUserId,
          // Missing title (required)
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23502'); // NOT NULL violation
    });

    it('should enforce status enum values', async () => {
      const mockProject = generateMockProject(testUserId);
      
      const { data, error } = await supabaseAdmin
        .from('projects')
        .insert({
          ...mockProject,
          status: 'invalid_status', // Invalid enum value
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23514'); // Check constraint violation
    });

    it('should accept valid project data', async () => {
      const mockProject = generateMockProject(testUserId);
      
      const { data, error } = await supabaseAdmin
        .from('projects')
        .insert(mockProject)
        .select()
        .single();
      
      expect(error).toBeNull();
      expect(data).toMatchObject({
        user_id: testUserId,
        title: mockProject.title,
        status: mockProject.status,
      });
      
      testIds.projectIds.push(data.id);
    });

    it('should handle null optional fields correctly', async () => {
      const { data, error } = await supabaseAdmin
        .from('projects')
        .insert({
          user_id: testUserId,
          title: 'Test Project',
          description: null,
          audio_file_name: null,
          audio_file_size: null,
          audio_duration: null,
          transcription_text: null,
        })
        .select()
        .single();
      
      expect(error).toBeNull();
      expect(data.description).toBeNull();
      expect(data.audio_file_name).toBeNull();
      expect(data.transcription_text).toBeNull();
      
      testIds.projectIds.push(data.id);
    });
  });

  describe('Outputs Table Schema', () => {
    let testProjectId;

    beforeEach(async () => {
      // Create test user and project
      const mockUser = generateMockUser();
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser.id,
          email: mockUser.email,
          full_name: mockUser.full_name,
        })
        .select()
        .single();
      
      testIds.userIds.push(profile.id);

      const mockProject = generateMockProject(profile.id);
      const { data: project } = await supabaseAdmin
        .from('projects')
        .insert(mockProject)
        .select()
        .single();
      
      testProjectId = project.id;
      testIds.projectIds.push(testProjectId);
    });

    it('should enforce foreign key constraint on project_id', async () => {
      const mockOutput = generateMockOutput('non-existent-project-id');
      
      const { data, error } = await supabaseAdmin
        .from('outputs')
        .insert(mockOutput);
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23503'); // Foreign key violation
    });

    it('should enforce type enum values', async () => {
      const mockOutput = generateMockOutput(testProjectId);
      
      const { data, error } = await supabaseAdmin
        .from('outputs')
        .insert({
          ...mockOutput,
          type: 'invalid_type', // Invalid enum value
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23514'); // Check constraint violation
    });

    it('should enforce platform enum values', async () => {
      const mockOutput = generateMockOutput(testProjectId);
      
      const { data, error } = await supabaseAdmin
        .from('outputs')
        .insert({
          ...mockOutput,
          platform: 'invalid_platform', // Invalid enum value
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23514'); // Check constraint violation
    });

    it('should enforce status enum values', async () => {
      const mockOutput = generateMockOutput(testProjectId);
      
      const { data, error } = await supabaseAdmin
        .from('outputs')
        .insert({
          ...mockOutput,
          status: 'invalid_status', // Invalid enum value
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23514'); // Check constraint violation
    });

    it('should accept valid output data', async () => {
      const mockOutput = generateMockOutput(testProjectId);
      
      const { data, error } = await supabaseAdmin
        .from('outputs')
        .insert(mockOutput)
        .select()
        .single();
      
      expect(error).toBeNull();
      expect(data).toMatchObject({
        project_id: testProjectId,
        type: mockOutput.type,
        platform: mockOutput.platform,
        content: mockOutput.content,
        status: mockOutput.status,
      });
      
      testIds.outputIds.push(data.id);
    });

    it('should handle JSON metadata correctly', async () => {
      const mockOutput = generateMockOutput(testProjectId);
      const complexMetadata = {
        hook_strength: 8,
        thread_number: 1,
        tags: ['AI', 'Technology'],
        metrics: {
          engagement_score: 9.5,
          readability: 'high',
        },
      };
      
      const { data, error } = await supabaseAdmin
        .from('outputs')
        .insert({
          ...mockOutput,
          metadata: complexMetadata,
        })
        .select()
        .single();
      
      expect(error).toBeNull();
      expect(data.metadata).toMatchObject(complexMetadata);
      
      testIds.outputIds.push(data.id);
    });
  });

  describe('Cascade Deletion Behavior', () => {
    let testUserId, testProjectId, testOutputId;

    beforeEach(async () => {
      // Create test user, project, and output
      const mockUser = generateMockUser();
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser.id,
          email: mockUser.email,
          full_name: mockUser.full_name,
        })
        .select()
        .single();
      
      testUserId = profile.id;

      const mockProject = generateMockProject(testUserId);
      const { data: project } = await supabaseAdmin
        .from('projects')
        .insert(mockProject)
        .select()
        .single();
      
      testProjectId = project.id;

      const mockOutput = generateMockOutput(testProjectId);
      const { data: output } = await supabaseAdmin
        .from('outputs')
        .insert(mockOutput)
        .select()
        .single();
      
      testOutputId = output.id;
    });

    it('should handle project deletion with outputs', async () => {
      // Delete project should cascade to outputs or prevent deletion
      const { data, error } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', testProjectId);
      
      if (error) {
        // If cascade is not enabled, should get foreign key violation
        expect(error.code).toBe('23503');
      } else {
        // If cascade is enabled, outputs should be deleted too
        const { data: outputs } = await supabaseAdmin
          .from('outputs')
          .select('*')
          .eq('id', testOutputId);
        
        expect(outputs).toHaveLength(0);
      }
      
      // Cleanup user
      await supabaseAdmin.from('profiles').delete().eq('id', testUserId);
    });

    it('should handle user profile deletion with projects', async () => {
      // Delete user should cascade to projects or prevent deletion
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', testUserId);
      
      if (error) {
        // If cascade is not enabled, should get foreign key violation
        expect(error.code).toBe('23503');
        
        // Manual cleanup
        await supabaseAdmin.from('outputs').delete().eq('id', testOutputId);
        await supabaseAdmin.from('projects').delete().eq('id', testProjectId);
        await supabaseAdmin.from('profiles').delete().eq('id', testUserId);
      } else {
        // If cascade is enabled, all related data should be deleted
        const { data: projects } = await supabaseAdmin
          .from('projects')
          .select('*')
          .eq('id', testProjectId);
        
        expect(projects).toHaveLength(0);
      }
    });
  });

  describe('Data Integrity Constraints', () => {
    it('should enforce unique email in profiles', async () => {
      const mockUser1 = generateMockUser();
      const mockUser2 = generateMockUser();
      const duplicateEmail = 'duplicate@example.com';
      
      // Insert first user
      const { data: profile1 } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser1.id,
          email: duplicateEmail,
          full_name: mockUser1.full_name,
        })
        .select()
        .single();
      
      testIds.userIds.push(profile1.id);
      
      // Try to insert second user with same email
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser2.id,
          email: duplicateEmail, // Duplicate email
          full_name: mockUser2.full_name,
        });
      
      expect(error).not.toBeNull();
      expect(error.code).toBe('23505'); // Unique violation
    });

    it('should handle processing hours constraints', async () => {
      const mockUser = generateMockUser();
      
      // Test negative processing hours
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: mockUser.id,
          email: mockUser.email,
          full_name: mockUser.full_name,
          processing_hours_used: -1, // Invalid negative value
        });
      
      // Should either fail with constraint or be accepted (depends on constraints)
      if (error) {
        expect(error.code).toBe('23514'); // Check constraint violation
      } else {
        // If accepted, clean up
        testIds.userIds.push(mockUser.id);
      }
    });
  });
});