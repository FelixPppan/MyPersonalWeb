// 纯路由，无任何数据
const navItems = [
    { name: "首页 | Home", page: "home" },
    { name: "博客 | Blog", page: "blog" },
    { name: "作品集 | Portfolio", page: "portfolio" },
    { name: "光标 | Cursor", page: "cursor" },
    { name: "关于我 | About", page: "about" },
];

/*
 * 导航是一条 `<a href="#/页面">`，不是光挂个 onclick 的 `<a>`。
 *
 * 差别不是好看：没有 href 的 `<a>` **不在 Tab 顺序里**，键盘根本够不着它 ——
 * 而这是全站唯一的导航。走到别的页面只靠改地址栏，那不叫导航。
 * href 让它天然可聚焦、Enter 天然能按，不用补 tabindex、不用补键盘事件。
 *
 * onclick 留着不是为了激活，是为了**快一帧**：它同步 renderPage()，而 href 走
 * hashchange 是异步的。两个一起上不冲突 —— href 要写的哈希值和 go() 写的是同一个，
 * 值没变就不会再触发一次 hashchange。
 *
 * 补这段的时候顺手记一笔：`<a href>` 会让链接落进 skin-ui.css 里 `a[href]` 那一组
 * （可点击、以及「里面的文字不算文本」那条排除链）。导航项本来就在
 * `.nav-btn a` 那一组里，所以意图没变；但下划线得确认过 —— 三个外观的
 * `.nav-btn a` 都写了 `text-decoration: none`（href 会带出 UA 的下划线）。
 */
function renderNav() {
    document.getElementById("navbar").innerHTML = `
    <ul>
      ${navItems.map(n => `
        <li class="nav-btn latex-blister" data-blister="round"><a href="#/${n.page}" onclick="go('${n.page}')">${n.name}</a></li>
      `).join('')}
    </ul>
  `;
}

window.go = function (page) {
    location.hash = `/${page}`;
    renderPage();
};

window.renderPage = function () {
    const fullHash = location.hash.replace('#', '');
    const path = fullHash.split('?')[0];
    const page = path.replace('/', '') || "home";

    if (page === "home") renderHome();
    else if (page === "blog") renderBlog();
    else if (page === "portfolio") renderPortfolio();
    else if (page === "cursor") renderCursor();
    else if (page === "about") renderAbout();
    else if (page.includes("project")) renderProject();

    requestAnimationFrame(() => {
        document.querySelectorAll(".card, .portfolio-item, .btn, .blog-tab-btn").forEach((el) => {
            el.classList.add("latex-blister");
            if (!el.dataset.blister) {
                el.dataset.blister = "round";
            }
        });
        applyRevealOrder();
        if (typeof window.latexRefreshLayout === "function") window.latexRefreshLayout();
        // 页面刚拼出来，里面的图/视频/iframe 从现在起才开始加载 —— 该重新数一遍了
        if (window.LoadingWatch) window.LoadingWatch.scan();
        // 同理：新页面可能把一块可点的元素正好推到静止的指针底下，
        // 那种情况一个 pointerover 都不会来，得主动问一次
        if (window.HoverWatch) window.HoverWatch.refresh();
    });
};

/*
 * 出现顺序：按「从上到下、从左到右」排队，依次给每个元素写 animation-delay，
 * 让整页是顺着阅读方向长出来的，而不是一起冒出来。
 */
function applyRevealOrder() {
    const nodes = Array.from(
        document.querySelectorAll(".nav-btn, .card, .portfolio-item, .blog-tab-btn, .cx-cell")
    );
    if (!nodes.length) return;

    const items = nodes.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, top: r.top + window.scrollY, left: r.left };
    });

    // 同一排（纵向差小于半行）算一行，行内再从左到右
    const ROW = 28;
    items.sort((a, b) => {
        const rowA = Math.round(a.top / ROW);
        const rowB = Math.round(b.top / ROW);
        if (rowA !== rowB) return rowA - rowB;
        return a.left - b.left;
    });

    items.forEach((item, i) => {
        item.el.style.animationDelay = `${Math.min(i * 55, 880)}ms`;
    });
}

renderNav();
window.onload = () => {
    renderPage();
    window.addEventListener("hashchange", renderPage);
    if (typeof window.initSiteSkin === "function") initSiteSkin();
    else if (typeof window.initLatexMembrane === "function") initLatexMembrane();
};
