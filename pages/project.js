// 项目详情（来自你CV的完整介绍）
const projectData = [
    {
        id: 1,
        title: "轻策略肉鸽卡牌游戏《欺诈猜拳》",
        type: "video",
        thumb: "images/project1.png",
        url: "https://player.bilibili.com/player.html?bvid=BV17sdsBBEkV",
        content: `
      <p>参加莉莉丝举办的“我的AI队友”高校游戏提案赛。</p>
      <p>基于猜拳玩法扩展，模仿《小丑牌》模式，扩展道具、技能、牌组、升级等元素，并接入大模型AI敌人。</p>
      <p>基于AI思考链设计读心玩法，玩家可通过道具洞悉AI行为碎片，实现真正博弈体验。</p>
      <p>AI辅助下三天内完成全栈开发，可玩demo。</p>
    `
    },
    {
        id: 2,
        title: "晚餐计划工具 Dinner Planner",
        type: "web",
        thumb: "images/project2.png",
        url: "https://dishprogram-6bff8.web.app/vue.html#/",
        content: `
      <p>响应式网页，实现制定菜单、联网获取食谱、生成购物清单功能。</p>
      <p>采用 MVP 架构：Model 数据层、View 界面层、Presenter 控制层。</p>
    `
    },
    {
        id: 3,
        title: "AI 塔罗占卜网站",
        type: "web",
        thumb: "images/project3.png",
        url: "https://tarot-app-account.web.app",
        content: `
      <p>利用AI塔罗占卜API实现抽牌、占卜、解读功能。</p>
      <p>支持Google账户登录、用户信息持久化、历史记录、塔罗教学等扩展功能。</p>
    `
    },
    {
        id: 4,
        title: "2D 塔防模拟经营游戏",
        type: "video",
        thumb: "images/project4.png",
        url: "https://player.bilibili.com/player.html?bvid=BV1m1QCBwE9V",
        content: `
      <p>个人独立全栈开发，包含游戏系统、逻辑、交互、前端界面全套实现。</p>
      <p>本科毕业论文《二维塔防元素模拟管理游戏的开发》项目。</p>
    `
    },
    {
        id: 5,
        title: "弹球对战《Last Fantasy》",
        type: "video",
        thumb: "images/project5.png",
        url: "https://player.bilibili.com/player.html?bvid=BV1kx4y1b7RA",
        content: `
      <p>基于物理模拟的回合制弹球战斗游戏。</p>
      <p>设计角色属性、攻击力、生命值、技能数值，3个职业各3项技能，共9项技能。</p>
      <p>使用Unity开发道具、陷阱、物理交互系统。</p>
    `
    },
    {
        id: 6,
        title: "《志异》横向解谜拼图",
        type: "video",
        thumb: "images/project6.png",
        url: "https://player.bilibili.com/player.html?bvid=BV1s1421y7vk",
        content: `
      <p>以中国民间故事为主题的横版卷轴解谜游戏。</p>
      <p>独立完成剧情、剧本、关卡、地图、场景设计。</p>
      <p>撰写完整设计文档，获全国大学生数字媒体技术大赛二等奖。</p>
    `
    },
    {
        id: 7,
        title: "智能 VR 交互游戏",
        type: "detail",
        thumb: "images/project7.png",
        content: `
      <p>基于深度学习的智能VR交互方法与技术研究。</p>
      <p>负责游戏策划、关卡设计、白盒原型、核心“合成”功能开发。</p>
      <p>参加中国大学生创新创业大赛。</p>
    `
    },
    {
        id: 8,
        title: "异地恋虚拟宠物 APP UX 设计",
        type: "detail",
        thumb: "images/project8.png",
        content: `
      <p>针对异地恋情侣情感连接需求，完成用户体验全流程设计。</p>
      <p>双钻模型：发现问题→定义问题→开发方案→交付方案。</p>
      <p>用户调研、需求分析、原型设计、可用性测试全套产出。</p>
    `
    },
    {
        id: 9,
        title: "VR 社交行为研究实验",
        type: "detail",
        thumb: "images/project9.png",
        content: `
      <p>研究礼貌策略与空间起始位置对虚拟代理加入小群体的影响。</p>
      <p>使用Unity与VR设备模拟实验过程，探究虚拟社交行为规律。</p>
    `
    },
    {
        id: 10,
        title: "轻开放世界生存《beavering away》",
        type: "detail",
        thumb: "images/project10.png",
        content: `
      <p>河狸主题生存+建造游戏，核心特色：河流物理系统、噪声压力系统。</p>
      <p>玩家需搜集食物、建造庇护所、挖掘支流、建设大坝、对抗环境危险。</p>
      <p>独创水流运输与噪音抑制机制，还原真实河狸生存逻辑。</p>
    `
    },
];

window.renderProject = function () {
    const match = location.hash.match(/id=(\d+)/);
    const id = match ? parseInt(match[1]) : 1;
    const p = projectData.find(x => x.id === id);

    let media = "";
    if (p.type === "video") {
        media = `<iframe src="${p.url}" width="100%" height="400" frameborder="0"></iframe>`;
    } else {
        media = `<img src="${p.thumb}" class="project-image" onerror="this.src='https://picsum.photos/800/450?random=${id}'">`;
    }

    document.getElementById("content").innerHTML = `
    <div class="card">
      <h2>${p.title}</h2>
      ${media}
      <div class="project-content">${p.content}</div>
      <br>
      <button class="btn btn-back" onclick="go('portfolio')">← 返回作品集</button>
    </div>
  `;
};