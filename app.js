// 导航菜单
const routes = [
    { name: "首页 | Home", path: "/" },
    { name: "游戏设计课博客 | Game Dev Blog", path: "/blog" },
    { name: "作品集 | Portfolio", path: "/portfolio" },
    { name: "关于我 | About", path: "/about" },
];

// 项目数据（上面那段替换这里）
const projects = [
    {
        id: 1,
        title: "轻策略肉鸽卡牌《欺诈猜拳》",
        en: "Roguelike Card Game: Rock-Paper-Scissors Deception",
        tech: "Godot, GD Script, AI大模型",
        thumb: "images/project1.png",
        type: "video",
        url: "https://player.bilibili.com/player.html?bvid=BV17sdsBBEkV&autoplay=0",
        link: "https://www.bilibili.com/video/BV17sdsBBEkV",
        content: `
      <p>莉莉丝“我的AI队友”高校游戏提案赛作品。</p>
      <p>基于猜拳扩展肉鸽卡牌玩法，接入大模型AI敌人，实现读心博弈体验。</p>
      <p>3 天独立完成全栈开发，可玩 demo。</p>
    `
    },
    {
        id: 2,
        title: "晚餐计划工具 Dinner Planner",
        en: "Dinner Planner - Responsive Website",
        tech: "HTML, CSS, JavaScript, Vue",
        thumb: "images/project2.png",
        type: "web",
        url: "https://dishprogram-6bff8.web.app/vue.html#/",
        link: "https://dishprogram-6bff8.web.app/vue.html#/",
        content: `
      <p>响应式网页，支持菜单制定、联网获取食谱、生成购物清单。</p>
      <p>采用 MVP 架构，UI 适配移动端与 PC 端。</p>
    `
    },
    {
        id: 3,
        title: "AI 塔罗占卜网站",
        en: "AI Tarot Reading Website",
        tech: "React, Mbox, AI API, Google Login",
        thumb: "images/project3.png",
        type: "web",
        url: "https://tarot-app-account.web.app",
        link: "https://tarot-app-account.web.app",
        content: `
      <p>AI 塔罗抽牌、解读、历史记录、教学、用户数据持久化。</p>
    `
    },
    {
        id: 4,
        title: "2D 塔防模拟经营游戏",
        en: "2D Tower Defense & Simulation Game",
        tech: "Unity, C#",
        thumb: "images/project4.png",
        type: "video",
        url: "https://player.bilibili.com/player.html?bvid=BV1m1QCBwE9V&autoplay=0",
        link: "https://www.bilibili.com/video/BV1m1QCBwE9V/",
        content: `<p>个人独立全栈开发，完整系统+交互+前端界面。</p>`
    },
    {
        id: 5,
        title: "弹球对战《Last Fantasy》",
        en: "Turn-Based Pinball Battle",
        tech: "Unity, C#",
        thumb: "images/project5.png",
        type: "video",
        url: "https://player.bilibili.com/player.html?bvid=BV1kx4y1b7RA&autoplay=0",
        link: "https://www.bilibili.com/video/BV1kx4y1b7RA/",
        content: `<p>回合制弹球战斗、角色技能、数值系统、物理陷阱。</p>`
    },
    {
        id: 6,
        title: "《志异》横向解谜拼图",
        en: "2D Scroll Puzzle Game: ZhiYi",
        tech: "Game Design, Level Design",
        thumb: "images/project6.png",
        type: "video",
        url: "https://player.bilibili.com/player.html?bvid=BV1s1421y7vk&autoplay=0",
        link: "https://www.bilibili.com/video/BV1s1421y7vk/",
        content: `<p>全国大学生数字媒体大赛二等奖。</p>`
    },
    {
        id: 7,
        title: "智能 VR 交互游戏",
        en: "VR Smart Interaction Game",
        tech: "Unity, VR",
        thumb: "images/project7.png",
        type: "detail",
        content: `<p>大创项目，核心合成系统、关卡谜题设计。</p>`
    },
    {
        id: 8,
        title: "异地恋虚拟宠物 APP UX 设计",
        en: "Long-Distance Pet App UX",
        tech: "Figma, UX Research",
        thumb: "images/project8.png",
        type: "detail",
        content: `<p>双钻模型、用户调研、高保真原型、可用性测试。</p>`
    },
    {
        id: 9,
        title: "VR 社交行为研究实验",
        en: "VR Social Interaction Research",
        tech: "Unity, VR",
        thumb: "images/project9.png",
        type: "detail",
        content: `<p>礼貌策略与空间位置对社交影响的研究实验。</p>`
    },
    {
        id: 10,
        title: "开放世界生存《beavering away》",
        en: "Beaver Survival & Building",
        tech: "Unity, Physics, River System",
        thumb: "images/project10.png",
        type: "detail",
        content: `<p>河狸生存、水流运输、大坝物理、噪音压力系统。</p>`
    }
];

// 渲染导航栏
function renderNavbar() {
    const nav = document.getElementById("navbar");
    nav.innerHTML = `
    <ul>
      ${routes.map(r => `
        <li class="nav-btn">
          <a onclick="navigate('${r.path}')">${r.name}</a>
        </li>
      `).join('')}
    </ul>
  `;
}

// 跳转
function navigate(path) {
    location.hash = path;
}

// 渲染页面
function renderPage() {
    const hash = location.hash.replace('#', '') || '/';
    const el = document.getElementById("content");

    // 首页
    if (hash === '/') {
        el.innerHTML = `
      <div class="card">
        <h1>个人网站 | Personal Website</h1>
        <p>潘国玺｜游戏设计｜前端开发｜游戏开发</p>
        <p>Guoxi Pan | Game Design | Web Dev | Game Dev</p>
      </div>
    `;
    }

    // 博客
    else if (hash === '/blog') {
        el.innerHTML = `
      <div class="card">
        <h1>游戏设计课博客 | Game Dev Blog</h1>
        <p>课程笔记、开发日志、原型设计思考</p>
      </div>
    `;
    }

    // 作品集（缩略图选项卡）
    else if (hash === '/portfolio') {
        el.innerHTML = `
      <div class="card">
        <h1>作品集 | Portfolio</h1>
        <p>全部项目展示｜点击查看详情</p>
      </div>
      <div class="portfolio-list">
        ${projects.map(p => `
          <div class="portfolio-item" onclick="navigate('/project/${p.id}')">
            <img src="${p.thumb}" alt="thumb" class="p-img" onerror="this.src='https://picsum.photos/300/180?random=${p.id}'">
            <div class="p-info">
              <h4>${p.title}</h4>
              <span>${p.tech}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    }

    // 项目详情页
    else if (hash.startsWith('/project/')) {
        const id = parseInt(hash.split('/')[2]);
        const proj = projects.find(x => x.id === id);
        if (!proj) { el.innerHTML = `<h1>项目不存在</h1>`; return; }

        let media = '';
        let btn = '';

        if (proj.type === 'video') {
            media = `<iframe src="${proj.url}" width="100%" height="400" frameborder="0"></iframe>`;
            btn = `<a href="${proj.link}" target="_blank" class="btn">打开 B 站观看</a>`;
        } else if (proj.type === 'web') {
            media = `<img src="${proj.thumb}" class="project-image">`;
            btn = `<a href="${proj.url}" target="_blank" class="btn">打开项目网站</a>`;
        } else {
            media = `<img src="${proj.thumb}" class="project-image">`;
        }

        el.innerHTML = `
      <h2>${proj.title}</h2>
      <p class="en-title">${proj.en}</p>
      <p class="tech-stack">${proj.tech}</p>
      <br>
      ${media}
      <br><br>
      <div class="card">
        ${proj.content}
        <br>
        ${btn}
      </div>
      <br>
      <a onclick="navigate('/portfolio')" class="btn back">← 返回作品集</a>
    `;
    }

    // 关于我
    else if (hash === '/about') {
        el.innerHTML = `
      <div class="card">
        <h1>关于我 | About</h1>
        <p>硕士｜交互媒体技术｜KTH 瑞典皇家理工学院</p>
        <p>求职意向：游戏设计策划、游戏开发、前端开发、产品经理</p>
      </div>
    `;
    }

    else {
        el.innerHTML = `<div class="card"><h1>页面建设中</h1></div>`;
    }
}

// 启动
renderNavbar();
renderPage();
window.addEventListener('hashchange', renderPage);