//! V8/fdlibm trigonometry, retaining its expression grouping and range reduction.
//! Source: nodejs/node v26.7.0, deps/v8/src/base/ieee754.cc (sin/cos kernels).
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved.
// Modified significantly by Google Inc.; Copyright 2016 the V8 project authors.
#![allow(clippy::excessive_precision, clippy::approx_constant)]
fn high(x: f64) -> u32 {
    (x.to_bits() >> 32) as u32
}
fn reduce(x: f64) -> (i32, f64, f64) {
    const INV: f64 = 6.36619772367581382433e-01;
    const P1: f64 = 1.57079632673412561417e+00;
    const T1: f64 = 6.07710050650619224932e-11;
    const P2: f64 = 6.07710050630396597660e-11;
    const T2: f64 = 2.02226624879595063154e-21;
    const P3: f64 = 2.02226624871116645580e-21;
    const T3: f64 = 8.47842766036889956997e-32;
    const HW: [u32; 32] = [
        0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB,
        0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB,
        0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C,
        0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB,
        0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB,
    ];
    let ix = high(x) & 0x7fffffff;
    if ix <= 0x3fe921fb {
        return (0, x, 0.0);
    }
    if ix < 0x4002d97c {
        if x > 0.0 {
            let mut z = x - P1;
            let (y0, y1) = if ix != 0x3ff921fb {
                let y = z - T1;
                (y, (z - y) - T1)
            } else {
                z -= P2;
                let y = z - T2;
                (y, (z - y) - T2)
            };
            return (1, y0, y1);
        } else {
            let mut z = x + P1;
            let (y0, y1) = if ix != 0x3ff921fb {
                let y = z + T1;
                (y, (z - y) + T1)
            } else {
                z += P2;
                let y = z + T2;
                (y, (z - y) + T2)
            };
            return (-1, y0, y1);
        }
    }
    let mut t = x.abs();
    let n = t.mul_add(INV, 0.5) as i32;
    let nf = n as f64;
    let mut r = (-nf).mul_add(P1, t);
    let mut w = nf * T1;
    let mut y0 = r - w;
    if !(n < 32 && ix != HW[(n - 1) as usize]) {
        let j = (ix >> 20) as i32;
        let mut i = j - ((high(y0) >> 20) & 0x7ff) as i32;
        if i > 16 {
            t = r;
            w = nf * P2;
            r = t - w;
            w = nf.mul_add(T2, -((t - r) - w));
            y0 = r - w;
            i = j - ((high(y0) >> 20) & 0x7ff) as i32;
            if i > 49 {
                t = r;
                w = nf * P3;
                r = t - w;
                w = nf.mul_add(T3, -((t - r) - w));
                y0 = r - w;
            }
        }
    }
    let y1 = (r - y0) - w;
    if x < 0.0 { (-n, -y0, -y1) } else { (n, y0, y1) }
}
fn kernel_cos(x: f64, y: f64) -> f64 {
    const C1: f64 = 4.16666666666666019037e-02;
    const C2: f64 = -1.38888888888741095749e-03;
    const C3: f64 = 2.48015872894767294178e-05;
    const C4: f64 = -2.75573143513906633035e-07;
    const C5: f64 = 2.08757232129817482790e-09;
    const C6: f64 = -1.13596475577881948265e-11;
    let ix = high(x) & 0x7fffffff;
    if ix < 0x3e400000 {
        return 1.0;
    }
    let z = x * x;
    let r = z * z.mul_add(
        z.mul_add(z.mul_add(z.mul_add(z.mul_add(C6, C5), C4), C3), C2),
        C1,
    );
    if ix < 0x3fd33333 {
        1.0 - z.mul_add(0.5, -z.mul_add(r, -x * y))
    } else {
        let qx = if ix > 0x3fe90000 {
            0.28125
        } else {
            f64::from_bits(((ix - 0x00200000) as u64) << 32)
        };
        let iz = z.mul_add(0.5, -qx);
        let a = 1.0 - qx;
        a - (iz - z.mul_add(r, -x * y))
    }
}
fn kernel_sin(x: f64, y: f64, tail: bool) -> f64 {
    const S1: f64 = -1.66666666666666324348e-01;
    const S2: f64 = 8.33333333332248946124e-03;
    const S3: f64 = -1.98412698298579493134e-04;
    const S4: f64 = 2.75573137070700676789e-06;
    const S5: f64 = -2.50507602534068634195e-08;
    const S6: f64 = 1.58969099521155010221e-10;
    if high(x) & 0x7fffffff < 0x3e400000 {
        return x;
    }
    let z = x * x;
    let v = z * x;
    let r = z.mul_add(z.mul_add(z.mul_add(z.mul_add(S6, S5), S4), S3), S2);
    if !tail {
        v.mul_add(z.mul_add(r, S1), x)
    } else {
        x - (-v).mul_add(S1, z.mul_add(y.mul_add(0.5, -v * r), -y))
    }
}
pub(crate) fn sin(x: f64) -> f64 {
    let ix = high(x) & 0x7fffffff;
    if ix <= 0x3fe921fb {
        return kernel_sin(x, 0.0, false);
    }
    if ix > 0x413921fb {
        return libm::sin(x);
    }
    let (n, a, b) = reduce(x);
    match n & 3 {
        0 => kernel_sin(a, b, true),
        1 => kernel_cos(a, b),
        2 => -kernel_sin(a, b, true),
        _ => -kernel_cos(a, b),
    }
}
pub(crate) fn cos(x: f64) -> f64 {
    let ix = high(x) & 0x7fffffff;
    if ix <= 0x3fe921fb {
        return kernel_cos(x, 0.0);
    }
    if ix > 0x413921fb {
        return libm::cos(x);
    }
    let (n, a, b) = reduce(x);
    match n & 3 {
        0 => kernel_cos(a, b),
        1 => -kernel_sin(a, b, true),
        2 => -kernel_cos(a, b),
        _ => kernel_sin(a, b, true),
    }
}

pub(crate) fn atan(mut x: f64) -> f64 {
    const HI: [f64; 4] = [
        4.63647609000806093515e-01,
        7.85398163397448278999e-01,
        9.82793723247329054082e-01,
        1.57079632679489655800e+00,
    ];
    const LO: [f64; 4] = [
        2.26987774529616870924e-17,
        3.06161699786838301793e-17,
        1.39033110312309984516e-17,
        6.12323399573676603587e-17,
    ];
    const A: [f64; 11] = [
        3.33333333333329318027e-01,
        -1.99999999998764832476e-01,
        1.42857142725034663711e-01,
        -1.11111104054623557880e-01,
        9.09088713343650656196e-02,
        -7.69187620504482999495e-02,
        6.66107313738753120669e-02,
        -5.83357013379057348645e-02,
        4.97687799461593236017e-02,
        -3.65315727442169155270e-02,
        1.62858201153657823623e-02,
    ];
    let negative = x.is_sign_negative();
    let ix = high(x) & 0x7fffffff;
    if ix >= 0x44100000 {
        return if x.is_nan() {
            x + x
        } else if negative {
            -HI[3] - LO[3]
        } else {
            HI[3] + LO[3]
        };
    }
    let id = if ix < 0x3fdc0000 {
        if ix < 0x3e400000 {
            return x;
        }
        -1
    } else {
        x = x.abs();
        if ix < 0x3ff30000 {
            if ix < 0x3fe60000 {
                x = x.mul_add(2.0, -1.0) / (2.0 + x);
                0
            } else {
                x = (x - 1.0) / (x + 1.0);
                1
            }
        } else if ix < 0x40038000 {
            x = (x - 1.5) / x.mul_add(1.5, 1.0);
            2
        } else {
            x = -1.0 / x;
            3
        }
    };
    let z = x * x;
    let w = z * z;
    let s1 = z * w.mul_add(
        w.mul_add(
            w.mul_add(w.mul_add(w.mul_add(A[10], A[8]), A[6]), A[4]),
            A[2],
        ),
        A[0],
    );
    let s2 = w * w.mul_add(
        w.mul_add(w.mul_add(w.mul_add(A[9], A[7]), A[5]), A[3]),
        A[1],
    );
    if id < 0 {
        (-x).mul_add(s1 + s2, x)
    } else {
        let z = HI[id as usize] - (x.mul_add(s1 + s2, -LO[id as usize]) - x);
        if negative { -z } else { z }
    }
}
pub(crate) fn atan2(y: f64, x: f64) -> f64 {
    use std::f64::consts::{FRAC_PI_2, FRAC_PI_4, PI};
    const PI_LO: f64 = 1.2246467991473531772E-16;
    if x.is_nan() || y.is_nan() {
        return x + y;
    }
    if x == 1.0 {
        return atan(y);
    }
    let mut m = (u32::from(y.is_sign_negative())) | ((u32::from(x.is_sign_negative())) << 1);
    if y == 0.0 {
        return match m {
            0 | 1 => y,
            2 => PI,
            _ => -PI,
        };
    }
    if x == 0.0 {
        return FRAC_PI_2.copysign(y);
    }
    if x.is_infinite() {
        return if y.is_infinite() {
            match m {
                0 => FRAC_PI_4,
                1 => -FRAC_PI_4,
                2 => 3.0 * FRAC_PI_4,
                _ => -3.0 * FRAC_PI_4,
            }
        } else {
            match m {
                0 => 0.0,
                1 => -0.0,
                2 => PI,
                _ => -PI,
            }
        };
    }
    if y.is_infinite() {
        return FRAC_PI_2.copysign(y);
    }
    let k = (((high(y) & 0x7fffffff) as i32) - ((high(x) & 0x7fffffff) as i32)) >> 20;
    let z = if k > 60 {
        m &= 1;
        FRAC_PI_2 + 0.5 * PI_LO
    } else if x < 0.0 && k < -60 {
        0.0
    } else {
        atan((y / x).abs())
    };
    match m {
        0 => z,
        1 => -z,
        2 => PI - (z - PI_LO),
        _ => (z - PI_LO) - PI,
    }
}
