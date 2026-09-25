const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const extractionId = '695aaf3a-8d98-4379-98e9-ec980ace7977';

async function check() {
  const { data, error } = await supabase
    .from('candidates')
    .select('id, candidate_id, decision_packet, updated_at, hiring_run_id')
    .eq('candidate_id', extractionId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Candidate entries for this profile:', data.length);
    data.forEach(c => {
      console.log(`ID: ${c.id}, Hiring Run: ${c.hiring_run_id}, Updated At: ${c.updated_at}, Has Packet: ${!!c.decision_packet}`);
    });
  }

}

check();
