// Internetradio über die freie Community-Datenbank radio-browser.info (öffentliche API, ohne Schlüssel)
var API = "https://de1.api.radio-browser.info/json";

function query(path, params) {
  var parts = [];
  for (var k in params) parts.push(k + "=" + encodeURIComponent(params[k]));
  return http.getJson(API + path + "?" + parts.join("&"));
}

// Standard-Parameter: nur funktionierende Sender, nach Beliebtheit sortiert
function popular(extra) {
  var p = { limit: 40, hidebroken: "true", order: "clickcount", reverse: "true" };
  for (var k in extra) p[k] = extra[k];
  return p;
}

function toItem(s) {
  var details = [];
  if (s.codec) details.push(s.codec + (s.bitrate ? " " + s.bitrate + " kbit/s" : ""));
  if (s.tags) details.push(s.tags.split(",").slice(0, 3).join(", "));
  return {
    id: "st:" + s.stationuuid,
    title: s.name.trim(),
    subtitle: s.country || "",
    description: details.join(" · "),
    type: "live",
    thumbnail: s.favicon ? s.favicon : null
  };
}

function section(title, path, params) {
  try {
    return { title: title, items: query(path, popular(params)).map(toItem) };
  } catch (e) {
    log("Sektion fehlgeschlagen: " + title + " – " + e);
    return { title: title, items: [] };
  }
}

var plugin = {
  home: function () {
    var country = (settings.get("country") || "CH").toUpperCase();
    var tag = settings.get("tag") || "tamil";
    return [
      section("Beliebt in " + country, "/stations/bycountrycodeexact/" + country, {}),
      section("Tag: " + tag, "/stations/bytagexact/" + tag, {}),
      section("Deutschland", "/stations/bycountrycodeexact/DE", {}),
      section("Weltweit meistgehört", "/stations/search", {})
    ];
  },

  browse: function (id) { return []; },

  search: function (q) {
    return query("/stations/search", popular({ name: q, limit: 50 })).map(toItem);
  },

  streams: function (id) {
    var uuid = id.substring(3);
    // /url/<uuid> zählt den Klick (Fairness gegenüber der Community) und liefert die Stream-URL
    var res = http.getJson(API + "/url/" + uuid);
    if (!res.url) throw new Error("Sender nicht erreichbar");
    return [{ url: res.url, title: res.name || "Radio" }];
  }
};
