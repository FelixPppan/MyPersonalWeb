window.renderExperience = function () {
    document.getElementById("content").innerHTML = `
    <div class="card">
      <h1>经历 | Experience</h1>
      <p>实习与教育 | Internships & Education</p>
    </div>

    <div class="card">
      <h2>实习经历 | Internship</h2>
      <h3>Hortor Games（疯狂游戏）— 游戏创作实习生 | Game Creation Intern</h3>
      <p>2026.7 – 2026.9 · 创游世界项目组 | Chuangyou World Project Team</p>

      <div class="bilingual-block">
        <p class="lang-zh">在创游世界平台负责小型游戏的设计、策划、实现与运营全链条。实习期间发布 8 款游戏，累计 39 万次游玩，账号积累 9,000 粉丝。</p>
        <p class="lang-en">Owned the full chain of design, planning, implementation and operations for small games on the Chuangyou World platform. Published 8 games during the internship, reaching 390,000 plays and growing the account to 9,000 followers.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">独立完成从玩法构思到上线运营的完整闭环，用 AI 工具快速生成游戏素材、搭建玩法原型并辅助测试。</p>
        <p class="lang-en">Independently closed the loop from gameplay concept to launch and operations, using AI tools to rapidly generate game assets, prototype gameplay and assist with testing.</p>
      </div>
      <div class="bilingual-block">
        <p class="lang-zh">以敏捷方式快速迭代，大幅提升开发效率。</p>
        <p class="lang-en">Iterated in an agile way, greatly improving development efficiency.</p>
      </div>
    </div>

    <div class="card">
      <h2>教育经历 | Education</h2>

      <h3>KTH 瑞典皇家理工学院 | KTH Royal Institute of Technology</h3>
      <p>2025.8 – 2027.6 · 理学硕士，交互媒体技术 | M.Sc. in Interactive Media Technology</p>

      <h3>北方工业大学 | North China University of Technology</h3>
      <p>2021.9 – 2025.7 · 数字媒体技术学士，GPA 3.76/4 | B.Sc. in Digital Media Technology, GPA 3.76/4</p>
    </div>
  `;
};
