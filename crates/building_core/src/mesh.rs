use crate::{generation::roof_order, *};
fn at(p: Point, y: f64) -> [f64; 3] {
    [p.x, y, p.z]
}
fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a.iter().zip(b).map(|(a, b)| a * b).sum()
}
fn triangle(mesh: &mut SurfaceMesh, a: [f64; 3], mut b: [f64; 3], mut c: [f64; 3], out: [f64; 3]) {
    let mut n = cross(sub(b, a), sub(c, a));
    if dot(n, out) < 0. {
        std::mem::swap(&mut b, &mut c);
        n = n.map(|v| -v);
    }
    let len = dot(n, n).sqrt();
    let index = mesh.positions.len() as u32;
    mesh.positions.extend([a, b, c]);
    mesh.normals.extend([n.map(|v| v / len); 3]);
    mesh.indices.extend([index, index + 1, index + 2]);
}
fn face(mesh: &mut SurfaceMesh, p: &[[f64; 3]], out: [f64; 3]) {
    for i in 1..p.len() - 1 {
        triangle(mesh, p[0], p[i], p[i + 1], out);
    }
}
fn empty(material: Material) -> SurfaceMesh {
    SurfaceMesh {
        material,
        positions: vec![],
        normals: vec![],
        indices: vec![],
    }
}
/// The only mesh derivation: generic wall/roof surfaces, no renderer types.
/// Call on an unmodified design returned by generate; arbitrary edited designs
/// are not validated by this function. Internal contact walls remain closed.
pub fn derive_meshes(design: &Design) -> Vec<SurfaceMesh> {
    let mut walls = empty(Material::Wall);
    let mut roofs = empty(Material::Roof);
    for part in &design.parts {
        for cell in crate::solid::cells(part) {
            let p = cell.footprint;
            for i in 0..4 {
                let a = p[i];
                let b = p[(i + 1) % 4];
                face(
                    &mut walls,
                    &[
                        at(a, cell.bottom[i]),
                        at(b, cell.bottom[(i + 1) % 4]),
                        at(b, cell.top[(i + 1) % 4]),
                        at(a, cell.top[i]),
                    ],
                    [b.z - a.z, 0., a.x - b.x],
                );
            }
            let bottom = std::array::from_fn::<_, 4, _>(|i| at(p[i], cell.bottom[i]));
            face(&mut walls, &bottom, [0., -1., 0.]);
            if part.roof.is_none() {
                let top = std::array::from_fn::<_, 4, _>(|i| at(p[i], cell.top[i]));
                face(&mut walls, &top, [0., 1., 0.]);
            }
        }
        let Some(roof) = &part.roof else { continue };
        let q = roof_order(part.footprint, roof.axis).map(|p| at(p, part.wall_top));
        let [a, b] = roof.ridge;
        face(&mut roofs, &[q[0], q[3], b, a], [0., 1., 0.]);
        face(&mut roofs, &[q[1], q[2], b, a], [0., 1., 0.]);
        for (i, j, r) in [(0, 1, a), (2, 3, b)] {
            face(
                &mut walls,
                &[q[i], q[j], r],
                [q[j][2] - q[i][2], 0., q[i][0] - q[j][0]],
            );
        }
    }
    vec![walls, roofs]
}
