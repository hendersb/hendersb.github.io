// Background soundtrack: plays window.TRACKS in order and loops. Browsers need a click before audio can start.
(function () {
  const tracks = window.TRACKS || [];
  const box = document.getElementById("music");
  if (!tracks.length || !box) return;
  box.hidden = false;

  const $ = (id) => document.getElementById(id);
  const audio = new Audio();
  audio.preload = "none";
  let index = Number(localStorage.getItem("musicIndex")) || 0;
  if (index >= tracks.length) index = 0;
  audio.volume = Number(localStorage.getItem("musicVolume") ?? 50) / 100;
  $("m-vol").value = Math.round(audio.volume * 100);

  function load(i) {
    index = (i + tracks.length) % tracks.length;
    localStorage.setItem("musicIndex", index);
    audio.src = encodeURI(tracks[index].file);
    $("m-title").textContent = tracks[index].title;
  }
  function play() { audio.play().catch(() => {}); }

  load(index);
  $("m-play").onclick = () => (audio.paused ? play() : audio.pause());
  $("m-next").onclick = () => { load(index + 1); play(); };
  $("m-prev").onclick = () => { load(index - 1); play(); };
  $("m-vol").oninput = (e) => {
    audio.volume = e.target.value / 100;
    localStorage.setItem("musicVolume", e.target.value);
  };
  audio.onended = () => { load(index + 1); play(); };
  audio.onplay = () => { $("m-play").textContent = "⏸"; $("m-play").title = "Pause music"; };
  audio.onpause = () => { $("m-play").textContent = "▶"; $("m-play").title = "Play music"; };
})();
