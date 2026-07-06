import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Autentifikatsiyadan otmagan' }), { status: 401 });
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', caller.id)
      .single();

    if (!profile || !profile.is_admin) {
      return new Response(JSON.stringify({ error: 'Faqat adminlar foydalanuvchi ochira oladi' }), { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId talab qilinadi' }), { status: 400 });
    }

    if (caller.id === userId) {
      return new Response(JSON.stringify({ error: 'Ozini ochirib bolmaydi' }), { status: 400 });
    }

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const tables = ['results', 'comments', 'arena_matches'];
    for (const table of tables) {
      const { error: delError } = await serviceRoleClient
        .from(table)
        .delete()
        .eq('userId', userId);
      if (delError) console.error(`Delete from ${table} error:`, delError);
    }

    const { error: delProfileError } = await serviceRoleClient
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (delProfileError) console.error('Delete profile error:', delProfileError);

    const { error: deleteAuthError } = await serviceRoleClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error('Auth delete error:', deleteAuthError);
      return new Response(JSON.stringify({ error: 'Foydalanuvchini ochirishda xatolik' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: 'Server xatoligi' }), { status: 500 });
  }
});
