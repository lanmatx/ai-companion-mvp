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

    const body = req.body || {};
    const userId = String(body.user_id || '').trim();

    console.log('GET NOTES userId:', userId, typeof userId);

    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const { data, error } = await supabase
      .from('progress_logs')
      .select('id, created_at, entry_date, entry_type, entry_text')
      .eq('user_id', userId)
      .in('entry_type', ['struggle', 'win', 'milestone'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('SUPABASE READ ERROR:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ notes: data || [] });
  } catch (error) {
    console.error('SERVER ERROR:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
}