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

  /* 初始深链接先直接落位，避免从页面顶部慢慢穿过多个章节；
     页面稳定后，用户主动点击的页内跳转仍保持平滑。 */
  if (!reduceMotion) {
    window.setTimeout(function () {
      root.classList.add("smooth-scroll-ready");
    }, 140);
  }

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

  /* Platform tabs preserve the existing Apple device demo. */
  var platformButtons = Array.prototype.slice.call(document.querySelectorAll("[data-platform]"));
  function choosePlatform(key, updateUrl) {
    if (!["apple", "android", "harmony"].includes(key)) return;
    platformButtons.forEach(function (button) {
      var selected = button.dataset.platform === key;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(button.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
    });
    if (updateUrl) {
      history.replaceState(null, "", "#demo-" + key);
    }
  }
  platformButtons.forEach(function (button) {
    button.addEventListener("click", function () { choosePlatform(button.dataset.platform, true); });
  });
  function platformFromHash() {
    if (!platformButtons.length) return;
    var key = location.hash.replace("#demo-", "");
    if (["apple", "android", "harmony"].includes(key)) {
      choosePlatform(key, false);
      requestAnimationFrame(function () { document.getElementById("product").scrollIntoView({ behavior: "instant" }); });
    }
  }
  if (platformButtons.length) { choosePlatform("apple", false); platformFromHash(); }
  window.addEventListener("hashchange", platformFromHash);
  var androidButtons = Array.prototype.slice.call(document.querySelectorAll("[data-android-shot]"));
  function chooseAndroid(key) {
    androidButtons.forEach(function (button) {
      var selected = button.dataset.androidShot === key;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      document.getElementById(button.getAttribute("aria-controls")).hidden = !selected;
    });
  }
  androidButtons.forEach(function (button) { button.addEventListener("click", function () { chooseAndroid(button.dataset.androidShot); }); });
  if (androidButtons.length) chooseAndroid("family");

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

  /* 功能目录：动态避让两层导航，并以当前位置反馈滚动进度。 */
  var featureIndex = document.querySelector(".fpage-index");
  if (featureIndex) {
    var featureLinks = Array.prototype.slice.call(featureIndex.querySelectorAll('a[href^="#"]'));
    var featureSections = featureLinks.map(function (a) { return document.getElementById(a.hash.slice(1)); });
    var featureOffset = 0;
    function measureFeatureIndex() {
      var header = document.querySelector(".site-header");
      featureOffset = (header ? header.getBoundingClientRect().height : 62) + featureIndex.getBoundingClientRect().height + 20;
      root.style.setProperty("--feature-scroll-offset", featureOffset + "px");
    }
    var lastFeature = -2;
    function updateFeatureIndex() {
      var active = -1;
      featureSections.forEach(function (section, i) {
        if (section && section.getBoundingClientRect().top <= featureOffset + 10) active = i;
      });
      if (active !== lastFeature && active >= 0) {
        var rail = featureIndex.querySelector(".container");
        var item = featureLinks[active];
        if (rail && rail.scrollWidth > rail.clientWidth) {
          var left = item.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
          rail.scrollTo({ left: Math.max(0, left - (rail.clientWidth - item.offsetWidth) / 2), behavior: "instant" });
        }
      }
      lastFeature = active;
      featureLinks.forEach(function (a, i) {
        if (i === active) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    }
    var featureTick = false;
    window.addEventListener("scroll", function () {
      if (featureTick) return;
      featureTick = true;
      requestAnimationFrame(function () { updateFeatureIndex(); featureTick = false; });
    }, { passive: true });
    if ("ResizeObserver" in window) {
      new ResizeObserver(function () { measureFeatureIndex(); updateFeatureIndex(); }).observe(featureIndex);
    } else window.addEventListener("resize", function () { measureFeatureIndex(); updateFeatureIndex(); });
    measureFeatureIndex();
    requestAnimationFrame(function () {
      var target = featureSections.find(function (section) { return section && "#" + section.id === location.hash; });
      if (target) target.scrollIntoView({ behavior: "instant", block: "start" });
      updateFeatureIndex();
    });
  }

  /* ---------- 滚动显现 ---------- */
  document.querySelectorAll(".fsec-head, .fcard, .member-preview, .release-card, .circular-grid article, .circular-scope article").forEach(function (el) { el.classList.add("reveal"); });
  var reveals = document.querySelectorAll(".reveal");
  /* 同一组卡片轻微错峰，最大延迟控制在 120ms，保持节奏而不拖沓。 */
  document.querySelectorAll(
    ".daily-grid, .why-grid, .method-grid, .ai-grid, .vision-grid, " +
    ".roadmap-grid, .roadmap-rail, .feature-glance-grid, .privacy-grid, .misread-grid, .fsec-grid, .release-grid, .circular-grid, .circular-scope"
  ).forEach(function (group) {
    Array.prototype.slice.call(group.children).forEach(function (child, i) {
      if (child.classList.contains("reveal")) {
        child.style.setProperty("--reveal-delay", Math.min(i, 3) * 40 + "ms");
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
      { threshold: 0.05, rootMargin: "0px 0px -16px 0px" }
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

  /* ---------- 导航当前位置 ----------
     只标记当前页面已有的页内章节；理念等独立页面链接保持普通状态。
     使用观察器而不是持续读取布局，滚动时没有额外的每帧计算。 */
  var navSectionLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav-links a[href*="#"], .mobile-nav a[href*="#"]')
  ).filter(function (link) {
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return false; }
    return url.pathname === location.pathname && url.hash && document.querySelector(url.hash);
  });
  var navTargets = [];
  navSectionLinks.forEach(function (link) {
    var id = new URL(link.href, location.href).hash.slice(1);
    var target = document.getElementById(id);
    if (target && navTargets.indexOf(target) === -1) navTargets.push(target);
  });

  function setCurrentNav(id) {
    navSectionLinks.forEach(function (link) {
      var active = new URL(link.href, location.href).hash === "#" + id;
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  /* 独立页面（例如理念页）标记当前页；首页的页内链接由下方观察器接管。 */
  document.querySelectorAll(".nav-links a, .mobile-nav a").forEach(function (link) {
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return; }
    if (!url.hash && url.pathname === location.pathname) {
      link.setAttribute("aria-current", "page");
    }
  });

  if (navTargets.length && "IntersectionObserver" in window) {
    var visibleNavTargets = new Map();
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visibleNavTargets.set(entry.target, entry);
        else visibleNavTargets.delete(entry.target);
      });
      var visible = Array.from(visibleNavTargets.values());
      if (!visible.length) {
        setCurrentNav("");
        return;
      }
      visible.sort(function (a, b) {
        return Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top);
      });
      setCurrentNav(visible[0].target.id);
    }, { rootMargin: "-24% 0px -64% 0px", threshold: 0 });
    navTargets.forEach(function (target) { navIO.observe(target); });
  }

  /* ---------- Hero 与第二屏连续交接 ----------
     rAF 节流，只写两个 CSS 变量；页面隐藏时不更新；
     首屏向上收束时，第二屏同步轻微上移，避免两段像静态海报一样断开。 */
  var heroEl = document.querySelector(".hero");
  var headerEl = document.querySelector(".site-header");
  if (heroEl) document.body.classList.add("home-motion");
  if ((heroEl || headerEl) && !reduceMotion) {
    var scrollTicking = false;
    function updateScrollEffects() {
      scrollTicking = false;
      if (document.hidden) return;
      var y = window.scrollY || window.pageYOffset || 0;
      if (heroEl) root.style.setProperty("--reading-progress", Math.min(1, y / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)).toFixed(4));
      if (headerEl) headerEl.classList.toggle("is-scrolled", y > 18);
      if (heroEl) {
        var p = Math.min(1, y / (window.innerHeight * 0.5));
        heroEl.style.setProperty("--hero-shrink", p.toFixed(4));
        root.style.setProperty("--hero-progress", p.toFixed(4));
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

/* Isolated, in-memory demonstrations. Never read or write real app records. */
(function () {
  var en = document.documentElement.lang === 'en';
  var t = function (zh, english) { return en ? english : zh; };
  document.querySelectorAll('[data-demo]').forEach(function (demo) {
    var step = 0, lots = [], shopping = 2;
    var screen = demo.querySelector('[data-demo-screen]');
    var feedback = demo.querySelector('[data-demo-feedback]');
    var safe = function (s) { return s.replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
    function total() { return lots.reduce(function(n,x){return n+x.quantity;},0); }
    function draw() {
      demo.querySelector('[data-demo-stock]').textContent = total();
      demo.querySelector('[data-demo-shopping]').textContent = shopping;
      demo.querySelectorAll('[data-demo-step]').forEach(function(b){if(Number(b.dataset.demoStep)===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
      var title = [t('记下买回来的食材','Add your food'),t('先看快到期的','Check upcoming dates'),t('用多少，记多少','Record what you use'),t('买到后，确认入库','Confirm your purchase')][step];
      var html = '<h4 tabindex="-1">'+title+'</h4>';
      if (step === 0) {
        html += '<form data-demo-form><label>'+t('食材名称','Food name')+'<input name="food" maxlength="30" required value="'+t('牛奶','Milk')+'"></label><label>'+t('数量（瓶）','Quantity (bottles)')+'<input name="quantity" type="number" min="1" max="99" step="1" required value="3"></label><p>'+t('演示日期：2 天后到期；存放位置：冷藏。','Sample expiry: in 2 days. Storage: fridge.')+'</p><button class="button primary" type="submit">'+t('加入示例库存','Add to sample pantry')+'</button></form>';
      } else if (step === 1 || step === 2) {
        var near = lots.filter(function(x){return x.days<=2&&x.quantity>0;});
        html += '<p>'+t('仅查看 2 天内到期的示例食材。日期不代表食用安全判断。','Showing sample food due within 2 days. Dates are not a food safety assessment.')+'</p>';
        if (!near.length) html += '<p class="demo-empty">'+t('暂无临期食材。可以先添加一件示例。','No food nearing expiry. Add a sample first.')+'</p><button type="button" data-demo-go="0">'+t('去添加','Add food')+'</button>';
        near.forEach(function(x){html+='<div class="demo-food"><strong>'+safe(x.name)+'</strong><span>'+x.quantity+' '+t('瓶 · 还有 2 天','bottles · due in 2 days')+'</span>'+(step===2?'<button class="button quiet" type="button" data-demo-use="'+lots.indexOf(x)+'">'+t('用掉 1 瓶','Use 1 bottle')+' · '+safe(x.name)+'</button>':'')+'</div>';});
        if (step===1&&near.length) html+='<button class="button primary" type="button" data-demo-go="2">'+t('试试记录用量','Try recording usage')+'</button>';
      } else {
        html+='<div class="demo-food"><strong>'+t('牛奶','Milk')+'</strong><span>'+shopping+' '+t('瓶待购买','bottles to buy')+'</span></div><p>'+t('本次买到 2 瓶，示例到期日为 7 天后。与之前的批次分别记录。','Buy 2 bottles, due in 7 days in this sample. They stay separate from earlier batches.')+'</p><button class="button primary" type="button" data-demo-buy '+(!shopping?'disabled':'')+'>'+t(shopping?'确认买到 2 瓶':'这项采购已完成',shopping?'Confirm buying 2 bottles':'Purchase completed')+'</button>';
      }
      var restoreFocus = screen.contains(document.activeElement);
      screen.innerHTML=html;
      if (restoreFocus) screen.querySelector('h4').focus({preventScroll:true});
    }
    demo.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b||!demo.contains(b))return;
      if(b.hasAttribute('data-demo-reset')){step=0;lots=[];shopping=2;feedback.textContent=t('示例已重置。','Sample reset.');draw();}
      else if(b.hasAttribute('data-demo-step')||b.hasAttribute('data-demo-go')){step=Number(b.dataset.demoStep??b.dataset.demoGo);feedback.textContent='';draw();}
      else if(b.hasAttribute('data-demo-use')){var lot=lots[Number(b.dataset.demoUse)];if(lot&&lot.quantity>0&&lot.days<=2){lot.quantity--;feedback.textContent=t('已记录用掉 1 瓶。库存剩余：','Recorded 1 bottle used. Remaining: ')+total()+t(' 瓶。',' bottles.');draw();}}
      else if(b.hasAttribute('data-demo-buy')&&shopping){lots.push({name:t('牛奶','Milk'),quantity:shopping,days:7});shopping=0;feedback.textContent=t('已加入库存，待购数量归零。','Added to pantry; shopping list completed.');draw();}
    });
    demo.addEventListener('submit',function(e){if(!e.target.matches('[data-demo-form]'))return;e.preventDefault();var f=e.target,n=f.elements.food.value.trim(),q=Number(f.elements.quantity.value);if(!n||!Number.isInteger(q)||q<1||q>99){feedback.textContent=t('请输入名称和 1–99 的整数数量。','Enter a name and a whole quantity from 1 to 99.');return;}lots.push({name:n,quantity:q,days:2});step=1;draw();feedback.textContent=t('已加入示例库存，可以查看临期或继续记录用量。','Added to sample pantry. Check dates or record usage.');});
    draw();
  });
})();

/* One download decision at a time; all cards remain readable without JavaScript. */
(function(){
 var grid=document.querySelector('#download .release-grid');if(!grid)return;
 var cards=Array.from(grid.querySelectorAll('.release-card'));if(cards.length!==4)return;
 var en=document.documentElement.lang==='en',tabs=document.createElement('div');tabs.className='download-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',en?'Choose a version':'选择使用版本');
 var order=[3,0,1,2],buttons=[];
 order.forEach(function(index){var card=cards[index],b=document.createElement('button');b.type='button';b.id='download-tab-'+index;b.textContent=card.querySelector('h3').textContent;b.setAttribute('role','tab');b.setAttribute('aria-controls','download-panel-'+index);card.id='download-panel-'+index;card.setAttribute('role','tabpanel');card.setAttribute('aria-labelledby',b.id);card.tabIndex=0;buttons.push(b);tabs.append(b);b.addEventListener('click',function(){select(index);});});
 function select(index){cards.forEach(function(c,i){c.hidden=i!==index;if(i===index)c.classList.add('in-view');});buttons.forEach(function(b,i){var active=order[i]===index;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});}
 tabs.addEventListener('keydown',function(e){var i=buttons.indexOf(document.activeElement);if(i<0)return;var next;if(e.key==='ArrowRight')next=(i+1)%4;else if(e.key==='ArrowLeft')next=(i+3)%4;else if(e.key==='Home')next=0;else if(e.key==='End')next=3;else return;e.preventDefault();buttons[next].focus();buttons[next].click();});
 grid.before(tabs);grid.classList.add('release-picker');select(3);
})();
