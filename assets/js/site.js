/* Drum Incremental — comportamiento general de la web: el tráiler se carga SOLO al pulsar
   (youtube-nocookie: nada de YouTube se descarga ni deja cookies hasta que el visitante lo pide). */
(function () {
  "use strict";
  document.querySelectorAll(".video button[data-yt]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-yt");
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
      f.title = btn.getAttribute("aria-label") || "Trailer";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.referrerPolicy = "strict-origin-when-cross-origin";
      btn.replaceWith(f);
    });
  });
})();
