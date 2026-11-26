// The web game's finish (src/engine/render/hd2d.ts and its renderer's output), as two passes:
//   0: one direction of the tilt-shift's separable blur (the web game's 5-tap Gaussian), sharp in a band across the
//      middle of the picture (0.16 either side) and softening over the next 0.3 above and below it;
//   1: the last blur, its vertical, mixed over the sharp picture; then the light and grade the web game's picture gets:
//      the sun and sky on flat ground (its Lambert, both lights), the warm grade, the gentle S-curve and the vignette,
//      and three.js's Neutral tone mapping, which is what crushes the asphalt to near black and deepens the grass.
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
    }
    CGINCLUDE
    #include "UnityCG.cginc"
    sampler2D _MainTex, _Sharp;
    float _Amount;
    float4 _Dir, _Res, _Light;

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
                // (into linear, lit as the web game's flat ground is, then its grade)
                c = ToLinear(saturate(c)) * _Light.rgb;
                c *= float3(1.06, 1.0, 0.92);
                c = lerp(c, c * c * (3.0 - 2.0 * c), 0.18);
                float v = smoothstep(0.95, 0.35, distance(i.uv, float2(0.5, 0.52)));
                c *= lerp(0.65, 1.0, v);
                c = Neutral(c);
                return float4(ToSrgb(saturate(c)), 1);
            }
            ENDCG
        }
    }
}
