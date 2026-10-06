import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const coordinators = [
  // Technical Events
  { event: 'Paper Presentation', code: 'PP', email: 'PP@gmail.com', password: 'Cybersentinel@techPP', day: 'DAY_1', type: 'TEAM' },
  { event: 'Unsaid', code: 'UN', email: 'UN@gmail.com', password: 'Cybersentinel@techUN', day: 'DAY_1', type: 'TEAM' },
  { event: 'Cipher Coding', code: 'CC', email: 'CC@gmail.com', password: 'Cybersentinel@techCC', day: 'DAY_1', type: 'INDIVIDUAL' },
  { event: 'Weblica', code: 'WE', email: 'WE@gmail.com', password: 'Cybersentinel@techWE', day: 'DAY_1', type: 'TEAM' },
  { event: 'Xcoders', code: 'XC', email: 'XC@gmail.com', password: 'Cybersentinel@techXC', day: 'DAY_1', type: 'INDIVIDUAL' },
  // Non-Technical Events
  { event: 'Spotlight', code: 'SP', email: 'SP@gmail.com', password: 'Cybersentinel@nonSP', day: 'DAY_2', type: 'INDIVIDUAL' },
  { event: 'Connections', code: 'CO', email: 'CO@gmail.com', password: 'Cybersentinel@nonCO', day: 'DAY_2', type: 'TEAM' },
  { event: 'Find the BGM', code: 'FTB', email: 'FTB@gmail.com', password: 'Cybersentinel@nonFTB', day: 'DAY_2', type: 'TEAM' },
  { event: 'Mixed Signals', code: 'MS', email: 'MS@gmail.com', password: 'Cybersentinel@nonMS', day: 'DAY_2', type: 'TEAM' },
  { event: 'Lost in Lyrics', code: 'LIL', email: 'LIL@gmail.com', password: 'Cybersentinel@nonLIL', day: 'DAY_2', type: 'TEAM' }
];

// pgcrypto's crypt() (used by public.coordinator_login) only verifies $2a$ bcrypt
// hashes, so the prefix bcryptjs emits must be rewritten before storing.
const hashPassword = (password) =>
  bcrypt.hashSync(password, bcrypt.genSaltSync(10)).replace('$2b$', '$2a$');

async function setup() {
  console.log("🚀 Starting Coordinator and Event setup...");

  for (const c of coordinators) {
    console.log(`\nProcessing ${c.event} (${c.code})...`);
    
    // 1. Ensure the Event exists in the database
    let eventId;
    const { data: existingEvent } = await supabase.from('events').select('id').eq('code', c.code).single();
    
    if (!existingEvent) {
      console.log(`   Event ${c.code} not found. Creating it...`);
      const { data: newEvent, error: evtErr } = await supabase.from('events').insert({
        name: c.event,
        code: c.code,
        day: c.day,
        event_type: c.type,
        min_team_size: 1,
        max_team_size: c.type === 'TEAM' ? 4 : 1,
        status: 'ACTIVE'
      }).select().single();
      
      if (evtErr) {
        console.error(`❌ Failed to create event ${c.code}:`, evtErr.message);
        continue;
      }
      eventId = newEvent.id;
    } else {
      eventId = existingEvent.id;
    }

    // 2. Create the user in Supabase Auth
    const { data: userRecord, error: userError } = await supabase.auth.admin.createUser({
      email: c.email,
      password: c.password,
      email_confirm: true,
      user_metadata: { role: 'coordinator', event_code: c.code }
    });

    let userId;
    if (userError) {
      if (userError.message.includes('already been registered')) {
        // Fetch existing user if already created
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users.find(u => u.email === c.email);
        userId = existingUser?.id;
      } else {
        console.error(`❌ Failed to create auth user ${c.email}: ${userError.message}`);
        continue;
      }
    } else {
      userId = userRecord.user.id;
      console.log(`✅ Created Auth User for ${c.email}`);
    }

    if (userId) {
// 3. Ensure they have a Profile in the `profiles` table (Fixes the Foreign Key Error)
      //    coordinator_login authenticates against profiles.password_hash, so the hash must
      //    be stored here or the account can never log in.
      const { data: existingProfile } = await supabase.from('profiles').select('id, password_hash').eq('id', userId).maybeSingle();

      if (!existingProfile) {
        const { error: profErr } = await supabase.from('profiles').insert({
          id: userId,
          email: c.email,
          name: `${c.code} Coordinator`,
          role: 'COORDINATOR',
          active: true,
          password_hash: hashPassword(c.password)
        });
        if (profErr) console.error(`❌ Failed to create profile:`, profErr.message);
        else console.log(`✅ Created profile with password hash for ${c.email}`);
      } else if (!existingProfile.password_hash) {
        const { error: backfillErr } = await supabase
          .from('profiles')
          .update({ password_hash: hashPassword(c.password) })
          .eq('id', userId);
        if (backfillErr) console.error(`❌ Failed to backfill password hash:`, backfillErr.message);
        else console.log(`✅ Backfilled missing password hash for ${c.email}`);
      }
      // 4. Assign coordinator to the event
      const { data: existingAssignment } = await supabase.from('event_coordinators')
        .select('id').eq('coordinator_user_id', userId).eq('event_id', eventId).single();
        
      if (!existingAssignment) {
        const { error: assignError } = await supabase.from('event_coordinators').insert({
          event_id: eventId,
          coordinator_user_id: userId
        });

        if (assignError) {
          console.error(`❌ Failed to assign to event: ${assignError.message}`);
        } else {
          console.log(`✅ Successfully assigned ${c.email} to event ${c.code}`);
        }
      } else {
        console.log(`✅ ${c.email} is already assigned to event ${c.code}`);
      }
    }
  }
  
  console.log("\n🎉 Setup complete!");
}

setup();
