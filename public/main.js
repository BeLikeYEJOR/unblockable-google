let query = new URLSearchParams(window.location.search).get("q");

let container = document.getElementById("results");
let iframe = document.getElementById("site-frame");

fetch(`/api/search?q=${query}&ts=${Date.now()}`, {
  cache: "no-store",
})
  .then((res) => res.json())
  .then((data) => {
    data.forEach((result) => {
      const resultElement = document.createElement("div");

      resultElement.innerHTML = `
        <h3><button class="open-btn" data-url="${result.url}">${result.title}</button></h3>
        <p>${result.snippet}</p>`;

      container.appendChild(resultElement);
    });

    document.querySelectorAll(".open-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        container.innerHTML = "";
        iframe.style = "display: block";
        let rawUrl = btn.dataset.url;
        if (!rawUrl.startsWith("http")) {
          rawUrl = "https://" + rawUrl;
        }
        iframe.src = `/proxy?url=${encodeURIComponent(rawUrl)}`;
      });
    });
  });
