import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { user_id, entry_date, entry_type, entry_text } = req.body || {};
    const cleanUserId = (user_id || "").trim();

    if (!cleanUserId || !entry_type || !entry_text) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { error } = await supabase.from('progress_logs').insert([
      {
        user_id: cleanUserId,
        entry_date: entry_date || null,
        entry_type,
        entry_text
      }
    ]);

    if (error) {
      console.error('SUPABASE INSERT ERROR:', JSON.stringify(error, null, 2));
      return res.status(500).json({
        error: 'Supabase insert failed',
        details: error.message
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('SERVER ERROR:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
}