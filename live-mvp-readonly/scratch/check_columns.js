const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else if (data.length > 0) {
    console.log('Columns in candidates:', Object.keys(data[0]));
  } else {
    console.log('No data in candidates table');
  }
}

checkColumns();
