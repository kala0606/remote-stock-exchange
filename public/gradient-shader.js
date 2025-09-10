// Fluid Gradient Shader System
class FluidGradient {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        this.animationId = null;
        this.startTime = Date.now();
        
        this.init();
    }
    
    init() {
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.pointerEvents = 'none';
        document.body.appendChild(this.canvas);
        
        // Get WebGL context
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }
        
        // Set canvas size
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Create shader program
        this.createShaderProgram();
        
        // Start animation
        this.animate();
    }
    
    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    createShaderProgram() {
        const vertexShaderSource = `
            attribute vec2 a_position;
            varying vec2 vTexCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                vTexCoord = (a_position + 1.0) * 0.5;
            }
        `;
        
        const fragmentShaderSource = `
            precision highp float;
            
            varying vec2 vTexCoord;
            
            uniform vec2 iResolution;
            uniform float iTime;
            uniform float u_sentiment;
            uniform vec3 u_baseColor;
            uniform vec3 u_accentColor;
            
            // Noise functions
            float rand(vec2 n) { 
                return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
            }
            
            float noise(vec2 p) {
                vec2 ip = floor(p);
                vec2 u = fract(p);
                u = u*u*(3.0-2.0*u);
                
                float res = mix(
                    mix(rand(ip), rand(ip+vec2(1.0,0.0)), u.x),
                    mix(rand(ip+vec2(0.0,1.0)), rand(ip+vec2(1.0,1.0)), u.x), u.y);
                return res*res;
            }
            
            // Create rotation matrix
            mat2 getRotationMatrix(float time) {
                float angle = time * 0.2;
                float c = cos(angle);
                float s = sin(angle);
                return mat2(c, -s, s, c);
            }
            
            // Fractal Brownian Motion
            float fbm(vec2 p) {
                float f = 0.0;
                mat2 rotMtx = getRotationMatrix(iTime * 0.1);
                p = rotMtx * p;
                
                f += 0.500000 * noise(p + iTime * 0.5);
                p = rotMtx * p * 2.02;
                f += 0.250000 * noise(p);
                p = rotMtx * p * 2.01;
                f += 0.125000 * noise(p);
                p = rotMtx * p * 2.03;
                f += 0.062500 * noise(p);
                p = rotMtx * p * 2.01;
                f += 0.031250 * noise(p);
                return f / 0.96875;
            }
            
            // Pattern function
            float pattern(vec2 p) {
                return fbm(p + fbm(p + fbm(p)));
            }
            
            // Smooth color interpolation
            vec3 smoothColorMix(vec3 color1, vec3 color2, float t) {
                t = clamp(t, 0.0, 1.0);
                return mix(color1, color2, smoothstep(0.0, 1.0, t));
            }
            
            void main() {
                vec2 uv = vTexCoord;
                
                // Center coordinates for rotation
                vec2 centered_uv = uv - 0.5;
                centered_uv.x *= iResolution.x / iResolution.y;
                
                // Apply global rotation
                mat2 globalRotation = getRotationMatrix(iTime * 0.05);
                centered_uv = globalRotation * centered_uv;
                
                // Move back to UV space
                vec2 pattern_uv = centered_uv + 0.5;
                
            // Generate fluid pattern
            float shade = pattern(pattern_uv * 2.5);
            
            // Create gradient based on sentiment
            vec3 baseColor = u_baseColor; // Grey base
            vec3 accentColor = u_accentColor; // Green or red accent
            
            // Mix colors based on pattern and sentiment intensity
            float intensity = abs(u_sentiment) / 50.0; // Normalize sentiment to 0-1
            intensity = clamp(intensity, 0.0, 1.0);
            
            // Create more dramatic 50/50 split
            // Use the pattern to create distinct regions of color
            float patternThreshold = 0.5;
            float colorMix = smoothstep(patternThreshold - 0.1, patternThreshold + 0.1, shade);
            
            // Create stronger contrast between base and accent colors
            vec3 finalColor;
            if (intensity > 0.1) {
                // When there's sentiment, create visible 50/50 split with enhanced saturation
                vec3 enhancedAccent = accentColor;
                
                // Boost saturation by increasing the difference from grey
                if (u_sentiment > 0.0) {
                    // Green: enhance green channel more aggressively and reduce red/blue
                    enhancedAccent.r = max(0.0, accentColor.r - 0.15);
                    enhancedAccent.g = min(1.0, accentColor.g + 0.15);
                    enhancedAccent.b = max(0.0, accentColor.b - 0.15);
                } else {
                    // Red: enhance red channel and reduce green/blue (keep current level)
                    enhancedAccent.r = min(1.0, accentColor.r + 0.1);
                    enhancedAccent.g = max(0.0, accentColor.g - 0.1);
                    enhancedAccent.b = max(0.0, accentColor.b - 0.1);
                }
                
                finalColor = mix(baseColor, enhancedAccent, colorMix * intensity);
            } else {
                // When neutral, just use base color
                finalColor = baseColor;
            }
            
            // Add subtle animation based on time
            float timeWave = sin(iTime * 0.3) * 0.05 + 0.95;
            finalColor *= timeWave;
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;
        
        // Create shaders
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        // Create program
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);
        
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Shader program failed to link:', this.gl.getProgramInfoLog(this.program));
            return;
        }
        
        // Get attribute and uniform locations
        const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        
        this.uniforms = {
            iResolution: this.gl.getUniformLocation(this.program, 'iResolution'),
            iTime: this.gl.getUniformLocation(this.program, 'iTime'),
            u_sentiment: this.gl.getUniformLocation(this.program, 'u_sentiment'),
            u_baseColor: this.gl.getUniformLocation(this.program, 'u_baseColor'),
            u_accentColor: this.gl.getUniformLocation(this.program, 'u_accentColor')
        };
        
        // Create buffer for full-screen quad
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ]), this.gl.STATIC_DRAW);
        
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    updateSentiment(sentiment) {
        this.sentiment = sentiment;
    }
    
    animate() {
        if (!this.gl || !this.program) return;
        
        const currentTime = (Date.now() - this.startTime) / 1000.0;
        
        // Set uniforms
        this.gl.useProgram(this.program);
        this.gl.uniform2f(this.uniforms.iResolution, this.canvas.width, this.canvas.height);
        this.gl.uniform1f(this.uniforms.iTime, currentTime);
        this.gl.uniform1f(this.uniforms.u_sentiment, this.sentiment || 0);
        
        // Set colors based on sentiment
        const baseColor = [240/255, 240/255, 240/255]; // Light grey base
        
        let accentColor;
        if (this.sentiment > 0) {
            // Green accent for positive sentiment - much more saturated
            const intensity = Math.min(100, Math.abs(this.sentiment) * 2.0); // Even higher intensity for green
            accentColor = [
                Math.max(0, (240 - intensity)/255), 
                240/255, 
                Math.max(0, (240 - intensity)/255)
            ];
        } else if (this.sentiment < 0) {
            // Red accent for negative sentiment - keep current intensity
            const intensity = Math.min(80, Math.abs(this.sentiment) * 1.5); // Keep red intensity as is
            accentColor = [
                240/255, 
                Math.max(0, (240 - intensity)/255), 
                Math.max(0, (240 - intensity)/255)
            ];
        } else {
            // Neutral grey
            accentColor = baseColor;
        }
        
        this.gl.uniform3f(this.uniforms.u_baseColor, baseColor[0], baseColor[1], baseColor[2]);
        this.gl.uniform3f(this.uniforms.u_accentColor, accentColor[0], accentColor[1], accentColor[2]);
        
        // Debug logging
        if (Math.abs(this.sentiment) > 1) {
            const greenIntensity = this.sentiment > 0 ? Math.min(100, Math.abs(this.sentiment) * 2.0) : Math.min(80, Math.abs(this.sentiment) * 1.5);
            console.log('Fluid Gradient Debug:', {
                sentiment: this.sentiment,
                baseColor: baseColor.map(c => Math.round(c * 255)),
                accentColor: accentColor.map(c => Math.round(c * 255)),
                intensity: greenIntensity,
                saturationBoost: this.sentiment > 0 ? 'Enhanced Green' : 'Enhanced Red'
            });
        }
        
        // Draw
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}

// Global instance
let fluidGradient = null;

// Initialize fluid gradient system
function initFluidGradient() {
    if (fluidGradient) {
        fluidGradient.destroy();
    }
    fluidGradient = new FluidGradient();
}

// Update gradient with sentiment
function updateFluidGradient(sentiment) {
    if (fluidGradient) {
        fluidGradient.updateSentiment(sentiment);
    }
}

// Export for use in client.js
window.initFluidGradient = initFluidGradient;
window.updateFluidGradient = updateFluidGradient;
