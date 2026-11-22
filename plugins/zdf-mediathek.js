// ZDF-Mediathek über öffentliche Katalogabfragen und die offizielle Player-Konfiguration.
var ZDF = "https://www.zdf.de";
var ZDF_API = "https://api.zdf.de";
var ZDF_TOKEN = "https://zdf-prod-futura.zdf.de/mediathekV2/token";
var zdfCredentials = null;
var zdfItems = Object.create(null);
var zdfQueries = Object.create(null);

var ZDF_FIELDS = "canonical title teaser{description image{list}}";
var ZDF_SEARCH = "query TvOneSearch($query:String!){searchDocuments(query:$query,first:40){results{item{" +
  "__typename ...on ISmartCollection{" + ZDF_FIELDS + "} ...on Video{" + ZDF_FIELDS + "}}}}}";
var ZDF_SEASONS = "query TvOneSeasons($id:String!){smartCollectionByCanonical(canonical:$id){" +
  "...on ISeriesSmartCollection{seasons(first:96){nodes{number}}}}}";
var ZDF_EPISODES = "query TvOneEpisodes($id:String!,$index:Int!,$after:Cursor){smartCollectionByCanonical(canonical:$id){" +
  "...on ISeriesSmartCollection{seasons(first:1,offset:$index){nodes{episodes(first:36,after:$after){" +
  "pageInfo{hasNextPage endCursor} nodes{__typename " + ZDF_FIELDS + " episodeInfo{seasonNumber episodeNumber}}}}}}}}";
var ZDF_VIDEO = "query TvOneVideo($id:String!){videoByCanonical(canonical:$id){title currentMedia{nodes{ptmdTemplate}}}" +
  " smartCollectionByCanonical(canonical:$id){...on MovieSmartCollection{video{title currentMedia{nodes{ptmdTemplate}}}}}}";

var ZDF_GENRES = {
  "movie-krimi": { title: "Krimifilme", query: "Krimi", type: "video" },
  "movie-komoedie": { title: "Komödien", query: "Komödie", type: "video" },
  "movie-drama": { title: "Dramen", query: "Drama", type: "video" },
  "series-krimi": { title: "Krimiserien", query: "Krimi", type: "folder" },
  "series-fernsehfilm": { title: "Fernsehfilm-Reihen", query: "Fernsehfilm", type: "folder" }
};

function zdfHeaders() {
  if (!zdfCredentials || Date.now() >= zdfCredentials.expiresAt) {
    var token = http.getJson(ZDF_TOKEN);
    if (typeof token.token !== "string" || !token.token || !/^bearer$/i.test(token.type || "")) {
      throw new Error("Die ZDF-Mediathek ist momentan nicht erreichbar.");
    }
    var expires = Number(token.expires) * 1000;
    zdfCredentials = {
      authorization: token.type + " " + token.token,
      expiresAt: isFinite(expires) && expires > Date.now() ? expires - 30000 : Date.now() + 60000
    };
  }
  return { "Api-Auth": zdfCredentials.authorization, "Apollo-Require-Preflight": "true", Referer: ZDF + "/" };
}

function zdfGraph(query, variables) {
  var result = http.getJson(ZDF_API + "/graphql?query=" + encodeURIComponent(query) +
    "&variables=" + encodeURIComponent(JSON.stringify(variables)), zdfHeaders());
  if (!result.data) throw new Error("Die ZDF-Mediathek hat keine Programmdaten geliefert.");
  return result.data;
}

function zdfId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,159}$/i.test(value);
}

function zdfImage(teaser) {
  var images = teaser && teaser.image && teaser.image.list;
  var url = images && (images["640x360"] || images["768x432"] || images["384x216"] || images.original ||
    images[Object.keys(images)[0]]);
  return typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
}

function zdfCard(value) {
  if (!value || !value.title || !zdfId(value.canonical) || /^collection-index-page-/.test(value.canonical)) return null;
  var kind = value.__typename || "";
  var folder = /SeriesSmartCollection$/.test(kind);
  if (!folder && kind !== "Video" && kind !== "MovieSmartCollection") return null;
  var id = (folder ? "zdf-series:" : "zdf-video:") + value.canonical;
  var episode = value.episodeInfo;
  var item = {
    id: id,
    title: value.title,
    type: folder ? "folder" : "video",
    thumbnail: zdfImage(value.teaser),
    description: value.teaser && value.teaser.description || null,
    subtitle: episode && episode.episodeNumber
      ? "Staffel " + episode.seasonNumber + " · Folge " + episode.episodeNumber : "ZDF"
  };
  zdfItems[id] = item;
  return item;
}

function zdfSearch(query) {
  var key = query.toLowerCase();
  var cached = zdfQueries[key];
  if (cached && Date.now() - cached.loadedAt < 5 * 60 * 1000) return cached.items;
  var data = zdfGraph(ZDF_SEARCH, { query: query }).searchDocuments;
  var items = (data && data.results || []).map(function (hit) {
    return zdfCard(hit && hit.item);
  }).filter(Boolean);
  if (Object.keys(zdfQueries).length >= 24) zdfQueries = Object.create(null);
  zdfQueries[key] = { items: items, loadedAt: Date.now() };
  return items;
}

function zdfSeasons(id, collection) {
  var data = zdfGraph(ZDF_SEASONS, { id: collection }).smartCollectionByCanonical;
  return (data && data.seasons && data.seasons.nodes || []).map(function (season, index) {
    return {
      id: "zdf-season:" + collection + ":" + index,
      title: "Staffel " + (season.number == null ? index + 1 : season.number),
      type: "folder",
      thumbnail: zdfItems[id] && zdfItems[id].thumbnail || null
    };
  });
}

function zdfEpisodes(collection, index, after) {
  var data = zdfGraph(ZDF_EPISODES, { id: collection, index: index, after: after || null }).smartCollectionByCanonical;
  var season = data && data.seasons && data.seasons.nodes && data.seasons.nodes[0];
  var episodes = season && season.episodes;
  var items = (episodes && episodes.nodes || []).map(zdfCard).filter(Boolean);
  var more = episodes && episodes.pageInfo;
  if (more && more.hasNextPage && /^[a-z0-9+/_=-]{1,600}$/i.test(more.endCursor || "") && more.endCursor !== after) {
    items.push({ id: "zdf-season:" + collection + ":" + index + ":" + more.endCursor, title: "Weitere Folgen", type: "folder" });
  }
  return items;
}

function zdfStreams(id) {
  var entry = zdfGraph(ZDF_VIDEO, { id: id });
  var video = entry.videoByCanonical || (entry.smartCollectionByCanonical && entry.smartCollectionByCanonical.video);
  var nodes = video && video.currentMedia && video.currentMedia.nodes;
  var selected = (nodes || []).filter(function (node) { return node && node.ptmdTemplate; })[0];
  var endpoint = selected && selected.ptmdTemplate.replace("{playerId}", "android_native_6");
  if (!endpoint || !/^\/tmd\/[a-z0-9_./-]+$/i.test(endpoint)) {
    throw new Error("Für diesen Titel ist beim ZDF momentan kein Video verfügbar.");
  }
  var playlist = http.getJson(ZDF_API + endpoint, zdfHeaders());
  var subtitles = (playlist.captions || []).filter(function (caption) {
    return caption && caption.format === "webvtt" && /^https:\/\//i.test(caption.uri || "");
  }).map(function (caption) {
    return { url: caption.uri, language: caption.language || "deu", mimeType: "text/vtt" };
  });
  var formats = [];
  (playlist.priorityList || []).forEach(function (section) {
    (section.formitaeten || []).forEach(function (format) {
      var hls = /mpegurl/i.test(format.mimeType || "");
      if (!hls && format.mimeType !== "video/mp4") return;
      (format.qualities || []).forEach(function (quality) {
        var tracks = quality.audio && quality.audio.tracks || [];
        tracks.forEach(function (track) {
          var url = track.uri;
          if (typeof url !== "string" || !/^https:\/\//i.test(url) || (hls && !/\.m3u8/i.test(url))) return;
          var stream = { url: url, headers: { Referer: ZDF + "/" } };
          var score = hls ? 100 : 0;
          if (quality.quality === "auto") score += 30;
          if (quality.quality === "fhd") score += 4;
          if (quality.quality === "hd") score += 2;
          if (track.class === "main") score += 10;
          if (/^de(?:u|r)?$/i.test(track.language || "")) score += 8;
          stream.title = video.title || "ZDF";
          stream.subtitles = subtitles;
          formats.push({ stream: stream, score: score });
        });
      });
    });
  });
  if (!formats.length) throw new Error("Das ZDF liefert keinen kompatiblen Stream. Je nach Titel gelten regionale Rechte.");
  formats.sort(function (a, b) { return b.score - a.score; });
  var seen = Object.create(null);
  return formats.map(function (format) { return format.stream; }).filter(function (stream) {
    if (seen[stream.url]) return false;
    seen[stream.url] = true;
    return true;
  }).slice(0, 5);
}

var plugin = {
  home: function () {
    return [{ title: "ZDF Mediathek", items: [
      { id: "zdf-films", title: "Filme", type: "folder" },
      { id: "zdf-shows", title: "Serien", type: "folder" }
    ] }];
  },
  browse: function (id) {
    if (id === "zdf-films" || id === "zdf-shows") {
      var kind = id === "zdf-films" ? "movie-" : "series-";
      return Object.keys(ZDF_GENRES).filter(function (key) { return key.indexOf(kind) === 0; }).map(function (key) {
        return { id: key, title: ZDF_GENRES[key].title, type: "folder" };
      });
    }
    if (Object.prototype.hasOwnProperty.call(ZDF_GENRES, id)) {
      var genre = ZDF_GENRES[id];
      return zdfSearch(genre.query).filter(function (item) { return item.type === genre.type; });
    }
    var series = /^zdf-series:([a-z0-9][a-z0-9-]{0,159})$/i.exec(id);
    if (series) return zdfSeasons(id, series[1]);
    var season = /^zdf-season:([a-z0-9][a-z0-9-]{0,159}):(\d{1,2})(?::([a-z0-9+/_=-]{1,600}))?$/i.exec(id);
    return season ? zdfEpisodes(season[1], Number(season[2]), season[3]) : [];
  },
  search: function (query) {
    var term = query.trim().slice(0, 120);
    return term ? zdfSearch(term) : [];
  },
  details: function (id) {
    var item = zdfItems[id];
    return item ? { item: item, backdrop: item.thumbnail } : null;
  },
  streams: function (id) {
    var video = /^zdf-video:([a-z0-9][a-z0-9-]{0,159})$/i.exec(id);
    return video ? zdfStreams(video[1]) : [];
  }
};
