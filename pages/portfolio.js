// 作品集列表（中英双语）
const projects = [
    {
        id: 10,
        titleZh: "休闲生存建造《Beavering Away》",
        titleEn: "Relaxing Survival & Building — Beavering Away",
        techZh: "Unity、水体模拟、生态系统",
        techEn: "Unity, water simulation, ecosystem",
        thumb: "images/Bevearing%20Away.png",
    },
    {
        id: 1,
        titleZh: "轻策略肉鸽卡牌《欺诈猜拳》",
        titleEn: "Light Strategy Roguelike Card — Deceptive Rock-Paper-Scissors",
        techZh: "Godot、GD Script、AI 大模型",
        techEn: "Godot, GDScript, large language models",
        thumb: "images/project1.png",
    },
    {
        id: 2,
        titleZh: "晚餐计划工具",
        titleEn: "Dinner Planner",
        techZh: "HTML、CSS、JavaScript、Vue",
        techEn: "HTML, CSS, JavaScript, Vue",
        thumb: "images/project2.png",
    },
    {
        id: 3,
        titleZh: "AI 塔罗占卜网站",
        titleEn: "AI Tarot Divination Website",
        techZh: "React、MobX、AI API",
        techEn: "React, MobX, AI API",
        thumb: "images/project3.png",
    },
    {
        id: 4,
        titleZh: "2D 塔防模拟经营游戏",
        titleEn: "2D Tower Defense & Simulation Management Game",
        techZh: "Unity、C#",
        techEn: "Unity, C#",
        thumb: "images/project4.png",
    },
    {
        id: 5,
        titleZh: "弹球对战《Last Fantasy》",
        titleEn: "Pinball Battle — Last Fantasy",
        techZh: "Unity、C#",
        techEn: "Unity, C#",
        thumb: "images/project5.png",
    },
    {
        id: 6,
        titleZh: "《志异》横向解谜拼图",
        titleEn: "Zhì Yì — Side-Scrolling Puzzle Adventure",
        techZh: "游戏策划、关卡设计、剧本",
        techEn: "Game design, level design, narrative",
        thumb: "images/project6.png",
    },
    {
        id: 7,
        titleZh: "智能 VR 交互游戏",
        titleEn: "Intelligent VR Interactive Game",
        techZh: "Unity、VR、深度学习",
        techEn: "Unity, VR, deep learning",
        thumb: "images/project7.png",
    },
    {
        id: 8,
        titleZh: "异地恋虚拟宠物 APP UX",
        titleEn: "Long-Distance Relationship Virtual Pet App — UX",
        techZh: "Figma、用户体验设计",
        techEn: "Figma, user experience design",
        thumb: "images/project8.png",
    },
    {
        id: 9,
        titleZh: "VR 社交行为研究实验",
        titleEn: "VR Social Behavior Research Experiment",
        techZh: "Unity、VR",
        techEn: "Unity, VR",
        thumb: "images/project9.png",
    },
];

/*
 * 卡片是 `<a href>`，不是挂 onclick 的 `<div>`。
 *
 * 理由和导航那条一模一样：整块可点的东西如果不是链接，键盘就够不着它，
 * Tab 顺序里没有它、Enter 也按不动 —— 「作品集里每一张卡都点不进去」。
 * 换成链接之后聚焦和 Enter 都是白给的，onclick 也就不需要了：href 写进去的
 * 哈希值和 go('project?id=N') 写的是同一个，hashchange 那条路会把它渲染出来
 * （renderProject 自己从 location.hash 里读 id，不靠谁先设好一个变量）。
 *
 * 代价只有 UA 给链接加的下划线和颜色，在 skin-ui.css 的 `.portfolio-item`
 * 里补掉了 —— 那一份是三个外观共用的，不用三个样式表各写一遍。
 */
window.renderPortfolio = function () {
    document.getElementById("content").innerHTML = `
    <div class="card">
      <h1>作品集 | Portfolio</h1>
      <p>游戏设计 | Game Design · 前端开发 | Front-end Development · 游戏开发 | Game Development · UX 设计 | UX Design</p>
    </div>
    <div class="portfolio-grid">
      ${projects.map(p => `
        <a class="portfolio-item" href="#/project?id=${p.id}">
          <img src="${p.thumb}" alt="${p.titleEn}" onerror="this.src='https://picsum.photos/300/180?random=${p.id}'">
          <div class="portfolio-info">
            <h3>${p.titleZh}</h3>
            <p class="portfolio-title-en">${p.titleEn}</p>
            <p class="p-tech">${p.techZh}</p>
            <p class="p-tech-en">${p.techEn}</p>
          </div>
        </a>
      `).join("")}
    </div>
  `;
};
