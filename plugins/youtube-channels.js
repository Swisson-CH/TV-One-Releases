// YouTube-Kanäle über die öffentlichen RSS-Feeds (ohne API-Schlüssel).
// Videos werden in der offiziellen YouTube-App geöffnet (external: true) –
// so bleiben die Nutzungsbedingungen von YouTube eingehalten.
var FEED = "https://www.youtube.com/feeds/videos.xml?channel_id=";
var cache = {}; // videoId → Eintrag (für die Detailseite)

function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function tag(xml, name) {
  var m = new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">").exec(xml);
  return m ? decode(m[1].trim()) : null;
}

// Kanalpakete mit offiziellen Kanälen – jedes per Schalter in den Einstellungen ein-/ausschaltbar
var PACKAGES = {
  tamil: [
    "UCBnxEdpoZwstJqC1yZpOjRA", // Sun TV
    "UCvrhwpnp2DHYQ1CbXby9ypQ", // Vijay Television
    "UC0SIHdEcfg4BsM8X5tixwHQ"  // Kalaignar TV
  ],
  schweiz: [
    "UCVuR4hBxX3zWY_xUCZeIc3A", // SRF – Schweizer Radio und Fernsehen
    "UCqdXpIZSamBceDmH8uOoTHA", // SRF News
    "UCdFkj0fA6VYJaty-v8_avvg", // SRF Dokus & Reportagen
    "UCodzpCel9VT-Sc0K7eeHm-w"  // SRF Kids
  ],
  deutsch: [
    "UCqmQ1b96-PNH4coqgHTuTlA", // ARD
    "UC5NOEUbkLheQcaaRldYW5GA", // tagesschau
    "UC_EnhS-vNDc6Eo9nyQHC2YQ", // ZDF
    "UCeqKIgPQfNInOswGRWt48kQ", // ZDFheute Nachrichten
    "UC7FeuS5wwfSR9IwOPkBV7SQ"  // ZDFinfo Dokus & Reportagen
  ]
};

// Schalter: ohne gespeicherten Wert gilt der Standard «an»
function isOn(key) {
  return settings.get(key) !== "false";
}

// Aktive Pakete + eigene Kanal-IDs, ohne Doppelte
function channelIds() {
  var ids = [];
  function add(id) { if (id.length > 0 && ids.indexOf(id) < 0) ids.push(id); }
  ["tamil", "schweiz", "deutsch"].forEach(function (pkg) {
    if (isOn(pkg)) PACKAGES[pkg].forEach(add);
  });
  (settings.get("channels") || "").split(/[\s,;]+/).forEach(add);
  return ids;
}

// Liest einen Kanal-Feed: Titel des Kanals + Videos
function loadChannel(id) {
  var xml = http.get(FEED + encodeURIComponent(id));
  var title = tag(xml.split("<entry>")[0], "title") || id;
  var entries = xml.split("<entry>").slice(1);
  var items = entries.map(function (e) {
    var videoId = tag(e, "yt:videoId");
    var item = {
      id: "yt:" + videoId,
      title: tag(e, "title"),
      type: "video",
      subtitle: title + " · " + (tag(e, "published") || "").substring(0, 10),
      description: (tag(e, "media:description") || "").substring(0, 400),
      thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"
    };
    cache[videoId] = item;
    return item;
  });
  return { title: title, items: items };
}

var plugin = {
  home: function () {
    var ids = channelIds();
    if (ids.length === 0) {
      throw new Error("Keine Kanäle aktiv – in den Plugin-Einstellungen ein Kanalpaket (Tamilisch, Schweiz, Deutschland) einschalten oder Kanal-IDs eintragen.");
    }
    return ids.map(function (id) {
      try { return loadChannel(id); }
      catch (e) { log("Kanal " + id + ": " + e); return { title: id, items: [] }; }
    });
  },

  browse: function (id) { return []; },

  details: function (id) {
    var videoId = id.substring(3);
    var item = cache[videoId];
    if (!item) return null;
    return { item: item, backdrop: "https://i.ytimg.com/vi/" + videoId + "/maxresdefault.jpg" };
  },

  streams: function (id) {
    return [{ url: "https://www.youtube.com/watch?v=" + id.substring(3), title: "YouTube", external: true }];
  }
};
