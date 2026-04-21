window.renderBlog = function () {
    document.getElementById("content").innerHTML = `
    <div class="card">
      <h1>游戏设计课开发者博客</h1>
      <p>Game Design Development Blog</p>
    </div>
    <div class="card">
      <h2>课程笔记 | Course Notes</h2>
      <p>第1周：游戏核心循环</p>
      <p>第2周：角色控制与物理</p>
      <p>第3周：UI与状态管理</p>
      <p>第4周：敌人AI与状态机</p>
      <p>第5周：关卡设计与节奏</p>
      <p>第6周：数值平衡</p>
    </div>
    <div class="card">
      <h2>开发日志 | Dev Log</h2>
      <p>在这里记录你的开发过程、问题、思路、迭代与心得。</p>
    </div>
  `;
}