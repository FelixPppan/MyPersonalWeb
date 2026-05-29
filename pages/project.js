// 项目详情（中英双语）
const projectData = [
    {
        id: 10,
        titleZh: "休闲生存建造《Beavering Away》",
        titleEn: "Relaxing Survival & Building — Beavering Away",
        type: "video",
        thumb: "images/Bevearing%20Away.png",
        videoLocal: "videos/Beavering%20away%20demo.mp4",
        link: "https://beaverdevelopers.github.io",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">KTH 课程 DH2650 团队项目，与 Guoxi Pan、Alexander Björkman、Natalie Eriksson、Maryam Khan、Tianyang Lu 共同设计与开发。</p>
        <p class="lang-en">Team project for KTH DH2650 (Computer Game Design), developed with Guoxi Pan, Alexander Björkman, Natalie Eriksson, Maryam Khan, and Tianyang Lu.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">严重干旱席卷河狸居住的森林，多数动物已逃离。玩家扮演河狸修筑水坝，拯救森林免于生态崩溃。</p>
        <p class="lang-en">A severe drought has ravaged the beavers' forest; most animals have fled. Play as a beaver building dams to save the forest from ecological collapse.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh"><strong>核心玩法：</strong>俯视半真实水体模拟、完整背包系统、模拟生态系统、饥饿等生存机制、动态季节变化。</p>
        <p class="lang-en"><strong>Features:</strong> semi-realistic top-down water simulation, inventory, simulated ecosystem, survival/hunger mechanics, dynamic seasons.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh"><strong>我的职责：</strong>游戏开发、游戏设计、动画绑定。</p>
        <p class="lang-en"><strong>My role:</strong> game development, game design, and animation rigging.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">最终方向为轻松愉快的生存建造体验：挖掘河道、修筑水坝、复苏干涸土地，吸引各类动物回归栖息地。当前 demo 展示核心系统（制作、建造、挖掘、水流模拟等），尚非完整 polished 版本。</p>
        <p class="lang-en">The final vision is a relaxing survival-and-building experience: dig channels, build dams, revitalize dry land, and bring animals back to their habitats. The current demo showcases core systems (crafting, construction, digging, water flow) rather than a fully polished release.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh"><strong>项目官网：</strong><a href="https://beaverdevelopers.github.io" target="_blank" rel="noopener noreferrer">beaverdevelopers.github.io</a></p>
        <p class="lang-en"><strong>Project website:</strong> <a href="https://beaverdevelopers.github.io" target="_blank" rel="noopener noreferrer">beaverdevelopers.github.io</a></p>
      </div>
    `,
    },
    {
        id: 1,
        titleZh: "轻策略肉鸽卡牌游戏《欺诈猜拳》",
        titleEn: "Light Strategy Roguelike Card Game — Deceptive Rock-Paper-Scissors",
        type: "video",
        thumb: "images/project1.png",
        url: "https://player.bilibili.com/player.html?bvid=BV17sdsBBEkV",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">参加莉莉丝举办的「我的 AI 队友」高校游戏提案赛。</p>
        <p class="lang-en">Entry for Lilith Games' university game pitch competition “My AI Teammate”.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">基于猜拳玩法扩展，模仿《小丑牌》模式，扩展道具、技能、牌组、升级等元素，并接入大模型 AI 敌人。</p>
        <p class="lang-en">Built on rock-paper-scissors with Balatro-style items, skills, decks, upgrades, and LLM-powered AI opponents.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">基于 AI 思考链设计读心玩法，玩家可通过道具洞悉 AI 行为碎片，实现真正博弈体验。</p>
        <p class="lang-en">Mind-reading mechanics via chain-of-thought design: items reveal fragments of AI behavior for genuine strategic play.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">AI 辅助下三天内完成全栈开发，可玩 demo。</p>
        <p class="lang-en">Full-stack playable demo completed in three days with AI assistance.</p>
      </div>
    `,
    },
    {
        id: 2,
        titleZh: "晚餐计划工具",
        titleEn: "Dinner Planner",
        type: "web",
        thumb: "images/project2.png",
        url: "https://dishprogram-6bff8.web.app/vue.html#/",
        link: "https://dishprogram-6bff8.web.app/vue.html#/",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">响应式网页，实现制定菜单、联网获取食谱、生成购物清单功能。</p>
        <p class="lang-en">Responsive web app for meal planning, online recipes, and auto-generated shopping lists.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">采用 MVP 架构：Model 数据层、View 界面层、Presenter 控制层。</p>
        <p class="lang-en">MVP architecture: Model (data), View (UI), Presenter (logic).</p>
      </div>
    `,
    },
    {
        id: 3,
        titleZh: "AI 塔罗占卜网站",
        titleEn: "AI Tarot Divination Website",
        type: "web",
        thumb: "images/project3.png",
        url: "https://tarot-app-dev-yuki.web.app/#/",
        link: "https://tarot-app-dev-yuki.web.app/#/",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">利用 AI 塔罗占卜 API 实现抽牌、占卜、解读功能。</p>
        <p class="lang-en">AI tarot API for drawing cards, readings, and interpretations.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">支持 Google 账户登录、用户信息持久化、历史记录、塔罗教学等扩展功能。</p>
        <p class="lang-en">Google sign-in, persistent user data, history, and tarot tutorials.</p>
      </div>
    `,
    },
    {
        id: 4,
        titleZh: "2D 塔防模拟经营游戏",
        titleEn: "2D Tower Defense & Simulation Management Game",
        type: "video",
        thumb: "images/project4.png",
        url: "https://player.bilibili.com/player.html?bvid=BV1m1QCBwE9V",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">个人独立全栈开发，包含游戏系统、逻辑、交互、前端界面全套实现。</p>
        <p class="lang-en">Solo full-stack development: systems, logic, interaction, and front-end UI.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">本科毕业论文《二维塔防元素模拟管理游戏的开发》项目。</p>
        <p class="lang-en">Undergraduate thesis project: Development of a 2D Tower Defense Simulation Management Game.</p>
      </div>
    `,
    },
    {
        id: 5,
        titleZh: "弹球对战《Last Fantasy》",
        titleEn: "Pinball Battle — Last Fantasy",
        type: "video",
        thumb: "images/project5.png",
        url: "https://player.bilibili.com/player.html?bvid=BV1kx4y1b7RA",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">基于物理模拟的回合制弹球战斗游戏。</p>
        <p class="lang-en">Turn-based pinball combat with physics simulation.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">设计角色属性、攻击力、生命值、技能数值，3 个职业各 3 项技能，共 9 项技能。</p>
        <p class="lang-en">Character stats, attack, HP, and skills — 3 classes × 3 skills each (9 total).</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">使用 Unity 开发道具、陷阱、物理交互系统。</p>
        <p class="lang-en">Built in Unity with items, traps, and physics interactions.</p>
      </div>
    `,
    },
    {
        id: 6,
        titleZh: "《志异》横向解谜拼图",
        titleEn: "Zhì Yì — Side-Scrolling Puzzle Adventure",
        type: "video",
        thumb: "images/project6.png",
        url: "https://player.bilibili.com/player.html?bvid=BV1s1421y7vk",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">以中国民间故事为主题的横版卷轴解谜游戏。</p>
        <p class="lang-en">Side-scrolling puzzle game inspired by Chinese folk tales.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">独立完成剧情、剧本、关卡、地图、场景设计。</p>
        <p class="lang-en">Solo work on story, script, levels, maps, and scene design.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">撰写完整设计文档，获全国大学生数字媒体技术大赛二等奖。</p>
        <p class="lang-en">Full design documentation; 2nd prize, National College Digital Media Technology Competition.</p>
      </div>
    `,
    },
    {
        id: 7,
        titleZh: "智能 VR 交互游戏",
        titleEn: "Intelligent VR Interactive Game",
        type: "detail",
        thumb: "images/project7.png",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">基于深度学习的智能 VR 交互方法与技术研究。</p>
        <p class="lang-en">Research on intelligent VR interaction methods and technologies using deep learning.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">负责游戏策划、关卡设计、白盒原型、核心「合成」功能开发。</p>
        <p class="lang-en">Game design, level design, greybox prototyping, and core crafting/combine mechanics.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">参加中国大学生创新创业大赛。</p>
        <p class="lang-en">Entered the China College Students' Innovation and Entrepreneurship Competition.</p>
      </div>
    `,
    },
    {
        id: 8,
        titleZh: "异地恋虚拟宠物 APP UX 设计",
        titleEn: "Long-Distance Relationship Virtual Pet App — UX Design",
        type: "detail",
        thumb: "images/project8.png",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">针对异地恋情侣情感连接需求，完成用户体验全流程设计。</p>
        <p class="lang-en">End-to-end UX design to help long-distance couples stay emotionally connected.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">双钻模型：发现问题 → 定义问题 → 开发方案 → 交付方案。</p>
        <p class="lang-en">Double Diamond: discover → define → develop → deliver.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">用户调研、需求分析、原型设计、可用性测试全套产出。</p>
        <p class="lang-en">User research, requirements, prototyping, and usability testing.</p>
      </div>
    `,
    },
    {
        id: 9,
        titleZh: "VR 社交行为研究实验",
        titleEn: "VR Social Behavior Research Experiment",
        type: "detail",
        thumb: "images/project9.png",
        content: `
      <div class="bilingual-block">
        <p class="lang-zh">研究礼貌策略与空间起始位置对虚拟代理加入小群体的影响。</p>
        <p class="lang-en">Studied how politeness strategies and starting position affect virtual agents joining small groups.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">使用 Unity 与 VR 设备模拟实验过程，探究虚拟社交行为规律。</p>
        <p class="lang-en">Unity and VR hardware to simulate experiments and explore virtual social behavior.</p>
      </div>
    `,
    },
];

window.renderProject = function () {
    const match = location.hash.match(/id=(\d+)/);
    const id = match ? parseInt(match[1]) : 10;
    const p = projectData.find(x => x.id === id);

    let media = "";
    let actionBtn = "";

    if (p.type === "video") {
        if (p.videoLocal) {
            media = `
        <video class="project-video" controls playsinline preload="metadata">
          <source src="${p.videoLocal}" type="video/mp4">
        </video>`;
        } else {
            media = `<iframe src="${p.url}" width="100%" height="400" frameborder="0"></iframe>`;
        }
    } else if (p.type === "web") {
        media = `<img src="${p.thumb}" class="project-image" onerror="this.src='https://picsum.photos/800/450?random=${id}'">`;
    } else {
        media = `<img src="${p.thumb}" class="project-image" onerror="this.src='https://picsum.photos/800/450?random=${id}'">`;
    }

    if (p.link) {
        actionBtn = `<a href="${p.link}" target="_blank" rel="noopener noreferrer" class="btn btn-visit">🌐 访问网站 | Visit Website</a>`;
    }

    document.getElementById("content").innerHTML = `
    <div class="card">
      <h2 class="project-title">
        <span class="project-title-zh">${p.titleZh}</span>
        <span class="project-title-en">${p.titleEn}</span>
      </h2>
      ${media}
      <div class="project-content">${p.content}</div>
      <br>
      ${actionBtn}
      <button class="btn btn-back" onclick="go('portfolio')">← 返回作品集 | Back to Portfolio</button>
    </div>
  `;
};
