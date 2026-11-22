// IPTV-Plugin: liest eine M3U-Playlist und zeigt Sender nach Gruppen an.
// Die Playlist-URL wird in den Plugin-Einstellungen hinterlegt.

var CACHE_MS = 10 * 60 * 1000; // Playlist 10 Minuten zwischenspeichern
var cache = null;

// Liest ein Attribut wie tvg-logo="…" aus einer #EXTINF-Zeile
function attr(line, name) {
  var m = new RegExp(name + '="([^"]*)"').exec(line);
  return m ? m[1] : null;
}

// Wandelt den M3U-Text in eine Liste von Sendern um
function parseM3u(text) {
  var lines = text.split(/\r?\n/);
  var entries = [];
  entries.epgUrl = null;
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.indexOf("#EXTM3U") === 0) {
      // EPG-Quelle aus dem Playlist-Kopf (url-tvg oder x-tvg-url)
      entries.epgUrl = attr(line, "url-tvg") || attr(line, "x-tvg-url");
    } else if (line.indexOf("#EXTINF") === 0) {
      var comma = line.lastIndexOf(",");
      current = {
        name: comma >= 0 ? line.substring(comma + 1).trim() : "Unbenannt",
        logo: attr(line, "tvg-logo"),
        epgId: attr(line, "tvg-id"),
        group: attr(line, "group-title") || "Allgemein",
        userAgent: null
      };
    } else if (line.indexOf("#EXTVLCOPT:http-user-agent=") === 0 && current) {
      current.userAgent = line.substring("#EXTVLCOPT:http-user-agent=".length);
    } else if (line && line.charAt(0) !== "#" && current) {
      current.url = line;
      entries.push(current);
      current = null;
    }
  }
  return entries;
}

function loadEntries() {
  var url = settings.get("playlistUrl");
  if (!url) {
    throw new Error("Bitte zuerst die Playlist-URL in den Plugin-Einstellungen eintragen.");
  }
  var now = Date.now();
  if (cache && cache.url === url && now - cache.at < CACHE_MS) return cache.entries;
  var entries = parseM3u(http.get(url));
  cache = { url: url, at: now, entries: entries };
  log("M3U geladen: " + entries.length + " Sender");
  return entries;
}

function toItem(e, index) {
  return { id: "ch:" + index, title: e.name, subtitle: e.group, type: "live", thumbnail: e.logo, epgId: e.epgId };
}

function groups(entries) {
  var seen = {}, result = [];
  entries.forEach(function (e) {
    if (!seen[e.group]) { seen[e.group] = true; result.push(e.group); }
  });
  return result;
}

var plugin = {
  home: function () {
    var entries = loadEntries();
    var sections = [{
      title: "Kategorien",
      items: groups(entries).map(function (g) {
        return { id: "group:" + g, title: g, type: "folder" };
      })
    }];
    sections.push({ title: "Alle Sender", items: entries.slice(0, 50).map(toItem) });
    return sections;
  },

  browse: function (id) {
    var entries = loadEntries();
    var group = id.substring("group:".length);
    var result = [];
    entries.forEach(function (e, i) { if (e.group === group) result.push(toItem(e, i)); });
    return result;
  },

  search: function (query) {
    var q = query.toLowerCase();
    var result = [];
    loadEntries().forEach(function (e, i) {
      if (e.name.toLowerCase().indexOf(q) >= 0) result.push(toItem(e, i));
    });
    return result;
  },

  // Alle Sender: für das TV-Programm und zum Umschalten im Player
  channels: function () {
    return loadEntries().map(toItem);
  },

  // Programmzeitschrift: eigene URL aus den Einstellungen hat Vorrang
  epg: function () {
    var custom = settings.get("epgUrl");
    if (custom) return custom;
    var entries = loadEntries();
    return entries.epgUrl ? entries.epgUrl.split(",")[0].trim() : null;
  },

  streams: function (id) {
    var e = loadEntries()[parseInt(id.substring(3), 10)];
    if (!e) return [];
    var headers = {};
    if (e.userAgent) headers["User-Agent"] = e.userAgent;
    return [{ url: e.url, title: e.name, headers: headers }];
  }
};
