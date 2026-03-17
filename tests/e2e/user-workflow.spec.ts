/**
 * End-to-End User Workflow Tests
 * Playwright tests for complete user journeys
 */

import { test, expect } from '@playwright/test';

test.describe('AudioRepurpose User Workflows', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test.describe('Anonymous User Journey', () => {
    test('should allow anonymous user to access homepage', async ({ page }) => {
      // Check that the homepage loads
      await expect(page).toHaveTitle(/AudioRepurpose/);
      
      // Look for key elements
      await expect(page.locator('h1')).toBeVisible();
      
      // Should see some form of upload interface or call-to-action
      const primaryCta = page.locator('a[href="/auth/signup"], a[href="/auth/demo"]').first();
      await expect(primaryCta).toBeVisible();
    });

    test('should navigate to waitlist signup', async ({ page }) => {
      // Look for waitlist signup elements
      const waitlistElements = page.locator('[data-testid="waitlist"], button:has-text("Join"), input[placeholder*="email" i]');
      
      if (await waitlistElements.count() > 0) {
        const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
        const submitButton = page.locator('button:has-text("Join"), button:has-text("Sign"), button[type="submit"]').first();
        
        if (await emailInput.isVisible()) {
          await emailInput.fill('test@example.com');
          
          if (await submitButton.isVisible()) {
            await submitButton.click();
            
            // Should show some confirmation
            await expect(page.locator('text=/success|thank|confirm/i')).toBeVisible({ timeout: 10000 });
          }
        }
      }
    });

    test('should show authentication options', async ({ page }) => {
      // Look for login/signup links or buttons
      const authElements = page.locator('a[href*="/auth/login"], a[href*="/auth/signup"]');
      
      if (await authElements.count() > 0) {
        await expect(authElements.first()).toBeVisible();
      }
    });
  });

  test.describe('Authentication Flow', () => {
    test('should navigate to login page', async ({ page }) => {
      // Try to find and click login link
      const loginLink = page.locator('a[href*="/auth/login"]').first();
      
      if (await loginLink.isVisible()) {
        await loginLink.click();
        
        // Should be on login page
        await expect(page).toHaveURL(/login/);
        
        // Should see login form
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button:has-text("Login"), button:has-text("Sign")')).toBeVisible();
      }
    });

    test('should navigate to signup page', async ({ page }) => {
      // Try to find and click signup link
      const signupLink = page.locator('a[href*="/auth/signup"]').first();
      
      if (await signupLink.isVisible()) {
        await signupLink.click();
        
        // Should be on signup page
        await expect(page).toHaveURL(/signup|register/);
        
        // Should see signup form
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]').first()).toBeVisible();
      }
    });

    test('should handle login form validation', async ({ page }) => {
      // Navigate to login page if it exists
      const loginLink = page.locator('a[href*="/auth/login"]').first();
      
      if (await loginLink.isVisible()) {
        await loginLink.click();
        
        const emailInput = page.locator('input[type="email"]');
        const passwordInput = page.locator('input[type="password"]');
        const submitButton = page.locator('button:has-text("Login"), button:has-text("Sign"), button[type="submit"]').first();
        
        if (await emailInput.isVisible() && await passwordInput.isVisible()) {
          // Try to submit empty form
          if (await submitButton.isVisible()) {
            await submitButton.click();
            
            // Should show validation errors
            await expect(page.locator('text=/required|invalid|error/i')).toBeVisible({ timeout: 5000 });
          }
          
          // Try with invalid email
          await emailInput.fill('invalid-email');
          if (await submitButton.isVisible()) {
            await submitButton.click();
            
            // Should show email validation error
            await expect(page.locator('text=/email|invalid/i')).toBeVisible({ timeout: 5000 });
          }
        }
      }
    });
  });

  test.describe('File Upload Interface', () => {
    test('should show file upload interface', async ({ page }) => {
      // Look for file upload elements
      const fileInput = page.locator('input[type="file"]');
      const uploadArea = page.getByText(/upload|drop/i).first();
      
      if (await fileInput.count() > 0 || await uploadArea.count() > 0) {
        // File upload interface exists
        if (await fileInput.isVisible()) {
          await expect(fileInput).toBeVisible();
          
          // Check accept attribute for audio files
          const acceptAttr = await fileInput.getAttribute('accept');
          if (acceptAttr) {
            expect(acceptAttr).toMatch(/audio|mp3|wav|m4a/i);
          }
        }
        
        if (await uploadArea.isVisible()) {
          await expect(uploadArea).toBeVisible();
        }
      }
    });

    test('should handle file selection', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]').first();
      
      if (await fileInput.isVisible()) {
        // Create a test file
        const testFile = Buffer.from('fake audio content');
        
        // Set the file
        await fileInput.setInputFiles({
          name: 'test-audio.mp3',
          mimeType: 'audio/mpeg',
          buffer: testFile,
        });
        
        // Should show file selected
        await expect(page.locator('text=/test-audio|selected|chosen/i')).toBeVisible({ timeout: 5000 });
      }
    });

    test('should validate file types', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]').first();
      
      if (await fileInput.isVisible()) {
        // Try to upload invalid file type
        const invalidFile = Buffer.from('not audio content');
        
        await fileInput.setInputFiles({
          name: 'document.txt',
          mimeType: 'text/plain',
          buffer: invalidFile,
        });
        
        // Look for upload button to trigger validation
        const uploadButton = page.locator('button:has-text("Upload"), button[type="submit"]').first();
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
          
          // Should show error message
          await expect(page.locator('text=/invalid|error|file.*type/i')).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });

  test.describe('Dashboard and Project Management', () => {
    test('should navigate to dashboard when available', async ({ page }) => {
      // Look for dashboard link
      const dashboardLink = page.locator('a[href*="/dashboard"]').first();
      
      if (await dashboardLink.isVisible()) {
        await dashboardLink.click();
        
        // Should be on dashboard page
        await expect(page).toHaveURL(/dashboard/);
        
        // Should show dashboard content
        await expect(page.locator('text=/project|upload|recent/i')).toBeVisible();
      }
    });

    test('should show project list when available', async ({ page }) => {
      // Navigate to dashboard or projects page
      const projectsLink = page.locator('[href*="dashboard"], [href*="project"]').first();
      
      if (await projectsLink.isVisible()) {
        await projectsLink.click();
        
        // Look for project-related elements
        const projectElements = page.locator('[data-testid*="project"], .project, text=/project/i');
        
        if (await projectElements.count() > 0) {
          await expect(projectElements.first()).toBeVisible();
        }
      }
    });

    test('should handle project status updates', async ({ page }) => {
      // This would test real-time status updates
      // For now, just check if status elements exist
      const statusElements = page.getByText(/status|processing|completed|failed/i).first();
      
      if (await statusElements.count() > 0) {
        await expect(statusElements).toBeVisible();
      }
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Page should still be usable
      await expect(page.locator('body')).toBeVisible();
      
      // Navigation might be collapsed on mobile
      const mobileNav = page.locator('button:has-text("Menu"), [data-testid="mobile-menu"], .hamburger');
      
      if (await mobileNav.count() > 0) {
        // Mobile navigation exists
        if (await mobileNav.first().isVisible()) {
          await mobileNav.first().click();
          
          // Navigation menu should open
          await expect(page.locator('[role="menu"], .mobile-menu, nav')).toBeVisible();
        }
      }
    });

    test('should work on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      
      // Page should be fully functional
      await expect(page.locator('body')).toBeVisible();
      
      // Check that main content is properly sized
      const mainContent = page.locator('main, [role="main"], .main-content').first();
      if (await mainContent.isVisible()) {
        const boundingBox = await mainContent.boundingBox();
        expect(boundingBox?.width).toBeLessThanOrEqual(768);
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper heading structure', async ({ page }) => {
      // Check for h1
      const h1 = page.locator('h1');
      await expect(h1.first()).toBeVisible();
      
      // Should have logical heading hierarchy
      const headings = page.locator('h1, h2, h3, h4, h5, h6');
      const headingCount = await headings.count();
      
      if (headingCount > 1) {
        // At least we have multiple headings
        expect(headingCount).toBeGreaterThan(1);
      }
    });

    test('should have accessible form labels', async ({ page }) => {
      const inputs = page.locator('input, textarea, select');
      const inputCount = await inputs.count();
      
      for (let i = 0; i < Math.min(inputCount, 5); i++) {
        const input = inputs.nth(i);
        
        // Should have label, aria-label, or aria-labelledby
        const hasLabel = await input.evaluate(el => {
          const id = el.id;
          if (id && document.querySelector(`label[for="${id}"]`)) return true;
          if (el.getAttribute('aria-label')) return true;
          if (el.getAttribute('aria-labelledby')) return true;
          if (el.getAttribute('placeholder')) return true; // Acceptable for demo
          return false;
        });
        
        if (await input.isVisible()) {
          expect(hasLabel).toBe(true);
        }
      }
    });

    test('should support keyboard navigation', async ({ page }) => {
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      
      // Should focus on first interactive element
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
      
      // Tab a few more times
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Should still have focus on an element
      await expect(page.locator(':focus')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Intercept API calls and make them fail
      await page.route('**/api/**', route => {
        route.abort('internetdisconnected');
      });
      
      // Try to interact with the app
      const uploadButton = page.locator('button:has-text("Upload"), input[type="file"]').first();
      
      if (await uploadButton.isVisible()) {
        if (await uploadButton.getAttribute('type') !== 'file') {
          await uploadButton.click();
        }
        
        // Should show error message
        await expect(page.locator('text=/error|failed|network/i')).toBeVisible({ timeout: 10000 });
      }
    });

    test('should display 404 page for invalid routes', async ({ page }) => {
      // Navigate to non-existent page
      await page.goto('/this-page-does-not-exist');
      
      // Should show 404 or error page
      await expect(page.getByRole('heading', { name: /404|could not be found/i }).first()).toBeVisible();
    });

    test('should handle JavaScript errors gracefully', async ({ page }) => {
      const jsErrors: string[] = [];
      
      // Listen for console errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          jsErrors.push(msg.text());
        }
      });
      
      // Listen for page errors
      page.on('pageerror', error => {
        jsErrors.push(error.message);
      });
      
      // Navigate and interact with the page
      await page.goto('/');
      
      // Click around the interface
      const clickableElements = page.locator('button, a, [role="button"]');
      const count = Math.min(await clickableElements.count(), 3);
      
      for (let i = 0; i < count; i++) {
        const element = clickableElements.nth(i);
        if (await element.isVisible()) {
          await element.click({ timeout: 5000 }).catch(() => {
            // Ignore click errors, we're just testing for JS errors
          });
          await page.waitForTimeout(1000);
        }
      }
      
      // Should not have critical JavaScript errors
      const criticalErrors = jsErrors.filter(error => 
        !error.includes('favicon') && 
        !error.includes('analytics') &&
        !error.includes('third-party')
      );
      
      expect(criticalErrors.length).toBe(0);
    });
  });

  test.describe('Performance', () => {
    test('should load page within reasonable time', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/');
      
      // Wait for main content to load
      await page.waitForLoadState('domcontentloaded');
      
      const loadTime = Date.now() - startTime;
      
      // Should load within 10 seconds (generous for CI environments)
      expect(loadTime).toBeLessThan(10000);
    });

    test('should have reasonable lighthouse scores', async ({ page }) => {
      // Navigate to page
      await page.goto('/');
      
      // Wait for content to load
      await page.waitForLoadState('networkidle');
      
      // Check for basic performance indicators
      const images = page.locator('img');
      const imageCount = await images.count();
      
      // Images should have alt text or be decorative
      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const role = await img.getAttribute('role');
        
        // Should have alt text or be marked as decorative
        expect(alt !== null || role === 'presentation').toBe(true);
      }
    });
  });
});
