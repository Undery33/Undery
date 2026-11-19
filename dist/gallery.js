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
      const entries = items.filter(item => item.type === mediaType);
      Array.from(list.children).forEach((tile, index) => {
        const entry = entries[index];
        if (!entry) return;
        const link = make("a");
        link.href = mediaType === "photo" ? "/vrchat/photos.html" : "/vrchat/videos.html";
        link.setAttribute("aria-label", entry.alt + (mediaType === "photo" ? " 사진 목록 보기" : " 영상 목록 보기"));
        link.append(thumbnail(entry));
        tile.removeAttribute("aria-hidden");
        tile.replaceChildren(link);
      });
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
    const dates = [];
    const years = [...new Set(entries.filter(item => item.date).map(item => item.date.slice(0, 4)))].sort().reverse();
    const numbers = count => Array.from({length: count}, (_, i) => String(i + 1).padStart(2, "0"));

    for (const [label, values] of [["연도", years], ["월", numbers(12)], ["일", numbers(31)]]) {
      const select = make("select");
      select.setAttribute("aria-label", label);
      select.className = "filter-date";
      select.add(new Option(label, ""));
      for (const value of values) select.add(new Option(String(Number(value)), value));
      select.addEventListener("change", () => {
        if (select !== dates[2]) {
          const [year, month, day] = dates;
          const max = month.value ? new Date(Number(year.value) || 2000, Number(month.value), 0).getDate() : 31;
          if (Number(day.value) > max) day.value = "";
          for (const option of day.options) option.disabled = Number(option.value) > max;
        }
        pages = 1;
        render();
      });
      dateRow.append(select);
      dates.push(select);
    }

    const buttons = [];
    function toggles(options, values, isQuality) {
      for (const value of values) {
        const button = make("button", "filter-choice");
        button.append(make("span", "", value));
        button.type = "button";
        button.addEventListener("click", () => {
          if (isQuality) quality = quality === value ? "" : value;
          else if (selectedTags.has(value)) selectedTags.delete(value);
          else {
            if (value === "16:9") selectedTags.delete("9:16");
            if (value === "9:16") selectedTags.delete("16:9");
            selectedTags.add(value);
          }
          pages = 1;
          render();
        });
        options.append(button);
        buttons.push({button, value, isQuality});
      }
    }
    toggles(tagRow, ["배경", "캐릭터", "16:9", "9:16", "친구"], false);
    toggles(qualityRow, ["FHD", "QHD", "4K"], true);
    const reset = make("button", "gallery-reset", "필터 초기화");
    reset.type = "button";
    reset.addEventListener("click", () => {
      for (const select of dates) {
        select.value = "";
        for (const option of select.options) option.disabled = false;
      }
      selectedTags.clear();
      quality = "";
      pages = 1;
      render();
      dates[0].focus();
    });
    dateRow.append(reset);
    form.hidden = false;

    function grid(orientation, media, size, filtered) {
      const list = make("ul", "gallery-grid" + (orientation === "portrait" ? " is-portrait" : ""));
      list.dataset.orientation = orientation;
      list.setAttribute("aria-label", orientation === "photo" ? "사진" : orientation === "portrait" ? "세로 영상" : "가로 영상");
      const visible = media.slice(0, size * pages);
      visibleMedia.push(...visible);
      const count = filtered ? visible.length : Math.max(size, Math.ceil(visible.length / size) * size);
      for (let i = 0; i < count; i++) {
        const tile = make("li", "gallery-tile");
        const item = visible[i];
        if (item) {
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
        } else {
          tile.setAttribute("aria-hidden", "true");
        }
        list.append(tile);
      }
      if (count) grids.append(list);
      return visible.length;
    }

    function render() {
      for (const {button, value, isQuality} of buttons) {
        button.setAttribute("aria-pressed", String(isQuality ? quality === value : selectedTags.has(value)));
      }
      const filtered = Boolean(quality || selectedTags.size || dates.some(select => select.value));
      reset.hidden = !filtered;
      const result = entries.filter(item =>
        (!quality || resolution(item) === quality) && [...selectedTags].every(tag => hasTag(item, tag)) &&
        dates.every((select, i) => !select.value || select.value === item.date?.split("-")[i])
      );
      grids.replaceChildren();
      visibleMedia = [];
      let displayed;
      if (type === "photo") displayed = grid("photo", result, 18, filtered);
      else {
        displayed = grid("portrait", result.filter(item => item.height > item.width), 8, filtered);
        displayed += grid("landscape", result.filter(item => item.height <= item.width), 6, filtered);
      }
      more.disabled = displayed >= result.length;
      status.classList.toggle("is-quiet", result.length > 0 || !filtered);
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
      const response = await fetch("/vrchat/media.json");
      if (!response.ok) throw new Error("Media catalog unavailable");
      const items = await response.json();
      items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      populatePreviews(items);
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
