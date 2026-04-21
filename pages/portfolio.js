// 作品集列表（只放封面需要的数据）
const projects = [
    { id: 1, title: "轻策略肉鸽卡牌《欺诈猜拳》", tech: "Godot、GD Script、AI大模型", thumb: "images/project1.png" },
    { id: 2, title: "晚餐计划工具 Dinner Planner", tech: "HTML、CSS、JS、Vue", thumb: "images/project2.png" },
    { id: 3, title: "AI 塔罗占卜网站", tech: "React、Mbox、AI API", thumb: "images/project3.png" },
    { id: 4, title: "2D 塔防模拟经营游戏", tech: "Unity、C#", thumb: "images/project4.png" },
    { id: 5, title: "弹球对战《Last Fantasy》", tech: "Unity、C#", thumb: "images/project5.png" },
    { id: 6, title: "《志异》横向解谜拼图", tech: "游戏策划、关卡设计、剧本", thumb: "images/project6.png" },
    { id: 7, title: "智能 VR 交互游戏", tech: "Unity、VR、深度学习", thumb: "images/project7.png" },
    { id: 8, title: "异地恋虚拟宠物 APP UX", tech: "Figma、用户体验设计", thumb: "images/project8.png" },
    { id: 9, title: "VR 社交行为研究实验", tech: "Unity、VR", thumb: "images/project9.png" },
    { id: 10, title: "开放世界生存《beavering away》", tech: "Unity、物理系统、河流系统", thumb: "images/project10.png" },
];

window.renderPortfolio = function () {
    document.getElementById("content").innerHTML = `
    <div class="card">
      <h1>作品集 | Portfolio</h1>
      <p>游戏设计 | 前端开发 | 游戏开发 | UX 设计</p>
    </div>
    <div class="portfolio-grid">
      ${projects.map(p => `
        <div class="portfolio-item" onclick="go('project?id=${p.id}')">
          <img src="${p.thumb}" onerror="this.src='https://picsum.photos/300/180?random=${p.id}'">
          <div class="portfolio-info">
            <h3>${p.title}</h3>
            <p class="p-tech">${p.tech}</p>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}