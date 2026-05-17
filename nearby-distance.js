// ============================================================
// nearby-distance.js — Nearby Distance Feature
// Include on every page: <script src="nearby-distance.js"></script>
// Must load AFTER supabase-config.js
// ============================================================

var NearbyDistance = (function() {

  var STORAGE_ENABLED = 'nearby_distance_enabled';
  var STORAGE_LAT     = 'nearby_user_lat';
  var STORAGE_LNG     = 'nearby_user_lng';
  var STORAGE_UPDATED = 'nearby_location_updated';

  // ── PUBLIC API ──────────────────────────────────────────────

  function isEnabled() {
    return localStorage.getItem(STORAGE_ENABLED) === 'true';
  }

  function getUserCoords() {
    if (!isEnabled()) return null;
    var lat = parseFloat(localStorage.getItem(STORAGE_LAT));
    var lng = parseFloat(localStorage.getItem(STORAGE_LNG));
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat: lat, lng: lng };
  }

  // Enable: ask for GPS, save, update DB
  function enable(onSuccess, onError) {
    if (!navigator.geolocation) {
      if (onError) onError('Geolocation not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        localStorage.setItem(STORAGE_ENABLED, 'true');
        localStorage.setItem(STORAGE_LAT, lat);
        localStorage.setItem(STORAGE_LNG, lng);
        localStorage.setItem(STORAGE_UPDATED, new Date().toISOString());
        // Save to DB if user is logged in
        saveToDb(lat, lng);
        if (onSuccess) onSuccess(lat, lng);
      },
      function(err) {
        var msg = err.code === 1 ? 'Location permission denied. Please allow location in your browser settings.'
                : err.code === 2 ? 'Location unavailable. Try again.'
                : 'Location request timed out.';
        if (onError) onError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }

  function disable() {
    localStorage.setItem(STORAGE_ENABLED, 'false');
    localStorage.removeItem(STORAGE_LAT);
    localStorage.removeItem(STORAGE_LNG);
    localStorage.removeItem(STORAGE_UPDATED);
  }

  // Refresh location silently (call periodically)
  function refresh() {
    if (!isEnabled()) return;
    var updated = localStorage.getItem(STORAGE_UPDATED);
    if (updated) {
      var age = (Date.now() - new Date(updated).getTime()) / 1000 / 60; // minutes
      if (age < 10) return; // fresh enough
    }
    enable(); // silent refresh
  }

  // ── DISTANCE MATH ───────────────────────────────────────────

  function calcKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2)
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function format(km) {
    if (km < 0.1) return 'Right here';
    if (km < 1)   return Math.round(km * 1000) + 'm away';
    if (km < 10)  return km.toFixed(1) + 'km away';
    return Math.round(km) + 'km away';
  }

  // Main: get distance string from user to a point
  function distanceTo(targetLat, targetLng) {
    var coords = getUserCoords();
    if (!coords || !targetLat || !targetLng) return null;
    var km = calcKm(coords.lat, coords.lng, targetLat, targetLng);
    return format(km);
  }

  // ── BADGE HTML ──────────────────────────────────────────────
  // Returns ready-to-inject HTML badge, or '' if not applicable

  function badge(targetLat, targetLng) {
    var dist = distanceTo(targetLat, targetLng);
    if (!dist) return '';
    var color = dist === 'Right here' ? '#7A9E7E' : '#8A96A8';
    return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;'
         + 'color:' + color + ';font-weight:600;background:rgba(0,0,0,.05);'
         + 'border-radius:8px;padding:2px 7px;">📍 ' + dist + '</span>';
  }

  // ── DB SYNC ─────────────────────────────────────────────────

  async function saveToDb(lat, lng) {
    try {
      var session = await getSession();
      if (!session) return;
      var userId = session.user.id;
      await sb.from('users').update({ latitude: lat, longitude: lng }).eq('id', userId);
    } catch(e) {
      console.log('Distance: could not save to DB', e);
    }
  }

  // ── INIT: silently refresh if enabled ───────────────────────
  refresh();

  return {
    isEnabled: isEnabled,
    enable: enable,
    disable: disable,
    getUserCoords: getUserCoords,
    distanceTo: distanceTo,
    badge: badge,
    calcKm: calcKm,
    format: format
  };
})();
