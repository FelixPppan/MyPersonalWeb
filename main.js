// 纯路由，无任何数据
const navItems = [
    { name: "首页 | Home", page: "home" },
    { name: "游戏设计课博客", page: "blog" },
    { name: "作品集", page: "portfolio" },
    { name: "关于我", page: "about" },
];

function renderNav() {
    document.getElementById("navbar").innerHTML = `
    <ul>
      ${navItems.map(n => `
        <li class="nav-btn"><a onclick="go('${n.page}')">${n.name}</a></li>
      `).join('')}
    </ul>
  `;
}

// 🔥 修复路由格式：变成 #/portfolio
window.go = function (page) {
    location.hash = `/${page}`;
    renderPage();
};

// 🔥 修复解析方式
window.renderPage = function () {
    const fullHash = location.hash.replace('#', '');
    const path = fullHash.split('?')[0];
    const page = path.replace('/', '') || "home";

    if (page === "home") renderHome();
    else if (page === "blog") renderBlog();
    else if (page === "portfolio") renderPortfolio();
    else if (page === "about") renderAbout();
    else if (page.includes("project")) renderProject();
};

renderNav();
window.onload = () => {
    renderPage();
    window.addEventListener("hashchange", renderPage);
};