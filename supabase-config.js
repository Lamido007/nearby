// supabase-config.js
const SUPABASE_URL = 'https://heyxaatplgcgjwqvtjof.supabase.co';
const SUPABASE_ANON_KEY = 'wYlIdKMnacfA13JWMOjkxw_-hIh_Orx';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper: Get current session
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Helper: Get current user profile
async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();
  return user;
}

// ... (rest of your helper functions remain the same)
// Ensure you have functions like signUp, signIn, signOut, createPost, fetchFeed, etc.
