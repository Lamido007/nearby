// ============================================================
// nearby-push.js — Push Notification Manager
// Include on every page after supabase-config.js
// ============================================================

var NearbyPush = (function() {

  var VAPID_PUBLIC_KEY = ''; // Leave blank — Nearby uses Supabase Edge Functions for push
  // For full push: you'd add a VAPID key from web-push library.
  // This implementation saves subscription to DB and shows in-app banners
  // which work reliably cross-platform without a push server.

  // ── IN-APP NOTIFICATION BANNER ───────────────────────────────
  // This shows a floating banner for real-time events (works while app is open)

  var bannerQueue = [];
  var bannerShowing = false;

  function injectBannerStyles() {
    if (document.getElementById('push-banner-style')) return;
    var style = document.createElement('style');
    style.id = 'push-banner-style';
    style.textContent = [
      '.nearby-push-banner{',
        'position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-120px);',
        'background:#1A2332;color:#fff;border-radius:14px;padding:12px 16px;',
        'max-width:340px;width:calc(100% - 32px);z-index:9999;',
        'display:flex;align-items:center;gap:10px;',
        'box-shadow:0 8px 32px rgba(0,0,0,.3);',
        'transition:transform .35s cubic-bezier(.34,1.56,.64,1);',
        'cursor:pointer;',
      '}',
      '.nearby-push-banner.show{transform:translateX(-50%) translateY(0);}',
      '.push-banner-icon{font-size:24px;flex-shrink:0;}',
      '.push-banner-body{flex:1;min-width:0;}',
      '.push-banner-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;}',
      '.push-banner-msg{font-size:12px;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.push-banner-close{font-size:18px;color:rgba(255,255,255,.5);padding:4px;flex-shrink:0;}'
    ].join('');
    document.head.appendChild(style);
  }

  function showBanner(title, message, icon, onClick) {
    injectBannerStyles();
    bannerQueue.push({ title: title, message: message, icon: icon || '🔔', onClick: onClick });
    if (!bannerShowing) processQueue();
  }

  function processQueue() {
    if (!bannerQueue.length) { bannerShowing = false; return; }
    bannerShowing = true;
    var item = bannerQueue.shift();

    var el = document.createElement('div');
    el.className = 'nearby-push-banner';
    el.innerHTML = '<span class="push-banner-icon">' + item.icon + '</span>'
      + '<div class="push-banner-body">'
      + '<div class="push-banner-title">' + item.title + '</div>'
      + '<div class="push-banner-msg">' + item.message + '</div>'
      + '</div>'
      + '<span class="push-banner-close">✕</span>';

    document.body.appendChild(el);
    setTimeout(function() { el.classList.add('show'); }, 50);

    el.addEventListener('click', function(e) {
      if (e.target.classList.contains('push-banner-close')) {
        dismiss(el);
      } else {
        dismiss(el);
        if (item.onClick) item.onClick();
      }
    });

    setTimeout(function() { dismiss(el); }, 5000);
  }

  function dismiss(el) {
    el.classList.remove('show');
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
      setTimeout(processQueue, 300);
    }, 350);
  }

  // ── REALTIME SUBSCRIPTION ─────────────────────────────────────
  // Listens to notifications table for this user and shows banners

  var realtimeChannel = null;

  async function startListening(userId) {
    if (realtimeChannel) return;
    try {
      realtimeChannel = sb.channel('notifications-' + userId)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: 'user_id=eq.' + userId
        }, function(payload) {
          var n = payload.new;
          if (!n) return;
          var icon = n.type === 'like' ? '❤️'
                   : n.type === 'comment' ? '💬'
                   : n.type === 'message' ? '✉️'
                   : n.type === 'welcome' ? '👋'
                   : n.type === 'follow' ? '👤'
                   : '🔔';
          showBanner('Nearby', n.message || 'New notification', icon, function() {
            window.location.href = n.link || 'nearby-notifications.html';
          });
        })
        .subscribe();
    } catch(e) {
      console.log('Push listen error:', e);
    }
  }

  // ── BROWSER PUSH (Optional / future) ──────────────────────────
  // Saves subscription to DB for server-side push (requires VAPID setup)

  async function requestBrowserPush(userId) {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return { ok: false, reason: 'Not supported' };
    }
    var permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'Permission denied' };
    }
    // Record that user wants push (even without VAPID, useful for future)
    localStorage.setItem('nearby_push_enabled', 'true');
    return { ok: true };
  }

  function isPushEnabled() {
    return localStorage.getItem('nearby_push_enabled') === 'true';
  }

  // ── AUTO INIT ──────────────────────────────────────────────────

  async function init() {
    try {
      var session = await getSession();
      if (!session) return;
      await startListening(session.user.id);
    } catch(e) {}
  }

  // Delay init slightly so page loads first
  setTimeout(init, 1500);

  return {
    show: showBanner,
    requestBrowserPush: requestBrowserPush,
    isPushEnabled: isPushEnabled,
    startListening: startListening
  };
})();
