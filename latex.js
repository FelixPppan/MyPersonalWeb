/**
 * Slime latex membrane — one sheet for lighting + UI domes + gravity dent.
 * DOM is transparent; content is warped via SVG feDisplacementMap from a height map.
 */
window.initLatexMembrane = function initLatexMembrane() {
    const root = document.documentElement;
    const canvas = document.getElementById("latex-light");
    const ball = document.getElementById("latex-ball");
    const displace = document.getElementById("latex-displace");
    const feImage = document.getElementById("latex-fe-image");
    if (!canvas || !ball) return;

    const MAX = 28;

    let tx = window.innerWidth * 0.5;
    let ty = window.innerHeight * 0.42;
    let hasPointer = false;

    let bx = tx, by = ty, bvx = 0, bvy = 0;
    let dx = tx, dy = ty, dvx = 0, dvy = 0;

    let press = 0;
    let targetPress = 0;
    let w = window.innerWidth || 1280;
    let h = window.innerHeight || 800;
    let dpr = 1;
    let raf = 0;
    let t0 = performance.now();
    let layoutDirty = true;
    let displaceTick = 0;

    const pressedEls = new Set();
    let hoveredEl = null;

    // Softer key light
    const Lx = -0.4, Ly = -0.52, Lz = 0.75;
    const Ll = Math.hypot(Lx, Ly, Lz);
    const LXn = Lx / Ll, LYn = Ly / Ll, LZn = Lz / Ll;

    const blisterA = new Float32Array(MAX * 4); // xy center, zw half extents
    const blisterB = new Float32Array(MAX * 4); // x corner radius, y amp, z unused, w unused
    let blisterCount = 0;

    const dctx = displace ? displace.getContext("2d", { alpha: false }) : null;
    let dw = 1, dh = 1;

    function placeBall() {
        if (!hasPointer) {
            ball.style.opacity = "0";
            return;
        }
        ball.style.opacity = "1";
        ball.style.transform = `translate3d(${bx}px, ${by}px, 0) scale(${1 - press * 0.06})`;
    }

    function updateCssLight() {
        root.style.setProperty("--shine-x", `${(26 - LXn * 14).toFixed(1)}%`);
        root.style.setProperty("--shine-y", `${(15 - LYn * 10).toFixed(1)}%`);
    }

    function ampFor(el) {
        const active = el.classList.contains("active") || pressedEls.has(el);
        const hover = hoveredEl === el;
        const panel = el.classList.contains("card") || el.classList.contains("portfolio-item");
        const base = panel ? 15.0 : 18.0;
        // Positive = raised dome (center up). Negative = pressed well (center down).
        if (active) return -base * 0.9;
        if (hover) return base * 1.08;
        return base;
    }

    function sampleBlisters() {
        const nodes = document.querySelectorAll(".latex-blister, .nav-btn, .card, .btn, .blog-tab-btn, .portfolio-item");
        let n = 0;
        nodes.forEach((el) => {
            if (n >= MAX) return;
            const amp = ampFor(el);
            const s = amp >= 0 ? 1 + amp * 0.0012 : 1 + amp * 0.0025;
            el.style.transform = `scale(${s.toFixed(4)})`;
            el.style.transformOrigin = "center center";

            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return;
            if (r.bottom < -40 || r.top > h + 40 || r.right < -40 || r.left > w + 40) return;

            const cs = getComputedStyle(el);
            const br = parseFloat(cs.borderRadius) || Math.min(22, Math.min(r.width, r.height) * 0.28);

            const i = n * 4;
            blisterA[i] = r.left + r.width * 0.5;
            blisterA[i + 1] = r.top + r.height * 0.5;
            // Unscale extents so WebGL dome matches resting layout
            blisterA[i + 2] = (r.width * 0.5) / s;
            blisterA[i + 3] = (r.height * 0.5) / s;
            blisterB[i] = Math.min(br, Math.min(r.width, r.height) * 0.5) / s;
            blisterB[i + 1] = amp;
            blisterB[i + 2] = 0;
            blisterB[i + 3] = 0;
            n++;
        });
        blisterCount = n;
        layoutDirty = false;
    }

    window.latexRefreshLayout = function () {
        layoutDirty = true;
    };

    function onMove(e) {
        const t = e.touches ? e.touches[0] : e;
        if (!t) return;
        tx = t.clientX;
        ty = t.clientY;
        if (!hasPointer) {
            bx = dx = tx;
            by = dy = ty;
            bvx = bvy = dvx = dvy = 0;
        }
        hasPointer = true;
        root.classList.add("has-pointer");

        const el = document.elementFromPoint(t.clientX, t.clientY);
        const blister = el && el.closest(".latex-blister, .nav-btn, .card, .btn, .blog-tab-btn, .portfolio-item");
        if (blister !== hoveredEl) {
            hoveredEl = blister;
            layoutDirty = true;
        }
    }

    function onLeave(e) {
        if (e && e.type === "pointerleave" && e.relatedTarget) return;
        hasPointer = false;
        targetPress = 0;
        hoveredEl = null;
        pressedEls.clear();
        root.classList.remove("has-pointer", "is-pressing");
        placeBall();
        layoutDirty = true;
    }

    function onDown(e) {
        targetPress = 1;
        root.classList.add("is-pressing", "has-pointer");
        const t = e.touches ? e.touches[0] : e;
        if (t) {
            tx = t.clientX;
            ty = t.clientY;
            const el = document.elementFromPoint(t.clientX, t.clientY);
            const blister = el && el.closest(".latex-blister, .nav-btn, .card, .btn, .blog-tab-btn, .portfolio-item");
            if (blister) {
                pressedEls.add(blister);
                layoutDirty = true;
            }
        }
        hasPointer = true;
    }

    function onUp() {
        targetPress = 0;
        pressedEls.clear();
        root.classList.remove("is-pressing");
        layoutDirty = true;
    }

    document.addEventListener("pointermove", onMove, { passive: true, capture: true });
    document.addEventListener("pointerdown", onDown, { passive: true, capture: true });
    document.addEventListener("pointerup", onUp, { passive: true, capture: true });
    document.addEventListener("pointercancel", onUp, { passive: true, capture: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", () => { layoutDirty = true; }, { passive: true });

    updateCssLight();
    placeBall();

    // --- Displacement map for text / images ---
    function resizeDisplace() {
        if (!displace || !dctx) return;
        dw = Math.max(1, Math.ceil(w / 6));
        dh = Math.max(1, Math.ceil(h / 6));
        if (displace.width !== dw || displace.height !== dh) {
            displace.width = dw;
            displace.height = dh;
        }
    }

    function heightAt(px, py) {
        // Warp follows gravity dent + pressed wells only (raised domes use CSS scale)
        let hh = 0;
        for (let i = 0; i < blisterCount; i++) {
            const o = i * 4;
            const amp = blisterB[o + 1];
            if (amp >= 0) continue; // raised: no map warp (keeps text centered on dome)
            const cx = blisterA[o], cy = blisterA[o + 1];
            const hx = blisterA[o + 2], hy = blisterA[o + 3];
            const dx0 = px - cx;
            const dy0 = py - cy;
            const qx = dx0 / Math.max(hx, 1);
            const qy = dy0 / Math.max(hy, 1);
            const d2 = qx * qx + qy * qy;
            if (d2 < 1) {
                const s = 1 - d2;
                hh += amp * s * s;
            }
        }
        return hh;
    }

    function updateDisplacementMap() {
        if (!dctx || !feImage) return;
        const img = dctx.createImageData(dw, dh);
        const data = img.data;
        const sx = w / dw;
        const sy = h / dh;
        // Encode slope as RG displacement around mid gray 128
        for (let y = 0; y < dh; y++) {
            for (let x = 0; x < dw; x++) {
                const px = (x + 0.5) * sx;
                const py = (y + 0.5) * sy;
                const h0 = heightAt(px, py);
                const hx = heightAt(px + sx, py);
                const hy = heightAt(px, py + sy);
                // Displacement from slope (content follows surface)
                const dxPix = Math.max(-40, Math.min(40, (hx - h0) * 1.8));
                const dyPix = Math.max(-40, Math.min(40, (hy - h0) * 1.8));
                const i = (y * dw + x) * 4;
                data[i] = 128 + dxPix;     // R → x
                data[i + 1] = 128 + dyPix; // G → y
                data[i + 2] = 128 + Math.max(-40, Math.min(40, h0 * 1.2));
                data[i + 3] = 255;
            }
        }
        dctx.putImageData(img, 0, 0);
        const url = displace.toDataURL("image/png");
        feImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
        feImage.setAttribute("href", url);
        feImage.setAttribute("width", String(w));
        feImage.setAttribute("height", String(h));
    }

    // --- WebGL sheet ---
    const gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
    });
    if (!gl) {
        console.warn("WebGL unavailable");
        return;
    }

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
        uniform float uCount;
        uniform vec3 uBase;
        uniform vec3 uSss;
        uniform vec4 uA[${MAX}];
        uniform vec4 uB[${MAX}];

        float sat(float v){ return clamp(v, 0.0, 1.0); }

        float sdRoundBox(vec2 p, vec2 b, float r) {
            vec2 q = abs(p) - b + vec2(r);
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }

        // Soft pillow dome: elliptical height (no axis cross) × rounded-rect silhouette
        float dome(vec2 p, vec2 c, vec2 he, float rad, float amp, out vec2 grad) {
            vec2 d = p - c;
            vec2 he2 = max(he, vec2(1.0));
            float rr = clamp(rad, 1.0, min(he2.x, he2.y));
            vec2 box = max(he2 - vec2(rr), vec2(0.5));
            float sd = sdRoundBox(d, box, rr);
            float feather = 16.0;
            if (sd > feather) { grad = vec2(0.0); return 0.0; }
            float mask = 1.0 - smoothstep(0.0, feather, sd);

            vec2 q = d / he2;
            float d2 = dot(q, q);
            float s = sat(1.0 - d2);
            float lobe = s * s;
            float hh = amp * lobe * mask;

            vec2 gLobe = -4.0 * amp * s * q / he2 * mask;
            float e = 1.25;
            float m1 = 1.0 - smoothstep(0.0, feather, sdRoundBox(d + vec2(e, 0.0), box, rr));
            float m2 = 1.0 - smoothstep(0.0, feather, sdRoundBox(d + vec2(0.0, e), box, rr));
            vec2 gMask = amp * lobe * vec2(m1 - mask, m2 - mask) / e;
            grad = gLobe + gMask;
            return hh;
        }

        void main(){
            vec2 pix = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
            vec2 uv = pix / uRes;

            vec3 Ld = normalize(uLight);
            vec3 V = normalize(vec3(0.04, 0.08, 0.996));

            float h = 0.0;
            vec2 grad = vec2(0.0);

            for (int i = 0; i < ${MAX}; i++) {
                if (float(i) >= uCount) break;
                vec2 g;
                h += dome(pix, uA[i].xy, uA[i].zw, uB[i].x, uB[i].y, g);
                grad += g;
            }

            float nScale = 1.2;
            vec3 N = normalize(vec3(-grad.x * nScale, -grad.y * nScale, 1.0));

            float ndl = sat(dot(N, Ld));
            float wrap = sat((ndl + 0.5) / 1.5);

            vec3 base = uBase;
            vec3 sss = uSss;
            float slope = length(grad);
            float sssW = (1.0 - wrap) * 0.22 + sat(-h * 0.035) * 0.08;
            vec3 albedo = mix(base, sss, sssW);

            vec2 litUv = vec2(0.2, 0.12);
            vec2 dlt = (uv - litUv) * vec2(1.7, 2.1);
            float wash = exp(-dot(dlt, dlt)) * 0.42;
            float breath = 0.016 * sin(uTime * 0.35 + uv.x * 1.6)
                * exp(-pow((uv.y - 0.22) / 0.22, 2.0));

            vec3 H = normalize(Ld + V);
            float ndh = sat(dot(N, H));
            float ndv = sat(dot(N, V));
            float rough = 0.17;
            float aa = max(0.001, rough * rough);
            float a2 = aa * aa;
            float dDen = (ndh * ndh * (a2 - 1.0) + 1.0);
            float D = a2 / (3.14159265 * dDen * dDen + 1e-4);
            float F0 = 0.04;
            float fres = F0 + (1.0 - F0) * pow(1.0 - sat(dot(H, V)), 5.0);
            float spec = D * fres * 0.4;
            float jelly = pow(ndh, 12.0) * fres * 0.24;
            float wall = sat(slope * 0.012) * pow(1.0 - ndv, 2.2) * 0.16;

            float amb = 0.52 + 0.28 * wrap + wash * 0.1 + breath;
            float raise = sat(h / 12.0);
            float dent = sat(-h / 24.0);
            float heightShade = 1.0 + raise * 0.22 - dent * 0.14 + wall * 0.04;

            vec3 col = albedo * amb * heightShade;
            col += vec3(1.0, 0.99, 0.97) * (spec + jelly + wash * 0.05);
            col += vec3(1.0, 0.985, 0.96) * ndl * raise * 0.28;

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
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uDpr = gl.getUniformLocation(program, "uDpr");
    const uLight = gl.getUniformLocation(program, "uLight");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uCount = gl.getUniformLocation(program, "uCount");
    const uBase = gl.getUniformLocation(program, "uBase");
    const uSss = gl.getUniformLocation(program, "uSss");
    const uA = gl.getUniformLocation(program, "uA[0]");
    const uB = gl.getUniformLocation(program, "uB[0]");

    const THEMES = {
        white: {
            base: [0.93, 0.915, 0.895],
            sss: [0.97, 0.94, 0.90],
            ball: "#0a0a0a",
        },
        black: {
            base: [0.14, 0.14, 0.15],
            sss: [0.22, 0.21, 0.2],
            ball: "#f2f2f2",
        },
        blue: {
            base: [0.55, 0.7, 0.88],
            sss: [0.7, 0.82, 0.95],
            ball: "#0a0a0a",
        },
        orange: {
            base: [0.92, 0.62, 0.38],
            sss: [0.98, 0.78, 0.55],
            ball: "#0a0a0a",
        },
    };

    let themeKey = "white";
    let themeBase = THEMES.white.base;
    let themeSss = THEMES.white.sss;

    function applyBallColor() {
        if (themeKey === "black") {
            ball.style.background = "radial-gradient(circle at 32% 28%, #fff 0%, #e8e8e8 42%, #c8c8c8 78%, #aaa 100%)";
            ball.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -3px 6px rgba(0,0,0,0.2)";
        } else {
            ball.style.background = "radial-gradient(circle at 32% 28%, #5a5a5a 0%, #1a1a1a 42%, #050505 78%, #000 100%)";
            ball.style.boxShadow = "0 10px 24px rgba(0,0,0,0.28), 0 3px 8px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.28), inset 0 -3px 6px rgba(0,0,0,0.55)";
        }
    }

    window.setLatexTheme = function setLatexTheme(key) {
        const t = THEMES[key] || THEMES.white;
        themeKey = THEMES[key] ? key : "white";
        themeBase = t.base;
        themeSss = t.sss;
        root.dataset.theme = themeKey;
        root.classList.remove("theme-white", "theme-black", "theme-blue", "theme-orange");
        root.classList.add(`theme-${themeKey}`);
        applyBallColor();
        document.querySelectorAll(".color-swatch").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.theme === themeKey);
        });
        layoutDirty = true;
    };

    gl.useProgram(program);
    gl.uniform3f(uLight, LXn, LYn, LZn);
    gl.uniform3f(uBase, themeBase[0], themeBase[1], themeBase[2]);
    gl.uniform3f(uSss, themeSss[0], themeSss[1], themeSss[2]);

    function resize() {
        w = Math.max(1, window.innerWidth);
        h = Math.max(1, window.innerHeight);
        dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const pw = Math.max(1, Math.floor(w * dpr));
        const ph = Math.max(1, Math.floor(h * dpr));
        if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
            gl.viewport(0, 0, pw, ph);
        }
        resizeDisplace();
        layoutDirty = true;
    }

    window.addEventListener("resize", resize, { passive: true });
    resize();
    sampleBlisters();
    updateDisplacementMap();
    window.setLatexTheme("white");

    // Color swatches
    document.querySelectorAll(".color-swatch").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.setLatexTheme(btn.dataset.theme);
        });
    });

    function spring(pos, vel, target, stiffness, damping, dt) {
        const f = (target - pos) * stiffness;
        const nv = (vel + f * dt) * damping;
        return [pos + nv * dt, nv];
    }

    let last = performance.now();
    let layoutAccum = 0;

    function tick(now) {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;

        press += (targetPress - press) * (1 - Math.exp(-10 * dt));

        if (hasPointer) {
            [bx, bvx] = spring(bx, bvx, tx, 180, 0.86, dt);
            [by, bvy] = spring(by, bvy, ty, 180, 0.86, dt);
            [dx, dvx] = spring(dx, dvx, tx, 55, 0.9, dt);
            [dy, dvy] = spring(dy, dvy, ty, 55, 0.9, dt);
        }

        placeBall();

        layoutAccum += dt;
        if (layoutDirty || layoutAccum > 0.25) {
            sampleBlisters();
            layoutAccum = 0;
        }

        gl.useProgram(program);
        gl.uniform2f(uRes, w, h);
        gl.uniform1f(uDpr, dpr);
        gl.uniform1f(uTime, (now - t0) * 0.001);
        gl.uniform1f(uCount, blisterCount);
        gl.uniform3f(uBase, themeBase[0], themeBase[1], themeBase[2]);
        gl.uniform3f(uSss, themeSss[0], themeSss[1], themeSss[2]);
        gl.uniform4fv(uA, blisterA);
        gl.uniform4fv(uB, blisterB);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Warp map ~20fps (toDataURL is the cost)
        displaceTick += dt;
        if (displaceTick > 0.05) {
            displaceTick = 0;
            updateDisplacementMap();
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
