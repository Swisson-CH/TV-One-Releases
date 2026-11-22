// Deutsche ARTE-Mediathek mit öffentlichem Katalog und Player-Konfiguration.
var ARTE = "https://www.arte.tv";
var ARTE_PLAYER = "https://api.arte.tv/api/player/v2/config/de/";
var ARTE_CATALOGUES = {
  "arte-films": "/de/videos/kino/filme/",
  "arte-series": "/de/videos/fernsehfilme-und-serien/serien/"
};
var arteCatalogueCache = Object.create(null);
var arteItems = Object.create(null);

function arteCard(card) {
  if (typeof card.programId !== "string" || typeof card.title !== "string") return null;
  var id = card.programId;
  var folder = /^RC-\d{6}$/.test(id);
  if (!folder && !/^\d{6}-\d{3}-[A-Z]$/.test(id)) return null;
  if (!folder && card.availability && card.availability.hasVideoStreams === false) return null;

  var path = typeof card.url === "string" ? card.url : "";
  if (folder && !/^\/de\/videos\/RC-\d{6}\/[a-z0-9-]+\/?$/i.test(path)) return null;
  var image = card.mainImage && card.mainImage.url;
  var item = {
    id: folder ? "arte-collection:" + path : "arte-video:" + id,
    title: card.title,
    type: folder ? "folder" : "video",
    subtitle: card.subtitle || (card.duration ? Math.round(card.duration / 60) + " Min." : null),
    description: card.teaserText || null,
    thumbnail: typeof image === "string" && /^https:\/\//i.test(image)
      ? image.replace("__SIZE__", "640x360") : null
  };
  arteItems[item.id] = item;
  return item;
}

function artePage(path) {
  var cached = arteCatalogueCache[path];
  if (cached && Date.now() - cached.loadedAt < 15 * 60 * 1000) return cached.items;

  var body = http.get(ARTE + path);
  var flightRows = [];
  var chunks = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  var chunk;
  while ((chunk = chunks.exec(body)) !== null) {
    try { flightRows.push(JSON.parse(chunk[1])); } catch (error) { /* Nächsten Datenblock lesen. */ }
  }

  var items = [];
  var seen = Object.create(null);
  function collect(node) {
    if (!node || typeof node !== "object" || items.length >= 100) return;
    if (node.programId && node.teaserText !== undefined) {
      var item = arteCard(node);
      if (item && !seen[item.id]) {
        seen[item.id] = true;
        items.push(item);
      }
      return;
    }
    Object.keys(node).forEach(function (key) { collect(node[key]); });
  }
  flightRows.join("").split("\n").forEach(function (line) {
    var data = /^[0-9a-f]+:([\[{].*)$/i.exec(line);
    if (data && items.length < 100) {
      try { collect(JSON.parse(data[1])); } catch (error) { /* Technische Zeilen enthalten keine Programmdaten. */ }
    }
  });
  if (!items.length) throw new Error("Auf dieser ARTE-Seite sind momentan keine Videos verfügbar.");
  arteCatalogueCache[path] = { items: items, loadedAt: Date.now() };
  return items;
}

var plugin = {
  home: function () {
    return [{ title: "ARTE Mediathek", items: [
      { id: "arte-films", title: "Filme", type: "folder" },
      { id: "arte-series", title: "Serien", type: "folder" }
    ] }];
  },
  browse: function (id) {
    if (Object.prototype.hasOwnProperty.call(ARTE_CATALOGUES, id)) return artePage(ARTE_CATALOGUES[id]);
    var collection = /^arte-collection:(\/de\/videos\/RC-\d{6}\/[a-z0-9-]+\/?)$/i.exec(id);
    return collection ? artePage(collection[1]).filter(function (item) { return item.type === "video"; }) : [];
  },
  search: function (query) {
    var key = query.trim().toLowerCase();
    if (!key) return [];
    Object.keys(ARTE_CATALOGUES).forEach(function (id) {
      try { artePage(ARTE_CATALOGUES[id]); } catch (error) { log("ARTE-Katalog momentan nicht erreichbar."); }
    });
    return Object.keys(arteItems).map(function (id) { return arteItems[id]; }).filter(function (item) {
      return (item.title + " " + (item.description || "")).toLowerCase().indexOf(key) >= 0;
    }).slice(0, 40);
  },
  details: function (id) {
    var item = arteItems[id];
    return item ? { item: item, backdrop: item.thumbnail } : null;
  },
  streams: function (id) {
    var video = /^arte-video:(\d{6}-\d{3}-[A-Z])$/.exec(id);
    if (!video) return [];
    var config = http.getJson(ARTE_PLAYER + video[1], { Referer: ARTE + "/" });
    var data = config.data && config.data.attributes;
    var restriction = data && data.restriction;
    if (restriction && restriction.geoblocking && restriction.geoblocking.restrictedArea) {
      throw new Error("ARTE stellt diesen Titel an deinem Standort nicht bereit.");
    }
    if (!data || !data.rights || data.error) throw new Error("ARTE stellt für diesen Titel momentan keine Wiedergabe bereit.");

    var streams = [];
    (data.streams || []).forEach(function (source) {
      if (!/^API_HLS/i.test(source.protocol || "")) return;
      if (typeof source.url !== "string" || !/^https:\/\//i.test(source.url) || !/\.m3u8/i.test(source.url)) return;
      var stream = { url: source.url, headers: { Referer: ARTE + "/" } };
      var versions = source.versions || [];
      var german = versions.some(function (version) { return /^Deutsch\b/i.test(version.label || ""); });
      stream.title = german ? "Deutsch · ARTE" : (versions[0] && versions[0].label) || "ARTE";
      if (german) streams.unshift(stream);
      else streams.push(stream);
    });
    if (!streams.length) throw new Error("ARTE hat keinen kompatiblen Stream geliefert.");
    return streams;
  }
};
