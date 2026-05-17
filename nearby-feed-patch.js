// ============================================================
// nearby-feed-patch.js
// Add this script to nearby-feed.html (before closing </body>)
// It patches the feed to show distance badges + push banners
// REQUIRES: nearby-distance.js and nearby-push.js loaded first
// ============================================================

(function() {

  // ── 1. PATCH: inject distance badges after feed renders ────
  //
  // This uses a MutationObserver to watch for new post cards
  // and injects distance badges automatically.
  // Your existing post cards need class="post-card" and
  // data-lat="..." data-lng="..." attributes.
  //
  // In your loadFeed() function, when building post HTML,
  // add: data-lat="${post.latitude || ''}" data-lng="${post.longitude || ''}"
  // to the post card element.

  function injectDistanceBadges() {
    if (!NearbyDistance.isEnabled()) return;

    var cards = document.querySelectorAll('.post-card[data-lat]:not(.dist-injected)');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var lat = parseFloat(card.getAttribute('data-lat'));
      var lng = parseFloat(card.getAttribute('data-lng'));
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        var badgeHtml = NearbyDistance.badge(lat, lng);
        if (badgeHtml) {
          // Find the neighborhood span in the card and append after it
          var neighborhoodEl = card.querySelector('.post-neighborhood, .post-location, .post-meta');
          if (neighborhoodEl) {
            var span = document.createElement('span');
            span.innerHTML = ' ' + badgeHtml;
            neighborhoodEl.appendChild(span);
          }
        }
      }
      card.classList.add('dist-injected');
    }
  }

  // Watch for feed updates (new posts loaded)
  var observer = new MutationObserver(function() {
    injectDistanceBadges();
  });

  // Start observing feed container when DOM is ready
  function startObserving() {
    var feed = document.getElementById('feedContainer') || document.getElementById('postsFeed') || document.getElementById('feed') || document.querySelector('.feed');
    if (feed) {
      observer.observe(feed, { childList: true, subtree: true });
    }
    // Also run immediately for already-loaded posts
    injectDistanceBadges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
  } else {
    setTimeout(startObserving, 500);
  }

  // ── 2. SAVE LOCATION ON POST CREATION ─────────────────────
  //
  // When a user creates a post, attach their coordinates.
  // In your createPost() call, add latitude and longitude:
  //
  //   var coords = NearbyDistance.getUserCoords();
  //   var postData = {
  //     user_id: userId,
  //     content: content,
  //     post_type: postType,
  //     neighborhood: neighborhood,
  //     latitude: coords ? coords.lat : null,
  //     longitude: coords ? coords.lng : null
  //   };
  //   await sb.from('posts').insert(postData);
  //
  // This is a reminder — implement in your existing post creation code.

  // ── 3. DISTANCE ENABLED INDICATOR ON FEED ─────────────────
  //
  // Adds a small "📍 Distance on" pill at top of feed when enabled

  function addDistanceIndicator() {
    if (!NearbyDistance.isEnabled()) return;
    if (document.getElementById('distIndicator')) return;

    var pill = document.createElement('div');
    pill.id = 'distIndicator';
    pill.innerHTML = '📍 Distance enabled — <a href="nearby-settings.html" style="color:inherit;text-decoration:underline;">Settings</a>';
    pill.style.cssText = [
      'background:#FEF3E8',
      'color:#C4622D',
      'font-size:12px',
      'font-weight:600',
      'padding:8px 16px',
      'text-align:center',
      'border-bottom:1px solid rgba(196,98,45,.15)',
      'display:block',
    ].join(';');

    var feed = document.getElementById('feedContainer') || document.getElementById('postsFeed') || document.getElementById('feed') || document.querySelector('.feed');
    if (feed && feed.parentNode) {
      feed.parentNode.insertBefore(pill, feed);
    } else {
      var content = document.querySelector('.content') || document.querySelector('main');
      if (content) content.prepend(pill);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(addDistanceIndicator, 600); });
  } else {
    setTimeout(addDistanceIndicator, 600);
  }

})();
