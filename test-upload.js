#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Simple test script to validate our upload pipeline
async function testUploadPipeline() {
  console.log('🧪 Testing AudioRepurpose Upload Pipeline...\n');

  // 1. Check environment variables
  console.log('1️⃣ Checking Environment Variables:');
  const requiredEnvs = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY'
  ];

  const missing = requiredEnvs.filter(env => !process.env[env]);
  if (missing.length > 0) {
    console.log('❌ Missing environment variables:', missing);
    return false;
  }
  console.log('✅ All environment variables present\n');

  // 2. Test Supabase connection
  console.log('2️⃣ Testing Supabase Connection:');
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test basic connection
    const { data, error } = await supabase.from('projects').select('count').limit(1);
    if (error) {
      console.log('❌ Supabase connection failed:', error.message);
      return false;
    }
    console.log('✅ Supabase connection successful\n');

    // 3. Test database schema
    console.log('3️⃣ Testing Database Schema:');
    const tables = ['profiles', 'projects', 'outputs'];
    
    for (const table of tables) {
      try {
        const { error: tableError } = await supabase.from(table).select('*').limit(1);
        if (tableError) {
          console.log(`❌ Table "${table}" error:`, tableError.message);
        } else {
          console.log(`✅ Table "${table}" accessible`);
        }
      } catch (err) {
        console.log(`❌ Table "${table}" failed:`, err.message);
      }
    }
    console.log('');

    // 4. Test storage bucket
    console.log('4️⃣ Testing Storage Bucket:');
    try {
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      if (bucketError) {
        console.log('❌ Storage bucket error:', bucketError.message);
      } else {
        const audioFilesBucket = buckets.find(b => b.name === 'audio-files');
        if (audioFilesBucket) {
          console.log('✅ audio-files bucket exists');
        } else {
          console.log('❌ audio-files bucket not found');
          console.log('Available buckets:', buckets.map(b => b.name));
        }
      }
    } catch (err) {
      console.log('❌ Storage test failed:', err.message);
    }
    console.log('');

    // 5. Test OpenAI connection
    console.log('5️⃣ Testing OpenAI Connection:');
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log('✅ OpenAI API connection successful');
      } else {
        console.log('❌ OpenAI API connection failed:', response.status);
      }
    } catch (err) {
      console.log('❌ OpenAI test failed:', err.message);
    }
    console.log('');

    // 6. Test demo user creation
    console.log('6️⃣ Testing Demo User Creation:');
    const demoUserId = '00000000-0000-0000-0000-000000000000';
    
    try {
      // Check if demo user exists
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', demoUserId)
        .single();

      if (!existingProfile && profileCheckError?.code === 'PGRST116') {
        // Create demo user
        const { error: createError } = await supabase
          .from('profiles')
          .insert({
            id: demoUserId,
            email: 'demo@example.com',
            full_name: 'Demo User',
            subscription_plan: 'free',
            subscription_status: 'inactive',
            processing_hours_used: 0,
            processing_hours_limit: 4
          });

        if (createError) {
          console.log('❌ Demo user creation failed:', createError.message);
        } else {
          console.log('✅ Demo user created successfully');
        }
      } else {
        console.log('✅ Demo user already exists');
      }
    } catch (err) {
      console.log('❌ Demo user test failed:', err.message);
    }

  } catch (err) {
    console.log('❌ Overall test failed:', err.message);
    return false;
  }

  console.log('\n🎉 Upload pipeline validation complete!');
  console.log('You can now try uploading files through the web interface.');
  return true;
}

// Run the test
testUploadPipeline().catch(console.error);