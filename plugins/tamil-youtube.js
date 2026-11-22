// Offizielle Playlists und der Einstieg in den tamilischen Einthusan-Katalog.
var EINTHUSAN_URL = "https://einthusan.tv/movie/browse/?lang=tamil";
var EINTHUSAN_ITEM = {
  id: "tamil-einthusan",
  title: "Einthusan – Tamil",
  type: "video",
  subtitle: "Offizieller Filmkatalog · Browser",
  description: "Öffnet den tamilischen Filmkatalog von Einthusan im Browser."
};

var COLLECTIONS = [
  { id: "PLwtDKTQpjlC-tRsslfkAaH4bBwi7GekM5", title: "Ayngaran · Ganze Tamil-Filme", films: true },
  { id: "PLKcGe9BTHkrqTvy75IHwpmOmay8rED734", title: "Deivamagal", films: false },
  { id: "PLKcGe9BTHkro47VkRPBnY9iixe9YRMrjX", title: "Kolangal", films: false },
  { id: "PLKcGe9BTHkrp7QuRb92SK2vOFnUMx6fa9", title: "Metti Oli", films: false },
  { id: "PLKcGe9BTHkroFdjcV-6zXGY_HqPUg0rhu", title: "Naayagi", films: false },
  { id: "PLKcGe9BTHkrrMyUZBhwXRswUbMMzXr3Cq", title: "Aadhalinaal Kaadhal Seiveer", films: false }
];

var cachedVideos = Object.create(null);
var cachedPlaylists = Object.create(null);

function collectionItem(collection) {
  return {
    id: "tamil-playlist:" + collection.id,
    title: collection.title,
    type: "folder",
    subtitle: collection.films ? "Ayngaran · YouTube" : "VikatanTV · YouTube"
  };
}

function playlist(id) {
  return COLLECTIONS.filter(function (entry) { return entry.id === id; })[0];
}

function readTag(source, name) {
  var match = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">").exec(source);
  return match ? match[1].trim().replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : "";
}

function loadPlaylist(collection) {
  var existing = cachedPlaylists[collection.id];
  if (existing && Date.now() - existing.loadedAt < 30 * 60 * 1000) return existing.items;
  var url = "https://www.youtube.com/feeds/videos.xml?playlist_id=" + collection.id;
  var xml = http.get(url);
  if (!/<feed\b/.test(xml)) throw new Error("Die YouTube-Playlist ist momentan nicht erreichbar.");
  var seen = Object.create(null);
  var items = [];
  xml.split("<entry>").slice(1).forEach(function (entry) {
    var videoId = readTag(entry, "yt:videoId");
    var title = readTag(entry, "title");
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId) || !title || seen[videoId]) return;
    if (/\b(?:trailer|promo|teaser|snippets?|shorts|super scene|video song)\b/i.test(title)) return;
    // Manche Serienplaylists mischen kurze Ausschnitte unter die vollständigen Folgen.
    if (!collection.films && !/\b(?:(?:episode|ep)\s*[-.:#]?\s*\d+|retelecast)\b|அத்தியாயம்/i.test(title)) return;
    seen[videoId] = true;
    var item = {
      id: "tamil-video:" + videoId,
      title: title,
      type: "video",
      subtitle: collection.films ? "Ayngaran · YouTube" : "VikatanTV · YouTube",
      description: readTag(entry, "media:description").slice(0, 500),
      thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"
    };
    cachedVideos[videoId] = item;
    items.push(item);
  });
  cachedPlaylists[collection.id] = { items: items, loadedAt: Date.now() };
  return items;
}

var plugin = {
  home: function () {
    return [
      { title: "Tamilische Filme", items: COLLECTIONS.filter(function (entry) { return entry.films; }).map(collectionItem).concat([EINTHUSAN_ITEM]) },
      { title: "Tamilische Serien auf YouTube", items: COLLECTIONS.filter(function (entry) { return !entry.films; }).map(collectionItem) }
    ];
  },
  browse: function (id) {
    if (id.indexOf("tamil-playlist:") !== 0) return [];
    var collection = playlist(id.slice(15));
    if (!collection) return [];
    var openPlaylist = {
      id: "tamil-open:" + collection.id, title: "Ganze Playlist auf YouTube", type: "video",
      subtitle: collection.title
    };
    try {
      return loadPlaylist(collection).concat([openPlaylist]);
    } catch (error) {
      log("YouTube-Feed nicht erreichbar: " + collection.title);
      return [openPlaylist];
    }
  },
  search: function (query) {
    var key = query.trim().toLowerCase();
    if (!key) return [];
    var folders = COLLECTIONS.map(collectionItem);
    var videos = Object.keys(cachedVideos).map(function (id) { return cachedVideos[id]; });
    return folders.concat([EINTHUSAN_ITEM], videos).filter(function (item) {
      return item.title.toLowerCase().indexOf(key) >= 0;
    }).slice(0, 40);
  },
  details: function (id) {
    if (id === EINTHUSAN_ITEM.id) return { item: EINTHUSAN_ITEM };
    var item = id.indexOf("tamil-video:") === 0 ? cachedVideos[id.slice(12)] : null;
    return item ? { item: item, backdrop: item.thumbnail } : null;
  },
  streams: function (id) {
    if (id === EINTHUSAN_ITEM.id) return [{ url: EINTHUSAN_URL, external: true }];
    var video = /^tamil-video:([a-zA-Z0-9_-]{11})$/.exec(id);
    if (video) return [{ url: "https://www.youtube.com/watch?v=" + video[1], external: true }];
    var collection = id.indexOf("tamil-open:") === 0 ? playlist(id.slice(11)) : null;
    return collection ? [{ url: "https://www.youtube.com/playlist?list=" + collection.id, external: true }] : [];
  }
};
