// The web game's arithmetic where C#'s differs from JavaScript's: Math.hypot (V8's, a scaled sum), Math.round (half
// up, not to even), a stable sort (JavaScript's Array.prototype.sort is), and its seeded random numbers (mulberry32,
// engine/rng.ts). The race is a chain of decisions (pass or not, a mistake or not), so the port has to make the same
// ones from the same numbers: these keep the last bits the same.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public static class JsMath
    {
        /// <summary>Math.hypot(x, y) as V8 does it: scaled by the larger, the squares summed with Kahan's compensation.</summary>
        public static double Hypot(double x, double y)
        {
            x = Math.Abs(x);
            y = Math.Abs(y);
            if (double.IsInfinity(x) || double.IsInfinity(y)) return double.PositiveInfinity;
            if (double.IsNaN(x) || double.IsNaN(y)) return double.NaN;
            double max = Math.Max(x, y);
            if (max == 0) return 0;
            double sum = 0, compensation = 0;
            foreach (double v in new[] { x, y })
            {
                double n = v / max;
                double summand = n * n - compensation;
                double preliminary = sum + summand;
                compensation = preliminary - sum - summand;
                sum = preliminary;
            }
            return Math.Sqrt(sum) * max;
        }

        /// <summary>Math.hypot(x, y, z).</summary>
        public static double Hypot(double x, double y, double z)
        {
            x = Math.Abs(x); y = Math.Abs(y); z = Math.Abs(z);
            double max = Math.Max(x, Math.Max(y, z));
            if (max == 0) return 0;
            double sum = 0, compensation = 0;
            foreach (double v in new[] { x, y, z })
            {
                double n = v / max;
                double summand = n * n - compensation;
                double preliminary = sum + summand;
                compensation = preliminary - sum - summand;
                sum = preliminary;
            }
            return Math.Sqrt(sum) * max;
        }

        // V8's Math.sin, cos, atan, atan2 and exp are fdlibm's (src/base/ieee754.cc); .NET's come from the platform's C
        // library, which differs in the last bit now and then (and from one platform to the next). A last bit is enough
        // to tip a decision a few minutes into a race, so these are fdlibm's, as V8 has them: the same bits as the web
        // game, on every platform.

        static int Hi(double x) => (int)(BitConverter.DoubleToInt64Bits(x) >> 32);
        static uint Lo(double x) => (uint)BitConverter.DoubleToInt64Bits(x);
        static double FromWords(int hi, uint lo) => BitConverter.Int64BitsToDouble(((long)hi << 32) | lo);

        const double S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04;
        const double S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;

        static double KernelSin(double x, double y, int iy)
        {
            int ix = Hi(x) & 0x7fffffff;
            if (ix < 0x3e400000 && (int)x == 0) return x;
            double z = x * x;
            double v = z * x;
            double r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
            if (iy == 0) return x + v * (S1 + z * r);
            return x - ((z * (0.5 * y - v * r) - y) - v * S1);
        }

        const double C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05;
        const double C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

        static double KernelCos(double x, double y)
        {
            int ix = Hi(x) & 0x7fffffff;
            if (ix < 0x3e400000 && (int)x == 0) return 1;
            double z = x * x;
            double r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
            if (ix < 0x3FD33333) return 1 - (0.5 * z - (z * r - x * y));
            double qx = ix > 0x3fe90000 ? 0.28125 : FromWords(ix - 0x00200000, 0);
            double hz = 0.5 * z - qx;
            double a = 1 - qx;
            return a - (hz - (z * r - x * y));
        }

        const double InvPio2 = 6.36619772367581382433e-01, Pio2_1 = 1.57079632673412561417e+00, Pio2_1t = 6.07710050650619224932e-11;
        const double Pio2_2 = 6.07710050630396597660e-11, Pio2_2t = 2.02226624879595063154e-21, Pio2_3 = 2.02226624871116645580e-21;
        const double Pio2_3t = 8.47842766036889956997e-32;

        static readonly int[] Npio2Hw =
        {
            0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
            0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
            0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
            0x404858EB, 0x404921FB,
        };

        /// <summary>x less the nearest multiple n of pi/2, as y0 + y1; returns n. False for |x| past 2^19·pi/2 (not reduced here).</summary>
        static bool RemPio2(double x, out int n, out double y0, out double y1)
        {
            int hx = Hi(x);
            int ix = hx & 0x7fffffff;
            if (ix < 0x4002d97c)
            {
                if (hx > 0)
                {
                    double z = x - Pio2_1;
                    if (ix != 0x3ff921fb) { y0 = z - Pio2_1t; y1 = (z - y0) - Pio2_1t; }
                    else { z -= Pio2_2; y0 = z - Pio2_2t; y1 = (z - y0) - Pio2_2t; }
                    n = 1;
                }
                else
                {
                    double z = x + Pio2_1;
                    if (ix != 0x3ff921fb) { y0 = z + Pio2_1t; y1 = (z - y0) + Pio2_1t; }
                    else { z += Pio2_2; y0 = z + Pio2_2t; y1 = (z - y0) + Pio2_2t; }
                    n = -1;
                }
                return true;
            }
            if (ix <= 0x413921fb)
            {
                double t = Math.Abs(x);
                n = (int)(t * InvPio2 + 0.5);
                double fn = n;
                double r = t - fn * Pio2_1;
                double w = fn * Pio2_1t;
                if (n < 32 && ix != Npio2Hw[n - 1]) y0 = r - w;
                else
                {
                    int j = ix >> 20;
                    y0 = r - w;
                    int i = j - ((Hi(y0) >> 20) & 0x7ff);
                    if (i > 16)
                    {
                        t = r; w = fn * Pio2_2; r = t - w;
                        w = fn * Pio2_2t - ((t - r) - w);
                        y0 = r - w;
                        i = j - ((Hi(y0) >> 20) & 0x7ff);
                        if (i > 49)
                        {
                            t = r; w = fn * Pio2_3; r = t - w;
                            w = fn * Pio2_3t - ((t - r) - w);
                            y0 = r - w;
                        }
                    }
                }
                y1 = (r - y0) - w;
                if (hx < 0) { y0 = -y0; y1 = -y1; n = -n; }
                return true;
            }
            n = 0; y0 = y1 = 0;
            return false;
        }

        /// <summary>Math.sin as V8 has it (fdlibm).</summary>
        public static double Sin(double x)
        {
            int ix = Hi(x) & 0x7fffffff;
            if (ix <= 0x3fe921fb) return KernelSin(x, 0, 0);
            if (ix >= 0x7ff00000) return x - x;
            if (!RemPio2(x, out int n, out double y0, out double y1)) return Math.Sin(x);
            switch (n & 3)
            {
                case 0: return KernelSin(y0, y1, 1);
                case 1: return KernelCos(y0, y1);
                case 2: return -KernelSin(y0, y1, 1);
                default: return -KernelCos(y0, y1);
            }
        }

        /// <summary>Math.cos as V8 has it (fdlibm).</summary>
        public static double Cos(double x)
        {
            int ix = Hi(x) & 0x7fffffff;
            if (ix <= 0x3fe921fb) return KernelCos(x, 0);
            if (ix >= 0x7ff00000) return x - x;
            if (!RemPio2(x, out int n, out double y0, out double y1)) return Math.Cos(x);
            switch (n & 3)
            {
                case 0: return KernelCos(y0, y1);
                case 1: return -KernelSin(y0, y1, 1);
                case 2: return -KernelCos(y0, y1);
                default: return KernelSin(y0, y1, 1);
            }
        }

        static readonly double[] AtanHi = { 4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00 };
        static readonly double[] AtanLo = { 2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17 };
        static readonly double[] AT =
        {
            3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
            9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
            4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02,
        };

        /// <summary>Math.atan as V8 has it (fdlibm).</summary>
        public static double Atan(double x)
        {
            int hx = Hi(x);
            int ix = hx & 0x7fffffff;
            int id;
            if (ix >= 0x44100000)
            {
                if (ix > 0x7ff00000 || (ix == 0x7ff00000 && Lo(x) != 0)) return x + x;
                return hx > 0 ? AtanHi[3] + AtanLo[3] : -AtanHi[3] - AtanLo[3];
            }
            if (ix < 0x3fdc0000)
            {
                if (ix < 0x3e400000) return x;
                id = -1;
            }
            else
            {
                x = Math.Abs(x);
                if (ix < 0x3ff30000)
                {
                    if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - 1) / (2.0 + x); }
                    else { id = 1; x = (x - 1) / (x + 1); }
                }
                else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); }
                else { id = 3; x = -1.0 / x; }
            }
            double z = x * x;
            double w = z * z;
            double s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
            double s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
            if (id < 0) return x - x * (s1 + s2);
            z = AtanHi[id] - ((x * (s1 + s2) - AtanLo[id]) - x);
            return hx < 0 ? -z : z;
        }

        const double PiO4 = 7.8539816339744827900E-01, PiO2 = 1.5707963267948965580E+00, PiD = 3.1415926535897931160E+00, PiLo = 1.2246467991473531772E-16;

        /// <summary>Math.atan2 as V8 has it (fdlibm).</summary>
        public static double Atan2(double y, double x)
        {
            if (double.IsNaN(x) || double.IsNaN(y)) return x + y;
            int hx = Hi(x), hy = Hi(y);
            uint lx = Lo(x), ly = Lo(y);
            int ix = hx & 0x7fffffff, iy = hy & 0x7fffffff;
            if (((hx - 0x3ff00000) | (int)lx) == 0) return Atan(y);
            int m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
            if ((iy | (int)ly) == 0)
            {
                switch (m)
                {
                    case 0: case 1: return y;
                    case 2: return PiD;
                    default: return -PiD;
                }
            }
            if ((ix | (int)lx) == 0) return hy < 0 ? -PiO2 : PiO2;
            if (ix == 0x7ff00000)
            {
                if (iy == 0x7ff00000)
                {
                    switch (m)
                    {
                        case 0: return PiO4;
                        case 1: return -PiO4;
                        case 2: return 3.0 * PiO4;
                        default: return -3.0 * PiO4;
                    }
                }
                switch (m)
                {
                    case 0: return 0.0;
                    case 1: return -0.0;
                    case 2: return PiD;
                    default: return -PiD;
                }
            }
            if (iy == 0x7ff00000) return hy < 0 ? -PiO2 : PiO2;
            int k = (iy - ix) >> 20;
            double z;
            if (k > 60) { z = PiO2 + 0.5 * PiLo; m &= 1; }
            else if (hx < 0 && k < -60) z = 0.0;
            else z = Atan(Math.Abs(y / x));
            switch (m)
            {
                case 0: return z;
                case 1: return -z;
                case 2: return PiD - (z - PiLo);
                default: return (z - PiLo) - PiD;
            }
        }

        const double OThreshold = 7.09782712893383973096e+02, UThreshold = -7.45133219101941108420e+02, InvLn2 = 1.44269504088896338700e+00;
        static readonly double[] Ln2Hi = { 6.93147180369123816490e-01, -6.93147180369123816490e-01 };
        static readonly double[] Ln2Lo = { 1.90821492927058770002e-10, -1.90821492927058770002e-10 };
        static readonly double[] HalfS = { 0.5, -0.5 };
        const double P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05;
        const double P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
        const double TwoM1000 = 9.33263618503218878990e-302, Two1023 = 8.988465674311579539e307;

        /// <summary>Math.exp as V8 has it (fdlibm).</summary>
        public static double Exp(double x)
        {
            int hx = Hi(x);
            int xsb = (hx >> 31) & 1;
            hx &= 0x7fffffff;
            double hi = 0, lo = 0;
            int k = 0;
            if (hx >= 0x40862E42)
            {
                if (hx >= 0x7ff00000) return ((hx & 0xfffff) | (int)Lo(x)) != 0 ? x + x : xsb == 0 ? x : 0.0;
                if (x > OThreshold) return double.PositiveInfinity;
                if (x < UThreshold) return 0;
            }
            if (hx > 0x3fd62e42)
            {
                if (hx < 0x3FF0A2B2)
                {
                    if (x == 1.0) return Math.E;
                    hi = x - Ln2Hi[xsb]; lo = Ln2Lo[xsb]; k = 1 - xsb - xsb;
                }
                else
                {
                    k = (int)(InvLn2 * x + HalfS[xsb]);
                    double tk = k;
                    hi = x - tk * Ln2Hi[0];
                    lo = tk * Ln2Lo[0];
                }
                x = hi - lo;
            }
            else if (hx < 0x3e300000) return 1 + x;
            double t = x * x;
            double twopk = k >= -1021 ? FromWords(0x3ff00000 + (k << 20), 0) : FromWords(0x3ff00000 + ((k + 1000) << 20), 0);
            double c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
            if (k == 0) return 1 - ((x * c) / (c - 2.0) - x);
            double y = 1 - ((lo - (x * c) / (2.0 - c)) - hi);
            if (k >= -1021)
            {
                if (k == 1024) return y * 2.0 * Two1023;
                return y * twopk;
            }
            return y * twopk * TwoM1000;
        }

        /// <summary>Math.round: half up (toward +infinity).</summary>
        public static double Round(double v) => Math.Floor(v + 0.5);

        public static int RoundToInt(double v) => (int)Math.Floor(v + 0.5);

        /// <summary>Math.sign (0 for 0).</summary>
        public static double Sign(double v) => v > 0 ? 1 : v < 0 ? -1 : 0;

        /// <summary>An index wrapped into 0…n-1.</summary>
        public static int Wrap(int i, int n) => ((i % n) + n) % n;

        /// <summary>A stable sort (JavaScript's), by `compare` (negative: a first).</summary>
        public static void StableSort<T>(List<T> list, Comparison<T> compare)
        {
            // (insertion into a merge sort: stable, and the lists here are short)
            if (list.Count < 2) return;
            var tmp = new T[list.Count];
            var arr = list.ToArray();
            MergeSort(arr, tmp, 0, arr.Length, compare);
            for (int i = 0; i < arr.Length; i++) list[i] = arr[i];
        }

        static void MergeSort<T>(T[] a, T[] tmp, int lo, int hi, Comparison<T> cmp)
        {
            if (hi - lo < 2) return;
            int mid = (lo + hi) / 2;
            MergeSort(a, tmp, lo, mid, cmp);
            MergeSort(a, tmp, mid, hi, cmp);
            int i = lo, j = mid, k = lo;
            while (i < mid && j < hi) tmp[k++] = cmp(a[j], a[i]) < 0 ? a[j++] : a[i++];
            while (i < mid) tmp[k++] = a[i++];
            while (j < hi) tmp[k++] = a[j++];
            for (k = lo; k < hi; k++) a[k] = tmp[k];
        }
    }

    /// <summary>engine/rng.ts's seededRandom (mulberry32): the same seed, the same numbers, as the web game.</summary>
    public sealed class SeededRandom
    {
        uint a;

        public SeededRandom(uint seed) { a = seed; }

        public double Next()
        {
            unchecked
            {
                a = a + 0x6d2b79f5u;
                int t = (int)a;
                t = Imul(t ^ (int)((uint)t >> 15), t | 1);
                t ^= t + Imul(t ^ (int)((uint)t >> 7), t | 61);
                return (uint)(t ^ (int)((uint)t >> 14)) / 4294967296.0;
            }
        }

        static int Imul(int x, int y) => unchecked(x * y);

        /// <summary>A seed as JavaScript's `>>> 0` makes one from a number.</summary>
        public static uint ToUint32(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return 0;
            double t = Math.Truncate(v) % 4294967296.0;
            if (t < 0) t += 4294967296.0;
            return (uint)t;
        }
    }
}
