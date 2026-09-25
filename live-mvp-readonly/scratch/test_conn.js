
async function test() {
  try {
    const res = await fetch('https://mumvdcoyivmcbegstosw.supabase.co/rest/v1/', {
        headers: { 'apikey': 'invalid' }
    });
    console.log('Status:', res.status);
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}
test();
