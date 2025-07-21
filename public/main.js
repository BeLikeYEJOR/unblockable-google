let query = new URLSearchParams(window.location.search).get("q");

console.log(`${window.location.href}search`);

if (window.location.pathname.endsWith("/search")) {
  let SearchBtn = document.getElementById("SearchBtn");
  let SearchBar = document.getElementById("search-input");
  let GoogleLogo = document.getElementById("googleh1");

  if (SearchBar) SearchBar.style.display = "none";
  if (SearchBtn) SearchBtn.style.display = "none";
  if (GoogleLogo) GoogleLogo.style.display = "none";

  let container = document.getElementById("results");
  let iframe = document.getElementById("site-frame");

  if (query) {
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
  } else {
    iframe.style = "display: none";
    container.innerHTML = "<p>No search query provided.</p>";
    iframe.style = "display: none";
  }
} else {
  let SearchBtn = document.getElementById("SearchBtn");
  let SearchBar = document.getElementById("search-input");
  let GoogleLogo = document.getElementById("googleh1");

  if (SearchBar) SearchBar.style.display = "block";
  if (SearchBtn) SearchBtn.style.display = "block";
  if (GoogleLogo) GoogleLogo.style.display = "block";
}
