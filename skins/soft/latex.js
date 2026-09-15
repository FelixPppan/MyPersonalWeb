/**
 * Soft latex lighting (WebGL sheet wash) + CSS finger as a pressed circular button.
 * The cursor always looks like a depressed bubble — same inset language as :active UI.
 */
window.initLatexMembrane = function initLatexMembrane() {
    const root = document.documentElement;
    const canvas = document.getElementById("latex-light");
    const finger = document.getElementById("latex-dent");
    if (!finger) return;

    let x = window.innerWidth * 0.5;
    let y = window.innerHeight * 0.4;
    let hasPointer = false;
    let press = 0;
    let targetPress = 0;
    let w = window.innerWidth || 1280;
    let h = window.innerHeight || 800;
    let dpr = 1;
    let raf = 0;
    let t0 = performance.now();

    // Key light — top-left (shared with CSS --shine-*)
    const Lx = -0.48;
    const Ly = -0.62;
    const Lz = 0.62;
    const Ll = Math.hypot(Lx, Ly, Lz);
    const LXn = Lx / Ll;
    const LYn = Ly / Ll;
    const LZn = Lz / Ll;

    function placeFinger() {
        finger.style.opacity = hasPointer ? "1" : "0";
        finger.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        const depth = 0.78 + press * 0.22;
        finger.style.setProperty("--dent-depth", String(depth));
    }

    function updateCssLight() {
        const sx = 30 - LXn * 18;
        const sy = 18 - LYn * 14;
        root.style.setProperty("--shine-x", `${sx.toFixed(1)}%`);
        root.style.setProperty("--shine-y", `${sy.toFixed(1)}%`);
    }

    function onMove(e) {
        const t = e.touches ? e.touches[0] : e;
        if (!t) return;
        x = t.clientX;
        y = t.clientY;
        hasPointer = true;
        root.classList.add("has-pointer");
        placeFinger();
    }

    function onLeave(e) {
        // Ignore spurious leave/blur while pointer is still over the page
        if (e && e.type === "pointerout" && e.relatedTarget) return;
        hasPointer = false;
        targetPress = 0;
        root.classList.remove("has-pointer", "is-pressing");
        placeFinger();
    }

    function onDown(e) {
        targetPress = 1;
        root.classList.add("is-pressing", "has-pointer");
        const t = e.touches ? e.touches[0] : e;
        if (t) {
            x = t.clientX;
            y = t.clientY;
        }
        hasPointer = true;
        placeFinger();
    }

    function onUp() {
        targetPress = 0;
        root.classList.remove("is-pressing");
    }

    document.addEventListener("pointermove", onMove, { passive: true, capture: true });
    document.addEventListener("pointerdown", onDown, { passive: true, capture: true });
    document.addEventListener("pointerup", onUp, { passive: true, capture: true });
    document.addEventListener("pointercancel", onUp, { passive: true, capture: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    updateCssLight();
    placeFinger();

    // --- Soft ambient sheet lighting (optional WebGL) ---
    let gl = null;
    let program = null;
    let uRes = null;
    let uDpr = null;
    let uLight = null;
    let uTime = null;

    if (canvas) {
        gl = canvas.getContext("webgl", {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
        });
    }

    if (gl) {
        const vsSrc = `
            attribute vec2 aPos;
            void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
        `;
        const fsSrc = `
            precision highp float;
            uniform vec2 uRes;
            uniform float uDpr;
            uniform vec3 uLight;
            uniform float uTime;

            float sat(float v){ return clamp(v, 0.0, 1.0); }

            void main(){
                vec2 uv = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr / uRes;
                vec3 Ld = normalize(uLight);
                float wrap = sat((sat(Ld.z) + 0.5) / 1.5);

                vec3 base = vec3(0.925, 0.902, 0.875);
                vec3 sss = vec3(0.97, 0.90, 0.84);
                vec2 litUv = vec2(0.22, 0.14);
                vec2 dlt = (uv - litUv) * vec2(2.0, 2.4);
                float wash = exp(-dot(dlt, dlt)) * 0.2;
                float fall = uv.x * 0.1 + uv.y * 0.14;
                float breath = exp(-pow((uv.y - 0.24 - sin(uTime * 0.3) * 0.01) / 0.18, 2.0)) * 0.045;

                // Soft dielectric sheen — latex, not metal
                float sheen = pow(sat(Ld.z), 1.4) * 0.1 + wash * 0.55;
                float sssW = (1.0 - wrap) * 0.28;

                vec3 col = mix(base, sss, sssW);
                col *= (0.55 + 0.38 * wrap + breath) * (1.0 - fall * 0.08);
                col += vec3(1.0, 0.98, 0.95) * sheen;
                gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
            }
        `;

        function compile(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(s));
                return null;
            }
            return s;
        }

        const vs = compile(gl.VERTEX_SHADER, vsSrc);
        const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
        if (vs && fs) {
            program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error(gl.getProgramInfoLog(program));
                program = null;
            }
        }

        if (program) {
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
                gl.STATIC_DRAW
            );
            const aPos = gl.getAttribLocation(program, "aPos");
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

            uRes = gl.getUniformLocation(program, "uRes");
            uDpr = gl.getUniformLocation(program, "uDpr");
            uLight = gl.getUniformLocation(program, "uLight");
            uTime = gl.getUniformLocation(program, "uTime");
            gl.useProgram(program);
            gl.uniform3f(uLight, LXn, LYn, LZn);
        }
    }

    function resize() {
        w = Math.max(1, window.innerWidth);
        h = Math.max(1, window.innerHeight);
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        if (gl && canvas && program) {
            const pw = Math.max(1, Math.floor(w * dpr));
            const ph = Math.max(1, Math.floor(h * dpr));
            if (canvas.width !== pw || canvas.height !== ph) {
                canvas.width = pw;
                canvas.height = ph;
                gl.viewport(0, 0, pw, ph);
            }
        }
    }

    window.addEventListener("resize", resize, { passive: true });
    resize();

    function tick(now) {
        press += (targetPress - press) * 0.18;
        placeFinger();

        if (gl && program) {
            gl.useProgram(program);
            gl.uniform2f(uRes, w, h);
            gl.uniform1f(uDpr, dpr);
            gl.uniform1f(uTime, (now - t0) * 0.001);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    return function destroy() {
        cancelAnimationFrame(raf);
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("pointercancel", onUp, true);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("resize", resize);
    };
};
