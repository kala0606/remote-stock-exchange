// ============================================================================
// Remote Stock Exchange — Fluid Market Backdrop
// A full-screen WebGL fluid gradient whose hue is driven by live market
// sentiment (green = bullish, red = bearish, neutral = calm) and whose base
// tone follows the active light/dark theme. Designed as the refractive
// backdrop for the glassmorphism UI: soft, low-frequency motion that reads
// beautifully through frosted panels without fighting text legibility.
// ============================================================================

class MarketBackdrop {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        this.animationId = null;
        this.startTime = performance.now();

        // Eased state — we lerp toward targets so sentiment/theme changes glide.
        this.sentiment = 0;        // current (eased) sentiment, -50..50
        this.targetSentiment = 0;  // requested sentiment
        this.dark = this._isDark();
        this.base = this._baseFor(this.dark);   // current eased base color
        this.targetBase = this.base.slice();

        this.reducedMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.init();
    }

    _isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    // Base canvas tone per theme. Kept deep/neutral so the colored sentiment
    // accent and the glass panels do the talking.
    _baseFor(dark) {
        return dark ? [0.043, 0.043, 0.105] /* #0b0b1b */
                    : [0.953, 0.961, 0.984] /* #f3f5fb */;
    }

    init() {
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, {
            position: 'fixed',
            inset: '0',
            width: '100%',
            height: '100%',
            zIndex: '-1',
            pointerEvents: 'none',
            display: 'block'
        });
        this.canvas.id = 'market-backdrop-canvas';
        document.body.appendChild(this.canvas);

        this.gl = this.canvas.getContext('webgl', { antialias: false, alpha: false }) ||
                  this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            // No WebGL: fall back to a CSS gradient so the page still looks intentional.
            this.canvas.remove();
            document.body.classList.add('no-webgl-bg');
            return;
        }

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Pause rendering when the tab is hidden to save battery.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._stop();
            } else if (!this.reducedMotion) {
                this._start();
            }
        });

        this.createShaderProgram();

        if (this.reducedMotion) {
            this._renderFrame(0); // single static frame, no animation loop
        } else {
            this._start();
        }
    }

    resize() {
        // Cap DPR for performance — the backdrop is soft, so it doesn't need
        // full retina density. Lower the cap further on small screens.
        const small = window.innerWidth < 700;
        const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5);
        const w = Math.floor(window.innerWidth * dpr);
        const h = Math.floor(window.innerHeight * dpr);
        this.canvas.width = w;
        this.canvas.height = h;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        if (this.gl) this.gl.viewport(0, 0, w, h);
    }

    createShaderProgram() {
        const vert = `
            attribute vec2 a_position;
            varying vec2 vUv;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                vUv = (a_position + 1.0) * 0.5;
            }
        `;

        const frag = `
            precision highp float;
            varying vec2 vUv;

            uniform vec2  iResolution;
            uniform float iTime;
            uniform float u_sentiment;   // -50 .. 50
            uniform vec3  u_base;        // theme base tone
            uniform float u_dark;        // 1.0 when dark theme

            float rand(vec2 n) {
                return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
            }

            float noise(vec2 p) {
                vec2 ip = floor(p);
                vec2 u = fract(p);
                u = u * u * u * (u * (u * 6.0 - 15.0) + 10.0);
                return mix(
                    mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
                    mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
            }

            mat2 rot(float a) {
                float c = cos(a), s = sin(a);
                return mat2(c, -s, s, c);
            }

            // Soft, slowly churning fractal flow — low frequency on purpose.
            float fbm(vec2 p) {
                float f = 0.0;
                mat2 m = rot(iTime * 0.06);
                p = m * p;
                f += 0.5000 * noise(p + iTime * 0.10);
                p = m * p * 2.02;
                f += 0.2500 * noise(p);
                p = m * p * 2.01;
                f += 0.1250 * noise(p);
                p = m * p * 2.03;
                f += 0.0625 * noise(p);
                return f / 0.9375;
            }

            float pattern(vec2 p) {
                return fbm(p + fbm(p * 0.5));
            }

            void main() {
                vec2 uv = vUv;
                vec2 c = uv - 0.5;
                c.x *= iResolution.x / iResolution.y;
                c = rot(iTime * 0.03) * c;
                vec2 puv = c + 0.5;

                float shade = pattern(puv * 1.7);

                // Sentiment → accent color + intensity.
                float s = u_sentiment;
                float intensity = clamp(abs(s) / 42.0, 0.0, 1.0);

                // Bullish (green) vs bearish (red) accent, tuned per theme.
                vec3 bull = (u_dark > 0.5) ? vec3(0.10, 0.62, 0.42) : vec3(0.36, 0.80, 0.55);
                vec3 bear = (u_dark > 0.5) ? vec3(0.66, 0.18, 0.30) : vec3(0.92, 0.46, 0.50);
                vec3 accent = (s >= 0.0) ? bull : bear;

                // Blend base toward accent following the fluid shade.
                float band = smoothstep(0.30, 0.72, shade);
                vec3 col = mix(u_base, accent, band * intensity * 0.85);

                // Gentle luminous veining for depth (very subtle).
                float vein = smoothstep(0.74, 0.95, sin(shade * 7.0 + iTime * 0.25) * 0.5 + 0.5);
                vec3 hi = (u_dark > 0.5) ? vec3(0.16, 0.18, 0.34) : vec3(1.0);
                col = mix(col, hi, vein * (u_dark > 0.5 ? 0.10 : 0.06));

                // Soft radial vignette to settle the edges and focus the center.
                float vig = smoothstep(1.15, 0.25, length(uv - 0.5));
                col *= mix(0.88, 1.0, vig);

                // Breathing motion.
                col *= 0.97 + 0.03 * sin(iTime * 0.2);

                gl_FragColor = vec4(col, 1.0);
            }
        `;

        const vs = this._compile(this.gl.VERTEX_SHADER, vert);
        const fs = this._compile(this.gl.FRAGMENT_SHADER, frag);
        const prog = this.gl.createProgram();
        this.gl.attachShader(prog, vs);
        this.gl.attachShader(prog, fs);
        this.gl.linkProgram(prog);
        if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
            this.canvas.remove();
            document.body.classList.add('no-webgl-bg');
            this.gl = null;
            return;
        }
        this.program = prog;

        const pos = this.gl.getAttribLocation(prog, 'a_position');
        this.uniforms = {
            iResolution: this.gl.getUniformLocation(prog, 'iResolution'),
            iTime: this.gl.getUniformLocation(prog, 'iTime'),
            u_sentiment: this.gl.getUniformLocation(prog, 'u_sentiment'),
            u_base: this.gl.getUniformLocation(prog, 'u_base'),
            u_dark: this.gl.getUniformLocation(prog, 'u_dark')
        };

        const buf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]), this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(pos);
        this.gl.vertexAttribPointer(pos, 2, this.gl.FLOAT, false, 0, 0);
    }

    _compile(type, src) {
        const sh = this.gl.createShader(type);
        this.gl.shaderSource(sh, src);
        this.gl.compileShader(sh);
        if (!this.gl.getShaderParameter(sh, this.gl.COMPILE_STATUS)) {
            this.gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    _renderFrame(t) {
        if (!this.gl || !this.program) return;
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform2f(this.uniforms.iResolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.iTime, t);
        gl.uniform1f(this.uniforms.u_sentiment, this.sentiment);
        gl.uniform3f(this.uniforms.u_base, this.base[0], this.base[1], this.base[2]);
        gl.uniform1f(this.uniforms.u_dark, this.dark ? 1.0 : 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    _start() {
        if (this.animationId) return;
        const loop = () => {
            const t = (performance.now() - this.startTime) / 1000.0;
            // Ease eased-state toward targets for buttery transitions.
            this.sentiment += (this.targetSentiment - this.sentiment) * 0.05;
            for (let i = 0; i < 3; i++) {
                this.base[i] += (this.targetBase[i] - this.base[i]) * 0.08;
            }
            this._renderFrame(t);
            this.animationId = requestAnimationFrame(loop);
        };
        this.animationId = requestAnimationFrame(loop);
    }

    _stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    // ---- Public API -------------------------------------------------------
    setSentiment(value) {
        const v = Math.max(-50, Math.min(50, Number(value) || 0));
        this.targetSentiment = v;
        if (this.reducedMotion) { // no loop running — snap + draw once
            this.sentiment = v;
            this._renderFrame((performance.now() - this.startTime) / 1000.0);
        }
    }

    setTheme(isDark) {
        this.dark = !!isDark;
        this.targetBase = this._baseFor(this.dark);
        if (this.reducedMotion) {
            this.base = this.targetBase.slice();
            this._renderFrame((performance.now() - this.startTime) / 1000.0);
        }
    }

    destroy() {
        this._stop();
        if (this.canvas && this.canvas.parentNode) this.canvas.remove();
    }
}

// ---- Globals & wiring -------------------------------------------------------
let marketBackdrop = null;

function initFluidGradient() {
    if (marketBackdrop) marketBackdrop.destroy();
    marketBackdrop = new MarketBackdrop();
}

function updateFluidGradient(sentiment) {
    if (marketBackdrop) marketBackdrop.setSentiment(sentiment);
}

function setFluidGradientTheme(isDark) {
    if (marketBackdrop) marketBackdrop.setTheme(isDark);
}

window.initFluidGradient = initFluidGradient;
window.updateFluidGradient = updateFluidGradient;
window.setFluidGradientTheme = setFluidGradientTheme;
