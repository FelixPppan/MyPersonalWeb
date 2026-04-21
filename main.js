// 纯路由，无任何数据、无projects
const navItems = [
    { name: "首页", page: "home" },
    { name: "游戏设计博客", page: "blog" },
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

window.go = function (page) {
    location.hash = page;
    renderPage();
};

window.renderPage = function () {
    const page = location.hash.replace('#', '') || 'home';
    if (page === "home") renderHome();
    else if (page === "blog") renderBlog();
    else if (page === "portfolio") renderPortfolio();
    else if (page === "about") renderAbout();
    else if (page.startsWith("project")) renderProject();
};

renderNav();
window.onload = () => { renderPage(); window.addEventListener("hashchange", renderPage); };