(() => {
  "use strict";

  const previewLists = document.querySelectorAll("[data-gallery-preview]");
  const type = document.body.dataset.gallery;
  if (!type && !previewLists.length) return;

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function thumbnail(item) {
    if (item.type === "video" && !item.thumbnail) {
      const video = make("video");
      video.src = item.src;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-hidden", "true");
      return video;
    }
    const img = make("img");
    img.src = item.thumbnail || item.src;
    img.loading = "lazy";
    img.alt = "";
    return img;
  }

  function populatePreviews(items) {
    for (const list of previewLists) {
      const mediaType = list.dataset.galleryPreview;
      const limit = mediaType === "photo" ? 6 : 4;
      const entries = items.filter(item => item.type === mediaType).slice(0, limit);
      list.replaceChildren(...entries.map(entry => {
        const tile = make("li");
        const link = make("a");
        link.href = mediaType === "photo" ? "/vrchat/photos.html" : "/vrchat/videos.html";
        link.setAttribute("aria-label", entry.alt + (mediaType === "photo" ? " 사진 목록 보기" : " 영상 목록 보기"));
        link.append(thumbnail(entry));
        tile.append(link);
        return tile;
      }));
    }
  }

  function viewer(noun) {
    const dialog = make("dialog", "gallery-dialog");
    dialog.setAttribute("aria-label", noun + " 확대 보기");
    const frame = make("div", "viewer-frame");
    frame.tabIndex = -1;
    const prev = make("button", "viewer-prev");
    const next = make("button", "viewer-next");
    prev.type = next.type = "button";
    prev.setAttribute("aria-label", "이전 " + noun);
    next.setAttribute("aria-label", "다음 " + noun);
    dialog.append(prev, frame, next);
    document.body.append(dialog);
    let items = [];
    let index = 0;

    function display() {
      const item = items[index];
      frame.querySelector("video")?.pause();
      const media = make(item.type === "photo" ? "img" : "video");
      media.src = item.src;
      if (item.type === "video") {
        media.controls = true;
        media.playsInline = true;
        media.setAttribute("aria-label", item.alt);
        if (item.thumbnail) media.poster = item.thumbnail;
      } else {
        media.alt = item.alt;
      }
      frame.replaceChildren(media);
    }

    function step(direction) {
      if (items.length < 2) return;
      index = (index + direction + items.length) % items.length;
      frame.dataset.direction = direction > 0 ? "next" : "prev";
      display();
    }
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    dialog.addEventListener("keydown", event => {
      if (event.target.tagName === "VIDEO" || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        step(event.key === "ArrowRight" ? 1 : -1);
      }
    });
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      frame.querySelector("video")?.pause();
      frame.replaceChildren();
      items = [];
    });
    return (entries, item) => {
      items = entries;
      index = items.indexOf(item);
      prev.hidden = next.hidden = items.length < 2;
      delete frame.dataset.direction;
      display();
      dialog.showModal();
      frame.focus({preventScroll: true});
    };
  }

  function hasTag(item, tag) {
    if (tag === "16:9") return item.width * 9 === item.height * 16;
    if (tag === "9:16") return item.width * 16 === item.height * 9;
    return item.tags?.includes(tag);
  }

  function resolution(item) {
    const long = Math.max(item.width, item.height);
    const short = Math.min(item.width, item.height);
    if (long >= 3840 && short >= 2160) return "4K";
    if (long >= 2560 && short >= 1440) return "QHD";
    if (long >= 1920 && short >= 1080) return "FHD";
    return "";
  }

  function compareDates(a, b, order) {
    if (!a.date) return b.date ? 1 : 0;
    if (!b.date) return -1;
    return order === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  }

  function prepareGallery(items) {
    const form = document.querySelector(".gallery-filters");
    const grids = document.querySelector(".gallery-grids");
    const status = document.querySelector(".gallery-status");
    const more = document.querySelector(".gallery-more");
    const entries = items.filter(item => item.type === type);
    const noun = type === "photo" ? "사진" : "영상";
    const open = viewer(noun);
    let visibleMedia = [];
    let pages = 1;
    const selectedTags = new Set();
    let quality = "";
    let dateOrder = "desc";

    function row(label) {
      const group = make("div", "filter-row");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", label);
      const options = make("div", "filter-options");
      group.append(make("span", "filter-label", label), options);
      form.append(group);
      return options;
    }

    const dateRow = row("날짜");
    const tagRow = row("태그");
    const qualityRow = row("화질");
    const buttons = [];
    function choice(options, label, isSelected, select) {
      const button = make("button", "filter-choice");
      button.append(make("span", "", label));
      button.type = "button";
      button.addEventListener("click", () => {
        select();
        pages = 1;
        render();
      });
      options.append(button);
      buttons.push({button, isSelected});
      return button;
    }
    choice(dateRow, "오름차순", () => dateOrder === "asc", () => { dateOrder = "asc"; });
    const newestFirst = choice(dateRow, "내림차순", () => dateOrder === "desc", () => { dateOrder = "desc"; });
    for (const tag of ["배경", "캐릭터", "16:9", "9:16", "친구"]) {
      choice(tagRow, tag, () => selectedTags.has(tag), () => {
        if (selectedTags.delete(tag)) return;
        if (tag === "16:9") selectedTags.delete("9:16");
        if (tag === "9:16") selectedTags.delete("16:9");
        selectedTags.add(tag);
      });
    }
    for (const value of ["FHD", "QHD", "4K"]) {
      choice(qualityRow, value, () => quality === value, () => { quality = quality === value ? "" : value; });
    }
    const reset = make("button", "gallery-reset", "필터 초기화");
    reset.type = "button";
    reset.addEventListener("click", () => {
      dateOrder = "desc";
      selectedTags.clear();
      quality = "";
      pages = 1;
      render();
      newestFirst.focus();
    });
    dateRow.append(reset);
    form.hidden = false;

    function grid() {
      if (!visibleMedia.length) return;
      const list = make("ul", "gallery-grid");
      list.setAttribute("aria-label", noun);
      if (type === "video") {
        const portraits = visibleMedia.filter(item => item.height > item.width).length;
        if (portraits) list.classList.add(portraits === visibleMedia.length ? "is-portrait" : "is-mixed");
      }
      for (const item of visibleMedia) {
        const tile = make("li", "gallery-tile");
        if (type === "video" && item.height > item.width) tile.classList.add("portrait-tile");
        const link = make("a");
        link.href = item.src;
        link.dataset.mediaId = item.id;
        link.setAttribute("aria-label", item.alt);
        link.setAttribute("aria-haspopup", "dialog");
        link.append(thumbnail(item));
        link.addEventListener("click", event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          open(visibleMedia, item);
        });
        tile.append(link);
        list.append(tile);
      }
      grids.append(list);
    }

    function render() {
      for (const {button, isSelected} of buttons) {
        button.setAttribute("aria-pressed", String(isSelected()));
      }
      const filtered = Boolean(quality || selectedTags.size);
      reset.hidden = !filtered && dateOrder === "desc";
      const result = entries.filter(item =>
        (!quality || resolution(item) === quality) && [...selectedTags].every(tag => hasTag(item, tag))
      ).sort((a, b) => compareDates(a, b, dateOrder));
      let limit = 18 * pages;
      if (type === "video") {
        const portraits = result.filter(item => item.height > item.width).length;
        limit = Math.min(portraits, 8 * pages) + Math.min(result.length - portraits, 6 * pages);
      }
      visibleMedia = result.slice(0, limit);
      grids.replaceChildren();
      grid();
      const displayed = visibleMedia.length;
      more.disabled = displayed >= result.length;
      status.classList.toggle("is-quiet", result.length > 0);
      if (result.length) status.textContent = noun + " " + result.length + "개 중 " + displayed + "개 표시";
      else status.textContent = filtered ? "조건에 맞는 " + noun + "이 없습니다." : "아직 등록된 " + noun + "이 없습니다.";
      document.querySelector(".gallery-results").setAttribute("aria-busy", "false");
    }
    more.addEventListener("click", () => {
      const existing = new Set([...grids.querySelectorAll("[data-media-id]")].map(link => link.dataset.mediaId));
      pages++;
      render();
      const firstNew = [...grids.querySelectorAll("[data-media-id]")].find(link => !existing.has(link.dataset.mediaId));
      firstNew?.focus();
    });
    render();
  }

  async function load() {
    try {
      const response = await fetch("/api/vrchat/media");
      if (!response.ok) throw new Error("Media catalog unavailable");
      const items = await response.json();
      if (previewLists.length) populatePreviews(items.sort((a, b) => compareDates(a, b, "desc")));
      if (type) prepareGallery(items);
    } catch {
      if (!type) return;
      const status = document.querySelector(".gallery-status");
      status.textContent = "목록을 불러오지 못했습니다. ";
      const retry = make("button", "", "다시 시도");
      retry.addEventListener("click", () => { status.replaceChildren(); load(); }, {once:true});
      status.append(retry);
      document.querySelector(".gallery-results").setAttribute("aria-busy", "false");
    }
  }
  load();
})();
