window.renderBlog = function () {
    document.getElementById("content").innerHTML = `
    <div class="card">
      <h1>Blog</h1>
    </div>
    <div class="blog-tabs">
      <button class="blog-tab-btn active" onclick="window.switchBlogTab('dh2650')">
        DH2650 VT26 Computer Game Design Blog
      </button>
      <button class="blog-tab-btn" onclick="window.switchBlogTab('dh2323')">
        DH2323 VT26 Computer Graphics and Interaction
      </button>
    </div>
    <div id="blog-content" class="card">
      <!-- 动态加载博客内容 -->
    </div>
  `;
    // 初始化显示第一个选项卡内容
    window.switchBlogTab('dh2650');
}

window.switchBlogTab = function (tab) {
    // 更新选项卡按钮的激活状态
    const buttons = document.querySelectorAll('.blog-tab-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    const contentDiv = document.getElementById('blog-content');

    if (tab === 'dh2650') {
        contentDiv.innerHTML = `
            <h2>DH2650 VT26 - Computer Game Design Blog</h2>
            <div class="blog-section">
                <h3>课程笔记 | Course Notes</h3>
                <p>第1周：游戏核心循环</p>
                <p>第2周：角色控制与物理</p>
                <p>第3周：UI与状态管理</p>
                <p>第4周：敌人AI与状态机</p>
                <p>第5周：关卡设计与节奏</p>
                <p>第6周：数值平衡</p>
            </div>
            <div class="blog-section">
                <h3>开发日志 | Dev Log</h3>
                <p>在这里记录你的开发过程、问题、思路、迭代与心得。</p>
            </div>
        `;
    } else if (tab === 'dh2323') {
        contentDiv.innerHTML = `
            <h2>DH2323 VT26 - Computer Graphics and Interaction</h2>
            <div class="blog-section">
                <h3>Distance-Based LOD Switching and Perceived Virtual Characters — My Project Log</h3>
                <p>I am a member of our team. This post traces how our topic moved from hair-card technology to distance × model fidelity,
                and what I contributed across literature review, LOD implementation, stimulus production, data collection, and reporting.</p>
            </div>
            <div class="blog-section">
                <h3>Early topic (Apr 10–16): Hair cards and anthropomorphism</h3>
                <p>Early on, a teammate had explored how different hairstyles affect perception of virtual characters in another course. We wanted to continue that line here from a new angle. After extensive reading, we focused on hair-card techniques and anthropomorphism toward virtual characters.

\nWe drew on Zheng et al.’s real-time hair card extraction: converting strand-based hair into card-based assets while preserving appearance under tight geometry and texture budgets. We did not aim to reproduce their full pipeline; we planned a simplified strand-vs-card setup for stimuli, with Godspeed (Bartneck et al.) as a candidate measure for anthropomorphism, animacy, likeability, perceived intelligence, and safety.

\nMy role here was mainly literature search and synthesis—mapping hair-card methods, strand-based hair, and anthropomorphism scales, and clarifying what we could borrow from Zheng versus Godspeed.</p>
            </div>
                        <div class="blog-section">
                <h3>Focus shift (May 1–7): Experiment design and stimuli</h3>
                <p>After discussing with Chris, we treated experimental design as the core of the project. McDonnell et al. on rendering style and character perception was especially useful: when geometry and motion are held constant, visual style still shifts ratings on realism, appeal, re-assurance, familiarity, friendliness, and trustworthiness—informing our second questionnaire block.

\nFrom Zheng’s work we noted MetaHuman in Unreal for switchable card/strand hair. I worked on LOD research and stimulus production:

\n  A mid-length female MetaHuman with card/strand switching
\n  A shared idle animation across conditions
\n  An early LOD idea: distance-driven card→strand switching (always cards, always strands, or switch)
\nI spent substantial time implementing and debugging in-engine: fidelity switching, camera distance tied to sequences, and export settings so conditions differed mainly in representation or LOD, not pose or lighting.</p>
            </div>
                        <div class="blog-section">
                <h3>Topic pivot (from May 7): Distance-based LOD</h3>
                <p>Group discussion showed card vs strand differences were too subtle for reliable psychophysical data. Building on existing stimuli and LOD thinking, we reframed the study as:

The effect of distance-based LOD switching on perception of virtual characters.

\nThe design became a 2×2 of distance and model fidelity: (1) high fidelity, near; (2) high, far; (3) LOD, near; (4) LOD, far. I kept maintaining the character and idle motion; the manipulation centered on camera distance and LOD level, not fine hair detail.</p>
            </div>
                        <div class="blog-section">
                <h3>Experiment design (two parts)</h3>
                <p>Part 1 — DSIS: Side-by-side high vs LOD models (near/far), silent clips with some expression and gesture. Two clarity items vs the high-quality reference, on a 5-point impairment scale. I helped with layout and stimulus export for reproducible side-by-side trials.

\nPart 2 — Six semantic differentials (McDonnell-style): abstract–realistic, unappealing–appealing, unfamiliar–familiar, eerie–re-assuring, unfriendly–friendly, untrustworthy–trustworthy. We aligned instructions with the group and Chris so rating context stayed consistent.

\nRQs: (RQ1) Does LOD vs high-fidelity change character perception? (RQ2) Does viewing distance moderate that effect?</p>
            </div>
                        <div class="blog-section">
                <h3>Data collection and writing</h3>
                <p>With stimuli ready, I ran sessions with teammates—briefing, environment checks, playback by condition, DSIS and six-scale responses, and fixes for loading, resolution, or distance mismatches. For the report I drafted methods (stimuli, LOD, distance) and results with figures.</p>
            </div>
                        <div class="blog-section">
                <h3>Reflection</h3>
                <p>The arc from hairstyle perception → hair-card literature → LOD × distance reflected a trade-off between visible effect size and measurability, not an arbitrary topic change. I stayed involved from literature through LOD tech, models, motion, collection, and writing; discussions with the team and Chris pushed us toward a feasible design rather than full hair-card reproduction.

\nNext steps could include finer distance steps, more LOD levels, or timed switches, with interaction analyses linking DSIS impairment to the six perception scales to test RQ2 more directly.</p>
            </div>
        `;
    }
}