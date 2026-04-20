// ==============================================
// 导航栏菜单（修改这里，全站自动更新）
// ==============================================
const routes = [
    { name: "首页", path: "/" },
    { name: "游戏设计课开发者博客", path: "/blog" },
    { name: "作品集", path: "/portfolio" },
    { name: "关于我", path: "/about" },
];

// ==============================================
// 博客项目数据（在这里写你的项目）
// ==============================================
const projects = [
    {
        id: 1,
        title: "项目 1：2D 平台跳跃游戏原型",
        desc: "使用 Unity / Godot 制作基础角色移动与跳跃",
        image: "https://picsum.photos/800/450",
        content: `
      <h2>项目介绍</h2>
      <p>这是我在游戏设计课完成的第一个原型项目，实现了：</p>
      <ul style="margin-left:1.5rem; line-height:1.7">
        <li>角色左右移动</li>
        <li>跳跃与二段跳</li>
        <li>碰撞地面与平台</li>
        <li>基本动画状态切换</li>
      </ul>
      <h2>开发过程</h2>
      <p>在这里写你遇到的问题、解决方法、思考……</p>
    `
    },
    {
        id: 2,
        title: "项目 2：敌人 AI 逻辑",
        desc: "巡逻、追击、攻击状态机设计",
        image: "https://picsum.photos/800/451",
        content: "<h2>AI 开发日志</h2><p>这里是你的 AI 开发内容……</p>"
    }
];

// ==============================================
// 1. 动态生成导航栏
// ==============================================
function renderNavbar() {
    const nav = document.getElementById("navbar");
    nav.innerHTML = `
    <ul>
      ${routes.map(route => `<li><a onclick="navigate('${route.path}')">${route.name}</a></li>`).join('')}
    </ul>
  `;
}

// ==============================================
// 2. 路由跳转（JS 无刷新切换页面）
// ==============================================
function navigate(path) {
    window.history.pushState({}, "", path);
    renderPage();
}

// ==============================================
// 3. 根据地址渲染不同页面
// ==============================================
function renderPage() {
    const path = window.location.pathname;
    const content = document.getElementById("content");

    // 首页
    if (path === "/" || path === "/index.html") {
        content.innerHTML = `
      <h1>欢迎来到我的个人网站</h1>
      <p>这里记录我的学习、作品与游戏开发笔记。</p>
      <p>点击上方「游戏设计课开发者博客」开始阅读。</p>
    `;
    }

    // 博客列表页
    else if (path === "/blog") {
        content.innerHTML = `
      <h1>游戏设计课 - 开发者博客</h1>
      <p>这里记录我在游戏设计课上的学习过程、思考与项目开发日志。</p>
      <h2>课程笔记区域</h2>
      <p>【你可以在这里自由写课程学习内容】</p>
      <div class="project-list">
        ${projects.map(p => `
          <div class="project-card">
            <span onclick="navigate('/project/${p.id}')">${p.title}</span>
            <p>${p.desc}</p>
          </div>
        `).join('')}
      </div>
    `;
    }

    // 项目详情页
    else if (path.startsWith("/project/")) {
        const id = parseInt(path.split("/")[2]);
        const proj = projects.find(p => p.id === id);
        if (!proj) {
            content.innerHTML = "<h1>项目不存在</h1>";
            return;
        }
        content.innerHTML = `
      <h1>${proj.title}</h1>
      <img src="${proj.image}" class="project-image" alt="游戏截图">
      ${proj.content}
    `;
    }

    // 其他页面
    else {
        content.innerHTML = `<h1>页面建设中</h1>`;
    }
}

// ==============================================
// 初始化：渲染导航 + 页面
// ==============================================
renderNavbar();
renderPage();
window.onpopstate = renderPage;