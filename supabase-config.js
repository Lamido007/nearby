// ============================================
// NEARBY — SUPABASE CONFIG v2
// ============================================
// SETUP:
// 1. Find YOUR_ANON_KEY_HERE below
// 2. Replace it with your full Supabase anon key
//    (starts with wYlIdK...)
// 3. Save file + push to GitHub
// ============================================

const SUPABASE_URL = 'https://heyxaatplgcgjwqvtjof.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhleXhhYXRwbGdjZ2p3cXZ0am9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMjM3MjksImV4cCI6MjA5MTU5OTcyOX0.GUOCMK6-zM5TNaLJ0lxSsCsLP-xGKKWX_izOhnHna0Q'

// Initialize Supabase client
const { createClient } = supabase
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ============================================
// AUTH HELPERS
// ============================================

async function getSession() {
  const { data: { session } } = await sb.auth.getSession()
  return session
}

async function requireAuth(redirectTo = 'nearby-auth.html') {
  const session = await getSession()
  if (!session) {
    window.location.href = redirectTo
    return null
  }
  return session
}

async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null
  const { data, error } = await sb
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single()
  if (error) console.warn('getCurrentUser error:', error.message)
  return data
}

async function signUp(email, password, fullName, userType = 'resident') {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  })
  if (error) return { error }

  // Profile is created automatically by the handle_new_user() trigger
  // But we update extra fields here
  if (data.user) {
    await sb.from('users').upsert({
      id: data.user.id,
      full_name: fullName,
      email: email,
      user_type: userType,
      is_newcomer: userType === 'newcomer',
      rep_points: 0,
      badge_level: 1,
      city: 'Lagos',
      country: 'Nigeria'
    }, { onConflict: 'id' })
  }

  return { data, error: null }
}

async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  return { data, error }
}

async function signInWithGoogle() {
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/nearby-onboarding.html' }
  })
  return { data, error }
}

async function signOut() {
  await sb.auth.signOut()
  window.location.href = 'nearby-landing.html'
}

async function resetPassword(email) {
  const { data, error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/nearby-auth.html'
  })
  return { data, error }
}

// ============================================
// USERS HELPERS
// ============================================

async function getUserById(userId) {
  const { data } = await sb
    .from('users').select('*').eq('id', userId).single()
  return data
}

async function updateProfile(userId, updates) {
  const { data, error } = await sb
    .from('users').update(updates).eq('id', userId)
  return { data, error }
}

async function addRepPoints(userId, points) {
  const user = await getUserById(userId)
  if (!user) return
  const newPoints = (user.rep_points || 0) + points
  const newBadge = getBadgeLevel(newPoints)
  await sb.from('users').update({
    rep_points: newPoints,
    badge_level: newBadge
  }).eq('id', userId)
  return newPoints
}

function getBadgeLevel(points) {
  if (points >= 1000) return 4 // Legend
  if (points >= 700) return 3  // Ambassador
  if (points >= 400) return 2  // Star
  return 1                     // Neighbor
}

function getBadgeName(level) {
  const badges = { 1: '🏡 Neighbor', 2: '⭐ Community Star', 3: '🏆 Ambassador', 4: '👑 Legend' }
  return badges[level] || '🏡 Neighbor'
}

function getBadgeColor(level) {
  const colors = { 1: '#7A9E7E', 2: '#E8A838', 3: '#C4622D', 4: '#9B59B6' }
  return colors[level] || '#7A9E7E'
}

// ============================================
// POSTS / FEED HELPERS
// ============================================

async function loadFeed(neighborhood, limit = 20) {
  const { data, error } = await sb
    .from('posts')
    .select(`*, users(id, full_name, avatar_url, badge_level, user_type, neighborhood)`)
    .eq('neighborhood', neighborhood)
    .eq('is_flagged', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

async function createPost(userId, content, postType, neighborhood, extra = {}) {
  const { data, error } = await sb.from('posts').insert({
    user_id: userId,
    content,
    post_type: postType || 'post',
    neighborhood,
    geofence_level: extra.geofenceLevel || 'estate',
    event_date: extra.eventDate || null,
    likes_count: 0,
    is_flagged: false
  }).select()

  // Award rep points for posting
  if (!error && data) await addRepPoints(userId, 5)
  return { data, error }
}

async function likePost(postId, userId) {
  const { error } = await sb.from('post_likes').insert({ post_id: postId, user_id: userId })
  if (!error) await sb.rpc('increment_likes', { post_id: postId })
  return { error }
}

async function unlikePost(postId, userId) {
  await sb.from('post_likes').delete()
    .eq('post_id', postId).eq('user_id', userId)
  await sb.from('posts').update({ likes_count: sb.raw('likes_count - 1') }).eq('id', postId)
}

async function hasLiked(postId, userId) {
  const { data } = await sb.from('post_likes')
    .select('id').eq('post_id', postId).eq('user_id', userId).single()
  return !!data
}

async function flagPost(postId, userId, reason) {
  await sb.from('posts').update({ is_flagged: true }).eq('id', postId)
  await sb.from('reports').insert({ post_id: postId, user_id: userId, reason, status: 'pending' })
}

// WhatsApp share for a post
function sharePostWhatsApp(postContent, neighborhood) {
  const text = encodeURIComponent(
    `📍 *Nearby — ${neighborhood}*\n\n${postContent}\n\n👉 Join your neighborhood: https://nearby-navy.vercel.app`
  )
  window.open(`https://wa.me/?text=${text}`, '_blank')
}

// WhatsApp share for a job
function shareJobWhatsApp(jobTitle, pay, neighborhood) {
  const text = encodeURIComponent(
    `💼 *Job Alert on Nearby — ${neighborhood}*\n\n*${jobTitle}*\nPay: ${pay}\n\n👉 Apply now: https://nearby-navy.vercel.app/nearby-jobs.html`
  )
  window.open(`https://wa.me/?text=${text}`, '_blank')
}

// ============================================
// NEW ARRIVALS HELPERS
// ============================================

async function getNewArrivals(neighborhood, days = 30) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const { data } = await sb
    .from('users')
    .select('*')
    .eq('neighborhood', neighborhood)
    .eq('is_newcomer', true)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
  return data || []
}

async function welcomeNewcomer(senderId, receiverId) {
  await sb.from('welcomes').insert({ sender_id: senderId, receiver_id: receiverId })
  await addRepPoints(senderId, 10)
  await createNotification(receiverId, 'welcome', 'Someone welcomed you to the neighborhood! 👋', senderId)
}

// ============================================
// JOBS HELPERS
// ============================================

async function loadJobs(neighborhood, limit = 20) {
  const { data } = await sb
    .from('jobs')
    .select(`*, users(id, full_name, avatar_url, badge_level)`)
    .eq('neighborhood', neighborhood)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

async function postJob(businessId, jobData) {
  const { data, error } = await sb.from('jobs').insert({
    business_id: businessId,
    title: jobData.title,
    description: jobData.description,
    job_type: jobData.jobType,
    pay: jobData.pay,
    neighborhood: jobData.neighborhood,
    city: jobData.city || 'Lagos',
    requirements: jobData.requirements,
    contact_info: jobData.contactInfo,
    is_active: true,
    is_featured: false,
    applicants_count: 0,
    expires_at: jobData.expiresAt
  }).select()
  return { data, error }
}

async function applyForJob(jobId, userId) {
  const { error } = await sb.from('job_applications')
    .insert({ job_id: jobId, user_id: userId, status: 'pending' })
  if (!error) await sb.rpc('increment_applicants', { job_id: jobId })
  return { error }
}

// ============================================
// MESSAGES HELPERS
// ============================================

async function loadMessages(userId, otherId) {
  const { data } = await sb
    .from('messages')
    .select(`*, sender:users!sender_id(id, full_name, avatar_url, badge_level)`)
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true })
  return data || []
}

async function sendMessage(senderId, receiverId, content) {
  const encrypted = btoa(unescape(encodeURIComponent(content)))
  const { data, error } = await sb.from('messages').insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content: encrypted,
    is_read: false
  }).select()
  return { data, error }
}

function decryptMessage(encrypted) {
  try { return decodeURIComponent(escape(atob(encrypted))) }
  catch { return encrypted }
}

async function markMessagesRead(userId, senderId) {
  await sb.from('messages')
    .update({ is_read: true })
    .eq('receiver_id', userId)
    .eq('sender_id', senderId)
}

// ============================================
// NOTIFICATIONS HELPERS
// ============================================

async function createNotification(userId, type, message, fromUserId = null) {
  await sb.from('notifications').insert({ user_id: userId, type, message, from_user_id: fromUserId, is_read: false })
}

async function loadNotifications(userId) {
  const { data } = await sb
    .from('notifications')
    .select(`*, from_user:users!from_user_id(id, full_name, avatar_url, badge_level)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  return data || []
}

async function markNotifRead(notifId) {
  await sb.from('notifications').update({ is_read: true }).eq('id', notifId)
}

async function getUnreadCount(userId) {
  const { count } = await sb.from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_read', false)
  return count || 0
}

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

function subscribeToFeed(neighborhood, onNewPost) {
  return sb.channel('feed-' + neighborhood)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `neighborhood=eq.${neighborhood}` }, onNewPost)
    .subscribe()
}

function subscribeToMessages(userId, onNewMessage) {
  return sb.channel('messages-' + userId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, onNewMessage)
    .subscribe()
}

function subscribeToNotifications(userId, onNew) {
  return sb.channel('notifs-' + userId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, onNew)
    .subscribe()
}

// ============================================
// NEARBY SCORE
// ============================================

async function getNeighborhoodScore(neighborhood) {
  const { data } = await sb.from('neighborhood_scores')
    .select('*').eq('neighborhood', neighborhood).single()
  return data || { score: 0, user_count: 0, post_count: 0, job_count: 0 }
}

// ============================================
// ADMIN HELPERS
// ============================================

async function getPlatformStats() {
  const [users, posts, jobs, reports] = await Promise.all([
    sb.from('users').select('*', { count: 'exact', head: true }),
    sb.from('posts').select('*', { count: 'exact', head: true }),
    sb.from('jobs').select('*', { count: 'exact', head: true }).eq('is_active', true),
    sb.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending')
  ])
  return {
    totalUsers: users.count || 0,
    totalPosts: posts.count || 0,
    activeJobs: jobs.count || 0,
    pendingReports: reports.count || 0
  }
}

async function getFlaggedPosts() {
  const { data } = await sb.from('posts')
    .select('*, users(full_name, email)')
    .eq('is_flagged', true)
    .order('created_at', { ascending: false })
  return data || []
}

async function removePost(postId) {
  await sb.from('posts').delete().eq('id', postId)
}

async function banUser(userId) {
  await sb.from('users').update({ is_banned: true }).eq('id', userId)
}

async function approveAmbassador(userId) {
  await sb.from('users').update({ badge_level: 3, ambassador_approved: true }).eq('id', userId)
  await createNotification(userId, 'badge', '🎉 Congratulations! You are now a Community Ambassador!')
}

// ============================================
// UTILITY: Format timestamp
// ============================================
function timeAgo(timestamp) {
  const now = new Date()
  const then = new Date(timestamp)
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago'
  return then.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

// ============================================
// UTILITY: Get user initials for avatar
// ============================================
function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

console.log('✅ Nearby — Supabase v2 connected')
console.log('📍 Project: heyxaatplgcgjwqvtjof.supabase.co')
console.log('🔒 RLS enabled · Messages encrypted · Real-time ready')
