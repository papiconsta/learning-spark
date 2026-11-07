/* Spark notes: shared behaviour. No build step; works from file:// */
(function () {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  window.SparkNotesStore = store;

  /* ---------- Theme ---------- */
  const savedTheme = store.get("theme", null);
  const prefersDark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = savedTheme || (prefersDark ? "dark" : "light");

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
    const b = document.getElementById("theme-toggle");
    if (b) b.textContent = next === "dark" ? "☀ Light" : "☾ Dark";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const pageId = document.body.dataset.page || location.pathname.split("/").pop();

    /* Theme button */
    const tbtn = document.getElementById("theme-toggle");
    if (tbtn) {
      tbtn.textContent = document.documentElement.dataset.theme === "dark" ? "☀ Light" : "☾ Dark";
      tbtn.addEventListener("click", toggleTheme);
    }

    /* Reading progress bar */
    const bar = document.getElementById("progress-bar");
    if (bar) {
      const update = () => {
        const h = document.documentElement.scrollHeight - innerHeight;
        bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + "%";
      };
      addEventListener("scroll", update, { passive: true }); update();
    }

    /* Code blocks: wrap, add language label + copy button */
    document.querySelectorAll("pre > code").forEach((code) => {
      const pre = code.parentElement;
      if (pre.parentElement.classList.contains("code-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "code-wrap" + (pre.classList.contains("output") ? " output" : "");
      pre.replaceWith(wrap); wrap.appendChild(pre);
      const m = (code.className.match(/language-(\w+)/) || [])[1];
      const label = document.createElement("span");
      label.className = "lang";
      label.textContent = pre.classList.contains("output") ? "output" : (m || "code");
      wrap.appendChild(label);
      if (!pre.classList.contains("output")) {
        const btn = document.createElement("button");
        btn.className = "copy"; btn.textContent = "Copy";
        btn.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(code.innerText); btn.textContent = "Copied ✓"; }
          catch { btn.textContent = "Select & copy"; }
          setTimeout(() => (btn.textContent = "Copy"), 1500);
        });
        wrap.appendChild(btn);
      }
    });
    if (window.hljs) document.querySelectorAll("pre:not(.output) code").forEach((el) => hljs.highlightElement(el));

    /* Tabs */
    document.querySelectorAll(".tabs").forEach((tabs) => {
      const panels = [...tabs.querySelectorAll(":scope > .tab-panel")];
      const btns = document.createElement("div");
      btns.className = "tab-buttons";
      panels.forEach((p, i) => {
        const b = document.createElement("button");
        b.textContent = p.dataset.label || "Tab " + (i + 1);
        b.addEventListener("click", () => {
          panels.forEach((x) => x.classList.remove("active"));
          btns.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
          p.classList.add("active"); b.classList.add("active");
        });
        btns.appendChild(b);
        if (i === 0) { p.classList.add("active"); b.classList.add("active"); }
      });
      tabs.prepend(btns);
    });

    /* Flashcards */
    document.querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => c.classList.toggle("flipped")));

    /* Quizzes: <div class="quiz" data-answer="1"> with .options > button */
    const quizzes = [...document.querySelectorAll(".quiz")];
    const scoreKey = "quiz:" + pageId;
    const saved = store.get(scoreKey, {});
    const scoreEl = document.querySelector(".quiz-score");
    const renderScore = () => {
      if (!scoreEl) return;
      const answered = Object.keys(saved).length;
      const right = Object.values(saved).filter(Boolean).length;
      scoreEl.textContent = `${right} / ${quizzes.length} correct` + (answered < quizzes.length ? ` (${quizzes.length - answered} left)` : "");
    };
    quizzes.forEach((quiz, qi) => {
      const answer = Number(quiz.dataset.answer);
      const buttons = [...quiz.querySelectorAll(".options button")];
      const finish = (chosen) => {
        buttons.forEach((b, i) => {
          b.disabled = true;
          if (i === answer) b.classList.add("correct");
          else if (i === chosen) b.classList.add("wrong");
        });
        quiz.classList.add("answered");
      };
      if (qi in saved) finish(saved[qi] ? answer : -1);
      buttons.forEach((b, i) => b.addEventListener("click", () => {
        finish(i); saved[qi] = i === answer; store.set(scoreKey, saved); renderScore();
      }));
    });
    const reset = document.getElementById("reset-quiz");
    if (reset) reset.addEventListener("click", () => { store.set(scoreKey, {}); location.reload(); });
    renderScore();

    /* TOC + "understood" checkboxes per section */
    const sections = [...document.querySelectorAll("section.note[id]")];
    const toc = document.querySelector(".toc");
    const doneKey = "done:" + pageId;
    const done = store.get(doneKey, {});
    const tocLinks = {};
    if (toc) {
      sections.forEach((s) => {
        const a = document.createElement("a");
        a.href = "#" + s.id;
        a.innerHTML = `<span></span><span class="check"></span>`;
        a.firstChild.textContent = s.querySelector("h2")?.textContent || s.id;
        toc.appendChild(a); tocLinks[s.id] = a;
      });
    }
    const paintDone = () => {
      sections.forEach((s) => { if (tocLinks[s.id]) tocLinks[s.id].querySelector(".check").textContent = done[s.id] ? "✓" : ""; });
      store.set("progress:" + pageId, { done: Object.values(done).filter(Boolean).length, total: sections.length });
    };
    sections.forEach((s) => {
      const label = document.createElement("label");
      label.className = "understood";
      label.innerHTML = `<input type="checkbox"> I understand this section`;
      const cb = label.querySelector("input");
      cb.checked = !!done[s.id];
      cb.addEventListener("change", () => { done[s.id] = cb.checked; store.set(doneKey, done); paintDone(); });
      s.appendChild(label);
    });
    paintDone();

    /* Highlight the active section in the TOC */
    if (toc && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            Object.values(tocLinks).forEach((a) => a.classList.remove("active"));
            tocLinks[e.target.id]?.classList.add("active");
          }
        });
      }, { rootMargin: "-30% 0px -60% 0px" });
      sections.forEach((s) => io.observe(s));
    }
  });
})();
