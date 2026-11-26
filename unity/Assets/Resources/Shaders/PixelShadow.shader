// Soft dark patches laid on the ground (tree and car shadows): vertex colour's alpha blended over what is there, no depth write.
Shader "CornerCutters/PixelShadow"
{
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Geometry+10" }
        Cull Off
        ZWrite Off
        Offset -2, -2
        Blend SrcAlpha OneMinusSrcAlpha
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata { float4 vertex : POSITION; fixed4 color : COLOR; };
            struct v2f { float4 pos : SV_POSITION; fixed4 color : COLOR; };

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = v.color;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target { return i.color; }
            ENDCG
        }
    }
}
