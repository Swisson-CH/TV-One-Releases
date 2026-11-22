// Die Netzkino- und Internet-Archive-Quellen von xStream für TV-One.
var ARCHIVE = "https://archive.org";
var NETZKINO = "https://api.netzkino.de.simplecache.net/capi-2.0a";
var NETZKINO_CDN = "https://pmd.netzkino-seite.netzkino.de/";
var ARCHIVE_COLLECTIONS = { Film_Noir: "Film Noir", short_films: "Kurzfilme", prelinger: "Prelinger-Archiv" };
var NETZKINO_CATEGORIES = {
  "highlights-frontpage": "Highlights", "neu-frontpage": "Neu bei Netzkino",
  actionkino: "Action", dramakino: "Drama", thrillerkino: "Thriller", scifikino: "Science Fiction"
};
var ARCHIVE_PAGE_SIZE = 24;

function archiveId(value) {
  return typeof value === "string" && /^[a-z0-9_][a-z0-9._-]{0,159}$/i.test(value);
}

function archiveItems(query, page, collection) {
  var response = http.getJson(ARCHIVE + "/advancedsearch.php?q=" + encodeURIComponent(query) +
    "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=description&fl%5B%5D=year" +
    "&rows=" + ARCHIVE_PAGE_SIZE + "&page=" + page + "&output=json").response;
  if (!response || !Array.isArray(response.docs)) return [];

  var items = [];
  response.docs.forEach(function (record) {
    if (!archiveId(record.identifier) || !record.title) return;
    items.push({
      id: "archive:" + record.identifier, title: media.text(record.title), type: "video",
      thumbnail: ARCHIVE + "/services/img/" + record.identifier,
      subtitle: record.year ? "Internet Archive · " + record.year : "Internet Archive",
      description: record.description ? media.text(record.description) : null
    });
  });
  if (collection && page < 100 && response.docs.length && page * ARCHIVE_PAGE_SIZE < Number(response.numFound)) {
    items.push({ id: "collection:" + collection + ":" + (page + 1), title: "Weitere Filme", type: "folder" });
  }
  return items;
}

function netzkinoKey(value) {
  return typeof value === "string" && value.length <= 250 && value.split("/").every(function (segment) {
    return segment && segment !== "." && segment !== ".." && !/[\\?#\x00-\x1f\x7f]/.test(segment);
  });
}

function netzkinoItems(path) {
  var response = http.getJson(NETZKINO + path);
  var items = [];
  var used = Object.create(null);
  var region = (settings.get("netzkinoCountry") || "CH").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) region = "CH";
  (response.posts || []).slice(0, 60).forEach(function (post) {
    var fields = post.custom_fields || {};
    var key = (fields.Streaming || [])[0];
    if (!netzkinoKey(key) || !post.title || fields.drm === true || fields.drm === "true" || used[key]) return;
    used[key] = true;
    var regions = Array.isArray(fields.activeCountries) ? fields.activeCountries : [];
    if (regions.length && regions.indexOf(region) < 0) return;
    var expires = Date.parse(fields.licenseEnd);
    if (!isNaN(expires) && expires < Date.now()) return;
    var starts = Date.parse(fields.licenseStart);
    if (!isNaN(starts) && starts > Date.now()) return;
    items.push({
      id: "netzkino:" + key, title: media.text(post.title), type: "video",
      thumbnail: media.url(post.thumbnail), subtitle: "Netzkino",
      description: post.content ? media.text(post.content) : null
    });
  });
  return items;
}

function sourceFolder(id, title) {
  return { id: id, title: title, type: "folder" };
}

function archiveStreams(identifier) {
  var item = http.getJson(ARCHIVE + "/metadata/" + identifier);
  var flags = item.metadata || {};
  if (item.is_dark === true || flags["access-restricted-item"] === true ||
      flags["access-restricted-item"] === "true") return [];
  var files = (item.files || []).filter(function (file) {
    return typeof file.name === "string" && /\.(mp4|webm)$/i.test(file.name) &&
      file.private !== true && file.private !== "true";
  });
  files.sort(function (a, b) {
    function rank(file) {
      if (file.format === "h.264") return 0;
      if (/\.mp4$/i.test(file.name)) return 1;
      return 2;
    }
    return rank(a) - rank(b);
  });
  return files.slice(0, 8).map(function (file) {
    return media.direct(ARCHIVE + "/download/" + identifier + "/" + encodeURIComponent(file.name));
  }).filter(Boolean);
}

var plugin = {
  home: function () {
    return [{ title: "xStream · Quellen", items: [
      sourceFolder("netzkino", "Netzkino"), sourceFolder("archive", "Internet Archive")
    ] }];
  },
  browse: function (id) {
    if (id === "netzkino") return Object.keys(NETZKINO_CATEGORIES).map(function (key) {
      return sourceFolder("category:" + key, NETZKINO_CATEGORIES[key]);
    });
    if (id === "archive") return Object.keys(ARCHIVE_COLLECTIONS).map(function (key) {
      return sourceFolder("collection:" + key + ":1", ARCHIVE_COLLECTIONS[key]);
    });
    var category = /^category:([\w-]+)$/.exec(id);
    if (category && Object.prototype.hasOwnProperty.call(NETZKINO_CATEGORIES, category[1])) {
      return netzkinoItems("/categories/" + category[1] + ".json?d=www&l=de-DE");
    }
    var collection = /^collection:(\w+):([1-9]\d{0,2})$/.exec(id);
    if (collection && Object.prototype.hasOwnProperty.call(ARCHIVE_COLLECTIONS, collection[1])) {
      return archiveItems("mediatype:movies AND collection:" + collection[1], Number(collection[2]), collection[1]);
    }
    return [];
  },
  search: function (query) {
    var text = query.trim().slice(0, 120);
    if (!text) return [];
    var results = [];
    try {
      results = netzkinoItems("/search?q=" + encodeURIComponent(text) + "&d=www&l=de-DE");
    } catch (error) {
      log("Netzkino-Suche ist momentan nicht erreichbar.");
    }
    try {
      var phrase = text.replace(/["\\]/g, " ").trim();
      if (phrase) results = results.concat(archiveItems('mediatype:movies AND title:"' + phrase + '"', 1));
    } catch (error) {
      log("Suche im Internet Archive ist momentan nicht erreichbar.");
    }
    return results;
  },
  streams: function (id) {
    if (id.indexOf("archive:") === 0 && archiveId(id.slice(8))) return archiveStreams(id.slice(8));
    if (id.indexOf("netzkino:") !== 0 || !netzkinoKey(id.slice(9))) return [];
    var path = id.slice(9).split("/").map(encodeURIComponent).join("/");
    var stream = media.direct(NETZKINO_CDN + path + ".mp4");
    return stream ? [stream] : [];
  }
};
