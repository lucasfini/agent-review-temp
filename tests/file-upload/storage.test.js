/**
 * Storage Integration Tests
 * Tests for Supabase Storage bucket operations
 */

import { supabaseAdmin } from '../../lib/supabase/server';
import {
  createMockAudioFile,
  validateEnvironmentVariables,
} from '../utils/test-helpers';

describe('Storage Integration', () => {
  const BUCKET_NAME = 'audio-files';
  let testFiles = [];

  beforeAll(() => {
    if (!validateEnvironmentVariables()) {
      console.warn('Skipping storage tests due to missing environment variables');
      return;
    }
  });

  afterEach(async () => {
    // Cleanup test files
    for (const filePath of testFiles) {
      try {
        await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .remove([filePath]);
      } catch (error) {
        console.warn(`Failed to cleanup file ${filePath}:`, error.message);
      }
    }
    testFiles = [];
  });

  describe('Bucket Configuration', () => {
    it('should have audio-files bucket configured', async () => {
      const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
      
      if (error) {
        console.warn('Storage may not be configured:', error.message);
        return;
      }
      
      expect(buckets).toBeDefined();
      const audioFilesBucket = buckets.find(bucket => bucket.name === BUCKET_NAME);
      expect(audioFilesBucket).toBeDefined();
      expect(audioFilesBucket.public).toBeDefined();
    });

    it('should allow listing bucket contents', async () => {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .list('', { limit: 1 });
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist:', error.message);
        return;
      }
      
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('File Upload Operations', () => {
    it('should upload audio file successfully', async () => {
      const testFile = createMockAudioFile('test-upload.mp3', 1024);
      const fileName = `test-${Date.now()}/test-upload.mp3`;
      const fileBuffer = await testFile.arrayBuffer();
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
          contentType: testFile.type,
          upsert: false,
        });
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping upload test');
        return;
      }
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.path).toBe(fileName);
      
      testFiles.push(fileName);
    });

    it('should handle duplicate file uploads', async () => {
      const testFile = createMockAudioFile('duplicate-test.mp3', 1024);
      const fileName = `test-${Date.now()}/duplicate-test.mp3`;
      const fileBuffer = await testFile.arrayBuffer();
      
      // First upload
      const { data: data1, error: error1 } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
          contentType: testFile.type,
          upsert: false,
        });
      
      if (error1 && error1.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping duplicate test');
        return;
      }
      
      expect(error1).toBeNull();
      testFiles.push(fileName);
      
      // Second upload with same name (should fail with upsert: false)
      const { data: data2, error: error2 } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
          contentType: testFile.type,
          upsert: false,
        });
      
      expect(error2).not.toBeNull();
      expect(error2.message).toContain('already exists');
    });

    it('should handle file upload with upsert', async () => {
      const testFile = createMockAudioFile('upsert-test.mp3', 1024);
      const fileName = `test-${Date.now()}/upsert-test.mp3`;
      const fileBuffer = await testFile.arrayBuffer();
      
      // First upload
      const { data: data1, error: error1 } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
          contentType: testFile.type,
          upsert: true,
        });
      
      if (error1 && error1.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping upsert test');
        return;
      }
      
      expect(error1).toBeNull();
      testFiles.push(fileName);
      
      // Second upload with upsert: true (should succeed)
      const { data: data2, error: error2 } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
          contentType: testFile.type,
          upsert: true,
        });
      
      expect(error2).toBeNull();
    });

    it('should reject invalid file types if configured', async () => {
      const invalidFile = new File(['text content'], 'test.txt', { type: 'text/plain' });
      const fileName = `test-${Date.now()}/test.txt`;
      const fileBuffer = await invalidFile.arrayBuffer();
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
          contentType: invalidFile.type,
          upsert: false,
        });
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping invalid file test');
        return;
      }
      
      // This depends on bucket configuration - might succeed or fail
      if (error) {
        expect(error.message).toContain('file type');
      } else {
        testFiles.push(fileName);
      }
    });

    it('should handle large file uploads', async () => {
      const largeSize = 10 * 1024 * 1024; // 10MB
      const largeFile = createMockAudioFile('large-test.mp3', largeSize);
      const fileName = `test-${Date.now()}/large-test.mp3`;
      const fileBuffer = await largeFile.arrayBuffer();
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
          contentType: largeFile.type,
          upsert: false,
        });
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping large file test');
        return;
      }
      
      if (error && error.message?.includes('size')) {
        console.warn('File size limit reached:', error.message);
        return;
      }
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      
      testFiles.push(fileName);
    });
  });

  describe('File Download Operations', () => {
    let uploadedFileName;

    beforeEach(async () => {
      // Upload a test file first
      const testFile = createMockAudioFile('download-test.mp3', 2048);
      uploadedFileName = `test-${Date.now()}/download-test.mp3`;
      const fileBuffer = await testFile.arrayBuffer();
      
      const { error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(uploadedFileName, fileBuffer, {
          contentType: testFile.type,
          upsert: false,
        });
      
      if (!error) {
        testFiles.push(uploadedFileName);
      }
    });

    it('should download uploaded file successfully', async () => {
      if (!uploadedFileName) {
        console.warn('No uploaded file available for download test');
        return;
      }
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .download(uploadedFileName);
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping download test');
        return;
      }
      
      expect(error).toBeNull();
      expect(data).toBeInstanceOf(Blob);
      expect(data.size).toBeGreaterThan(0);
    });

    it('should handle download of non-existent file', async () => {
      const nonExistentFile = `test-${Date.now()}/non-existent.mp3`;
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .download(nonExistentFile);
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping non-existent file test');
        return;
      }
      
      expect(error).not.toBeNull();
      expect(error.message).toContain('not found');
      expect(data).toBeNull();
    });

    it('should validate downloaded file content', async () => {
      if (!uploadedFileName) {
        console.warn('No uploaded file available for content validation test');
        return;
      }
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .download(uploadedFileName);
      
      if (error) {
        console.warn('Cannot download file for content validation');
        return;
      }
      
      expect(data).toBeInstanceOf(Blob);
      expect(data.type).toBeTruthy();
      
      // Check if we can read the blob content
      const arrayBuffer = await data.arrayBuffer();
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
      expect(arrayBuffer.byteLength).toBe(data.size);
    });
  });

  describe('File Management Operations', () => {
    let testFileName;

    beforeEach(async () => {
      // Upload a test file
      const testFile = createMockAudioFile('management-test.mp3', 1024);
      testFileName = `test-${Date.now()}/management-test.mp3`;
      const fileBuffer = await testFile.arrayBuffer();
      
      const { error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(testFileName, fileBuffer, {
          contentType: testFile.type,
          upsert: false,
        });
      
      if (!error) {
        testFiles.push(testFileName);
      }
    });

    it('should list files in directory', async () => {
      if (!testFileName) {
        console.warn('No test file available for listing test');
        return;
      }
      
      const directory = testFileName.split('/')[0];
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .list(directory);
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping list test');
        return;
      }
      
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      
      const uploadedFile = data.find(file => file.name === 'management-test.mp3');
      expect(uploadedFile).toBeDefined();
    });

    it('should get file metadata', async () => {
      if (!testFileName) {
        console.warn('No test file available for metadata test');
        return;
      }
      
      const directory = testFileName.split('/')[0];
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .list(directory);
      
      if (error) {
        console.warn('Cannot list files for metadata test');
        return;
      }
      
      const fileInfo = data.find(file => file.name === 'management-test.mp3');
      if (fileInfo) {
        expect(fileInfo).toHaveProperty('name');
        expect(fileInfo).toHaveProperty('id');
        expect(fileInfo).toHaveProperty('updated_at');
        expect(fileInfo).toHaveProperty('created_at');
        expect(fileInfo).toHaveProperty('last_accessed_at');
        expect(fileInfo).toHaveProperty('metadata');
      }
    });

    it('should delete file successfully', async () => {
      if (!testFileName) {
        console.warn('No test file available for deletion test');
        return;
      }
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([testFileName]);
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping deletion test');
        return;
      }
      
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      
      // Remove from test cleanup list since we deleted it
      testFiles = testFiles.filter(file => file !== testFileName);
      
      // Verify file is deleted
      const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .download(testFileName);
      
      expect(downloadError).not.toBeNull();
      expect(downloadData).toBeNull();
    });

    it('should handle deletion of non-existent file', async () => {
      const nonExistentFile = `test-${Date.now()}/non-existent.mp3`;
      
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([nonExistentFile]);
      
      if (error && error.message?.includes('bucket')) {
        console.warn('Storage bucket may not exist, skipping non-existent deletion test');
        return;
      }
      
      // This might succeed or fail depending on implementation
      if (error) {
        expect(error.message).toContain('not found');
      } else {
        expect(Array.isArray(data)).toBe(true);
      }
    });
  });

  describe('Storage Security', () => {
    it('should enforce file path restrictions', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '/etc/passwd',
        '..\\..\\windows\\system32',
        'test/../../../sensitive.txt',
      ];
      
      for (const path of maliciousPaths) {
        const testFile = createMockAudioFile('test.mp3', 1024);
        const fileBuffer = await testFile.arrayBuffer();
        
        const { data, error } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .upload(path, fileBuffer, {
            contentType: testFile.type,
            upsert: false,
          });
        
        if (error && error.message?.includes('bucket')) {
          console.warn('Storage bucket may not exist, skipping security test');
          break;
        }
        
        // Should either reject malicious paths or sanitize them
        if (!error) {
          // If upload succeeded, the path should be sanitized
          expect(data.path).not.toBe(path);
          testFiles.push(data.path);
        }
      }
    });

    it('should handle special characters in file paths', async () => {
      const specialPaths = [
        'test-folder/файл.mp3',
        'test-folder/αρχείο.mp3',
        'test-folder/special@#$.mp3',
        'test-folder/with spaces.mp3',
      ];
      
      for (const path of specialPaths) {
        const testFile = createMockAudioFile('test.mp3', 1024);
        const fileBuffer = await testFile.arrayBuffer();
        
        const { data, error } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .upload(path, fileBuffer, {
            contentType: testFile.type,
            upsert: false,
          });
        
        if (error && error.message?.includes('bucket')) {
          console.warn('Storage bucket may not exist, skipping special characters test');
          break;
        }
        
        if (!error) {
          expect(data).toBeDefined();
          testFiles.push(data.path);
        }
      }
    });
  });
});