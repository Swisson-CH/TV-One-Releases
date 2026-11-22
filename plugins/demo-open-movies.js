// Demo-Plugin: frei lizenzierte Filme (Blender Foundation, CC-BY) und Test-Streams
var BASE = "https://storage.googleapis.com/gtv-videos-bucket/sample/";

var MOVIES = [
  { id: "BigBuckBunny", title: "Big Buck Bunny", year: "2008",
    description: "Ein grosser Hase rächt sich an drei frechen Nagern." },
  { id: "ElephantsDream", title: "Elephants Dream", year: "2006",
    description: "Zwei Männer in einer surrealen, mechanischen Welt." },
  { id: "Sintel", title: "Sintel", year: "2010",
    description: "Eine junge Frau sucht ihren verlorenen Drachen." },
  { id: "TearsOfSteel", title: "Tears of Steel", year: "2012",
    description: "Science-Fiction in Amsterdam mit Robotern." }
];

var LIVE = [
  { id: "hls-bbb", title: "HLS Test (Big Buck Bunny)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  { id: "hls-bipbop", title: "HLS Test (Apple BipBop)",
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8" }
];

function movieItem(m) {
  return {
    id: "movie:" + m.id,
    title: m.title,
    subtitle: m.year,
    description: m.description,
    type: "video",
    thumbnail: BASE + "images/" + m.id + ".jpg"
  };
}

var plugin = {
  home: function () {
    return [
      { title: "Open Movies", items: MOVIES.map(movieItem) },
      { title: "Test-Streams", items: LIVE.map(function (l) {
          return { id: "live:" + l.id, title: l.title, type: "live" };
        }) }
    ];
  },

  browse: function (id) { return []; },

  // Detailseite: grosses Hintergrundbild und «Weitere Filme»
  details: function (id) {
    var key = id.substring("movie:".length);
    var movie = MOVIES.filter(function (m) { return m.id === key; })[0];
    if (!movie) return null;
    return {
      item: movieItem(movie),
      backdrop: BASE + "images/" + movie.id + ".jpg",
      sections: [{
        title: "Weitere Filme",
        items: MOVIES.filter(function (m) { return m.id !== key; }).map(movieItem)
      }]
    };
  },

  search: function (query) {
    var q = query.toLowerCase();
    return MOVIES.filter(function (m) { return m.title.toLowerCase().indexOf(q) >= 0; })
                 .map(movieItem);
  },

  streams: function (id) {
    if (id.indexOf("movie:") === 0) {
      return [{ url: BASE + id.substring(6) + ".mp4", title: "MP4" }];
    }
    for (var i = 0; i < LIVE.length; i++) {
      if ("live:" + LIVE[i].id === id) return [{ url: LIVE[i].url, title: "HLS" }];
    }
    return [];
  }
};
