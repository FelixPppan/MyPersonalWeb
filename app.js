// 导航菜单
const routes = [
    { name: "首页 | Home", path: "/" },
    { name: "游戏设计课博客 | Game Dev Blog", path: "/blog" },
    { name: "作品集 | Portfolio", path: "/portfolio" },
    { name: "关于我 | About", path: "/about" },
];

// 项目数据
const projects = [
    {
        id: 1,
        title: "项目 1：2D 平台跳跃原型 | Project 1: 2D Platformer Prototype",
        desc: "角色移动、跳跃、碰撞系统 | Player Movement, Jump & Collision",
        image: "https://picsum.photos/900/500",
        content: `
      <h2>项目介绍 | Project Introduction</h2>
      <p>本项目是游戏设计课的基础原型，实现核心平台跳跃机制。</p>
      <p>This is a basic prototype for game design class, implementing core platformer mechanics.</p>

      <ul>
        <li>角色移动系统 | Character Movement</li>
        <li>跳跃与二段跳 | Jump & Double Jump</li>
        <li>地面碰撞检测 | Ground Collision</li>
        <li>动画状态切换 | Animation States</li>
      </ul>

      <h2>开发日志 | Dev Log</h2>
      <p>在这里记录你的开发过程、遇到的问题与解决方案。</p>
      <p>Write your development process, problems and solutions here.</p>
    `
    },
    {
        id: 2,
        title: "项目 2：敌人 AI 设计 | Project 2: Enemy AI Design",
        desc: "巡逻、追击、攻击状态机 | Patrol, Chase, Attack State Machine",
        image: "https://picsum.photos/900/501",
        content: `
      <h2>AI 逻辑说明 | AI Logic</h2>
      <p>使用有限状态机实现敌人行为控制。</p>
      <p>Using finite state machine to control enemy behaviors.</p>
    `
    }
];

// ==========================================
// 导航栏渲染（每个菜单都是独立按钮）
// ==========================================
function renderNavbar() {
    const nav = document.getElementById("navbar");
    nav.innerHTML = `
    <ul>
      ${routes.map(route => `
        <li class="nav-btn">
          <a onclick="navigate('${route.path}')">${route.name}</a>
        </li>
      `).join('')}
    </ul>
  `;
}

// 路由跳转
function navigate(path) {
    location.hash = path;
}

// 渲染页面
function renderPage() {
    const hash = location.hash.replace('#', '') || '/';
    const el = document.getElementById("content");

    if (hash === "/" || hash === "/index.html") {
        el.innerHTML = `
      <div class="card">
        <h1>个人网站 | Personal Website</h1>
        <p>欢迎来到我的个人主页，这里展示游戏设计课程笔记与项目开发过程。</p>
        <p>Welcome to my personal site. It includes game design notes and project dev logs.</p>
      </div>
    `;
    }
    else if (hash === "/blog") {
        el.innerHTML = `
      <div class="card">
        <h1>游戏设计课开发者博客 | Game Design Dev Blog</h1>
        <p>记录课程学习、原型开发与设计思考。</p>
        <p>Recording learning, prototyping and design thinking.</p>
      </div>

      <div class="card">
        <h2>课程笔记 | Course Notes</h2>
        <p>【在这里开始写你的笔记内容】</p>
        <p>【Start writing your notes here】</p>
      </div>

      <h2>课程项目 | Course Projects</h2>
      ${projects.map(p => `
        <div class="card project-card" onclick="navigate('/project/${p.id}')">
          <h3>${p.title}</h3>
          <p>${p.desc}</p>
        </div>
      `).join('')}
    `;
    }
    else if (hash.startsWith("/project/")) {
        const id = parseInt(hash.split("/")[2]);
        const proj = projects.find(p => p.id === id);
        if (!proj) {
            el.innerHTML = `<h1>项目不存在 | Project Not Found</h1>`;
            return;
        }
        el.innerHTML = `
      <h1>${proj.title}</h1>
      <img src="${proj.image}" class="project-image" alt="Project Screenshot">
      <div class="card">
        ${proj.content}
      </div>
    `;
    }
    else {
        el.innerHTML = `
      <div class="card">
        <h1>建设中 | Under Construction</h1>
        <p>页面正在更新，敬请期待。</p>
        <p>This page is under construction, stay tuned.</p>
      </div>
    `;
    }
}

// 初始化
renderNavbar();
renderPage();
window.addEventListener("hashchange", renderPage);