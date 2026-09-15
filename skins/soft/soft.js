/**
 * 亲肤外观 —— 只负责那张柔光膜的底色。
 *
 * 鼠标不再做「凹陷」：这里已经删掉，改由 ball.js 的黑球光标统一负责。
 */
window.initSoftMembrane = function initSoftMembrane() {
    const canvas = document.getElementById("soft-light");
    const gl = canvas && canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
    });

    if (!canvas || !gl) return function () {};

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
    if (!vs || !fs) return function () {};

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return function () {};
    }

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

    const uRes = gl.getUniformLocation(program, "uRes");
    const uDpr = gl.getUniformLocation(program, "uDpr");
    const uLight = gl.getUniformLocation(program, "uLight");
    const uTime = gl.getUniformLocation(program, "uTime");

    // 主光：左上
    const Lx = -0.48, Ly = -0.62, Lz = 0.62;
    const Ll = Math.hypot(Lx, Ly, Lz);
    gl.useProgram(program);
    gl.uniform3f(uLight, Lx / Ll, Ly / Ll, Lz / Ll);

    let w = 1, h = 1, dpr = 1, raf = 0;
    const t0 = performance.now();

    function resize() {
        w = Math.max(1, window.innerWidth);
        h = Math.max(1, window.innerHeight);
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const pw = Math.max(1, Math.floor(w * dpr));
        const ph = Math.max(1, Math.floor(h * dpr));
        if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
            gl.viewport(0, 0, pw, ph);
        }
    }

    function tick(now) {
        gl.useProgram(program);
        gl.uniform2f(uRes, w, h);
        gl.uniform1f(uDpr, dpr);
        gl.uniform1f(uTime, (now - t0) * 0.001);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        raf = requestAnimationFrame(tick);
    }

    window.addEventListener("resize", resize, { passive: true });
    resize();
    raf = requestAnimationFrame(tick);

    return function destroy() {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
    };
};
