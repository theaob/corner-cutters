// PixelUnlit with a light map that glows (three.js's emissiveMap): the flame towers' flames, run up the glass. The part's
// texture times its vertex colour (lit at bake), plus the light map's colour times _GlowColor, added as light is (in linear),
// the map's uv from the part's (_GlowUv: scale, offset) scrolling at _GlowRate a second. The part's own texture may scroll
// too (the neon city's sphere of lights): per axis, _ScrollU/V (drift a second, sway amp, rad/s, phase) from the offset its
// uvs were baked at (_ScrollAt).
Shader "CornerCutters/PixelGlow"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _GlowTex ("Light", 2D) = "black" {}
        _GlowUv ("Light uv (scale, offset)", Vector) = (1,1,0,0)
        _GlowRate ("Light scroll (uv a second)", Vector) = (0,0,0,0)
        _GlowColor ("Light colour (linear)", Color) = (1,1,1,1)
        _ScrollU ("Scroll u (drift, sway amp, rad/s, phase)", Vector) = (0,0,0,0)
        _ScrollV ("Scroll v (drift, sway amp, rad/s, phase)", Vector) = (0,0,0,0)
        _ScrollAt ("Baked offset", Vector) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Cull Off
        ZWrite On
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            sampler2D _GlowTex;
            float4 _GlowUv;
            float4 _GlowRate;
            float4 _GlowColor;
            float4 _ScrollU, _ScrollV, _ScrollAt;

            float Offset(float4 s, float t) { return s.x * t + s.y * sin(s.z * t + s.w); }

            struct appdata { float4 vertex : POSITION; fixed4 color : COLOR; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; fixed4 color : COLOR; float2 uv : TEXCOORD0; float2 glow : TEXCOORD1; };

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = v.color;
                float t = _Time.y;
                o.uv = v.uv - _ScrollAt.xy + float2(Offset(_ScrollU, t), Offset(_ScrollV, t));
                o.glow = v.uv * _GlowUv.xy + _GlowUv.zw + _GlowRate.xy * _Time.y;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float3 lit = GammaToLinearSpace((tex2D(_MainTex, i.uv) * i.color).rgb);
                float3 own = GammaToLinearSpace(tex2D(_GlowTex, i.glow).rgb) * _GlowColor.rgb;
                float3 c = lit + own;
                // (alpha: the share the weather's light falls on; the glow's its own, kept whatever the weather)
                float all = max(c.r, max(c.g, c.b));
                // (a scrolling part's own light is in its vertex colour, its alpha the lit share of that: BakedScenery)
                float3 mine = own + lit * (1 - i.color.a);
                float share = all > 0 ? saturate(1 - max(mine.r, max(mine.g, mine.b)) / all) : 1;
                return fixed4(LinearToGammaSpace(saturate(c)), share);
            }
            ENDCG
        }
    }
}
