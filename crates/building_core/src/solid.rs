//! Shared geometric solids used for both fit checks and mesh derivation.
use crate::{geometry::lerp, *};

pub(crate) struct Cell {
    pub footprint: [Point; 4],
    pub bottom: [f64; 4],
    pub top: [f64; 4],
}
fn slice(p: [Point; 4], a: f64, b: f64) -> [Point; 4] {
    [
        lerp(p[0], p[1], a),
        lerp(p[0], p[1], b),
        lerp(p[3], p[2], b),
        lerp(p[3], p[2], a),
    ]
}
pub(crate) fn cells(part: &Part) -> Vec<Cell> {
    let p = part.footprint;
    let top = [part.wall_top; 4];
    let Some(opening) = &part.opening else {
        return vec![Cell {
            footprint: p,
            bottom: [part.base; 4],
            top,
        }];
    };
    let [start, end] = opening.interval;
    let mut result = vec![
        Cell {
            footprint: slice(p, 0., start),
            bottom: [part.base; 4],
            top,
        },
        Cell {
            footprint: slice(p, end, 1.),
            bottom: [part.base; 4],
            top,
        },
    ];
    let height =
        |t: f64| opening.spring + opening.rise * (1. - (2. * t - 1.).powi(2)).max(0.).sqrt();
    for i in 0..10 {
        let a = i as f64 / 10.;
        let b = (i + 1) as f64 / 10.;
        result.push(Cell {
            footprint: slice(p, start + (end - start) * a, start + (end - start) * b),
            bottom: [height(a), height(b), height(b), height(a)],
            top,
        });
    }
    result
}
