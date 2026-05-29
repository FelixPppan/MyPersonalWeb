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
                <h3>Beavering Away — Team Project Overview</h3>
                <p>Hello everyone! I'm a member of the team consisting of Guoxi Pan, Alexander Björkman, Natalie Eriksson, Maryam Khan and Tianyang Lu. Over the past two months, we have designed and developed the game <em>Beavering Away</em>.</p>
                <p>The story of the game goes like this: A severe drought has ravaged the forest where beavers live. Most animals have fled to find new habitats. Now it falls to the beaver to build dams and save the forest from ecological collapse.</p>
                <p>Visit our project website: <a class="blog-link" href="https://beaverdevelopers.github.io" target="_blank" rel="noopener noreferrer">beaverdevelopers.github.io</a></p>
            </div>
            <div class="blog-section">
                <h3>Gameplay Features</h3>
                <p>The game comes with a host of interesting and interactive gameplay features:</p>
                <ul class="blog-list">
                    <li>Semi-realistic top-down water simulation</li>
                    <li>Complete inventory system</li>
                    <li>Simulated ecosystem</li>
                    <li>Survival mechanics including a hunger system</li>
                    <li>Dynamic seasonal changes</li>
                </ul>
            </div>
            <div class="blog-section">
                <h3>My Role</h3>
                <p>My main responsibilities include game development, game design and animation rigging.</p>
            </div>
            <div class="blog-section">
                <h3>The Initial Stage</h3>
                <p>In the first few weeks, we brainstormed ideas for our game. Initially, the team adopted my concept: players take on dual roles as both the town mayor and dungeon master. The ultimate goal is to turn Rockfall Town into a haven for adventurers and the dungeon into a world-famous challenge site, achieving prosperity for the town and steady profits from the dungeon at the same time.</p>
                <p>After discussions with our supervisor, however, we realized the design was far too complex. It would be nearly impossible to implement even the core systems within our limited timeline. We then switched to a new concept proposed by Alex: a beaver-themed survival game.</p>
                <p>Following an in-depth team meeting, we finalized the first iteration of the storyline: A young beaver gets separated from its family. A sudden thunderstorm triggers a flash flood, sweeping it off a cliff from its mountaintop den. To reunite with its family, the beaver must swim upstream through three progressively challenging natural areas.</p>
                <p>It needs to gather resources to build dams and calm the raging currents, as well as construct shelters to stay safe from harsh weather, predators and disturbing noises, before finally returning to its family on the mountaintop.</p>
                <p>Even this version remained overly complicated. We therefore adopted the optimized plan put forward by Maryam. We kept the core beaver survival theme, and repositioned the game to deliver a relaxing and enjoyable experience.</p>
                <p>In the final version, players control the beaver to dig river channels and build dams, revitalize parched lands, and draw various animals back to their natural habitats.</p>
            </div>
            <div class="blog-section">
                <h3>Development Phase</h3>
                <p>We spent the subsequent weeks focusing on development. We made several minor adjustments to our plans along the way. In the end, we completed models for two animal characters, as well as the game's core systems — including crafting, construction, digging and water flow simulation.</p>
                <p>This is essentially what our current demo looks like. To be honest, it is more of a showcase of basic functions and core concepts rather than a fully polished demo. We received plenty of constructive feedback during in-class presentations.</p>
                <p>Special thanks also go to our supervisor Björn for his invaluable suggestions.</p>
                <p>Below is a short gameplay clip of the current game demo:</p>
                <video class="blog-video" controls playsinline preload="metadata">
                    <source src="videos/Beavering%20away%20demo.mp4" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <p class="blog-link-note">More about the project: <a class="blog-link" href="https://beaverdevelopers.github.io" target="_blank" rel="noopener noreferrer">beaverdevelopers.github.io</a></p>
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