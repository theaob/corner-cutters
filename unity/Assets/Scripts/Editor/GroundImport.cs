// Import settings for the baked ground pictures (Resources/Grounds, written by `npm run unity:grounds`): each is the web
// game's own painted ground, one texel per map pixel and up to ~4,700 px a side. Unity's defaults would shrink it to
// 2048, filter it smooth and compress it, which blurs the edge lines and kerbs; the web game draws it nearest-neighbour,
// full size, no mipmaps, so this does the same.
using UnityEditor;
using UnityEngine;

namespace CornerCutters.Editor
{
    public sealed class GroundImport : AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            if (!assetPath.Replace('\\', '/').Contains("/Resources/Grounds/")) return;
            var t = (TextureImporter)assetImporter;
            t.textureType = TextureImporterType.Default;
            t.npotScale = TextureImporterNPOTScale.None;
            t.mipmapEnabled = false;
            // (a roof's word, drawn in letters, reads better smooth; the ground is pixel art)
            t.filterMode = assetPath.EndsWith("-roof.png") ? FilterMode.Bilinear : FilterMode.Point;
            t.wrapMode = TextureWrapMode.Clamp;
            t.maxTextureSize = 8192;
            t.textureCompression = TextureImporterCompression.Uncompressed;
            t.alphaSource = TextureImporterAlphaSource.None;
            t.sRGBTexture = true;
            t.isReadable = false;
        }
    }
}
