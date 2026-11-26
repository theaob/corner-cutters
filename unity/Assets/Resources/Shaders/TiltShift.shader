// The web game's "HD-2D" finish as one full-screen pass: a tilt-shift blur (sharp in a band across the middle of the
// picture, blurring toward the top and bottom edges), a touch of saturation and contrast, and a soft vignette.
Shader "CornerCutters/TiltShift"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _Blur ("Blur (texels at the edge)", Float) = 5
        _Band ("Sharp half-height (0..0.5)", Float) = 0.18
        _Sat ("Saturation", Float) = 1.12
        _Contrast ("Contrast", Float) = 1.06
        _Vignette ("Vignette", Float) = 0.25
    }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_TexelSize;
            float _Blur, _Band, _Sat, _Contrast, _Vignette;

            fixed4 frag (v2f_img i) : SV_Target
            {
                float d = saturate((abs(i.uv.y - 0.5) - _Band) / (0.5 - _Band));
                float r = d * d * _Blur;
                float2 px = _MainTex_TexelSize.xy * r;
                fixed4 c = tex2D(_MainTex, i.uv);
                if (r > 0.25)
                {
                    // 12 taps on two rings round the pixel
                    float4 sum = c;
                    float w = 1;
                    for (int k = 0; k < 12; k++)
                    {
                        float a = k * 0.5236 + (k % 2) * 0.26;
                        float rr = (k % 2 == 0) ? 1.0 : 0.55;
                        sum += tex2D(_MainTex, i.uv + float2(cos(a), sin(a)) * px * rr);
                        w += 1;
                    }
                    c = fixed4((sum / w).rgb, 1);
                }
                float l = dot(c.rgb, float3(0.299, 0.587, 0.114));
                c.rgb = lerp(l.xxx, c.rgb, _Sat);
                c.rgb = (c.rgb - 0.5) * _Contrast + 0.5;
                float2 v = i.uv - 0.5;
                c.rgb *= 1.0 - _Vignette * saturate(dot(v, v) * 2.2);
                return fixed4(saturate(c.rgb), 1);
            }
            ENDCG
        }
    }
}
