// Unlit, opaque, depth-writing: the pixel atlas times vertex colour (times a material tint). Everything solid in the game
// (ground, barriers, trees, stands, cars) uses it. Sprites/Default does not write depth, so it can't draw 3D geometry.
Shader "CornerCutters/PixelUnlit"
{
    Properties
    {
        _MainTex ("Atlas", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
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
            fixed4 _Color;

            struct appdata { float4 vertex : POSITION; fixed4 color : COLOR; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; fixed4 color : COLOR; float2 uv : TEXCOORD0; };

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = v.color;
                o.uv = v.uv;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                fixed4 c = tex2D(_MainTex, i.uv) * i.color * _Color;
                // (alpha: the share of it the weather's light falls on, the rest its own light: BakedScenery, TiltShift pass 2)
                return fixed4(c.rgb, i.color.a);
            }
            ENDCG
        }
    }
}
