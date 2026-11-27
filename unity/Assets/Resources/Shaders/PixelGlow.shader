// PixelUnlit with a light map that glows (three.js's emissiveMap): the flame towers' flames, run up the glass. The part's
// texture times its vertex colour (lit at bake), plus the light map's colour times _GlowColor, added as light is (in linear),
// the map's uv from the part's (_GlowUv: scale, offset) scrolling at _GlowRate a second.
Shader "CornerCutters/PixelGlow"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _GlowTex ("Light", 2D) = "black" {}
        _GlowUv ("Light uv (scale, offset)", Vector) = (1,1,0,0)
        _GlowRate ("Light scroll (uv a second)", Vector) = (0,0,0,0)
        _GlowColor ("Light colour (linear)", Color) = (1,1,1,1)
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

            struct appdata { float4 vertex : POSITION; fixed4 color : COLOR; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; fixed4 color : COLOR; float2 uv : TEXCOORD0; float2 glow : TEXCOORD1; };

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = v.color;
                o.uv = v.uv;
                o.glow = v.uv * _GlowUv.xy + _GlowUv.zw + _GlowRate.xy * _Time.y;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float3 c = GammaToLinearSpace((tex2D(_MainTex, i.uv) * i.color).rgb);
                c += GammaToLinearSpace(tex2D(_GlowTex, i.glow).rgb) * _GlowColor.rgb;
                return fixed4(LinearToGammaSpace(saturate(c)), 1);
            }
            ENDCG
        }
    }
}
