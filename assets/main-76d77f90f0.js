/* FreshLife 官网交互脚本（第三轮）
   职责：日夜主题切换（localStorage 记忆）、移动导航、
   手机演示 Tab 切换（含键盘方向键）、iPad 侧边栏演示、
   设备切换（iPhone/iPad/并排）、锚点跳转焦点管理、滚动显现、
   无障碍状态。无外部依赖；尊重 prefers-reduced-motion；
   脚本失效时内容仍完整可见。 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var THEME_KEY = "freshlife-theme";

  /* 界面文案按页面语言（html lang）切换：英文页不会被脚本注入中文。 */
  var isZh = document.documentElement.lang === "zh-CN";
  var STR = isZh ? {
    toDay: "切换到日间模式",
    toNight: "切换到夜间模式",
    day: "日间",
    night: "夜间",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
  } : {
    toDay: "Switch to light mode",
    toNight: "Switch to dark mode",
    day: "Day",
    night: "Night",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  };

  /* ---------- 日夜主题 ---------- */
  var root = document.documentElement;

  function applyTheme(theme, animate) {
    if (theme !== "light" && theme !== "dark") return;
    root.setAttribute("data-theme", theme);
    if (animate && !reduceMotion) {
      root.classList.add("theme-switching");
      clearTimeout(applyTheme._t);
      applyTheme._t = setTimeout(function () {
        root.classList.remove("theme-switching");
      }, 420);
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#101715" : "#f8f6ef");
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      var next = theme === "dark" ? "light" : "dark";
      var dark = theme === "dark";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? STR.toDay : STR.toNight);
      var label = btn.querySelector(".theme-toggle-label");
      if (label) label.textContent = dark ? STR.day : STR.night;
      btn.setAttribute("data-theme-next", next);
    });
  }

  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function toggleTheme() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next, true);
  }

  /* 首次访问跟随系统；用户手动选择后用 localStorage 记住 */
  var sysMedia = window.matchMedia("(prefers-color-scheme: dark)");
  function systemTheme() {
    return sysMedia.matches ? "dark" : "light";
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  var initialTheme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : systemTheme();
  applyTheme(initialTheme, false);

  /* 用户未手动选择时，跟随系统变化；选择后固定偏好 */
  var sysListener = function () {
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (stored !== "light" && stored !== "dark") {
      applyTheme(systemTheme(), true);
    }
  };
  sysMedia.addEventListener
    ? sysMedia.addEventListener("change", sysListener)
    : sysMedia.addListener(sysListener);

  document.querySelectorAll(".theme-toggle").forEach(function (btn) {
    btn.addEventListener("click", toggleTheme);
  });

  /* ---------- 移动导航 ---------- */
  var toggle = document.getElementById("nav-toggle");
  var panel = document.getElementById("mobile-nav");
  if (toggle && panel) {
    function setMenu(open, returnFocus) {
      panel.classList.toggle("open", open);
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      if ("inert" in panel) panel.inert = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? STR.closeMenu : STR.openMenu);
      if (!open && returnFocus) toggle.focus();
    }
    setMenu(false, false);
    toggle.addEventListener("click", function () {
      setMenu(!panel.classList.contains("open"), false);
    });
    panel.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        setMenu(false, false);
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) {
        setMenu(false, true);
      }
    });
    var wideMenu = window.matchMedia("(min-width: 961px)");
    var closeMenuOnWide = function () {
      if (wideMenu.matches && panel.classList.contains("open")) setMenu(false, false);
    };
    wideMenu.addEventListener
      ? wideMenu.addEventListener("change", closeMenuOnWide)
      : wideMenu.addListener(closeMenuOnWide);
  }

  /* ---------- Tab 键盘方向键（自动激活） ---------- */
  function initTablist(tablist) {
    var tabs = Array.prototype.slice.call(
      tablist.querySelectorAll('[role="tab"]')
    );
    if (tabs.length < 2) return;
    tablist.addEventListener("keydown", function (e) {
      var idx = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      var next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        next = tabs[(idx + 1) % tabs.length];
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        next = tabs[(idx - 1 + tabs.length) % tabs.length];
      } else if (e.key === "Home") {
        next = tabs[0];
      } else if (e.key === "End") {
        next = tabs[tabs.length - 1];
      }
      if (next) {
        e.preventDefault();
        next.focus();
        next.click();
      }
    });
  }

  document.querySelectorAll('[role="tablist"]').forEach(initTablist);

  /* ---------- 手机演示：五个核心页面切换 ---------- */
  var switcher = document.querySelector("[data-tab-switch]");
  if (switcher) {
    var screens = document.querySelectorAll("[data-mock-screen]");
    var buttons = document.querySelectorAll("[data-target]");
    var points = document.getElementById("tab-points");
    var pointsData = window.__FRESHLIFE_TAB_POINTS__ || {};

    function select(targetId, focus) {
      buttons.forEach(function (b) {
        var active = b.getAttribute("data-target") === targetId;
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      screens.forEach(function (s) {
        var active = s.id === "mock-" + targetId;
        s.classList.toggle("active", active);
      });
      if (points && pointsData[targetId]) {
        points.innerHTML = pointsData[targetId]
          .map(function (p) {
            return '<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span>' + p + "</span></li>";
          })
          .join("");
      }
      if (focus) {
        var activeButton = switcher.querySelector('[data-target="' + targetId + '"]');
        if (activeButton) activeButton.focus();
      }
    }

    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        select(b.getAttribute("data-target"), false);
      });
    });

    /* 初始状态：第一个标签 */
    if (buttons.length) select(buttons[0].getAttribute("data-target"), false);
  }

  /* ---------- iPad 侧边栏演示 ---------- */
  var ipadDevice = document.getElementById("ipad-device");
  if (ipadDevice) {
    var ipadItems = ipadDevice.querySelectorAll("[data-ipad-target]");
    var ipadPages = ipadDevice.querySelectorAll("[data-ipad-page]");

    function selectIpad(targetId, focus) {
      ipadItems.forEach(function (it) {
        var active = it.getAttribute("data-ipad-target") === targetId;
        it.classList.toggle("active", active);
        it.setAttribute("aria-pressed", active ? "true" : "false");
      });
      ipadPages.forEach(function (p) {
        p.classList.toggle("active", p.getAttribute("data-ipad-page") === targetId);
      });
      if (focus) {
        var activeItem = ipadDevice.querySelector(
          '[data-ipad-target="' + targetId + '"]'
        );
        if (activeItem) activeItem.focus();
      }
    }

    ipadItems.forEach(function (it) {
      it.addEventListener("click", function () {
        selectIpad(it.getAttribute("data-ipad-target"), false);
      });
    });
  }

  /* ---------- 设备切换（iPhone / iPad / 并排） ---------- */
  var deviceBtns = document.querySelectorAll("[data-device-view]");
  var deviceGrid = document.querySelector("[data-device-grid]");
  if (deviceBtns.length && deviceGrid) {
    function setDeviceView(view, animate) {
      var changed = deviceGrid.getAttribute("data-view") !== view;
      deviceGrid.setAttribute("data-view", view);
      deviceBtns.forEach(function (b) {
        var active = b.getAttribute("data-device-view") === view;
        b.setAttribute("aria-pressed", active ? "true" : "false");
        if (active) b.classList.add("active");
        else b.classList.remove("active");
      });
      if (changed && animate && !reduceMotion) {
        deviceGrid.classList.remove("just-swapped");
        /* 重新触发一次短暂进入动画；属性先更新，辅助技术与自动测试无需等待。 */
        void deviceGrid.offsetWidth;
        deviceGrid.classList.add("just-swapped");
        clearTimeout(setDeviceView._t);
        setDeviceView._t = setTimeout(function () {
          deviceGrid.classList.remove("just-swapped");
        }, 680);
      }
    }
    deviceBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        setDeviceView(b.getAttribute("data-device-view"), true);
      });
    });
    /* 窄屏默认只看 iPhone，避免并排挤压 */
    var mq = window.matchMedia("(max-width: 1080px)");
    function defaultView() {
      if (deviceGrid.getAttribute("data-view")) return; // 用户已选择
      setDeviceView(mq.matches ? "phone" : "both", false);
    }
    defaultView();
    if (mq.addEventListener) mq.addEventListener("change", defaultView);
    else mq.addListener(defaultView);
  }

  /* ---------- 锚点跳转后的焦点与反馈 ----------
     前进/后退、站内锚点都会触发 hashchange：把焦点交给目标区域，
     屏幕阅读器能感知到达；preventScroll 避免与浏览器滚动冲突。 */
  function focusTarget(id) {
    var el = id && document.getElementById(id);
    if (!el || el === document.activeElement) return;
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  if ("onhashchange" in window) {
    window.addEventListener("hashchange", function () {
      focusTarget(decodeURIComponent(location.hash.slice(1)));
    });
  }

  /* ---------- 滚动显现 ---------- */
  var reveals = document.querySelectorAll(".reveal");
  /* 同一组卡片轻微错峰，最大延迟控制在 280ms，保持节奏而不拖沓。 */
  document.querySelectorAll(
    ".daily-grid, .why-grid, .method-grid, .ai-grid, .vision-grid, " +
    ".roadmap-grid, .roadmap-rail, .feature-glance-grid, .privacy-grid, .misread-grid"
  ).forEach(function (group) {
    Array.prototype.slice.call(group.children).forEach(function (child, i) {
      if (child.classList.contains("reveal")) {
        child.style.setProperty("--reveal-delay", Math.min(i, 4) * 70 + "ms");
      }
    });
  });
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in-view"); });
  }

  /* ---------- 品牌滚动叙事：章节联动 ----------
     用 IntersectionObserver 感知当前章节（根边距只留视口中央细带），
     只更新舞台 data-active 与进度指示 aria-current，不做每帧读写；
     reduced-motion 下完全跳过，内容保持静态可见。 */
  var storyStage = document.querySelector("[data-story-stage]");
  var storyChapters = Array.prototype.slice.call(
    document.querySelectorAll("[data-story-chapter]")
  );
  var storyIndicators = document.querySelectorAll("[data-story-indicator]");

  function setStoryChapter(n) {
    if (!storyStage) return;
    var previous = parseInt(storyStage.getAttribute("data-active") || "1", 10);
    storyStage.setAttribute("data-direction", Number(n) < previous ? "back" : "forward");
    storyStage.setAttribute("data-active", String(n));
    storyChapters.forEach(function (chapter) {
      chapter.classList.toggle(
        "is-active",
        chapter.getAttribute("data-story-chapter") === String(n)
      );
    });
    storyIndicators.forEach(function (a) {
      if (a.getAttribute("data-story-indicator") === String(n)) {
        a.setAttribute("aria-current", "step");
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }

  if (storyStage && storyChapters.length && !reduceMotion) {
    setStoryChapter(storyStage.getAttribute("data-active") || "1");
    if ("IntersectionObserver" in window) {
      var storyIO = new IntersectionObserver(
        function (entries) {
          var best = null;
          var bestDist = Infinity;
          var vh = window.innerHeight;
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var r = entry.target.getBoundingClientRect();
            var d = Math.abs((r.top + r.bottom) / 2 - vh / 2);
            if (d < bestDist) {
              bestDist = d;
              best = entry.target;
            }
          });
          if (best) setStoryChapter(best.getAttribute("data-story-chapter"));
        },
        { rootMargin: "-42% 0px -42% 0px", threshold: 0 }
      );
      storyChapters.forEach(function (ch) { storyIO.observe(ch); });
    }
  }

  /* ---------- Hero 滚动收束（很轻） ----------
     rAF 节流，只写 --hero-shrink 一个 CSS 变量；页面隐藏时不更新；
     只做 transform/opacity，首屏最多位移 20px、淡化 35%。 */
  var heroEl = document.querySelector(".hero");
  var headerEl = document.querySelector(".site-header");
  if ((heroEl || headerEl) && !reduceMotion) {
    var scrollTicking = false;
    function updateScrollEffects() {
      scrollTicking = false;
      if (document.hidden) return;
      var y = window.scrollY || window.pageYOffset || 0;
      if (headerEl) headerEl.classList.toggle("is-scrolled", y > 18);
      if (heroEl) {
        var p = Math.min(1, y / (window.innerHeight * 0.5));
        heroEl.style.setProperty("--hero-shrink", p.toFixed(4));
      }
    }
    window.addEventListener("scroll", function () {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(updateScrollEffects);
    }, { passive: true });
    updateScrollEffects();
  }

  /* ---------- 当前年份 ---------- */
  var yearEls = document.querySelectorAll("[data-year]");
  yearEls.forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
