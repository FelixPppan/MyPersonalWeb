// 纯路由，无任何数据
const navItems = [
    { name: "首页 | Home", page: "home" },
    { name: "博客 | Blog", page: "blog" },
    { name: "作品集 | Portfolio", page: "portfolio" },
    { name: "关于我 | About", page: "about" },
];

function renderNav() {
    document.getElementById("navbar").innerHTML = `
    <ul>
      ${navItems.map(n => `
        <li class="nav-btn latex-blister" data-blister="round"><a onclick="go('${n.page}')">${n.name}</a></li>
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
    });
};

/*
 * 出现顺序：按「从上到下、从左到右」排队，依次给每个元素写 animation-delay，
 * 让整页是顺着阅读方向长出来的，而不是一起冒出来。
 */
function applyRevealOrder() {
    const nodes = Array.from(
        document.querySelectorAll(".nav-btn, .card, .portfolio-item, .blog-tab-btn")
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
