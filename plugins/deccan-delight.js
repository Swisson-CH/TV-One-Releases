// TV-One-Anbindung für die in Deccan Delight angebotenen Serien von Har Pal Geo.
var GEO = "https://harpalgeo.tv";
var GEO_LINK = /^https:\/\/(?:www\.)?harpalgeo\.tv\/program\/([a-z0-9][a-z0-9_-]{0,159})(?:\/([0-9]{1,12}))?\/?(?:[?#].*)?$/i;

function geoFindLinks(document, kind) {
  var links = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  var items = [];
  var seen = Object.create(null);
  var match;
  while ((match = links.exec(document)) !== null && items.length < 50) {
    var url = media.url(media.attr(match[1], "href"), GEO);
    var program = url ? GEO_LINK.exec(url) : null;
    if (!program || (kind === "series" && program[2]) || (kind === "episodes" && !program[2])) continue;
    var image = /<img\b[^>]*>/i.exec(match[2]);
    var label = /<h[234]\b[^>]*>([\s\S]*?)<\/h[234]>/i.exec(match[2]);
    var title = media.attr(match[1], "title") ||
      (image && media.attr(image[0], "alt")) || (label && label[1]) || media.text(match[2]);
    title = media.text(title);
    if (!title || /\b(?:teaser|promo)\b/i.test(title)) continue;
    var id = program[2] ? "episode:" + program[1] + ":" + program[2] : "series:" + program[1];
    if (seen[id]) continue;
    seen[id] = true;
    items.push({
      id: id, title: title, type: program[2] ? "video" : "folder",
      thumbnail: image ? media.url(media.attr(image[0], "data-src") || media.attr(image[0], "src"), GEO) : null,
      subtitle: "Har Pal Geo"
    });
  }
  return items;
}

function geoMore(items, slug, category, page) {
  if (items.length && /^\d{1,12}$/.test(category) && page < 100) {
    items.push({ id: "more:" + slug + ":" + category + ":" + (page + 1), title: "Weitere Folgen", type: "folder" });
  }
  return items;
}

var plugin = {
  home: function () {
    return [{ title: "Deccan Delight · Har Pal Geo", items: [
      { id: "series", title: "Serien", type: "folder" },
      { id: "latest", title: "Neueste Folgen", type: "folder" }
    ] }];
  },
  browse: function (id) {
    if (id === "series") return geoFindLinks(http.get(GEO + "/programs/"), "series");
    if (id === "latest") return geoFindLinks(http.get(GEO + "/videos"), "episodes");
    var series = /^series:([a-z0-9][a-z0-9_-]{0,159})$/i.exec(id);
    if (series) {
      var document = http.get(GEO + "/program/" + series[1]);
      var category = /<input\b[^>]*\bid=["']category_id["'][^>]*>/i.exec(document);
      var start = document.indexOf('class="programVideos"');
      var section = start < 0 ? document : document.slice(start, category ? category.index : undefined);
      var episodes = geoFindLinks(section, "episodes");
      return geoMore(episodes, series[1], category ? media.attr(category[0], "value") : "", 1);
    }
    var more = /^more:([a-z0-9][a-z0-9_-]{0,159}):(\d{1,12}):([1-9]\d?)$/i.exec(id);
    if (more) {
      var page = Number(more[3]);
      var fragment = http.sessionPost(GEO + "/program/more_videos/" + page, {
        Referer: GEO + "/program/" + more[1], "X-Requested-With": "XMLHttpRequest"
      }, { category_id: more[2] });
      return geoMore(geoFindLinks(fragment, "episodes"), more[1], more[2], page);
    }
    return [];
  },
  search: function (query) {
    var text = query.trim().slice(0, 120);
    return text ? geoFindLinks(http.get(GEO + "/search/" + encodeURIComponent(text))) : [];
  },
  streams: function (id) {
    var episode = /^episode:([a-z0-9][a-z0-9_-]{0,159}):([0-9]{1,12})$/i.exec(id);
    if (!episode) return [];
    var url = GEO + "/program/" + episode[1] + "/" + episode[2];
    var streams = media.fromPage(http.get(url), url);
    if (!streams.length) throw new Error("Har Pal Geo stellt für diese Folge keinen kompatiblen Stream bereit.");
    return streams;
  }
};
