// The web game's finish (src/engine/render/hd2d.ts and its renderer's output). TiltShiftEffect runs the passes:
//   2: the picture into linear light, lit as the web game's flat ground is (its sun and sky, both lights);
//   3-5: its glow (three.js UnrealBloomPass: strength 0.35, radius 0.5, threshold 0.9): the parts brighter than the
//      threshold, blurred at five sizes, added back;
//   0: one direction of the tilt-shift's separable blur (the web game's 5-tap Gaussian), sharp in a band across the
//      middle of the picture (0.16 either side) and softening over the next 0.3 above and below it;
//   1: the last blur, its vertical, mixed over the sharp picture; then the web game's grade: the warm tint, the gentle
//      S-curve and the vignette, and three.js's Neutral tone mapping, which is what crushes the asphalt to near black
//      and deepens the grass.
// The scene is drawn unlit in gamma space (the shaders shade by slope and face only); this pass does the rest in linear.
Shader "CornerCutters/TiltShift"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _Sharp ("Sharp picture", 2D) = "white" {}
        _Amount ("Blur", Float) = 1.2
        _Dir ("Direction", Vector) = (1, 0, 0, 0)
        _Res ("Screen size", Vector) = (1280, 720, 0, 0)
        _Light ("Light on flat ground (linear)", Vector) = (0.8375, 0.7537, 0.7039, 0)
        _Radius ("Blur kernel radius", Float) = 3
    }
    CGINCLUDE
    #include "UnityCG.cginc"
    sampler2D _MainTex, _Sharp, _Bloom0, _Bloom1, _Bloom2, _Bloom3, _Bloom4;
    float4 _MainTex_TexelSize;
    float _Amount, _Radius;
    float4 _Dir, _Res, _Light;
    float _BloomStrength;

    float BlurAt(float2 uv) { return smoothstep(0.0, 0.3, max(0.0, abs(uv.y - 0.5) - 0.16)); }

    float4 Gauss(float2 uv, float2 stepUv)
    {
        float4 c = tex2D(_MainTex, uv) * 0.2270270270;
        c += tex2D(_MainTex, uv + stepUv * 1.3846153846) * 0.3162162162;
        c += tex2D(_MainTex, uv - stepUv * 1.3846153846) * 0.3162162162;
        c += tex2D(_MainTex, uv + stepUv * 3.2307692308) * 0.0702702703;
        c += tex2D(_MainTex, uv - stepUv * 3.2307692308) * 0.0702702703;
        return c;
    }

    float3 ToLinear(float3 c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
    float3 ToSrgb(float3 c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }

    // three.js NeutralToneMapping (Khronos PBR Neutral)
    float3 Neutral(float3 color)
    {
        const float start = 0.8 - 0.04;
        const float desat = 0.15;
        float x = min(color.r, min(color.g, color.b));
        float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
        color -= offset;
        float peak = max(color.r, max(color.g, color.b));
        if (peak < start) return color;
        float d = 1.0 - start;
        float newPeak = 1.0 - d * d / (peak + d - start);
        color *= newPeak / peak;
        float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
        return lerp(color, newPeak.xxx, g);
    }
    ENDCG

    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            float4 frag (v2f_img i) : SV_Target
            {
                return Gauss(i.uv, _Dir.xy / _Res.xy * _Amount * BlurAt(i.uv));
            }
            ENDCG
        }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            float4 frag (v2f_img i) : SV_Target
            {
                float w = BlurAt(i.uv);
                float3 blurred = Gauss(i.uv, float2(0, 1) / _Res.xy * _Amount * w).rgb;
                float3 c = lerp(tex2D(_Sharp, i.uv).rgb, blurred, min(1.0, w * 3.0));
                // (already linear and lit: pass 2)
                c *= float3(1.06, 1.0, 0.92);
                c = lerp(c, c * c * (3.0 - 2.0 * c), 0.18);
                float v = smoothstep(0.95, 0.35, distance(i.uv, float2(0.5, 0.52)));
                c *= lerp(0.65, 1.0, v);
                c = Neutral(c);
                return float4(ToSrgb(saturate(c)), 1);
            }
            ENDCG
        }
        Pass
        {
            // 2: into linear light, lit
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            float4 frag (v2f_img i) : SV_Target { return float4(ToLinear(saturate(tex2D(_MainTex, i.uv).rgb)) * _Light.rgb, 1); }
            ENDCG
        }
        Pass
        {
            // 3: the glow's bright parts (LuminosityHighPassShader: threshold 0.9, smooth width 0.01)
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            float4 frag (v2f_img i) : SV_Target
            {
                float4 c = tex2D(_MainTex, i.uv);
                float v = dot(c.rgb, float3(0.299, 0.587, 0.114));
                return lerp(float4(0, 0, 0, 0), c, smoothstep(0.9, 0.91, v));
            }
            ENDCG
        }
        Pass
        {
            // 4: one direction of a mip's Gaussian blur (UnrealBloomPass: sigma = kernel radius, normalised)
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            float Gaussian(float x, float sigma) { return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma; }
            float4 frag (v2f_img i) : SV_Target
            {
                float sigma = _Radius;
                float wsum = Gaussian(0, sigma);
                float3 sum = tex2D(_MainTex, i.uv).rgb * wsum;
                float2 stepUv = _Dir.xy * _MainTex_TexelSize.xy;
                for (int k = 1; k < 11; k++)
                {
                    if (k >= _Radius) break;
                    float w = Gaussian(k, sigma);
                    sum += (tex2D(_MainTex, i.uv + stepUv * k).rgb + tex2D(_MainTex, i.uv - stepUv * k).rgb) * w;
                    wsum += 2 * w;
                }
                return float4(sum / wsum, 1);
            }
            ENDCG
        }
        Pass
        {
            // 5: the five mips added to the picture: strength 0.35 (0.7 at night), each mip's factor lerp(f, 1.2 - f, radius 0.5) = 0.6
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            float4 frag (v2f_img i) : SV_Target
            {
                float3 glow = tex2D(_Bloom0, i.uv).rgb + tex2D(_Bloom1, i.uv).rgb + tex2D(_Bloom2, i.uv).rgb + tex2D(_Bloom3, i.uv).rgb + tex2D(_Bloom4, i.uv).rgb;
                return float4(tex2D(_MainTex, i.uv).rgb + _BloomStrength * 0.6 * glow, 1);
            }
            ENDCG
        }
    }
}
