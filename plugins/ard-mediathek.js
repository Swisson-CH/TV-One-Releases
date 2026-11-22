// ARD Mediathek: öffentlich-rechtliche Inhalte über die Schnittstelle, die auch ardmediathek.de nutzt.
// Hinweis: Manche Inhalte sind nur in Deutschland abrufbar (Geoblocking durch die ARD).
var BASE = "https://api.ardmediathek.de/page-gateway/pages/ard/home?embedded=true";
var IMG_WIDTH = "640";

function image(obj) {
  var img = obj && obj.images && (obj.images.aspect16x9 || obj.images.aspect16x7);
  return img && img.src ? img.src.replace("{width}", IMG_WIDTH) : null;
}

function minutes(sec) {
  return sec ? Math.round(sec / 60) + " Min." : "";
}

// Wandelt einen ARD-Teaser in einen Eintrag um (oder null, wenn nicht unterstützt)
function toItem(t) {
  var target = t.links && t.links.target;
  if (!target || !target.href) return null;
  var title = t.shortTitle || t.longTitle || "";
  var showTitle = t.show && t.show.title ? t.show.title : "";
  switch (t.type) {
    case "ondemand":
      return { id: "v:" + target.href, title: title, type: "video", thumbnail: image(t),
               subtitle: [showTitle, minutes(t.duration)].filter(Boolean).join(" · ") };
    case "live":
      return { id: "l:" + target.href, title: title, type: "live", thumbnail: image(t), subtitle: "Live" };
    case "show":
    case "compilation":
    case "editorialPage":
    case "poster":
      return { id: "p:" + target.href, title: title, type: "folder", thumbnail: image(t) };
    default:
      return null; // Banner, externe Links usw.
  }
}

function teasers(widget) {
  return (widget.teasers || []).map(toItem).filter(function (i) { return i !== null; });
}

function page(href) {
  return http.getJson(href);
}

var plugin = {
  home: function () {
    return page(BASE).widgets
      .filter(function (w) { return w.type !== "navigation" && w.type !== "banner"; })
      .map(function (w) { return { title: w.title || "ARD", items: teasers(w) }; })
      .filter(function (s) { return s.items.length > 0; });
  },

  // Ordner = Sendung/Rubrik: alle Teaser der Unterseite
  browse: function (id) {
    var widgets = page(id.substring(2)).widgets || [];
    var result = [];
    widgets.forEach(function (w) { result = result.concat(teasers(w)); });
    return result.slice(0, 150);
  },

  search: function (q) {
    var url = "https://api.ardmediathek.de/page-gateway/widgets/ard/search/vod?searchString=" +
              encodeURIComponent(q) + "&pageSize=40";
    var res = http.getJson(url);
    return teasers(res);
  },

  details: function (id) {
    if (id.indexOf("v:") !== 0) return null;
    var w = page(id.substring(2)).widgets[0];
    return {
      item: {
        id: id,
        title: w.title,
        type: "video",
        subtitle: w.show && w.show.title ? w.show.title : null,
        description: w.synopsis || null,
        thumbnail: w.image && w.image.src ? w.image.src.replace("{width}", IMG_WIDTH) : null
      },
      backdrop: w.image && w.image.src ? w.image.src.replace("{width}", "1280") : null
    };
  },

  streams: function (id) {
    var w = page(id.substring(2)).widgets[0];
    var mc = w.mediaCollection && w.mediaCollection.embedded;
    if (!mc || !mc.streams) throw new Error("Kein Stream verfügbar (evtl. nur in Deutschland abrufbar).");
    var main = mc.streams.filter(function (s) { return s.kind === "main"; })[0] || mc.streams[0];
    // HLS bevorzugen (passt sich der Bandbreite an), sonst das grösste MP4
    var hls = main.media.filter(function (m) { return m.mimeType === "application/vnd.apple.mpegurl"; })[0];
    var best = hls || main.media.slice().sort(function (a, b) {
      return (b.maxHResolutionPx || 0) - (a.maxHResolutionPx || 0);
    })[0];
    var subs = [];
    (mc.subtitles || []).forEach(function (s) {
      (s.sources || []).forEach(function (src) {
        if (src.kind === "webvtt") subs.push({ url: src.url, language: s.languageCode || "de", mimeType: "text/vtt" });
      });
    });
    return [{ url: best.url, title: w.title, subtitles: subs }];
  }
};
